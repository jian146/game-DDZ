# 🃏 斗地主 Web 游戏

一款基于 **React + Express + WebSocket** 的在线斗地主，支持最多 3 人实时对战，内置纯服务端 AI 陪玩。**单服务即可部署**——后端同时承载前端静态文件，一个 Node 进程搞定 HTTP API + WebSocket + SPA。

![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933)
![pnpm](https://img.shields.io/badge/pnpm-9-F69220)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Express](https://img.shields.io/badge/Express-4-000000)
![ws](https://img.shields.io/badge/ws-8-FFCA28)

---

## 🌟 特性

| 特性 | 说明 |
|---|---|
| 在线对战 | 最多 3 人同房间实时对战，WebSocket 毫秒级同步 |
| 双玩法 | **斗地主**（54 张，叫地主 2 打 1）和 **跑得快**（48 张，各自为战，能管必须管），建房时选择 |
| AI 陪玩 | 纯服务端实现：牌型识别 → 全枚举 → 贪心打分；思考时长按动作分档（叫地主 0.45~0.7s / 出牌 0.65~1s / 不要 0.32~0.5s），决策逻辑不变 |
| 本轮出牌记录 | 牌桌中央按顺序摆出**这一轮每家出的牌**（不止上一手），过牌显示「不要」胶囊；两家都过后自动清空 |
| 提示 | 点「提示」自动选中能管上的牌，连点轮换下一组候选；候选由服务端枚举，规则只有一份 |
| 全端适配 | PC / 平板 / 手机竖屏横屏全覆盖，手牌按视口自动缩放叠压，20 张地主牌也不溢出 |
| 音效 | Web Audio 实时合成，**零音频文件**；发牌/出牌/炸弹/胜负/叫地主/砸人全场景；可开关并记忆 |
| 互动玩法 | 🍅 砸番茄 / 🥚 扔鸡蛋，抛物线飞向目标 + 爆开 + 头像抖动；AI 被砸会记仇砸回来 |
| 快捷语音 | 8 句经典斗地主台词（"快点吧，我等的花儿都谢了"…），语音条 + 头像气泡，mp3 本地托管 |
| 默认头像 | 昵称哈希 → 稳定渐变色 + 首字符，AI 独立配色；地主皇冠、当前回合呼吸光圈、剩余牌数角标 |
| 牌桌版式 | 木框暖色桌面 + 中央水印；头像下方深色信息板（昵称 / 积分金币）；剩余牌数蓝色方块角标；右下竖排工具栏（砸番茄 / 扔鸡蛋 / 语音） |
| 账号系统 | 昵称 + 密码注册登录，scrypt 加盐哈希；无状态签名 token，服务重启不掉登录 |
| 数据持久化 | 积分 / 胜场 / 局数落盘 JSON，原子写防损坏；重启后账号和战绩都在 |
| 单服务部署 | Express 同时托管前端 SPA，HTTP API + WS + 静态文件同一个端口 |
| 房间制 | HTTP 创建房间，WS 实时同步房间状态 |
| 房主权限 | 只有房主能增删 AI、开始游戏；对局中新玩家无法中途加入顶掉牌局 |
| 断线保护 | 刷新/切后台不掉座位（90 秒宽限），离线期间由 AI 托管出牌 |
| 心跳与重连 | 客户端自动心跳（20s），断线自动重连（最多 10 次） |
| 首屏加载 | HTML 内联骨架（0 依赖，首帧就出画面）+ 服务端 gzip + 路由懒加载分包 + 静态资源 immutable 长缓存 |
| 健康检查 | `/health` 端点，支持 Railway / Render 自动健康检查 |

---

## 📦 目录结构

```
game-DDZ/
├── package.json                 # 根目录：统一 scripts
├── pnpm-workspace.yaml          # monorepo 声明（game-ddz-web + game-ddz-server）
├── railway.json                 # Railway 部署配置
├── .gitignore
│
├── scripts/                     # 🎯 新增：运维脚本
│   ├── tunnel.js                #   内网穿透包装（ngrok / localtunnel / cpolar / cloudflared）
│   ├── gen-voice.py             #   🗣 用 edge-tts 生成快捷语音 mp3
│
├── start-game.bat               # 🖱 双击启动脚本
├── start-game.ps1               # PowerShell 一键启动（自动检查构建 + 启动 + 穿透）
│
├── game-ddz-web/                # 前端（React 19 + Vite 8 + Ant Design + Tailwind）
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Auth/            #   登录 / 注册页
│   │   │   └── DouDiZhu/        #   游戏大厅 + 游戏页
│   │   │       └── components/
│   │   │           ├── playerHeader/  # 三家头像位（含移除 AI 按钮 / 被砸抖动）
│   │   │           └── funLayer/      # 🍅 投掷特效 + 💬 语音气泡（fixed 覆盖层）
│   │   ├── components/
│   │   │   ├── playerAvatar/    #   默认头像（昵称哈希 → 渐变色 + 首字）
│   │   │   ├── pageLoading/     #   路由懒加载时的全屏加载页
│   │   │   └── decor/           #   花色图标
│   │   ├── utils/
│   │   │   ├── auth.ts          #   🔐 登录态管理 + 注册/登录/资料接口封装
│   │   │   ├── sound.ts         #   🔊 音效引擎（Web Audio 合成，无音频文件）
│   │   │   ├── voice.ts         #   🗣 快捷语音（mp3 缓存播放 + 文案表）
│   │   │   ├── useViewport.ts   #   视口 hook（isMobile / isSmall / 横屏）
│   │   │   └── request / card / storage / awaitHelper
│   │   ├── App.tsx / main.tsx / router.tsx
│   │   └── index.css            #   全局样式 + 移动端基础修正
│   ├── proxy.ts                 #   环境配置（dev / test / pre / prod WS 地址）
│   ├── vite.config.ts / tailwind.config.ts / postcss.config.js
│   └── public/
│       ├── favicon.svg / icons.svg
│       └── voice/               #   🗣 8 条快捷语音 mp3（gen-voice.py 生成）
│
├── game-ddz-server/             # 后端（Node.js + Express + ws）
│   ├── app.ts                   #   🧠 主入口：HTTP API + WebSocket + 静态文件 + AI 调度
│   ├── store.ts                 #   💾 玩家数据持久化（JSON 原子写 + 防抖落盘）
│   ├── auth.ts                  #   🔑 密码哈希（scrypt）+ 无状态签名 token
│   ├── init.ts                  #   牌数据初始化（54 张扑克牌）
│   ├── scripts/build.js         #   打包脚本：tsc + 复制前端 + 汇总到根 build/
│   ├── scripts/pdk-check.ts     #   🧪 跑得快规则自检（39 项断言，ts-node 直接跑）
│   ├── scripts/pdk-e2e.ts       #   🧪 跑得快整局对局脚本（需服务在 9302 运行）
│   ├── scripts/round-hint-check.ts #  🧪 出牌日志 + 提示端到端校验（双玩法，401 项）
│   ├── utils/
│   │   ├── card.ts              #   洗牌 / 发牌工具
│   │   ├── identify.ts          #   斗地主：12 种牌型识别 + 压牌判定
│   │   ├── enumerate.ts         #   斗地主：候选牌型枚举（手牌 → 所有可出组合）
│   │   ├── pdk.ts               #   🏃 跑得快：48 张牌堆 / 牌型 / 定庄 / 能管判定 / 枚举
│   │   └── ai.ts                #   AI 贪心决策（斗地主 decideAI + 跑得快 decidePdkAI）
│   ├── data/                    #   ⚠️ 玩家数据（players.json + secret.key，gitignore）
│   ├── public/                  #   ⚠️ 产物（build 自动生成，gitignore）
│   └── dist/                    #   ⚠️ 产物（tsc 自动生成，gitignore）
│
└── build/                       # 🎯 根目录统一产物（gitignore，部署时可选）
    ├── public/                  #   前端静态文件（与 game-ddz-server/public/ 同内容）
    └── dist/                    #   后端编译产物（与 game-ddz-server/dist/ 同内容）
```

### ⚠️ 三个"看起来重复"的产物目录

| 路径 | 性质 | 何时生成 | gitignore |
|---|---|---|---|
| `game-ddz-web/dist/` | 前端 Vite 构建直接输出 | `pnpm build:web` | ✅ |
| `game-ddz-server/public/` | 单服务部署模式专用 | `pnpm build` 自动复制 | ✅ |
| `game-DDZ/build/public/` + `build/dist/` | 根目录统一产物 | `pnpm build` 自动汇总 | ✅ |

**三套完全一样的内容**，只是给不同部署方式用的（任选其一即可）。全部在 gitignore 里。

---

## 🛠 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 前端框架 | React | 19 | SPA，函数组件 + Hooks |
| 构建工具 | Vite | 8 | 极速 HMR，生产构建同源 |
| UI 组件 | Ant Design | 5 | 大厅页表单 + 消息提示 |
| 样式 | Tailwind CSS 4 + Less | — | Tailwind 做原子样式，Less 做组件模块化 |
| 路由 | React Router DOM | 7 | `/` 大厅 → `/game/:roomId` 游戏页 |
| 后端框架 | Express | 4 | HTTP API + 静态文件托管 |
| WebSocket | ws | 8 | 同端口挂载，实时通信 |
| AI 算法 | 自研 | — | 牌型识别 → 全枚举 → 贪心打分（详见 CODE_WIKI.md §9） |
| 语言 | TypeScript | 5 | 全栈类型安全 |
| 包管理 | pnpm | 9 | monorepo workspace |
| Node | Node.js | ≥ 18 | 运行时 |

---

## 🚀 快速开始

### 环境准备

```bash
# 确认版本
node -v    # 需 ≥ 18
pnpm -v    # 需 ≥ 9

# 如果没装 pnpm
npm install -g pnpm@9
```

### 一键安装

```bash
pnpm install
```

pnpm workspace 会一次性装好前后端所有依赖（约 395 个包，20-30 秒）。

---

### 开发模式（前后端分离，热重载）

两个 Vite dev server，各自 HMR：

```bash
# 终端 1：后端（9200 端口）
pnpm dev:server

# 终端 2：前端（9100 端口，自动代理 /api 和 WS 到后端）
pnpm dev:web
```

或一条命令同时启动：

```bash
pnpm dev
```

浏览器打开 **<http://localhost:9100>** 即可。前端 dev server 会把 `/api/*` 和 WebSocket 请求自动代理到 `localhost:9200`。

---

### 生产模式（单服务，推荐部署方式）

```bash
# 构建前端 + 后端
pnpm build

# 启动（默认 9200 端口）
pnpm serve
```

浏览器打开 **<http://localhost:9200>**。这就是生产模式——Express 一个进程同时提供 SPA + API + WebSocket。

### 手动分步（等价于 `pnpm serve`）

```bash
pnpm build
node game-ddz-server/dist/app.js

# 自定义端口
PORT=3000 node game-ddz-server/dist/app.js
```

---

### 🌐 发给朋友玩（内网穿透）

朋友在公网，你在本地运行，通过穿透工具暴露出去。

#### 方案 1：ngrok（推荐，老牌稳定，免费版零验证页）

```bash
# 先配置一次（ngrok.com 注册 → 复制 authtoken）
npx ngrok config add-authtoken 你的token

# 之后每次
pnpm tunnel:ngrok
```

终端会显示：

```
   ╔══════════════════════════════════════════════╗
   ║   🎮  PUBLIC URL                              ║
   ║   https://xxxxxx.ngrok-free.dev               ║
   ║   复制上面这个链接发给朋友就能玩！            ║
   ║   ⚠ 首次打开会看到 ngrok 警告页              ║
   ║   点 "Visit Site" 即可进入游戏               ║
   ╚══════════════════════════════════════════════╝
```

**免费版注意**：ngrok 免费版会显示一个警告页（ERR_NGROK_6024），朋友第一次打开点一下 **"Visit Site"** 就进游戏了。

#### 方案 2：localtunnel（免注册，有 IP 验证页）

```bash
pnpm tunnel:lt
```

朋友第一次打开会看到验证页，把页面上显示的 IP 填进去即可（每 IP 7 天一次）。

#### 方案 3：cloudflared（海外节点，国内较慢）

```bash
node scripts/tunnel.js --provider cf
```

#### 方案 4：cpolar（国内最快，零验证页，需注册安装）

```bash
# 先去 cpolar.com 注册 + 下载 Windows 客户端
pnpm tunnel:cpolar
```

#### 穿透方案对比

| 命令 | 工具 | 国内速度 | 警告页 | 前置条件 |
|---|---|---|---|---|
| `pnpm tunnel` | ngrok（默认） | ⭐⭐⭐ | 点一次 Visit Site | ngrok.com 注册 + authtoken |
| `pnpm tunnel:ngrok` | ngrok | ⭐⭐⭐ | 点一次 Visit Site | ngrok.com 注册 + authtoken |
| `pnpm tunnel:lt` | localtunnel | ⭐⭐ | 填 IP | 免注册 |
| `pnpm tunnel:cpolar` | cpolar | ⭐⭐⭐⭐⭐ | **无** | cpolar.com 注册 + 客户端 |
| `node scripts/tunnel.js --provider cf` | cloudflared | ⭐（海外） | 无 | 免注册 |

> 💡 Ctrl+C 退出穿透时，tunnel 脚本会自动杀掉 node 游戏服务和穿透进程，不留僵尸进程。

---

### 所有命令汇总

```bash
# ─── 安装与构建 ───
pnpm install                    # 安装所有依赖（workspace 模式）
pnpm build                      # 🎯 完整构建：前端 vite → 后端 tsc → 汇总到根 build/
pnpm build:web                  # 只构建前端
pnpm build:server               # 只构建后端（tsc）

# ─── 启动 ───
pnpm serve                      # 构建 + 启动（生产模式，localhost:9200）
pnpm start                      # 直接启动（跳过构建，已跑过 build 时用）
pnpm dev                        # 开发模式（前后端同时启动 + HMR）
pnpm dev:web                    # 只起前端 dev server（localhost:9100）
pnpm dev:server                 # 只起后端（localhost:9200）

# ─── 🌐 内网穿透（发给朋友玩） ───
pnpm tunnel                     # ngrok（默认 provider，同 tunnel:ngrok）
pnpm tunnel:ngrok               # ngrok（推荐，国内可用）
pnpm tunnel:lt                  # localtunnel（免注册）
pnpm tunnel:cpolar              # cpolar（国内最快零验证）
# cloudflared 需直接运行脚本：
# node scripts/tunnel.js --provider cf

# ─── 工具 ───
pnpm typecheck                  # 后端 TypeScript 类型检查
```

---

## 🚀 部署到公网服务

### 单服务部署（推荐，零配置）

后端 Express 同时托管前端 SPA，**只需要一个 Node 进程**。

#### 上传整个 game-ddz-server/

```bash
# 本地打包
pnpm build

# 上传 game-ddz-server/ 整个目录到服务器
# 然后服务器上：
cd game-ddz-server
node dist/app.js
```

#### Render（免费但需绑卡，Railway 类似）

项目已包含 `railway.json` 和 `pnpm-workspace.yaml`，Render 会自动识别：

1. **New + → Web Service → Import GitHub repo**
2. Root Directory: `/`（仓库根）
3. Build Command: `pnpm build`
4. Start Command: `pnpm start`
5. **Health Check Path: `/health`** ⚠️ 记得填这个
6. Deploy，拿到 `https://xxx.onrender.com` 即可

#### Railway

和 Render 同理，仓库里已有 `railway.json`，自动配置。

#### 健康检查端点

`GET /health` 返回：

```json
{ "ok": true, "uptime": 3.14 }
```

Render / Railway 会定期 ping 这个端点判断容器存活。

---

### 手动部署清单（三选一）

| 方式 | 上传什么 | 启动命令 |
|---|---|---|
| A. 完整服务目录 | `game-ddz-server/`（含 public/ + dist/ + node_modules/） | `node dist/app.js` |
| B. 根 build 产物 | `build/` + 旁边放 `game-ddz-server/package.json` + `node_modules/` | `PORT=3000 node dist/app.js` |
| C. 纯产物 | `game-ddz-server/public/` + `game-ddz-server/dist/` + 一个 Node runtime | `node dist/app.js` |

> ⚠️ `game-ddz-server/public/` 和 `game-ddz-server/dist/` 在 gitignore 里，部署前先本地 `pnpm build` 生成。

---

## 📡 API 文档

### HTTP API（Express）

| 方法 | 路径 | 说明 | 输入 | 输出 |
|---|---|---|---|---|
| GET | `/health` | 健康检查 | — | `{ ok: true, uptime: number }` |
| POST | `/api/register` | 注册 | `{ name, password }` | `{ isSuccess, token, player }` |
| POST | `/api/login` | 登录 | `{ name, password }` | `{ isSuccess, token, player }` |
| GET | `/api/me` | 当前账号资料（需 Bearer） | — | `{ isSuccess, player }` |
| GET | `/api/leaderboard` | 积分排行榜 Top 20 | — | `{ isSuccess, list }` |
| GET | `/api/roomList` | 房间列表 | — | `{ isSuccess, roomList: RoomInfo[] }` |
| POST | `/api/createRoom` | 创建房间 | `{ userName?: string, mode?: 'ddz' \| 'pdk' }` | `{ isSuccess, roomId: number }` |
| POST | `/api/addAI` | HTTP 添加 AI（测试用，受房主权限约束） | `{ roomId, skipAutoStart? }` | `{ isSuccess, room }` |
| POST | `/api/removeAI` | HTTP 删除 AI（测试用，受房主权限约束） | `{ roomId, targetId }` | `{ isSuccess, room }` |

> 注册/登录失败也返回 HTTP 200，用 `isSuccess: false` + `message` 区分业务错误。
> `/api/me` 未登录返回 401，前端据此跳登录页。
> 带 `Authorization` 时以 token 里的昵称为准，body 里的 `playerId` 无法冒充房主。

### WebSocket 消息协议

所有消息 JSON 格式：`{ type: "...", ...fields }`

#### 客户端 → 服务端

| type | 必填字段 | 说明 |
|---|---|---|
| `onJoin` | roomId, token | 加入房间（身份以 token 为准，`playerId` 仅兼容旧链接） |
| `onLeave` | roomId, playerId | 退出房间（主动退出，立即生效） |
| `addAI` | roomId, playerId | **仅房主**：添加 AI 玩家 |
| `removeAI` | roomId, playerId, targetId | **仅房主**：删除指定 AI（`targetId` 为 AI 昵称） |
| `onStart` | roomId | **仅房主**：开始游戏（发牌） |
| `onCall` | roomId, playerId | 叫地主 |
| `onNoCall` | roomId, playerId | 不叫地主 |
| `useCard` | roomId, playerId, position, useCard | 出牌 |
| `onNotUseCard` | roomId, playerId, position | 不要（放弃出牌） |
| `throwItem` | roomId, playerId, targetId, item | 砸道具（`item`: `tomato` / `egg`），600ms 节流 |
| `quickChat` | roomId, playerId, voiceId | 发快捷语音（`voiceId` 见服务端白名单） |
| `hint` | roomId, playerId, seq | 提示：返回能管上当前这手牌的第 `seq` 组候选，只回给发起人 |
| `ping` | — | 心跳 |

#### 服务端 → 客户端

| type | 说明 |
|---|---|
| （广播） | 所有事件处理后，服务端向房间所有人广播更新后的 **RoomInfo** 对象 |
| `throwItem` | 投掷事件：`{ from, to, item, ts, fromAI? }`，**不带房间数据**，纯通知 |
| `quickChat` | 语音事件：`{ from, voiceId, text, ts }`，客户端据此播 mp3 + 冒气泡 |
| `hint` | `{ type: 'hint', seq, total, cards }`，`total` 为候选组数，`cards` 为空表示要不起 |
| `pong` | 心跳回复 `{ type: 'pong' }` |
| （错误） | `{ isError: true, message: '...' }` |
| `maxCount` | `{ status: 'maxCount' }` 房间已满 |

> `throwItem` / `quickChat` 走的是独立的 `sendRoomEvent()`，不会把整份 RoomInfo 重推一遍。
> 房间数据本身没变，重推只是白费带宽。前端在 `handleServerMessage` 最前面拦这两种 `type`。
> `hint` 走 `sendMesForPlay()`，只发给发起人 —— 提示是个人操作，不该广播。

### RoomInfo 对象（房间状态）

```typescript
interface RoomInfo {
  roomId: number;                     // 房间 ID
  status: 'prepare' | 'selectLandlord' | 'reopen' | 'play' | 'useCard' | 'end';
  player: RoomPlayer[];               // 最多 3 人
  round: { useCard: number[]; useId: string }[];  // 当前出牌回合（规则判定用，只含真出牌）
  roundLog: { useId: string; useCard: number[]; pass?: boolean }[];  // 本轮完整过程（含「不要」），给前端展示
  current: number;                    // 当前操作玩家索引 (0/1/2)
  lastUser: number;                   // 上一个出牌玩家索引（跑得快里 -1 = 本局还没人出过）
  notUseCardCount: number;            // 连续不要次数（=2 时重置 round）
  callCount: number;                  // 叫地主轮次
  aHand: number[];                    // 底牌 3 张（跑得快为空）
  winRole: number;                    // -1=未开始, 0=地主胜, 1/2=农民胜
  mode?: 'ddz' | 'pdk';               // 玩法，缺省按斗地主

  // ===== 仅跑得快 =====
  banker?: number;                    // 庄家（player 索引）
  markerId?: number;                  // 本房间第一局首出必须带的牌 id
  mustPlay?: boolean;                 // 当前玩家能管上 → 「不要」置灰
  winnerIndex?: number;               // 赢家（player 索引）
  pdkDelta?: number[];                // 本局累计增减分（含炸弹分）
  pdkBomb?: { by: number } | null;    // 挂起的炸弹，被压掉就作废
  scoreDeltas?: number[];             // 结算后每家的增减分，供结果面板展示
}

interface RoomPlayer {
  playerId: string;                   // 玩家名 / AI 名
  position: 0 | 1;                    // 0=地主, 1=农民（跑得快恒为 1）
  isOnline: boolean;
  isAI: boolean;                      // 是否 AI 托管
  score: number;
  card: number[];                     // 手牌（54 张 id，不含已出的）
}
```

### ⚠️ PlayerPosition 命名陷阱

`RoomPlayer.position` 字段表示**角色**（0=地主, 1=农民），但前端 WS 消息里的 `position` 字段传的是 `player[]` 数组的**索引**（0/1/2）。**两个概念完全不同，不要混淆。**

### 房间状态流转

```
prepare ── start ──► selectLandlord ── call ──► play ──► useCard ──► end
                         │                           ▲          │
                         └── noCall ×3 ──► reopen    └──────────┘
                                              (自动 start)
```

跑得快没有叫地主环节，`start` 直接进 `play`：

```
prepare ── start ──► play ──► useCard ──► end
                      ▲          │
                      └──────────┘
```

---

## 🔐 账号与积分

### 注册登录

未登录访问任何页面会被守卫拦到 `/login`，注册成功后自动登录并回到原地址。

- 昵称 2~10 字符，只能中文 / 字母 / 数字 / 下划线，**全局唯一**（大小写不敏感）
- 密码 4~32 位
- 密码用 Node 内置 `scrypt` 加盐哈希后存储，每个账号独立 16 字节随机盐，**磁盘上没有明文密码**

### 登录态

服务端签发 HMAC-SHA256 签名的无状态 token（有效期 7 天），前端存 localStorage，请求自动带 `Authorization: Bearer <token>`。

- 进程重启后 token 依然有效，玩家不用重新登录
- 签名密钥在 `data/secret.key`，和数据一起备份
- 注销只是前端清掉 token（无状态 token 无法在服务端主动吊销）

### 身份校验

WS 的 `onJoin` 消息必须带 token，服务端据此确定真实身份。

客户端自报的 `playerId` **不可信**：认证通过后，该 socket 后续所有消息里的 `playerId` 都会被强制覆盖成 token 对应的昵称。所以改 URL、改消息体都冒充不了别人。

### 积分规则

**斗地主**：地主 1v2，风险收益对等。

| 结果 | 地主 | 每个农民 |
|---|---|---|
| 地主赢 | +2 | -1 |
| 农民赢 | -2 | +1 |

**跑得快**：炸弹分 + 剩余牌分，三家零和。

| 项 | 规则 |
|---|---|
| 炸弹 | 出炸者 +20，另外两家各 -10；**被打掉的炸弹不算分** |
| 剩余牌 | 赢家按每个输家剩余张数收分；输家只剩 1 张（报单）不扣分 |

详见 [🏃 跑得快 · 积分](#积分-1)。

同时累加：胜场 +1（仅赢家）、总局数 +1（所有人）。AI 玩家不记分。

结算在牌出完、房间状态转 `end` 的那一刻触发，用 `roomInfo.settled` 标记防止重复加分。

### 数据存储

`game-ddz-server/data/players.json`：

```json
{
  "version": 1,
  "players": [
    {
      "id": "7243b4e82d604c3e95f67f35",
      "name": "老王",
      "hash": "620eef3c...（scrypt 派生，128 hex）",
      "salt": "5e6efbf9...（16 字节）",
      "score": 2,
      "wins": 1,
      "games": 1,
      "createdAt": 1793253909428,
      "lastLoginAt": 1793253916068
    }
  ]
}
```

**为什么用 JSON 而不是数据库**：单进程 + 小规模玩家，JSON 够用；零依赖、零 Node 版本门槛，部署不需要 native 编译；备份就是拷一个文件。

写入策略：

- **原子写**：先写 `players.json.tmp` 再 rename，进程中途被杀不会留下半个文件
- **防抖落盘**：100ms 内的多次改动合并成一次磁盘 IO
- **退出兜底**：收到 `SIGINT` / `SIGTERM` 时强制落盘
- **损坏保护**：读到坏文件先备份成 `players.json.broken-<时间戳>` 再重建空库，不会静默覆盖

> ⚠️ `data/` 已加入 `.gitignore`，里面有密码哈希和签名密钥，**不要提交、不要公开**。
>
> Railway / Render 的容器文件系统是临时的，重新部署数据会丢。要长期保存需要挂载持久卷（Railway 的 Volume），或用 `DDZ_DATA_DIR` 环境变量把数据目录指到持久化路径。

---

## 👑 房主与房间权限

房间里**第一个加入的真人**自动成为房主（`RoomInfo.ownerName`）。

### 房主能做什么

| 操作 | 权限 |
|---|---|
| 添加 AI | 仅房主 |
| 删除 AI | 仅房主，且只能删 AI，删不了真人 |
| 开始游戏 | 仅房主 |

非房主在准备阶段看到的是「等待房主 xxx 开局…」，这些按钮根本不渲染。

### 中途加入的限制

对局进行中（`selectLandlord` / `play` / `useCard`）**不接受新玩家加入**，服务端返回 `gameInProgress: true`，前端弹窗引导回大厅。

这条限制不是可选项：`onJoin` 在加入新玩家时会把 `status` 重置成 `prepare`，不拦的话第三个人进来就能把正在打的牌局直接顶掉重开。

### 断线不算退出

刷新页面、切后台、网络抖动都会触发 WebSocket 关闭，但**不会立刻把人清出座位**：

- 断线后先标记 `isOnline = false`，座位保留 90 秒
- 90 秒内重连 → 恢复在线状态，位置不变
- 超时未归 → 才真正移除
- 轮到离线玩家操作时，AI 自动托管出牌，牌局不会卡死

主动点「退出房间」则立即移除，不走宽限期。

### 房主退出

房主主动退出或被超时清理后，房主自动转给房间里下一个真人。房间里没有真人了（空房或只剩 AI）就整个删除。

---

## 🃏 数据模型

### 牌的编号

一副牌 = 54 张，每张牌用一个 **id（1~54）** 表示：

```
id 1~13:   ♠ 3,4,5,6,7,8,9,10,J,Q,K,A,2
id 14~26:  ♥ 3,4,5,6,7,8,9,10,J,Q,K,A,2
id 27~39:  ♣ 3,4,5,6,7,8,9,10,J,Q,K,A,2
id 40~52:  ♦ 3,4,5,6,7,8,9,10,J,Q,K,A,2
id 53:     小王
id 54:     大王
```

### 点数映射（point）

```
3→3, 4→4, 5→5, 6→6, 7→7, 8→8, 9→9, 10→10
J→11, Q→12, K→13, A→14
2→16, 小王→17, 大王→18
```

> 💡 2 的 point 是 **16** 不是 15——因为地主拿到底牌后最大牌是 2 和王，中间留空位方便比较。

### 12 种牌型

| 牌型 | 说明 | 识别位置 |
|---|---|---|
| 单张 | 任意一张牌 | `identify.ts` |
| 对子 | 两张相同点数（不含王） | |
| 三张 | 三张相同点数 | |
| 三带一 | 三条 + 一张单牌 | |
| 三带二 | 三条 + 一对子 | |
| 顺子 | 5+ 张连续点数（3~A，不含 2 和王） | |
| 连对 | 3+ 对连续点数 | |
| 飞机 | 2+ 组连续三条（不带牌） | |
| 飞机带单 | n 组连续三条 + n 张单牌 | |
| 飞机带对 | n 组连续三条 + n 对子 | |
| 炸弹 | 四条相同点数 | |
| 王炸 | 大小王 | |

---

## 🤖 AI 陪玩机制

AI 为**纯服务端**实现，核心逻辑三层：

```
手牌 → enumerate.ts 全枚举所有可出组合 → identify.ts 过滤合法牌型 → ai.ts 贪心打分选最优
```

### 调度 hook

每次房间状态转移后，`scheduleAITurn(roomInfo)` 自动触发：

```
状态转移 → 检查当前玩家是否 AI → 按动作类型取思考时长 → ai.ts 决策 → 执行出牌/叫地主/pass
```

思考时长只是「表演时间」，不影响决策：

| 动作 | 时长 | 理由 |
|---|---|---|
| 叫地主 / 不叫 | 0.45~0.7s | 只是举手，没有牌要展示 |
| 出牌 | 0.65~1.0s | 留出看清这一手的时间 |
| 不要 | 0.32~0.5s | 没有牌要展示，压到最短 |
| 掉线托管 | 再 ×0.6 | 没人看，直接快进 |

> 先空算一次决策只为拿到动作类型（决策是纯函数，不产生副作用），
> 真正执行时会在定时器里用**最新状态重算一次**，避免用过期决策。

### 决策优先级

1. **能压必压**：上家出牌则寻找能压过的最小组合
2. **最少剩牌**：优先打出能让自己手牌最少的组合
3. **安全出牌**：手牌少时出大牌，留小牌；手牌多时先出小牌
4. **pass 兜底**：无法出或策略需要时 pass

### 叫地主策略

手牌加权评分（炸弹 +10、2 +3、王 +5、A +1），超过阈值则叫地主。

---

## 🏃 跑得快（第二种玩法）

大厅建房时选「跑得快」，房间对象带 `mode: 'pdk'`，服务端走另一套发牌 / 牌型 / 结算逻辑。
**规则全部集中在 `game-ddz-server/utils/pdk.ts`**，`app.ts` 只做流程调度。

### 和斗地主的差异

| 项 | 斗地主 | 跑得快 |
|---|---|---|
| 牌堆 | 54 张（含大小王） | **48 张**（去大小王、三张 2、一张 A） |
| 手牌 | 地主 20 / 农民 17 | 每人 **16 张**，无底牌 |
| 阵营 | 地主 1 打 2 | **各自为战**，没有队友 |
| 开局 | 叫地主 / 抢地主 | 无，直接开打 |
| 三带二 | 必须带一个**对子** | 带**任意两张**，不要求对子 |
| 裸三张 | 随时可出 | **只有这一手打完就出完时才允许** |
| 连对 | ≥3 对 | **≥2 对** |
| 过牌 | 随时可以不要 | **能管必须管**，能压就得压（炸弹也算） |
| 胜负 | 地主先出完 → 地主赢 | **第一个出完的人赢**，并成为下局庄家 |
| 积分 | 地主 ±2，农民 ±1 | 炸弹分 + 剩余牌分（见下） |

### 牌堆

```ts
// 从 52 张标准牌里剔掉：红桃2 / 梅花2 / 方片2 / 方片A
const PDK_EXCLUDED = new Set([26, 39, 52, 51])
export const PDK_DECK = [1..52].filter(id => !PDK_EXCLUDED.has(id))  // 48 张
```

- 只留一张 2（黑桃 2），它是全场最大的单张
- **四个 3 全都在** —— 这是「庄家有四个三就改判黑桃4」能生效的前提
- A 只剩三张

### 定庄与首出

**本房间第一局**：谁抓到黑桃 3 谁坐庄，且他第一次出牌必须带上这张牌。
如果庄家把这个点数的四张全抓在手里（比如四个 3），规则顺延到下一点数（黑桃 4），
还全抓就继续顺延到黑桃 5……直到某个点数没有全抓为止。

```ts
export function resolveBanker(hands: number[][]): { banker: number; markerId: number } | null {
  for (let rank = 0; rank < 13; rank++) {
    const markerId = RANK_IDS[rank][0]           // 黑桃
    const holder = hands.findIndex(h => h.includes(markerId))
    if (holder < 0) continue
    if (RANK_IDS[rank].every(id => hands[holder].includes(id))) continue  // 全抓 → 顺延
    return { banker: holder, markerId }
  }
  return null
}
```

**之后每局**：上一局赢家坐庄并先出，首出无限制（`markerId = -1`）。

> ⚠️ `lastUser === -1` 是「本局还没人出过牌」的判据，首出限制靠它识别。
> 别改成判断 `round.length === 0` —— 两家都过之后 `round` 也会被清空，会误判。

### 能管必须管

服务端在两个地方各拦一次：

| 位置 | 拦截 | 提示 |
|---|---|---|
| `onNotUseCard` | `hasAnyBeatPdk(手牌, 上家牌型)` 为真就拒绝过牌 | 「你有能管上的牌，必须出牌」 |
| `onUseCard` | 出的牌 `canBeatPdk` 不成立就拒绝 | 「管不上，换一手或者点不要」 |

前端不重复实现这套规则，靠服务端在每次状态变化时算好 `roomInfo.mustPlay` 下发，
「不要」按钮直接读这个字段置灰并变成「必须管」。

> 牌型校验同样只维护服务端一份。前端 `useCard` 在跑得快模式下**不做本地校验**，
> 直接把牌发出去由服务端裁决 —— 避免两边规则漂移（斗地主那套 `ruleList` 是历史包袱，别学）。

### 积分

**炸弹分**（固定 20 / 10）：

```
出炸者 +20，另外两家各 -10
```

炸弹被打掉就没有分。所以不能一出炸就加分，要先「挂起」：

```ts
// 出炸弹 → 挂起，覆盖掉上一颗（上一颗就被打掉了，自然作废）
roomInfo.pdkBomb = { by: playerIndex }
// 这一轮结束（两家都过）或牌局结束 → 才真正落账
commitPdkBomb(roomInfo)
```

于是「4个3 被 4个4 打掉」时，4个3 的分从来没进过账，天然符合规则。

**剩余牌分**（赢家向每个输家收）：

```
输家剩 n 张 → 输家 -n，赢家 +n
输家剩 1 张（报单）→ 双方都不动
```

**示例**（实际对局跑出来的）：

| 玩家 | 剩牌 | 炸弹 | 剩余牌分 | 合计 |
|---|---|---|---|---|
| test1（赢） | 0 | -10（别人炸） | +17（9+8） | **+7** |
| AI-小红 | 9 | -10（别人炸） | -9 | **-19** |
| AI-小明 | 8 | +20（自己炸，没被压） | -8 | **+12** |

三家增减分之和恒为 0，脚本里就是这么校验的。

### AI

`decidePdkAI(手牌, 上家牌, 必须带的牌id)`：

- 自由出牌 → `enumeratePdkAll` 全枚举；压牌 → `enumeratePdkBeats` 只留能压的
- 打分口径和斗地主不同：**一次出得越多越好**（跑牌游戏不保牌），炸弹惩罚更重，单张最不划算
- 首出必须带庄家牌时，只保留含那张牌的候选；实在没有就单出这张牌兜底
- 因为「能管必须管」，AI 只要枚举出能压的牌就一定出，不会出现「能压却过牌」

### 自检与对局脚本

```bash
# 牌型 / 定庄 / 压牌 / 能管判定，39 项断言
cd game-ddz-server && npx ts-node scripts/pdk-check.ts

# 真实跑完一整局（需要服务已在 9302 跑起来）
cd game-ddz-server && npx ts-node scripts/pdk-e2e.ts

# 出牌日志 roundLog + 提示 hint（斗地主 / 跑得快各跑一局）
cd game-ddz-server && npx ts-node scripts/round-hint-check.ts
```

`pdk-e2e.ts` 会登录 test1、建 pdk 房、加 2 个 AI、用同一套 AI 决策代替真人出牌，
全程校验：牌堆 48 张 / 每人 16 张 / 没有大小王 / 只有一个 2 / 四个 3 都在 /
首出带庄家牌 / 「必须管」会被拒绝 / 三家分数零和。

---

## 🔌 后端为什么能同时托管前端？

Express `app.ts` 里关键的两行：

```typescript
// ① 找前端 dist
const frontendDist = findFrontendDist();  // 优先级：server/public → root/build/public → web/dist

// ② 静态文件 + SPA fallback
app.use(express.static(frontendDist));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile('index.html'));

// ③ HTTP + WS 同端口
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT);
```

前端 React SPA 通过 `resolveWsAddress('__AUTO__')` 自动推导 WS 地址：

```
https://your-domain.com  →  wss://your-domain.com
http://localhost:9200    →  ws://localhost:9200
```

**天然同源，零跨域，零代理配置。**

---

## 📱 响应式与移动端适配

### 尺寸基线

牌的大小不是 CSS 写死的 `clamp`，而是**按「这一手有几张牌 + 视口宽度」用 JS 算出来**，
再通过内联 style 把 `--card-w` / `--card-h` / `--card-gap` 三个变量一起交给 CSS：

```ts
// 总宽 = 牌宽 + (n-1) × 露出宽，露出宽 = 牌宽 × (1 - 重叠比例)
const need = 1 + (n - 1) * (1 - HAND_GAP_RATIO)
const handCardW = clamp(26, floor(avail / need), maxHandCardW)
```

`--card-w` 是唯一源头，字号、圆角、选中抬起高度、点击热区全部 `calc()` 自它。

| 场景 | 重叠比例 | 上限 | 390 屏实测 |
|---|---|---|---|
| 手牌（`isSmall`） | 60% | 56px | 20 张 → 43×58，露出 17px |
| 手牌（`isMobile`） | 46% | 64px | 20 张 → 45×60，露出 18px |
| 手牌（桌面） | 46% | 76px | 20 张 → 76×102，露出 41px |
| 出牌区 | 34% | 手机 50px / 桌面 40px | 单手牌 50×67 |

- **为什么不用 `clamp`**：`clamp` 不知道这一手有几张牌，只能按最坏情况（20 张）取最小值。
  手机上手牌被压到 34px、出牌区只有 21px（点数 7px 高，等于看不见）。
- **手牌和出牌区是两个独立变量组**：手牌用 `--card-w`，出牌区 / 底牌用 `--table-card-w`
  （出牌区的 `.roundCardList` 在自己身上把 `--card-w` 指向 `--table-card-w`）。

#### ⚠️ 坑一：CSS 自定义属性在「声明它的元素」上求值

```less
/* ❌ 在 .page 上这样写，--card-h 会被 .page 的 --card-w 提前算死 */
.page { --card-w: 34px; --card-h: calc(var(--card-w) * 1.34); }
/* 之后在子元素 .cardList 上把 --card-w 改成 50px，--card-h 还是 46px */
```

`var()` 的替换发生在**声明该变量的元素**上，不是在**使用它的元素**上。
所以牌宽、牌高、间距三个值必须一起从 JS 传（`handCardVars`），别指望 CSS 级联。

反过来说，只要**声明处**的 `--card-w` 已经是最终值，写 `calc()` 就是安全的 ——
`.cardList` 上的 `--card-exposed: calc(var(--card-w) + var(--card-gap))` 就属于这种，
因为那两个变量正是内联写在同一个元素上的。

#### ⚠️ 坑二：点数字号要卡「露出条」，不是「牌宽」

叠牌时每张牌只露出左边一条（`--card-exposed`）。字号按牌宽 0.34 算的话，
「10」这种两位数宽约 1.1em，而 390 屏 20 张牌时露出条只有 17px ——
右半截被下一张盖掉，屏幕上显示成「1(」。

```less
font-size: min(
  calc(var(--card-w) * 0.34),
  calc(var(--card-exposed) * 0.72)   /* 露出条约束 */
);
```

`--card-exposed` 由各容器分别给出：

| 容器 | `--card-exposed` |
|---|---|
| `.cardList`（手牌） | `calc(var(--card-w) + var(--card-gap))` |
| `.roundCardList`（出牌区） | `calc(var(--card-w) * 0.66)`（横向重叠 34%） |
| `.aHand`（底牌） | `var(--card-w)`（不叠，整张露出） |

没有声明时 `min()` 的兜底是 `9999px`，等价于「只按牌宽算」——桌面端行为完全不变。

#### 叠牌点击

- **点牌靠热区而不是牌面**：每张牌只有「自己露出来的那一条」接收点击
  （`.cardHit` 宽度 = `--card-w + --card-gap`），所以选中一张之后，
  点旁边那张的露出区能准确选中它，跟 `z-index` 无关
- **手牌上不能加任何 `z-index`**：叠牌靠的是「后渲染的盖住前一张的右半截」。
  给选中牌加 `z-index` 会让它的整张牌身浮到最上层，把右边那张的露出区盖掉
  （实测 25px 里只剩 5px）；左右两张都选中时，中间那张等于消失。
  选中态只靠抬起 + 黄色描边表达，层叠顺序交还给 DOM。

### 出牌可读性

| 问题 | 处理 |
|---|---|
| 出牌区太小，手机上几乎看不到别人出了什么 | 出牌区牌宽按张数算，手机上限 50px（原来 clamp 只有 21px） |
| 服务端「不要」只加计数不动 `round`，牌桌毫无变化，看不出是过牌还是卡住 | 前端比对前后两帧的 `notUseCardCount` 差值，弹出「XX 不要」浮标，1.8s 自动消失 |
| 整局出牌历史纵向堆在中央，越堆越高 | 服务端另存 `roundLog`（本轮 + 「不要」），两家都过就清空；前端只渲染 `roundLog`，多组横排、放不下才换行 |
| 只看得到上一手，看不到这一轮谁还跟了牌 | 出牌区渲染 `roundLog` 全部条目，过牌的显示虚线「不要」胶囊 |
| 想跟牌但懒得算该出哪几张 | 「提示」按钮：服务端枚举能压上的候选，弱→强排序，连点轮换 |
| 出牌者昵称长短不一，牌行被挤得参差不齐 | 昵称独立成行居中，牌行从同一起点排 |

### 断点

| 断点 | 处理 |
|---|---|
| `max-width: 480px` | 手牌重叠从 46% 加到 60%（牌能更大一截）、按钮变矮、头像缩小、房间列表只显 2 个头像 |
| `max-height: 620px` | 横屏手机 / 小笔记本：压缩顶栏和按钮高度，手牌上限降到 46px |

### 移动端专项修正

| 问题 | 处理 |
|---|---|
| `100vh` 在移动端被地址栏顶掉 | 改用 `100dvh`（带 `100vh` 兜底） |
| iPhone 刘海 / 底部指示条遮挡 | `viewport-fit=cover` + `env(safe-area-inset-bottom)` |
| iOS 输入框聚焦自动放大页面 | `input { font-size: 16px !important }` |
| 下拉刷新把整页弹走 | `body { overscroll-behavior: none }` |
| 点击出现蓝色高亮块 | `-webkit-tap-highlight-color: transparent` |
| 双指缩放误触放大牌桌 | `user-scalable=no` |
| 触屏上 hover 样式粘滞 | `@media (hover: none)` 清除 |

> ⚠️ `index.css` 里**不要**写 `color-scheme: light dark`。游戏页是固定绿色主题，跟随系统暗色模式会把文字刷白，和背景糊在一起。

---

## 🔊 音效系统

**音效零音频文件**，全部用 Web Audio API 实时合成（`src/utils/sound.ts`）。
唯一的音频素材是快捷语音的 8 个 mp3（见下一节）。

| 音效 | 触发时机 | 合成方式 |
|---|---|---|
| `deal` | 开局发牌 | 3 段短噪声，模拟牌滑过桌面 |
| `select` / `unselect` | 选牌 / 取消 | 三角波 1180Hz / 760Hz，45ms |
| `play` | 出牌 | 噪声 + 方波 320→180Hz 下滑 |
| `pass` | 不要 | 正弦 300→150Hz 下滑 |
| `call` / `nocall` | 抢地主 / 不抢 | 三音上行 C5-E5-G5 / 两音下行 |
| `bomb` | 炸弹 / 王炸 | 低频锯齿 90→40Hz + 白噪声爆裂 |
| `win` / `lose` | 胜 / 负 | C 大调琶音上行 / 小调下行 |
| `throw` / `splat` | 道具飞出 / 砸中 | 高频噪声扫频 + 上滑音 / 闷响 + 湿润碎裂噪声 |
| `click` / `join` | 按钮 / 新玩家 | 短促提示音 |

设计要点：

- **浏览器自动播放策略**：AudioContext 必须在用户手势里激活，页面挂载时监听一次 `pointerdown` 调 `sound.unlock()`
- **开关持久化**：`localStorage.DDZ_SoundEnabled`，顶栏喇叭按钮切换
- **静音时完全跳过**：`play()` 入口先判 `enabled`，不创建任何音频节点

---

## 🗣️ 快捷语音

8 句经典台词，素材在 `game-ddz-web/public/voice/*.mp3`（每条约 11~20KB，合计 ~115KB）。

| voiceId | 台词 |
|---|---|
| `hurry` | 快点吧，我等的花儿都谢了 |
| `hello` | 大家好，很高兴见到各位 |
| `praise` | 你的牌打得也太好了吧 |
| `fight` | 不要走，决战到天亮 |
| `quiet` | 不要吵了，不要吵了，专心玩游戏吧 |
| `bigger` | 大你 |
| `cooperate` | 和你合作真是太愉快了 |
| `bye` | 再见了，我会想你的 |

**素材是自己合成的，不是扒现成语音包**。商业游戏（欢乐斗地主等）的语音有版权，不能直接拷进项目，
所以用 `scripts/gen-voice.py` 调 edge-tts（晓晓女声，+12% 语速）生成：

```bash
python -m pip install edge-tts
python scripts/gen-voice.py
```

改文案 → 重跑脚本 → mp3 覆盖，前端不用动。生成结果要提交进仓库，运行时零依赖、断网也能播。

实现要点：

- `src/utils/voice.ts`：`new Audio()` 实例按 id 缓存复用，同一时间只允许一条在响
- **文案以服务端 `QUICK_CHAT_TEXT` 为准**，前端只维护 id → 显示文案；两边 id 必须一致
- 气泡由 `components/funLayer` 渲染：按 `[data-pid]` 反查头像位置，浮在头像上方 2.6 秒
- 语音受音效总开关控制（用户按的是"静音"，不是"只静音音效"）

---

## 🎭 默认头像

不依赖任何图片资源（`src/components/playerAvatar/`）。

```
昵称 → FNV-1a 哈希 → 从 12 组渐变里取一组 → 显示首字符
```

- 同一个人每次进来颜色一致，不同人区分度高
- AI 固定紫色系，和真人一眼区分
- 地主显示 👑 角标（带浮动动画）
- 当前回合显示黄色呼吸光圈
- 剩余牌数用蓝色方块角标标在头像右下

---

## 🪑 牌桌版式

参考手游牌桌的排版方式（`douDiZhu.module.less` + `playerHeader.module.less`）：

```
┌────────────────────────────────────────────┐
│ 房间 123 · 叫地主            🔊  [退出]     │ ← 顶栏（半透明玻璃）
├────────────────────────────────────────────┤
│  ╭──────╮                        ╭──────╮  │
│  │ 头像 │ 17                     │ 头像 │17│ ← 蓝色方块 = 剩余牌数
│  ╰──────╯                        ╰──────╯  │
│  ┌────────┐                    ┌────────┐  │
│  │ AI-小红 │                    │  玩家  │  │ ← 深色信息板
│  │ ● 0    │                    │ ● -4   │  │
│  └────────┘                    └────────┘  │
│         ╭──────────────────────╮           │
│         │   斗地主（水印）      │           │ ← 桌面：木框 + 暖色渐变
│         │  房间 123 · 出牌中    │           │
│         │   [出牌区 / 回合提示]  │      🍅  │
│  ╭────╮ ╰──────────────────────╯      🥚  │ ← 右下竖排工具栏
│  │头像│                               💬  │
│  └────┘                                    │
├────────────────────────────────────────────┤
│         [出牌] [不要] [取消]                │
│  🂡 🂢 🂣 🂤 🂥 …（手牌，clamp 自适应）        │
└────────────────────────────────────────────┘
```

几个关键决定：

| 决定 | 原因 |
|---|---|
| 桌面用 `.tableSurface` 绝对定位画，不用背景图 | 一张图在 16:9 和 9:16 下必然裁切；CSS 椭圆能跟着容器变形，且零资源体积 |
| `border-radius: 50% / 22%` | 纯 `50%` 会变成正圆/胶囊；压扁纵向弧度才像一张平放的桌子 |
| 信息板放头像**下方**而不是右侧 | 三家分别在左上/右上/左下，放右侧会和牌桌边缘打架 |
| 牌数单独做蓝色方块角标 | 和昵称/积分拉开层级 —— 打牌时最需要一眼看到的数字 |
| 出牌区**只渲染当前一手** | 整局历史堆在中央会越堆越高，超出容器被裁掉，最底下一张只剩半截 |
| 出牌者昵称单独一行居中 | 昵称长短不一，放在牌行左侧会让每行牌的起点参差不齐 |
| 一手牌横向重叠 34% | 飞机带翅膀最多 20 张，不重叠会顶出牌桌；重叠后手机 10 张只占 166px |
| 底部按钮区 `min-height` = 按钮高 + padding | 按钮是条件渲染的，轮到别人时整块消失；高度一回落，牌桌（`flex:1`）就长高几像素，背景椭圆会抖 |
| 矮屏（`max-height: 620px`）工具栏转横排、去标签 | 竖排 3 个按钮要 200px，横屏手机牌桌本身才 240px 高 |
| 头像尺寸同时看**宽和高** | 只按宽度算的话，780×400 的横屏手机会得到 80px 头像，把牌桌挤没 |

> 桌面中央的水印是 `rgba(150,102,48,.17)` 的纯文字，不挡点击（`pointer-events: none`），
> 出牌区压上去也不会糊 —— 和真实牌桌上的烫印一个道理。

---

## ⚡ 首屏加载优化

手机第一次打开时，用户看到的顺序应该是：**骨架（瞬间）→ 登录页（1~2 秒）**，
而不是「一片纯色空屏 → 等半天 → 突然出现登录页」。

### 四个手段

| 手段 | 位置 | 效果 |
|---|---|---|
| HTML 内联骨架 | `index.html` 的 `<style>` + `#splash` | 浏览器拿到文档的第一帧就出画面，不等任何 JS / CSS |
| 服务端 gzip | `app.ts` 的 `compression` 中间件 | 前端产物 990KB → **290KB**（约 3.4 倍） |
| 路由懒加载 + 手动分包 | `router.tsx` + `vite.config.ts` | 入口 JS 从 990KB 降到 8KB，登录页只下载自己需要的 chunk |
| 静态资源长缓存 | `express.static` 的 `setHeaders` | `/assets/*` 带内容 hash → `immutable` 一年，回访直接读磁盘缓存 |

### 骨架为什么要放在 `#root` 外面

```html
<div id="root"></div>
<div id="splash">…</div>
```

```less
#root:not(:empty) ~ #splash { display: none; }
```

首帧路由是 `/ → /room → /login` 两次 `<Navigate>`，中间会渲染 `null`。
如果把骨架塞进 `#root` 里，React 会先清空容器 —— 骨架跟着消失，
用户看到的是「骨架闪一下 → 纯色空屏 → 登录页」。
放在外面靠兄弟选择器控制，空树期间骨架一直挂着，直到真正的内容出现才隐藏。

### 缓存策略

| 路径 | Cache-Control | 原因 |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | 文件名带内容 hash，内容变了名字才变 |
| `index.html` | `no-cache, must-revalidate` | 入口 HTML 绝不能缓存，否则用户永远拿到旧版本的资源引用 |
| `/voice/*`、`favicon` | `public, max-age=86400` | 名字固定但可能替换，缓存一天 |

> ⚠️ `compression` 中间件必须注册在 `express.static` **之前**，否则静态文件按原样发出去。
> 另外它默认只压 `text/*`，这里额外排除了 `image|audio|video` —— mp3 和图片本身已是压缩格式，再压纯浪费 CPU。

### 别为了格式化一个日期引 moment

大厅原来用 `moment(item.roomId).format("MM-DD HH:mm")`，为了这一个调用多打进去 70KB。
现在换成 `formatRoomTime()`，5 行原生 `Date` 搞定。

---

## 🔥 常见问题

**Q: `pnpm install` 报错 "Cannot find module pnpm"？**
A: `npm install -g pnpm@9`。或检查 `package.json` 里的 `packageManager` 字段。

**Q: 前端 dev server 打开页面，WS 连不上后端？**
A: 确认 `pnpm dev:server` 正在运行（9200 端口）。dev 模式前端代理已经配好。

**Q: ngrok 公网 URL 打开报错 ERR_NGROK_6024？**
A: 免费版正常，点页面上的 **"Visit Site"** 继续。付费版无此提示。

**Q: `pnpm tunnel:ngrok` 打印的链接打不开 / 不是本次启动的？**

A: 两个原因，都已由脚本自动处理：

1. **代理变量干扰**（最常见）。ngrok 免费版**禁止走 HTTP 代理**（属付费功能）。只要进程环境里有 `http_proxy` / `https_proxy`，ngrok 会直接认证失败退出：
   ```
   ERROR: authentication failed: Running the agent with an http/s proxy is a
   Pay-as-you-go feature.
   ```
   脚本已自动剔除这些变量后再启动 ngrok。若仍失败，说明你的网络**必须**走代理才能访问 ngrok，此时换国内通道：`pnpm tunnel:cpolar`。

2. **残留 ngrok 进程**。旧的 ngrok 还占着 4040 管理端口，新进程报 `ERR_NGROK_334` 秒退，脚本轮询 4040 就抓到了旧链接。现在脚本会：记录启动前的旧 tunnel → 杀掉残留 → 等 4040 真正释放 → 只接受 `addr` 匹配 9200 的**新** tunnel → **实际请求一次 `/health` 验证可达**，全部通过才打印。

   手动排查：
   ```bash
   taskkill /F /IM ngrok.exe
   pnpm tunnel:ngrok
   ```

> 💡 ngrok URL 字符串可能和上次一样（账号有固定域名），但只要 tunnel session ID 变了就是新连接。判断标准是脚本已验证 `/health` 可通，不是 URL 长什么样。

**Q: 怎么确认打印的链接是真的通的？**
A: 脚本打印前已经用 `ngrok-skip-browser-warning` 头请求过一次 `/health`，返回含 `"ok":true` 才会显示。手动验证：
```bash
curl -H "ngrok-skip-browser-warning: 1" https://你的域名.ngrok-free.dev/health
```

**Q: cloudflared 生成了 URL 但国内打不开？**
A: cloudflared 默认连海外节点，被墙是正常的。换 `pnpm tunnel:ngrok` 或 `pnpm tunnel:lt`。

**Q: tunnel 脚本 Ctrl+C 后还有残留进程？**
A: 脚本的 `SIGINT` 钩子会自动清理，但偶尔卡住。手动 `Get-Process node | Stop-Process -Force`。

**Q: 部署后 WS 连不上？**
A: 检查协议——HTTPS 页面必须用 WSS，HTTP 页面必须用 WS。单服务部署模式下 `__AUTO__` 会自动处理。

**Q: 想改成双服务部署（前后端分开）？**
A: 前端单独部署到任何静态托管（nginX / CDN / Solta），后端单独部署，WS 地址手动填 `wss://你的后端域名`。

**Q: 端口被占用？**
A: 默认 9200。`PORT=3000 node dist/app.js` 换端口。

**Q: 房间数据会不会丢？**
A: 会。房间全部存在内存里——服务重启即丢失。多实例部署需要加 Redis 做房间同步。

---

## 📊 端口说明

| 端口 | 用途 | 启动方式 | 环境 |
|---|---|---|---|
| **9200** | 后端 HTTP API + WebSocket + SPA | `PORT=9200 node dist/app.js` | **生产** / 本地 |
| 9100 | 前端 Vite dev server（自动代理到 9200） | `pnpm dev:web` | 仅开发 |

---

## 🔧 构建流程详解

`pnpm build` 执行了什么？

```
Step 1. pnpm --filter game-ddz-web build
       ↓ vite build（路由懒加载 + 手动分包）
       game-ddz-web/dist/
           ├── index.html
           └── assets/
               ├── index-xxx.js        ← 入口，只有 8KB
               ├── react-xxx.js        ← react / react-router
               ├── antd-xxx.js         ← antd 全家桶（最大的一块）
               ├── vendor-xxx.js       ← 其余三方依赖
               ├── auth-xxx.js         ← 登录页（懒加载）
               ├── DouDiZhu-xxx.js     ← 大厅页（懒加载）
               └── douDiZhu-xxx.js     ← 牌桌页（懒加载）

Step 2. tsc 编译后端        (在 game-ddz-server/)
       ↓ npx tsc
       game-ddz-server/dist/
           ├── app.js
           └── utils/
               ├── card.js
               ├── ai.js
               ├── identify.js
               └── enumerate.js

Step 3. game-ddz-server/scripts/build.js（自动执行）
       ├─ 镜像同步 dist → game-ddz-server/public/
       └─ 汇总到根 game-DDZ/build/
           ├── public/        ← 同 game-ddz-server/public/
           └── dist/          ← 同 game-ddz-server/dist/
```

三个产物目录内容完全一致，只是给不同部署方式用的。

> Step 3 用的是**镜像同步**（逐文件覆盖 + 只删过期文件），不是「先 rm -rf 再复制」。
> 原因：一次清空要删几十个文件，宿主对单轮批量删除有阈值保护，删到 50 个构建就会中断。
> 镜像同步正常构建几乎不产生删除动作，中途失败也不会留下半个空目录。

---

## 📖 深度文档

- [CODE_WIKI.md](./CODE_WIKI.md) — 完整架构文档：系统架构图、后端模块详解、前端页面与组件、AI 决策算法、API 完整参考、游戏状态机、依赖关系图、关键陷阱清单

---

## 📄 License

MIT
