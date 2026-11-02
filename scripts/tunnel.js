/**
 * 内网穿透一键启动
 *
 * Usage:
 *   node scripts/tunnel.js                     # cloudflared
 *   node scripts/tunnel.js --provider ngrok     # ngrok (推荐)
 *   node scripts/tunnel.js --provider lt        # localtunnel
 *   node scripts/tunnel.js --provider cpolar   # cpolar
 */
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 9200;
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_DIST = path.join(REPO_ROOT, 'game-ddz-server', 'dist', 'app.js');
const isWin = process.platform === 'win32';

const provider = process.argv.includes('--provider')
  ? process.argv[process.argv.indexOf('--provider') + 1]
  : process.env.TUNNEL_PROVIDER || 'ngrok';

const providers = {
  cf: {
    name: 'Cloudflare Tunnel',
    hint: '海外节点，国内可能较慢',
    cmd: ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`,
          '--no-autoupdate', '--protocol', 'http2'],
    urlRegex: /https?:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i,
  },
  lt: {
    name: 'Localtunnel',
    hint: '免注册，可能有 IP 验证页',
    cmd: ['--yes', 'localtunnel', '--port', String(PORT)],
    urlRegex: /https?:\/\/[a-z0-9][a-z0-9-]*\.loca\.lt/i,
  },
  ngrok: {
    name: 'ngrok',
    hint: '老牌稳定。需 ngrok.com 注册 + authtoken（一次配置永久使用）',
    cmd: ['--yes', 'ngrok', 'http', String(PORT)],
    apiPort: 4040,
    urlRegex: /https?:\/\/[a-z0-9][a-z0-9-]*\.ngrok(-free)?\.(dev|app)/i,
    ngrokWarn: true,
  },
  cpolar: {
    name: 'Cpolar',
    hint: '国内最稳零验证页。需 cpolar.com 注册 + 安装 Windows 客户端',
    cmd: ['http', String(PORT)],
    urlRegex: /https?:\/\/[a-z0-9][a-z0-9-]*\.cpolar\.(cn|io)/i,
    useBinary: true,
  },
};

const cfg = providers[provider];
if (!cfg) {
  console.error('Unknown provider:', provider);
  console.error('Available:', Object.keys(providers).join(', '));
  process.exit(1);
}

// ===== 工具 =====
const log = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 剔除代理环境变量。
 * ngrok 免费版禁止走 HTTP/HTTPS 代理（属 Pay-as-you-go 功能），
 * 只要进程环境里存在 http_proxy/https_proxy 就直接认证失败退出。
 * 必须清干净再 spawn，否则 ngrok 秒退、脚本只能抓到上次残留的旧链接。
 */
function envWithoutProxy() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(k)) delete env[k];
  }
  return env;
}

// ===== 状态 =====
let nodeProc = null;
let tunnelProc = null;
let found = false;

// ===== 清理（杀残留） =====
function killResiduals() {
  if (isWin) {
    try { execSync('taskkill /F /IM ngrok.exe 2>nul', { stdio: 'ignore' }); } catch {}
    try { execSync('taskkill /F /IM cloudflared.exe 2>nul', { stdio: 'ignore' }); } catch {}
    try { execSync('taskkill /F /IM cpolar.exe 2>nul', { stdio: 'ignore' }); } catch {}
    try { execSync('taskkill /F /IM localtunnel.exe 2>nul', { stdio: 'ignore' }); } catch {}
  }
}

function cleanup() {
  log('\n[cleanup] 关闭所有进程...');
  if (tunnelProc) { try { tunnelProc.kill('SIGTERM'); } catch {} }
  if (nodeProc)  { try { nodeProc.kill('SIGTERM'); } catch {} }
  killResiduals();
}

process.on('SIGINT', () => { cleanup(); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { cleanup(); setTimeout(() => process.exit(0), 500); });

// ===== 健康检查 =====
/**
 * 校验 9200 上跑的确实是本项目（返回 {"ok":true,...}），
 * 而不是别的恰好占了 9200 的服务 —— 否则会静默穿透到错误的后端。
 */
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/health`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(false);
        try {
          resolve(JSON.parse(data).ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ===== ngrok 管理 API 工具 =====
/** 读 4040/api/tunnels。连不上返回 null（区分"没隧道"和"服务没起"） */
function getNgrokTunnels(port, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/tunnels`, { timeout }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).tunnels || []);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/** 等 4040 彻底释放（旧 ngrok 真正退出），否则新进程抢不到端口 */
async function waitNgrokApiDown(maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if ((await getNgrokTunnels(4040)) === null) return true;
    await sleep(300);
  }
  return false;
}

/** 验证公网 URL 真能打到本地服务（ngrok 免费版会拦浏览器，必须带 skip 头） */
async function verifyPublicUrl(url) {
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/health', {
      headers: { 'ngrok-skip-browser-warning': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('"ok"') || text.includes('uptime');
  } catch {
    return false;
  }
}

// ===== 步骤 1: 起 node 游戏服务 =====
async function ensureNodeRunning() {
  log('[1/4] 检查游戏服务...');
  if (await checkHealth()) {
    log(`      localhost:${PORT} 已在运行 ✓`);
    return;
  }
  if (!fs.existsSync(SERVER_DIST)) {
    log(`      ✗ dist/app.js 不存在！请先跑:  pnpm build`);
    process.exit(1);
  }
  log(`      启动 node game-ddz-server/dist/app.js ...`);
  nodeProc = spawn('node', [SERVER_DIST], { stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO_ROOT });
  nodeProc.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) log('      ' + line);
  });
  nodeProc.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) log('      ' + line);
  });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await checkHealth()) { log(`      游戏服务就绪 ✓`); return; }
  }
  log('      ✗ 游戏服务启动超时');
  process.exit(1);
}

// ===== 步骤 2: 启穿透 =====
/** 终端显示宽度：CJK / 全角 / emoji 占 2 列，普通字符占 1 列 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff);
    w += wide ? 2 : 1;
  }
  return w;
}

function printUrl(url) {
  found = true;
  const padTo = (s, w) => s + ' '.repeat(Math.max(0, w - displayWidth(s)));
  const inner = Math.max(48, displayWidth(url) + 6);   // 动态宽度，URL 长了也不撑破
  const bar = '═'.repeat(inner);
  const blank = '   ║' + ' '.repeat(inner) + '║';
  const row = (text) => '   ║   ' + padTo(text, inner - 3) + '║';

  console.log('');
  console.log('   ╔' + bar + '╗');
  console.log(blank);
  console.log(row('🎮  PUBLIC URL'));
  console.log(blank);
  console.log(row(url));
  console.log(blank);
  console.log(row('复制上面这个链接发给朋友就能玩！'));
  console.log(blank);
  if (cfg.ngrokWarn) {
    console.log(row('⚠ 首次打开会看到 ngrok 警告页'));
    console.log(row('点 "Visit Site" 即可进入游戏'));
    console.log(blank);
  }
  console.log('   ╚' + bar + '╝');
  console.log('');
  console.log('   本地访问:  http://localhost:' + PORT);
  console.log('   Ctrl+C 退出（自动清理）');
  console.log('');
}

function extractUrl(line) {
  const m = line.match(cfg.urlRegex);
  return m ? m[0] : null;
}

async function startTunnel() {
  // ① 记录启动前 4040 上已有的 tunnel —— 这些 URL 一律不采用（都是上次的残留）
  const before = cfg.apiPort ? await getNgrokTunnels(cfg.apiPort) : null;
  const staleUrls = new Set((before || []).map((t) => t.public_url).filter(Boolean));
  if (staleUrls.size > 0) {
    log(`      发现 ${staleUrls.size} 个残留 tunnel，将被忽略`);
  }

  // ② 杀残留进程，并等 4040 真正释放（500ms 远远不够）
  killResiduals();
  if (cfg.apiPort) {
    const released = await waitNgrokApiDown(8000);
    if (!released) {
      log('      ⚠ 4040 仍被占用，本次可能拿到旧链接');
      log('        手动清理:  taskkill /F /IM ngrok.exe');
    }
  } else {
    await sleep(800);
  }

  log('[2/4] 启动穿透 (' + cfg.name + ')...');

  // 构造 spawn 参数（统一剔除代理变量，ngrok 免费版不接受代理）
  const cleanEnv = envWithoutProxy();
  let cmd, args, opts;
  if (cfg.useBinary) {
    cmd = isWin ? 'cpolar.exe' : 'cpolar';
    args = cfg.cmd;
    opts = { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv };
  } else if (isWin) {
    cmd = 'npx.cmd';
    args = cfg.cmd;
    opts = { stdio: ['ignore', 'pipe', 'pipe'], shell: true, windowsVerbatimArguments: true, env: cleanEnv };
  } else {
    cmd = 'npx';
    args = cfg.cmd;
    opts = { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv };
  }

  try {
    tunnelProc = spawn(cmd, args, opts);
  } catch (e) {
    log('      ✗ spawn 失败: ' + e.message);
    process.exit(1);
  }

  tunnelProc.on('error', (err) => {
    log('      ✗ 穿透启动失败: ' + err.message);
    cleanup();
    process.exit(1);
  });

  tunnelProc.on('exit', (code) => {
    if (found) return;  // URL 已经拿到了，穿透退出不影响
    log('      ✗ 穿透进程提前退出 (code=' + code + ')');
    if (provider === 'ngrok') {
      log('         检查 token:    npx ngrok config check');
      log('         配置 token:    npx ngrok config add-authtoken <你的token>');
      log('         是否残留:      tasklist | findstr ngrok');
    }
    cleanup();
    process.exit(code ?? 1);
  });

  // 抓所有输出（合并 stdout + stderr）
  const { PassThrough } = require('node:stream');
  const readline = require('node:readline');
  const merged = new PassThrough();
  tunnelProc.stdout.pipe(merged);
  tunnelProc.stderr.pipe(merged);

  // 也打印 stderr 原文（帮用户看错误）
  tunnelProc.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (!s || found) return;
    if (s.includes('DEP0190')) return;

    if (/http\/s proxy|proxy_url/i.test(s)) {
      log('      ⚠ ngrok 免费版不允许走 HTTP 代理（付费功能）');
      log('        脚本已自动剔除 http_proxy/https_proxy，若仍失败说明网络需代理才能访问 ngrok');
      log('        改用国内通道:  pnpm tunnel:cpolar');
      return;
    }
    if (/ERR_NGROK_334|already online/i.test(s)) {
      log('      ⚠ 旧 ngrok session 未注销（endpoint 已在线）');
      log('        已自动清理，若反复出现请等 30 秒再重试');
      return;
    }
    if (/authentication failed/i.test(s)) {
      log('      ⚠ 认证失败，检查 token:  npx ngrok config check');
      return;
    }
    console.log('      [err] ' + s.slice(0, 250));
  });

  // 正则抓 URL（lt / cf / cpolar）
  readline.createInterface({ input: merged }).on('line', (line) => {
    if (found) return;
    const url = extractUrl(line);
    if (url) printUrl(url);
  });

  // ngrok: 轮询本地 API（最可靠）
  if (cfg.apiPort) {
    await pollApi(cfg.apiPort, staleUrls);
  }
}

/**
 * 轮询 4040 拿本次新建的 tunnel。
 * 三条硬性条件，缺一不可：
 *   1) 不在启动前的 staleUrls 里（排除旧进程的链接）
 *   2) config.addr 指向当前 PORT（排除别的项目开的 tunnel）
 *   3) 公网真能打通本地 /health（排除刚建立还没 ready 的）
 */
async function pollApi(port, staleUrls = new Set()) {
  log('[3/4] 等待 tunnel 建立...');
  const expectedAddr = `:${PORT}`;

  for (let i = 0; i < 40; i++) {
    if (found) return;
    await sleep(700);

    const tunnels = await getNgrokTunnels(port);
    if (!tunnels) continue;  // 4040 还没起来

    const fresh = tunnels.filter((t) => {
      if (t.proto !== 'https') return false;
      if (staleUrls.has(t.public_url)) return false;
      const addr = (t.config && t.config.addr) || '';
      return addr.endsWith(expectedAddr) || addr.includes(expectedAddr);
    });

    if (fresh.length > 0) {
      const url = fresh[0].public_url;
      await sleep(1200);  // 等 tunnel 完全 ready
      if (await verifyPublicUrl(url)) {
        printUrl(url);
        return;
      }
      log(`      ⚠ ${url} 暂不可达，继续等待...`);
    }
  }

  log('      ✗ 40 次轮询未拿到可用 URL');
  log('        可能原因：');
  log('          - ngrok 报 ERR_NGROK_334（旧 session 未注销）');
  log('          - 4040 被旧进程占用，拿到的是过期 tunnel');
  log('        手动排查:  taskkill /F /IM ngrok.exe  然后重跑');
  cleanup();
  process.exit(1);
}

// ===== 主流程 =====
(async () => {
  log('');
  log('   ==============================================');
  log('   🃏  斗地主一键公网启动');
  log('   Provider: ' + cfg.name);
  log('   ' + cfg.hint);
  log('   ==============================================');

  await ensureNodeRunning();
  await startTunnel();

  if (found) {
    log('[4/4] Tunnel 运行中。Ctrl+C 退出。');
  }
})();
