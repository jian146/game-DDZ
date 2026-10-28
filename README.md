# 🃏 斗地主 Web 游戏

一款基于 **React + Express + WebSocket** 的在线斗地主，支持真人对战与 AI 陪玩，单服务即可部署。

---

## 目录结构

```
ddz/
├── package.json               # 根目录（统一 build/start 脚本）
├── game-ddz-web/              # 前端（React + Vite + Ant Design）
│   ├── src/
│   ├── proxy.ts               # 环境配置（dev/test/pre/prod）
│   └── vite.config.ts
└── game-ddz-server/           # 后端（Node.js + Express + ws）
    ├── app.ts                 # 主入口（HTTP + WS + 静态文件）
    ├── scripts/build.js       # 打包脚本（复制前端 + tsc）
    ├── utils/
    │   ├── ai.ts              # AI 贪心决策
    │   ├── identify.ts        # 8 种牌型识别
    │   ├── enumerate.ts       # 候选牌型枚举
    │   └── card.ts
    ├── public/                # ⚠️ 打包产物（前端静态文件，build 自动生成）
    └── dist/                  # ⚠️ 打包产物（后端 JS，build 自动生成）
```

---

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 前端 | React 19 + Vite 8 + TypeScript + Ant Design | SPA，生产构建同源连 WS |
| 后端 | Node.js + Express + ws | HTTP API + WebSocket 同端口 |
| AI | 纯服务端实现 | 牌型识别 → 全枚举 → 贪心打分 |
| 部署 | **单服务** | 后端承载前端静态文件，一个进程搞定 |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 9

### 安装依赖

```bash
pnpm install
```

### 开发模式（前后端分离）

```bash
# 终端 1：后端（9200 端口）
pnpm dev:server

# 终端 2：前端（9100 端口，自动代理 /api 到 9200）
pnpm dev:web
```

或一条命令同时启动：

```bash
pnpm dev
```

浏览器打开 <http://localhost:9100> 即可。

---

## ⭐ 一键打包（单服务部署）

```bash
pnpm build
```

就这一条命令。它自动做了三件事：

```
1. pnpm build:web      → 前端 vite build → game-ddz-web/dist/
2. 复制 dist → public   → game-ddz-server/public/
3. tsc 编译后端          → game-ddz-server/dist/
```

### 产物在哪？

全部集中在 `game-ddz-server/` 下：

```
game-ddz-server/
├── public/              # 前端静态文件（index.html + assets/）
├── dist/                # 后端编译产物（app.js + utils/*.js）
├── node_modules/        # 后端运行时依赖
└── package.json
```

### 部署到单服务（如 Solta / Railway / 任何 Node 托管）

**只要上传整个 `game-ddz-server/` 目录**，然后：

```bash
# 进入目录
cd game-ddz-server

# 启动（默认 9200 端口）
node dist/app.js

# 或自定义端口
PORT=3000 node dist/app.js
```

### 为什么一个进程就行？

后端 `app.ts` 同时承载了三件事：

| 请求 | 路由 | 处理者 |
|---|---|---|
| `GET /` `/assets/*` | 静态文件 | `express.static(public/)` |
| `GET /api/*` `POST /api/*` | API | Express 路由 |
| `WS upgrade` | 实时通信 | WebSocketServer |

WS 地址通过前端 `resolveWsAddress('__AUTO__')` 自动推导：

```
https://your-domain.com  →  wss://your-domain.com
http://localhost:9200    →  ws://localhost:9200
```

**天然同源，零跨域，零代理配置。**

---

## API 文档

### HTTP

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/roomList` | 获取房间列表 |
| POST | `/api/createRoom` | 创建房间 `{ userName }` |
| POST | `/api/addAI` | HTTP 添加 AI（测试用）`{ roomId, playerId }` |

### WebSocket 消息

客户端 → 服务端：

```json
{ "type": "onJoin",   "roomId": 123, "playerId": "张三" }
{ "type": "onLeave",  "roomId": 123, "playerId": "张三" }
{ "type": "addAI",    "roomId": 123, "playerId": "张三" }
{ "type": "onStart",  "roomId": 123 }
{ "type": "onCall",   "roomId": 123, "playerId": "张三" }
{ "type": "onNoCall", "roomId": 123, "playerId": "张三" }
{ "type": "useCard",  "roomId": 123, "playerId": "张三", "position": 0, "useCard": [1,2,3] }
{ "type": "onNotUseCard", "roomId": 123, "playerId": "张三", "position": 0 }
{ "type": "ping" }
```

服务端 → 客户端：广播更新后的 `RoomInfo` 对象。

### 房间状态流转

```
prepare → selectLandlord → play ⇄ useCard → end
               ↓
            reopen → (自动 start) → selectLandlord
```

### PlayerPosition 警告 ⚠️

`RoomPlayer.position` 字段表示**角色**（0=地主, 1=农民），但前端 WS 消息里的 `position` 字段传的是 `player[]` 数组的**索引**（0/1/2）。两个概念不要混淆。

---

## AI 陪玩

AI 为纯服务端实现，核心模块：

| 文件 | 职责 |
|---|---|
| `utils/identify.ts` | 识别 8 种牌型：单张/对子/三带一/顺子/连对/飞机/炸弹/王炸 |
| `utils/enumerate.ts` | 从手牌全枚举所有可出组合 |
| `utils/ai.ts` | 贪心打分：能压必压、优先剩牌最少、pass 兜底 |

AI 调度通过 `scheduleAITurn()` hook，每次房间状态转移后自动判断当前玩家是否 AI，1.5~3 秒延迟执行决策。

---

## 常见问题

**Q: 本地开发怎么让前端连线上后端？**  
改 `game-ddz-web/proxy.ts`，在 `dev` 里把 `proxy.target` 和 `wsAddress` 换成线上地址即可。

**Q: 部署后 WS 连不上？**  
检查前端页面的协议：HTTPS 必须用 WSS，HTTP 必须用 WS。`__AUTO__` 模式会自动处理。

**Q: `pnpm build` 报前端 dist 不存在？**  
先确认前端构建没报错。脚本顺序是先 web 后 server，出问题看 vite build 输出。

**Q: 想改成双服务部署（前后端分开）？**  
前端 `pnpm build:pre`（走 pre 环境配置），前端静态文件用 nginx/CDN 托管，后端独立部署，WS 地址手动填 `wss://你的后端域名`。

---

## 端口说明

| 端口 | 用途 | 启动方式 |
|---|---|---|
| 9200 | 后端 HTTP + WS（生产端口） | `PORT=9200 node dist/app.js` |
| 9100 | 前端 dev server（仅开发用） | `pnpm dev:web` |
