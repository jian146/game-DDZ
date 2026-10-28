/**
 * 根目录统一打包脚本 — 所有产物额外输出到仓库根 build/
 *
 * 执行流程：
 *   1. tsc 编译后端 → game-ddz-server/dist/（本地编译 + 现有部署方式不变）
 *   2. 复制前端 dist → game-ddz-server/public/（单服务部署模式兼容）
 *   3. 汇总：复制到根目录 build/（统一产物目录）
 *
 * 产物结构：
 *   game-DDZ/build/
 *   ├── public/          前端静态文件（index.html + assets/）
 *   └── dist/            后端编译产物（app.js + utils/*.js）
 *
 * 三种部署方式：
 *   A) 上传 game-ddz-server/ 整个目录 → node dist/app.js
 *   B) 上传 build/ + 复制 game-ddz-server/package.json/node_modules 到旁边
 *   C) 上传整个 game-DDZ/（build/ 里有完整产物）
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ===== 路径定义 =====
const SERVER_ROOT = path.resolve(__dirname, '..');                         // game-ddz-server/
const REPO_ROOT   = path.resolve(SERVER_ROOT, '..');                       // game-DDZ/
const WEB_DIST    = path.resolve(REPO_ROOT, 'game-ddz-web', 'dist');        // 前端构建产物（已由 pnpm build:web 生成）
const SERVER_PUBLIC = path.resolve(SERVER_ROOT, 'public');                 // 单服务部署（原样保留）
const SERVER_DIST   = path.resolve(SERVER_ROOT, 'dist');                   // tsc 编译输出
const OUT_DIR       = path.resolve(REPO_ROOT, 'build');                    // 🎯 根目录统一产物
const OUT_PUBLIC    = path.join(OUT_DIR, 'public');
const OUT_DIST      = path.join(OUT_DIR, 'dist');

function log(msg)  { console.log(`\x1b[36m[build]\x1b[0m ${msg}`); }
function ok(msg)   { console.log(`\x1b[32m  ✓\x1b[0m ${msg}`); }
function fail(msg) { console.error(`\x1b[31m  ✗\x1b[0m ${msg}`); process.exit(1); }

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ===== 前置检查 =====
log('前置检查');
if (!fs.existsSync(WEB_DIST)) {
  fail(`前端 dist 不存在: ${WEB_DIST}\n  请先运行 pnpm build:web 或 pnpm build`);
}
ok(`前端构建产物就绪: ${WEB_DIST}`);

// ===== Step 1: tsc 编译后端 =====
log('Step 1/3: tsc 编译后端 TypeScript → game-ddz-server/dist/');
try {
  execSync('npx tsc', { cwd: SERVER_ROOT, stdio: 'inherit' });
} catch {
  fail('后端编译失败');
}
ok('后端编译完成');

// ===== Step 2: 单服务部署兼容（原样保留） =====
log('Step 2/3: 单服务部署兼容 → game-ddz-server/public/');
if (fs.existsSync(SERVER_PUBLIC)) fs.rmSync(SERVER_PUBLIC, { recursive: true, force: true });
copyDir(WEB_DIST, SERVER_PUBLIC);
ok(`单服务 public 就位（${fs.readdirSync(SERVER_PUBLIC).length} 项）`);

// ===== Step 3: 汇总到根目录 build/ =====
log('Step 3/3: 汇总到根目录 build/');
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
copyDir(WEB_DIST, OUT_PUBLIC);
copyDir(SERVER_DIST, OUT_DIST);
ok(`根目录 build/ 就绪（public ${fs.readdirSync(OUT_PUBLIC).length} 项 + dist ${fs.readdirSync(OUT_DIST).length} 项）`);

// ===== 汇总打印 =====
log('打包完成！产物位置：');
console.log(`  \x1b[32m📁 game-ddz-server/public/\x1b[0m   单服务部署前端静态文件`);
console.log(`  \x1b[32m📁 game-ddz-server/dist/\x1b[0m     后端编译产物`);
console.log(`  \x1b[33m📁 game-DDZ/build/\x1b[0m            🎯 统一产物（gitignore）`);
console.log('');
console.log('部署（任选一种）：');
console.log('  A) 上传 game-ddz-server/ → node dist/app.js');
console.log('  B) 上传 build/ + game-ddz-server/package.json → node dist/app.js');
console.log('');

if (!fs.existsSync(path.join(OUT_DIST, 'app.js'))) {
  fail('build/dist/app.js 不存在！');
}
ok('全部就绪 ✅');
