/**
 * 后端打包脚本（单服务部署）
 * 流程：
 *  1. 把 game-ddz-web/dist/ 复制到 game-ddz-server/public/
 *  2. tsc 编译后端 TS → dist/
 *  结果：public/ + dist/ + node_modules/ → 上传到单服务即可运行
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIST = path.resolve(ROOT, '..', 'game-ddz-web', 'dist');
const SERVER_PUBLIC = path.resolve(ROOT, 'public');

function log(msg) {
  console.log(`\x1b[36m[build:server]\x1b[0m ${msg}`);
}

// Step 1: 复制前端产物
log('Step 1/2: 复制前端 dist → server/public');
if (!fs.existsSync(WEB_DIST)) {
  console.error(`\x1b[31m前端 dist 不存在: ${WEB_DIST}\x1b[0m`);
  console.error('请先在根目录运行 `pnpm build:web` 或 `pnpm build`');
  process.exit(1);
}

// 清空旧 public
if (fs.existsSync(SERVER_PUBLIC)) {
  fs.rmSync(SERVER_PUBLIC, { recursive: true, force: true });
}
fs.mkdirSync(SERVER_PUBLIC, { recursive: true });

// 递归复制目录
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
copyDir(WEB_DIST, SERVER_PUBLIC);

const publicFileCount = fs.readdirSync(SERVER_PUBLIC).length;
log(`public/ 已就位（顶层 ${publicFileCount} 项）`);

// Step 2: tsc 编译
log('Step 2/2: tsc 编译后端 TypeScript');
try {
  execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('\x1b[31m后端编译失败\x1b[0m');
  process.exit(1);
}

const distApp = path.resolve(ROOT, 'dist', 'app.js');
log(`✅ 打包完成！产物在 game-ddz-server/ 下：`);
log(`   public/  (前端静态文件)`);
log(`   dist/   (后端 JS)`);
log('');
log('单服务部署：上传整个 game-ddz-server/ 目录，启动命令:');
log('  node dist/app.js');

if (!fs.existsSync(distApp)) {
  console.error(`\x1b[31mdist/app.js 不存在，编译可能有问题\x1b[0m`);
  process.exit(1);
}
