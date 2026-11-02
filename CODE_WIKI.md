# 🃏 斗地主 Web 游戏 — Code Wiki

> 项目代号 `game-DDZ` | 在线多人斗地主，支持真人对战与 AI 陪玩
> 技术栈：React 19 + Vite 8 + TypeScript + Express + ws（WebSocket）
> 部署方式：**单服务部署**（后端承载前端静态文件，一个 Node 进程搞定）

---

## 📖 目录

- [1. 项目概览](#1-项目概览)
- [2. 目录结构](#2-目录结构)
- [3. 技术栈与依赖](#3-技术栈与依赖)
- [4. 系统架构](#4-系统架构)
- [5. 后端模块详解](#5-后端模块详解)
  - [5.1 入口文件 app.ts](#51-入口文件-appts)
  - [5.2 游戏房间模型 RoomInfo](#52-游戏房间模型-roominfo)
  - [5.3 业务 Handler 清单](#53-业务-handler-清单)
  - [5.4 AI 调度机制](#54-ai-调度机制)
  - [5.5 工具模块 utils/](#55-工具模块-utils)
  - [5.6 数据持久化 store.ts](#56-数据持久化-storets)
  - [5.7 认证 auth.ts](#57-认证-authts)
- [6. 前端模块详解](#6-前端模块详解)
  - [6.1 路由与页面](#61-路由与页面)
  - [6.2 大厅页 RoomPage](#62-大厅页-roompage)
  - [6.3 游戏页 DouDiZhuPage](#63-游戏页-doudizhupage)
  - [6.4 前端工具模块](#64-前端工具模块)
  - [6.5 组件清单](#65-组件清单)
  - [6.6 互动玩法（砸道具 / 快捷语音）](#66-互动玩法砸道具--快捷语音)
  - [6.7 响应式策略](#67-响应式策略)
  - [6.8 首屏加载与静态资源](#68-首屏加载与静态资源)
- [7. API 参考](#7-api-参考)
  - [7.1 HTTP API](#71-http-api)
  - [7.2 WebSocket 消息协议](#72-websocket-消息协议)
- [8. 游戏状态机](#8-游戏状态机)
- [9. AI 决策算法](#9-ai-决策算法)
- [10. 依赖关系图](#10-依赖关系图)
- [11. 运行与部署](#11-运行与部署)
- [12. 内网穿透脚本（scripts/tunnel.js）](#12-内网穿透脚本scriptstunneljs)
- [13. 构建脚本详解](#13-构建脚本详解)
- [14. 关键注意事项与陷阱](#14-关键注意事项与陷阱)
- [15. 跑得快（第二种玩法）](#15-跑得快第二种玩法)

---

## 1. 项目概览

本项目是一款基于 **React + Express + WebSocket** 的在线斗地主游戏。

### 核心特性

| 特性 | 说明 |
|---|---|
| 在线对战 | 支持最多 3 人实时同房间对战 |
| AI 陪玩 | 纯服务端实现，牌型识别 → 全枚举 → 贪心打分 |
| 单服务部署 | 后端 Express 同时承载前端静态文件，一个 Node 进程搞定 |
| 房间制 | 通过 HTTP 创建房间，WS 实时同步房间状态 |
| 心跳与重连 | 客户端自动心跳（20s），断线后自动重连（最多 10 次） |

### 核心数据模型

**一副牌 = 54 张**，每张牌用一个 **id（1~54）** 表示：

- `id 1~52`：4 种花色 × 13 点数（3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2）
- `id 53`：小王
- `id 54`：大王

**点数 point 映射**：`3→3`, `4→4`, ..., `14→A`, `16→2`, `17→小王`, `18→大王`

---

## 2. 目录结构

```
game-DDZ/                              ← 仓库根（monorepo，pnpm workspaces）
├── package.json                       # 根目录统一 build/start/dev/tunnel 脚本
├── pnpm-workspace.yaml                # monorepo 声明（game-ddz-web + game-ddz-server）
├── railway.json                       # Railway/Railway 部署配置（自动识别）
├── .gitignore                         # 根级 gitignore（/build/, **/dist/, game-ddz-server/public/）
├── README.md                          # 项目说明（启动方式 / 部署 / API 速查）
├── CODE_WIKI.md                       # ← 本文档（完整架构文档）
├── start-game.bat                     # 🖱 Windows 双击一键启动
├── start-game.ps1                     # PowerShell 启动脚本（自动检查 + build + serve + 可选穿透）
├── scripts/
│   └── tunnel.js                      # 🌐 内网穿透包装（ngrok / localtunnel / cpolar / cloudflared）
├── build/                             # ⚠️ 根目录统一产物（gitignore，pnpm build 自动生成）
│   ├── public/                        #   前端静态文件
│   └── dist/                          #   后端编译产物
│
├── game-ddz-server/                   ← 后端（Node.js + Express + ws）
│   ├── app.ts                         # 🎯 后端主入口（HTTP + WS + 静态文件 + /health）
│   ├── store.ts                       # 💾 玩家数据持久化（JSON 原子写 + 防抖落盘）
│   ├── auth.ts                        # 🔑 密码哈希（scrypt）+ 无状态签名 token
│   ├── init.ts                        # 初始牌数组 cardIdList
│   ├── tsconfig.json
│   ├── package.json
│   ├── scripts/
│   │   └── build.js                   # 打包脚本（tsc + 复制前端 + 汇总到根 build/）
│   ├── utils/
│   │   ├── card.ts                    # 洗牌 / 摸牌 / 点数映射
│   │   ├── identify.ts                # 牌型识别器（12 种牌型）
│   │   ├── enumerate.ts               # 候选牌型枚举
│   │   └── ai.ts                      # AI 决策（贪心打分）
│   ├── data/                          # ⚠️ 玩家数据（players.json + secret.key，gitignore）
│   ├── public/                        # ⚠️ 打包产物（前端静态文件）
│   └── dist/                          # ⚠️ 打包产物（后端 JS）
│
└── game-ddz-web/                      ← 前端（React 19 + Vite 8 + Ant Design）
    ├── index.html                     # Vite 入口
    ├── vite.config.ts                 # Vite 配置（含 __WS_ADDRESS__ 注入）
    ├── proxy.ts                       # 多环境配置（dev/test/pre/prod）
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── package.json
    ├── src/
    │   ├── main.tsx                   # React 入口
    │   ├── App.tsx                    # 根组件
    │   ├── App.css                    # 根组件样式
    │   ├── router.tsx                 # 路由配置
    │   ├── index.css                  # 全局样式
    │   ├── env.d.ts                   # Vite 环境类型声明
    │   ├── components/
    │   │   ├── decor/
    │   │   │   └── decor.tsx          # 花色图标（黑桃/红桃/梅花/方片）
    │   │   ├── pageLoading/
    │   │   │   └── pageLoading.tsx    # 路由懒加载时的全屏加载页（和 index.html 骨架同款）
    │   │   └── playerAvatar/
    │   │       └── playerAvatar.tsx   # 默认头像（昵称哈希 → 渐变色 + 首字）
    │   ├── utils/
    │   │   ├── card.ts                # 牌数据 + 牌型分组工具
    │   │   ├── request.ts             # axios 封装（自动注入 Authorization）
    │   │   ├── storage.ts             # localStorage/sessionStorage 封装
    │   │   ├── auth.ts                # 🔐 登录态 + 注册/登录/资料接口
    │   │   ├── awaitHelper.ts         # async/await 辅助
    │   │   ├── sound.ts               # 🔊 音效引擎（Web Audio 合成，零音频文件）
    │   │   ├── voice.ts               # 🗣 快捷语音（mp3 缓存播放 + 文案表）
    │   │   └── useViewport.ts         # 视口 hook（isMobile/isSmall/横屏）
    │   └── pages/
    │       ├── Auth/
    │       │   └── auth.tsx           # 🔐 登录 / 注册页（Tab 切换）
    │       └── DouDiZhu/
    │           ├── index.tsx          # 🎯 大厅页（账号信息 / 房间列表 / 创建房间）
    │           ├── douDiZhu.tsx       # 🎯 游戏页核心组件（800+ 行）
    │           ├── cardStyle/
    │           │   └── cardStyle.tsx  # 单张扑克牌组件
    │           ├── components/
    │           │   └── playerHeader/
    │           │       └── playerHeader.tsx  # 玩家头像/位置组件
    │           └── result/
    │               └── result.tsx     # 游戏结算弹窗
    └── dist/                          # ⚠️ 前端打包产物
```

---

## 3. 技术栈与依赖

### 后端依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `express` | ^4.18.2 | HTTP 服务器框架 |
| `ws` | ^8.12.0 | WebSocket 实现（服务端） |
| `cors` | ^2.8.6 | 跨域中间件 |
| `body-parser` | ^1.20.1 | 请求体解析 |
| `compression` | ^1.8.1 | gzip 压缩（前端产物 990KB → 290KB） |
| `typescript` | ^5.9.3 | 类型系统 |
| `ts-node` | ^10.9.2 | 开发时直接运行 TS |

### 前端依赖

| 包名 | 版本 | 用途 |
|---|---|---|
| `react` | ^19.2.4 | UI 框架 |
| `react-dom` | ^19.2.4 | React DOM 渲染 |
| `react-router-dom` | ^7.13.1 | SPA 路由 |
| `antd` | ^6.3.3 | UI 组件库 |
| `axios` | ^1.13.6 | HTTP 客户端 |
| `vite` | ^8.0.0 | 构建工具 |
| `typescript` | ~5.9.3 | 类型系统 |
| `tailwindcss` | ^4.2.1 | 原子化 CSS |
| `less` | ^4.6.4 | CSS 预处理器 |

### 运行时要求

| 工具 | 最低版本 |
|---|---|
| Node.js | ≥ 18 |
| pnpm | ≥ 9 |

---

## 4. 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端 (浏览器)                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  React SPA (game-ddz-web)                                   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  大厅页       │  │  游戏页       │  │  WebSocket 管理  │ │ │
│  │  │  (RoomPage)  │  │(DouDiZhuPage) │  │  (心跳/重连)     │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │ │
│  │         │                 │                    │             │ │
│  │  ┌──────┴─────────────────┴────────────────────┴─────────┐ │ │
│  │  │                    utils/                              │ │ │
│  │  │          request.ts (axios) + card.ts + storage.ts    │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────┬──────────────────────────────────┘ │
│          HTTP /api/*       │        WS upgrade                   │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    服务端 Node.js (单进程)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Express + WebSocketServer (game-ddz-server/app.ts)         │ │
│  │                                                             │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐│ │
│  │  │ HTTP API │  │  WS Router   │  │  静态文件 (express)    ││ │
│  │  │ /api/*   │  │ type handlers│  │ / → index.html        ││ │
│  │  └────┬─────┘  └──────┬───────┘  └────────────────────────┘│ │
│  │       │                │                                     │ │
│  │  ┌────┴────────────────┴────────────────────────────────────┐│ │
│  │  │                  Room 业务层                              ││ │
│  │  │  onJoin / onLeave / onStart / onCall / onUseCard ...    ││ │
│  │  └────────────────────────┬────────────────────────────────┘│ │
│  │                           │                                  │ │
│  │  ┌────────────────────────┴────────────────────────────────┐│ │
│  │  │                   utils/ AI 引擎                         ││ │
│  │  │  identify.ts → enumerate.ts → ai.ts → card.ts          ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │  内存存储: roomList (房间列表), user_sockets (socket 映射)    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 单服务部署原理

后端 `app.ts` 同时承载三件事：

| 请求 | 路由 | 处理者 |
|---|---|---|
| `GET /` `/assets/*` | 静态文件 | `express.static(public/)` |
| `GET /api/*` `POST /api/*` | API | Express 路由 |
| `WS upgrade` | 实时通信 | `WebSocketServer` |

WS 地址通过前端 `resolveWsAddress('__AUTO__')` 自动推导，天然同源零跨域。

---

## 5. 后端模块详解

### 5.1 入口文件 app.ts

**文件路径**: [game-ddz-server/app.ts](file:///d:/project/my/game-DDZ/game-ddz-server/app.ts)

后端所有业务逻辑都集中在这个文件中，约 **845 行**。

#### 关键常量与全局变量

| 名称 | 类型 | 说明 |
|---|---|---|
| `aiTimerMap` | `Map<number, NodeJS.Timeout>` | 房间级 AI 调度定时器，key 为 roomId |
| `AI_NAMES` | `string[]` | AI 玩家候选名 |
| `user_sockets` | `UserSocketInfo[]` | 所有在线 WS 连接映射 |
| `roomList` | `RoomInfo[]` | 所有活跃房间列表 |
| `PORT` | `number` | 监听端口，默认 9200 |

#### 静态文件查找函数

```
findFrontendDist() → string | null
```

优先查 `dist/../public`（单服务部署），其次查 `../../build/public`（根目录统一产物），最后查 `../../game-ddz-web/dist`（开发模式前端构建产物）。

---

### 5.2 游戏房间模型 RoomInfo

```typescript
interface RoomInfo {
  roomId: number;                    // 房间唯一 ID
  status: RoomStatus;                 // 状态机（见 §8）
  model: number;                      // 0=随机地主, 1=轮庄
  allCount: number;                   // 总局数（暂未使用）
  initPost: number;                  // 发起叫地主的玩家索引
  initUser: number;                   // 初始发牌起始位置
  lastUser: number;                   // 上一个出牌玩家索引
  notUseCardCount: number;           // 连续不要计数（=2 时清空当前回合）
  callCount: number;                  // 叫地主轮次
  player: RoomPlayer[];               // 3 个玩家
  round: RoomRound[];                 // 当前出牌历史（规则判定用，只含真出牌）
  roundLog: RoomLogEntry[];           // 本轮完整过程（含「不要」），只给前端展示
  aHand: number[];                    // 底牌（3 张）
  current: number;                    // 当前应该操作的玩家索引
  winRole: number;                    // -1=未开始, 0=地主胜, 1/2=农民胜
  settled?: boolean;                  // 本局是否已结算过积分
  ownerName?: string;                 // 房主昵称（第一个加入的真人）
}

interface RoomPlayer {
  playerId: string;                   // 玩家名（AI 也有名字）
  position: 0 | 1 | 2;                // ⚠️ 0=地主, 1=农民（类型允许 2 但逻辑中只用 0/1）
  isOnline: boolean;                  // 是否在线
  isAI: boolean;                      // 是否 AI 玩家
  score: number;                      // 分数（暂未累积）
  card: number[];                     // 手牌（card id 数组）
}

type RoomStatus = 'prepare' | 'selectLandlord' | 'reopen' | 'play' | 'useCard' | 'end';
```

#### ⚠️ PlayerPosition 命名陷阱

`RoomPlayer.position` 表示**角色**（0=地主，1/2=农民），
但前端 WS 消息里的 `position` 字段传的是 `player[]` 数组的**索引**（0/1/2）。
两个概念完全不同，不要混淆！

---

### 5.3 业务 Handler 清单

所有业务 handler 定义在 `app.ts` 中。

| Handler | 签名 | 说明 |
|---|---|---|
| `createInitialRoom` | `(roomId) → RoomInfo` | 创建初始房间对象 |
| `onJoin` | `(data, socket) → result` | 加入房间。校验 token → 已加入则重连恢复在线 → **对局中拒绝新人** → 满员拒绝 → 加入并设置首个真人为房主 |
| `onLeave` | `(data, socket?) → RoomInfo \| null` | **主动退出**，立即移除（不走断线宽限），内部走 `removePlayer` |
| `onAddAI` | `(data, socket?) → result` | **仅房主**添加 AI。满 3 人自动开局 |
| `onRemoveAI` | `(data) → result` | **仅房主**删除 AI，只能删 AI 不能删真人 |
| `onThrowItem` | `(data) → { isError } \| null` | 砸番茄/鸡蛋。道具白名单 + 目标在房校验 + 600ms 节流；目标是 AI 时 35% 概率被砸回来。返回 `null` 表示"已广播，无需重推房间" |
| `onQuickChat` | `(data) → { isError } \| null` | 快捷语音广播。`voiceId` 查 `QUICK_CHAT_TEXT` 白名单，文案以服务端为准 |
| `onStart` | `(data, internal?) → result` | **仅房主**开局（`internal=true` 供服务端自动开局跳过校验）：发牌 + 随机叫地主者 |
| `onNoCall` | `(data) → result` | 不叫地主。3 人都不叫 → `reopen` 状态 |
| `onCall` | `(data) → result` | 抢地主。设 position、地主拿底牌（+3 张） |
| `onUseCard` | `(data) → result` | 出牌。校验身份 + 校验手牌 + 胜利判断（触发结算） |
| `onNotUseCard` | `(data) → result` | 不要。无人出过牌时不能不要。连续 2 次不要 → 清空当前回合 |
| `removePlayer` | `(roomInfo, playerId) → RoomInfo \| null` | 真正移除玩家：房主转移、空房删除、对局作废 |
| `markOffline` | `(roomInfo, playerId) → void` | 断线处理：标记离线 + 90 秒宽限计时 |
| `transferOwner` | `(roomInfo) → void` | 房主退出后转给下一个真人 |
| `resetToPrepare` | `(roomInfo) → void` | 本局作废，回到准备阶段 |
| `clearRound` | `(roomInfo) → void` | 清空当前这一轮（`round` + `roundLog` + 计数），**别单独写 `round = []`** |
| `scheduleAITurn` | `(roomInfo) → void` | AI 调度 hook。按动作分档 0.32~1s 后触发；**离线真人也会被托管** |
| `computeAIDecision` | `(roomInfo, player) → AIDecision` | 纯函数：按 mode 分流 `decideAI` / `decidePdkAI` |
| `onHint` | `(data) → hint 载荷` | 提示：枚举能压上的候选，按 `seq` 返回第 n 组 |
| `executeAIDecision` | `(roomInfo, decision) → void` | 执行 AI 决策（内部调用 onCall/onUseCard 等） |

#### 房主与断线宽限（易踩坑）

**房主**是 `ownerName`，值为第一个加入的真人昵称。判权用 `isOwner(roomInfo, playerId)`。

**为什么对局中必须拒绝新玩家**：`onJoin` 加入新玩家时会执行 `roomInfo.status = 'prepare'`。如果对局中放行，第三个人进来就能把正在打的牌局直接顶掉重开。

**断线为什么不立即移除**：`socket.on('close')` 在刷新页面、切后台、网络抖动时都会触发。原实现直接调 `onLeave`，导致：

1. 座位被腾出，别人能占走
2. `status` 被重置成 `prepare`，牌局作废

现在改为 `markOffline()`：标记 `isOnline = false` + 90 秒定时器，重连时 `onJoin` 走 `isJoin` 分支恢复。超时才 `removePlayer`。

**离线托管**：`scheduleAITurn` 的判断从 `current.isAI` 放宽到 `current.isAI || !current.isOnline`，否则离线玩家那一轮没人出牌，牌局卡死。玩家回来时若还没轮到 AI 执行，定时器内部会二次检查 `isOnline` 并放弃托管。

#### 辅助校验函数

| 函数 | 说明 |
|---|---|
| `validateTurn(roomInfo, playerId)` | 检查发送方是否是当前该操作的玩家 |
| `validateCardsInHand(roomInfo, playerIndex, useCard)` | 检查出牌的人手里是否真的有这些牌 |
| `getRoom(roomId)` | 从 roomList 查找房间 |
| `sendMes(backData)` | 给房间内所有在线玩家广播消息 |
| `sendMesForPlay(userName, data)` | 给指定玩家单独发消息（常用于错误提示） |
| `sendRoomEvent(roomId, payload)` | 给房间内所有人推一条**事件**（不带 RoomInfo），用于投掷 / 语音这类瞬时动作 |

---

### 5.4 AI 调度机制

AI 调度采用 **Hook 模式**：

1. 每次房间状态转移后（WS handler 执行完），调用 `scheduleAITurn(roomInfo)`
2. 检查当前 `roomInfo.current` 玩家是否是 AI
3. 如果是，先空算一次决策拿到动作类型（纯函数，无副作用），据此取思考时长：
   叫地主 0.45~0.7s / 出牌 0.65~1.0s / 不要 0.32~0.5s，掉线托管再 ×0.6
4. 定时器触发时做"防过期"校验（room 是否存在、current 是否还是原来的玩家）
5. 用**最新状态重算**决策（防止用过期决策）→ `executeAIDecision()` 执行
6. 执行完后再 `sendMes()` 广播新房间 → 再次 `scheduleAITurn()` 递归链式调度

```
状态转移 → scheduleAITurn → 分档延时 → decideAI（重算）→ executeAIDecision → sendMes → scheduleAITurn → ...
```

---

### 5.5 工具模块 utils/

#### utils/card.ts

**文件路径**: [game-ddz-server/utils/card.ts](file:///d:/project/my/game-DDZ/game-ddz-server/utils/card.ts)

| 函数 | 签名 | 说明 |
|---|---|---|
| `shuffleCard` | `(cardlist: number[]) → number[]` | Knuth-Durstenfeld 洗牌算法 |
| `getCard` | `(count, cardList) → number[]` | 从牌堆头部取 count 张（splice） |
| `getRoundNumber` | `(x, y) → number` | 生成 [x, y] 范围内的随机整数 |
| `getCardPoint` | `(id: number) → number` | 牌 id → 点数 point 映射 |
| `getCardsByPoint` | `(cardIds, point) → number[]` | 从 cardIds 中筛选指定 point 的牌 |

**点数映射表**：

| id 范围 | 花色 | point 序列 |
|---|---|---|
| 1~13 | 黑桃 0 | 3,4,5,6,7,8,9,10,J(11),Q(12),K(13),A(14),2(16) |
| 14~26 | 红桃 1 | 同上 |
| 27~39 | 梅花 2 | 同上 |
| 40~52 | 方片 3 | 同上 |
| 53 | - | 小王 = 17 |
| 54 | - | 大王 = 18 |

#### utils/identify.ts — 牌型识别器

**文件路径**: [game-ddz-server/utils/identify.ts](file:///d:/project/my/game-DDZ/game-ddz-server/utils/identify.ts)

识别 **12 种牌型**：

| CardType | 说明 | 约束 |
|---|---|---|
| `joker22` | 王炸 | 大小王都有 |
| `bomb` | 炸弹 | 4 张同 point |
| `single` | 单张 | |
| `pair` | 对子 | 不含王 |
| `triple` | 三张 | |
| `tripleWith1` | 三带一 | 三张 + 1 单张 |
| `tripleWith2` | 三带二 | 三张 + 1 对子 |
| `straight` | 顺子 | ≥5 张连续单，不含 2 和王 |
| `consecutivePairs` | 连对 | ≥3 对连续对子，不含 2 和王 |
| `plane` | 飞机（不带牌） | ≥2 连续三张 |
| `planeWith1` | 飞机带单 | n 飞机 + n 单张 |
| `planeWith2` | 飞机带对 | n 飞机 + n 对子 |

**核心函数**：

| 函数 | 说明 |
|---|---|
| `identifyType(cards)` | 识别入口，按优先级返回牌型（unknown 表示无法识别） |
| `canBeat(a, b)` | 判断 a 能否压过 b（同类型同结构 + mainPoint 更大 / 炸弹压非炸弹 / 王炸压一切） |

#### utils/enumerate.ts — 候选枚举器

**文件路径**: [game-ddz-server/utils/enumerate.ts](file:///d:/project/my/game-DDZ/game-ddz-server/utils/enumerate.ts)

| 函数 | 说明 |
|---|---|
| `enumerateAll(hand)` | 从手牌枚举全部合法牌型（不考虑压牌） |
| `enumerateBeatCandidates(hand, lastPlayType)` | 只枚举能压过 lastPlay 的候选 |

枚举覆盖：单张 / 对子 / 三张 / 炸弹 / 三带一 / 三带二 / 顺子 5~12 / 连对 3~10 / 飞机 2~5（含带单/带对变体）。

#### utils/ai.ts — AI 决策

**文件路径**: [game-ddz-server/utils/ai.ts](file:///d:/project/my/game-DDZ/game-ddz-server/utils/ai.ts)

**主入口**：

```typescript
decideAI(cards, lastPlay, callPhase, callCount) → AIDecision
```

返回四种动作之一：
- `{ action: 'callLandlord' }` — 叫地主
- `{ action: 'noCall' }` — 不叫
- `{ action: 'playCards', cards }` — 出牌
- `{ action: 'pass' }` — 不要

**决策流程**：

1. **叫地主阶段**：`decideCallLandlord()` 根据手牌大小王、2、炸弹、A/K 数量打分，与动态阈值（callCount 越大阈值越低）比较
2. **自由出牌**（没人出过）：`decideFreePlay()` 枚举全部候选 → `scoreCandidate()` 打分 → 选最优
3. **压牌**：`decideBeatPlay()` 枚举能压的候选 → 打分 → 选最优；压不上返回 `pass`

**打分维度**（越大越好）：

| 维度 | 说明 |
|---|---|
| winNow（∞） | 出完后剩余 0 张 → 必胜，优先级最高 |
| 残局（50000-） | 剩余 ≤ 2 张 → 非常好的选择 |
| remainingFriendly | 剩余牌越少越好 |
| pointValue 惩罚 | 主牌点数越大扣分越多（保留大牌策略） |
| 炸弹/王炸 惩罚 | 非必要不使用（-30 / -50） |
| 复杂牌型 加分 | 长顺子/连对/飞机小加分 |
| 残局对手快出完 | 反转策略：愿意用大牌压，炸弹/王炸加分 |

#### 跑得快：`decidePdkAI(cards, lastPlay, mustInclude)`

同一个 `ai.ts` 里的第二个入口，走 `utils/pdk.ts` 的枚举：

| 场景 | 候选来源 |
|---|---|
| 自由出牌 | `enumeratePdkAll(手牌)` |
| 压牌 | `enumeratePdkBeats(手牌, 上家牌型)` |

打分口径和斗地主不同——跑得快是**跑牌**游戏，不是保牌游戏：

| 维度 | 跑得快 | 斗地主 |
|---|---|---|
| 张数 | 一次出得越多越好（`cards.length * 2`） | 只鼓励出完 |
| 单张 | 额外 -3（散牌留手里很难走） | 无 |
| 炸弹 | -60（比斗地主更重，除非能一手走完） | -30 |
| 顺子/连对 | 按长度加分 | 小加分 |

`mustInclude > 0` 表示「首出必须带庄家牌」，只保留含那张牌的候选；
万一过滤空了（理论上不会），直接单出这张牌兜底，避免 AI 卡住不动。

因为「能管必须管」，只要 `enumeratePdkBeats` 非空就一定出牌，不会出现能压却过牌的情况。

#### utils/pdk.ts — 跑得快规则

**文件路径**: [game-ddz-server/utils/pdk.ts](file:///d:/project/my/game-DDZ/game-ddz-server/utils/pdk.ts)

| 导出 | 签名 | 说明 |
|---|---|---|
| `PDK_DECK` | `number[]` | 48 张牌堆（去大小王、三张 2、一张 A） |
| `SPADE_3` | `1` | 首局庄家标记牌 |
| `resolveBanker` | `(hands) → { banker, markerId } \| null` | 黑桃3 定庄，庄家抓全四张则顺延下一点数 |
| `identifyPdk` | `(cards, handLen) → PdkIdent` | 牌型识别，`handLen` 决定裸三张是否合法 |
| `canBeatPdk` | `(a, b) → boolean` | 压牌判定（无王炸，炸弹压一切） |
| `enumeratePdkAll` | `(hand) → PdkCandidate[]` | 枚举所有合法出牌组合 |
| `enumeratePdkBeats` | `(hand, last) → PdkCandidate[]` | 只保留能压过上家的 |
| `hasAnyBeatPdk` | `(hand, last) → boolean` | 「能管必须管」的判定依据 |

细节见 §15。

---

### 5.6 数据持久化 store.ts

**文件路径**: [game-ddz-server/store.ts](file:///d:/project/my/game-DDZ/game-ddz-server/store.ts)

玩家账号的落盘层。纯 JSON 文件，不引入数据库。

| 导出 | 说明 |
|---|---|
| `PlayerRecord` | 账号记录类型（id / name / hash / salt / score / wins / games / 时间戳） |
| `findByName(name)` | 按昵称查（大小写不敏感，防 `Tom` 和 `tom` 注册成两个号） |
| `findById(id)` | 按内部 id 查 |
| `createPlayer(input)` | 新建账号 |
| `updatePlayer(id, patch)` | 局部更新 |
| `applyMatchResult(entries)` | 批量结算积分 / 胜场 / 局数，只落盘一次 |
| `publicProfile(p)` | 对外安全视图，剥掉 `hash` / `salt` |
| `topPlayers(limit)` | 积分排行榜 |
| `flushNow()` | 强制立即落盘（退出钩子用） |

**数据目录定位**：编译后 `__dirname` 是 `dist/`，`ts-node` 直跑是包根，用 `path.basename(__dirname) === 'dist'` 判断后统一指向 `game-ddz-server/data/`，避免开发和生产各存一份。可用 `DDZ_DATA_DIR` 环境变量覆盖。

**写入策略**：

| 机制 | 作用 |
|---|---|
| 原子写 | 先写 `players.json.tmp` 再 `rename`，进程中途被杀不会留下半个文件 |
| 防抖 100ms | `save()` 合并多次改动，一局结算只写一次磁盘 |
| 退出钩子 | `SIGINT` / `SIGTERM` 时 `flushNow()`，防抖窗口内的改动不丢 |
| 损坏保护 | `JSON.parse` 失败先复制成 `.broken-<时间戳>` 再重建空库，不静默覆盖玩家数据 |

### 5.7 认证 auth.ts

**文件路径**: [game-ddz-server/auth.ts](file:///d:/project/my/game-DDZ/game-ddz-server/auth.ts)

| 导出 | 说明 |
|---|---|
| `hashPassword(pwd)` | scrypt + 16 字节随机盐，返回 `{ hash, salt }` |
| `verifyPassword(pwd, hash, salt)` | `timingSafeEqual` 等时比较，防时序侧信道 |
| `newPlayerId()` | 12 字节随机内部 id |
| `signToken(pid, name)` | 签发 7 天有效期的 HMAC token |
| `verifyToken(token)` | 校验签名 + 过期，任何异常返回 `null` |
| `extractToken(header)` | 从 `Authorization: Bearer xxx` 取 token |
| `validateName` / `validatePassword` | 昵称与密码规则校验 |

**token 格式**：`base64url(payload).base64url(hmac_sha256(payload))`，payload 为 `{ pid, name, exp }`。

无状态设计的好处是进程重启后 token 依然有效，不需要 session 表；代价是无法在服务端主动吊销（注销只是前端清 token）。

**签名密钥**：`data/secret.key`，首次启动生成 32 字节随机值。磁盘不可写时退化为进程内密钥——功能正常，但重启后需重新登录。

**WS 身份绑定**：`onJoin` 校验 token → 取 `pid` → 查库得昵称 → 绑定到 `user_sockets`。此后消息入口会把 `data.playerId` 强制改成绑定值，客户端自报的身份一律忽略，改 URL 或改消息体都冒充不了别人。

---

## 6. 前端模块详解

### 6.1 路由与页面

**文件路径**: [game-ddz-web/src/router.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/router.tsx)

| 路径 | 组件 | 说明 |
|---|---|---|
| `/` | → 重定向 | 自动跳转大厅 |
| `/login` | `AuthPage` | 登录 / 注册（未登录时唯一可达页面） |
| `/room` | `RoomPage` | 大厅：账号信息 + 房间列表 + 创建房间（需登录） |
| `/ddz/:roomId/:userId` | `DouDiZhuPage` | 游戏页面（需登录；`userId` 仅兼容旧链接） |
| `*` | → 重定向 | 兜底回大厅 |

`RequireAuth` 包裹需要登录的路由：未登录时 `<Navigate to="/login" state={{ from }} />`，登录成功后 `AuthPage` 会把用户送回 `from`。

---

### 6.2 大厅页 RoomPage

**文件路径**: [game-ddz-web/src/pages/DouDiZhu/index.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/pages/DouDiZhu/index.tsx)

**核心功能**：

| 功能 | 实现方式 |
|---|---|
| 账号信息展示 | 先用 `getPlayer()` 缓存渲染，再调 `apiMe()` 校准；token 失效则清凭证跳登录页 |
| 获取房间列表 | axios GET `/api/roomList` |
| 创建房间 | axios POST `/api/createRoom` → navigate 到游戏页 |
| 加入房间 | navigate 到 `/ddz/:roomId/:userId` |
| 退出登录 | Popconfirm 确认 → `logout()` 清本地凭证 → 跳 `/login` |

**关键状态**：`player`（账号资料）、`roomList`、`loading`

---

### 6.3 游戏页 DouDiZhuPage

**文件路径**: [game-ddz-web/src/pages/DouDiZhu/douDiZhu.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/pages/DouDiZhu/douDiZhu.tsx)

约 **806 行**，是整个前端的核心。

#### 关键常量

```typescript
const WS_ADDRESS = resolveWsAddress(__WS_ADDRESS__)  // Vite 注入的全局变量
const PING_INTERVAL = 20000     // 20 秒心跳
const RECONNECT_DELAY = 3000    // 3 秒后重连
const MAX_RECONNECT = 10        // 最多重连 10 次
```

#### WebSocket 管理

| 方法/状态 | 说明 |
|---|---|
| `wsRef` | WebSocket 实例引用（useRef） |
| `reconnectCountRef` | 重连次数计数 |
| `connectWs()` | 建立连接 → onopen 后发送 `onJoin` → 启动心跳 |
| `ws.onmessage` | JSON.parse → `handleServerMessage(data)` |
| `ws.onclose` | 自动重连（超限则提示用户手动刷新） |
| `ping/pong` | 20 秒一次；服务端 echo `{ type: 'pong' }` |

#### 状态管理

| 状态 | 类型 | 说明 |
|---|---|---|
| `roomData` | `I_roomData?` | 房间状态（服务端广播的完整 RoomInfo） |
| `activeCardId` | `number[]` | 用户选中的手牌（准备出的牌） |
| `roundCard` | `I_roundCard[]` | 整局出牌历史（`useCard` / `end` 时由服务端 `data.round` 全量同步）。**只用来取最后一手渲染到牌桌中央**，不再整列堆叠；`length === 0` 同时是「新一轮起手」的判据 |
| `isShowResult` | `boolean` | 是否显示结算弹窗 |
| `loading` | `boolean` | WS 连接状态 |

#### 牌型校验（前端 ruleList）

前端维护了一份与后端一致的牌型校验逻辑（6 条 rule 顺序匹配）：

1. 王炸（大小王）
2. 单张
3. 对子
4. 顺子 + 连对
5. 三张 / 三带一 / 三带二 / 飞机 / 飞机带单 / 飞机带对
6. 炸弹 + 4 带 2

前端校验通过后才发送 `useCard`，**但后端仍会校验一次**（`validateCardsInHand`）。

#### 生命周期

| 事件 | 处理 |
|---|---|
| 组件挂载 | `connectWs()` 建立 WebSocket |
| 组件卸载 | 清理 timer + 关闭 WS |
| `roomData.status === 'end'` | 显示 `Result` 组件 |
| `roomData.status === 'reopen'` | 自动发送 `onStart` |

---

### 6.4 前端工具模块

#### utils/card.ts — 牌数据定义

**文件路径**: [game-ddz-web/src/utils/card.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/card.ts)

| 名称 | 说明 |
|---|---|
| `INIT_CARDS` | 完整 54 张牌的静态数组（与后端 cardIdList 一一对应） |
| `getMyCard(cardIdList, initCard)` | 根据 id 数组取牌对象并按 point 排序 |
| `shuffleCard` | Knuth-Durstenfeld 洗牌（重复定义，同后端） |
| `getGroupData(useCard)` | 按 point 分组后再按数量（1/2/3/4）分组 → 前端 ruleList 用 |
| `getIsContinuityNumber(backData, type)` | 判断某种数量的牌是否连续（用于顺子/连对/飞机校验） |

#### utils/request.ts — axios 封装

**文件路径**: [game-ddz-web/src/utils/request.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/request.ts)

```typescript
newRequest({ url, options }) → Promise<res.data | null>
```

- 支持 `withCredentials`
- 异常自动 notification 弹出
- 直接返回后端 data 对象（不是完整 AxiosResponse）

#### utils/storage.ts — 本地存储

**文件路径**: [game-ddz-web/src/utils/storage.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/storage.ts)

封装 `localStorage` 和 `sessionStorage`，额外提供带过期时间的 `setToken/getToken`、`setAccount/getAccount`（7 天过期）。

#### utils/auth.ts — 登录态与账号接口

**文件路径**: [game-ddz-web/src/utils/auth.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/auth.ts)

| 导出 | 说明 |
|---|---|
| `getToken()` | 读本地 token（复用 `storage.getToken` 的 7 天过期判断） |
| `getPlayer()` | 读缓存的账号资料 |
| `isLoggedIn()` | 是否有本地凭证（路由守卫用） |
| `setAuth(token, player)` | 写入登录态 |
| `cachePlayer(player)` | 只更新资料缓存（结算后刷新积分） |
| `clearAuth()` / `logout()` | 清空登录态 |
| `apiRegister` / `apiLogin` | 注册 / 登录，返回 `{ isSuccess, message?, token?, player? }` |
| `apiMe()` | 用 token 换最新资料，失效返回 `null` |
| `apiLeaderboard()` | 拉排行榜 |

`request.ts` 会自动读取 token 并注入 `Authorization: Bearer`，业务代码不用手动带。401/403 在 `errorHandler` 里静默返回，交给调用方决定跳转，避免一进页面就弹红框。

#### utils/awaitHelper.ts — 异步辅助

**文件路径**: [game-ddz-web/src/utils/awaitHelper.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/awaitHelper.ts)

| 函数 | 说明 |
|---|---|
| `formatTime(num)` | 毫秒 → `HH:MM:SS` 格式字符串 |
| `awaitFun(delaytime)` | Promise 延时包装（默认 3000ms） |

#### utils/sound.ts — 音效引擎

**文件路径**: [game-ddz-web/src/utils/sound.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/sound.ts)

**纯 Web Audio 实时合成，项目里没有任何 .mp3 / .wav 文件。**

单例 `sound`，对外暴露：

| 成员 | 说明 |
|---|---|
| `sound.play(name)` | 播放指定音效 |
| `sound.toggle()` | 切换开关，返回新状态 |
| `sound.setEnabled(v)` | 设置开关并写 `localStorage.DDZ_SoundEnabled` |
| `sound.unlock()` | 在用户手势里 resume AudioContext（移动端必需） |

内部两个发声原语：

```typescript
// 振荡器：支持滑音（endFreq）
private tone(freq, dur, { type, gain, delay, endFreq })

// 白噪声：带低通滤波扫频，用于爆炸 / 洗牌质感
private noise(dur, { gain, delay, filter })
```

音效清单：`deal` / `select` / `unselect` / `play` / `pass` / `call` / `nocall` / `bomb` / `win` / `lose` / `click` / `join` / `throw` / `splat`。

> ⚠️ 三个必须遵守的点：
> 1. **AudioContext 必须由用户手势激活**，否则移动端 Safari 完全静音。页面挂载时监听一次 `pointerdown` 调 `unlock()`。
> 2. **`enabled === false` 时在 `play()` 入口直接 return**，不创建任何节点，否则静音状态下仍在跑音频图。
> 3. **不要复用 OscillatorNode**，Web Audio 的振荡器是一次性的，每次发声新建。

#### utils/voice.ts — 快捷语音

**文件路径**: [game-ddz-web/src/utils/voice.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/voice.ts)

素材是 `scripts/gen-voice.py` 用 edge-tts 生成的 8 个 mp3，放在 `public/voice/`，由 Vite 当静态资源服务。

| 导出 | 说明 |
|---|---|
| `QUICK_CHAT` | `{ id, label, text, icon }[]`，面板按钮用 |
| `quickChatText(id)` | 按 id 取完整文案（服务端没推 text 时兜底） |
| `playVoice(id)` | 播放一条语音；`sound.enabled === false` 时静音 |
| `preloadVoice()` | 进房间时预热全部音频，避免首次播放有半秒延迟 |

> ⚠️ **文案以服务端 `QUICK_CHAT_TEXT` 为准**，前端只维护 id → 显示文案。加语音时两边一起改，
> 否则服务端会以「没有这句语音」拒掉。
>
> `new Audio()` 实例按 id 缓存复用（不是每次 new），并且同一时刻只允许一条在响 —— 否则三个人连发会叠成噪音。

#### utils/useViewport.ts — 视口 hook

**文件路径**: [game-ddz-web/src/utils/useViewport.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/useViewport.ts)

```typescript
const { width, height, isMobile, isSmall, isLandscape } = useViewport()
// isMobile  < 768px
// isSmall   < 480px
```

> **只用于 JS 必须知道尺寸的场景**（给头像传 px）。纯样式层面的响应式一律走 CSS 媒体查询 / `clamp()`，不要用这个 hook 驱动样式——resize 时重渲染代价远高于 CSS。
>
> 内部用 `requestAnimationFrame` 节流，避免 resize 期间疯狂 setState。

---

### 6.5 组件清单

| 组件 | 路径 | 说明 |
|---|---|---|
| `CardStyle` | `pages/DouDiZhu/cardStyle/cardStyle.tsx` | 单张扑克牌（花色、选中高亮、红黑配色）；尺寸由父级 `--card-w` / `--card-h` / `--card-gap` 驱动，**点数字号还要受 `--card-exposed`（露出条宽度）约束**，否则「10」会被右边那张盖掉一半；`disabled` 用于出牌区/底牌（同时不渲染点击热区）。**点击落在 `.cardHit` 热区上而不是牌面本身**，见「叠牌点击」一节 |
| `PlayerHeader` | `pages/DouDiZhu/components/playerHeader/playerHeader.tsx` | 玩家头像位：头像 + 蓝色方块牌数角标 + 下方深色信息板（昵称 / 金币积分）；三家绝对定位（slot0/1/2）也在这里。可选 `onRemove`：传了就在头像右上角渲染红色 `×` 移除按钮（仅房主 + 准备阶段 + 目标是 AI 时才由父级传入）。`isHit` 触发被砸抖动 |
| `PlayerAvatar` | `components/playerAvatar/playerAvatar.tsx` | 默认头像：昵称哈希 → 渐变底色 + 首字符；AI 固定紫色；地主皇冠、当前回合呼吸光圈、离线灰显 |
| `PageLoading` | `components/pageLoading/pageLoading.tsx` | 全屏加载页，视觉和 `index.html` 内联骨架一致；作为 `App.tsx` 里 `<Suspense>` 的 fallback |
| `FunLayer` | `pages/DouDiZhu/components/funLayer/funLayer.tsx` | 互动特效层：投掷物抛物线飞行 → 爆开 + 冲击波 + 碎屑；语音气泡浮在头像上方。`position: fixed` + `pointer-events: none`，起止坐标靠 `[data-pid]` 反查头像现算 |
| `Result` | `pages/DouDiZhu/result/result.tsx` | 结算弹窗（`position: fixed` 居中，不用负 margin） |
| `Decor` | `components/decor/decor.tsx` | 花色图标（♠♥♣♦）；`font-size: inherit` 跟随卡牌缩放 |

---

### 6.6 互动玩法（砸道具 / 快捷语音）

```
点 🍅 → aiming='tomato'（牌桌进入瞄准态，头像加虚线框）
      → 点头像 → send({ type:'throwItem', targetId, item })
      → 服务端校验 + 节流 → sendRoomEvent 广播全房
      → 前端 handleServerMessage 拦到 type==='throwItem'
      → FunLayer 算起止坐标 → 飞行 600ms → 爆开 520ms + 头像抖动 500ms
```

**几个刻意的设计决定：**

| 决定 | 原因 |
|---|---|
| 客户端**不做乐观渲染**，等服务器回声 | 被节流/校验拦下时不会出现"假动画"；服务端也广播给发起人，天然一致 |
| 用 `sendRoomEvent` 而不是 `sendMes` | 房间数据没变，推整份 `RoomInfo` 纯属浪费带宽 |
| 点击用**事件委托**（挂在 `.table` 上） | 准备阶段和打牌阶段是两套完全不同的 DOM，委托一份逻辑通吃 |
| 起止坐标用 `getBoundingClientRect` **现算** | 窗口缩放、横竖屏切换后依然对准 |
| 特效层 `pointer-events: none` | 盖在牌桌上但不挡任何点击 |

> ⚠️ **CSS Modules 的坑**：antd 的 `Popover` 内容渲染在 `document.body` 的 portal 里，
> 不在 `.page` 的 DOM 子树中。如果把 `.chatPanel` 嵌在 `.page {}` 里面写，
> 编译结果是 `.page_hash .chatPanel_hash`，在 portal 里匹配不到 ——
> 表现就是语音面板被拉成一整行横穿屏幕。**portal 内容的样式必须写在 `.page` 外面。**

---

### 6.7 响应式策略

#### 尺寸由 JS 按张数算，不用 clamp

`.page` 上只留兜底值，真正生效的是 `douDiZhu.tsx` 里算出来、内联写进 `style` 的那一组：

```ts
// 总宽 = 牌宽 + (n-1) × 露出宽，露出宽 = 牌宽 × (1 - 重叠比例)
const need = 1 + (n - 1) * (1 - HAND_GAP_RATIO)
const handCardW = Math.max(26, Math.min(maxHandCardW, Math.floor(avail / need)))

const handCardVars = {
  "--card-w":   `${handCardW}px`,
  "--card-h":   `${Math.round(handCardW * 1.34)}px`,
  "--card-gap": `${-Math.round(handCardW * HAND_GAP_RATIO)}px`,
}
```

| 场景 | 重叠 | 上限 | 390 屏 20 张实测 |
|---|---|---|---|
| 手牌 `isSmall` | 60% | 56px | 43×58，露出 17px |
| 手牌 `isMobile` | 46% | 64px | 45×60，露出 18px |
| 手牌桌面 | 46% | 76px | 76×102，露出 41px |
| 出牌区 | 34% | 手机 50 / 桌面 40 | 单手牌 50×67 |

**为什么弃用 `clamp`**：`clamp` 不知道这一手有几张牌，只能按最坏情况（20 张）取最小值，手机上被压到 34px、出牌区只有 21px（点数 7px 高，等于看不见）。按张数算就能「张数少 → 牌自动变大」。

卡牌内部所有字号 / 圆角 / 选中抬起高度仍是 `calc(var(--card-w) * N)`，组件内不写媒体查询。

#### ⚠️ 自定义属性在「声明它的元素」上求值

```less
/* ❌ 坑：--card-h 被 .page 的 --card-w 提前算死 */
.page { --card-w: 34px; --card-h: calc(var(--card-w) * 1.34); }
/* 在子元素上把 --card-w 改成 50px，--card-h 仍然是 46px，间距仍按 34px 算 */
```

`var()` 的替换发生在**声明该变量的元素**上，不是**使用它的元素**上。
所以 `--card-w` / `--card-h` / `--card-gap` 必须一起从 JS 传，别指望级联。
症状：牌宽 50 了、高度还停在 46、17 张牌撑到 520px 溢出屏幕（`handCard.x = -65`）。

反过来，只要**声明处**的 `--card-w` 已经是最终值，写 `calc()` 就是安全的：
`.cardList` 上的 `--card-exposed: calc(var(--card-w) + var(--card-gap))` 就属于这种，
因为这两个变量正是内联写在同一个元素上的。

#### ⚠️ 点数字号要卡「露出条」，不是「牌宽」

叠牌时每张牌只露出左边一条（`--card-exposed`）。字号按牌宽 0.34 算的话，
「10」宽约 1.1em = 16px，而 390 屏 20 张时露出条只有 17px，减去左边距后右半截被下一张盖掉，
屏幕上显示成「1(」。

```less
font-size: min(
  calc(var(--card-w) * 0.34),
  calc(var(--card-exposed) * 0.72)
);
```

`--card-exposed` 由各容器分别给出：

| 容器 | `--card-exposed` | 说明 |
|---|---|---|
| `.cardList` | `calc(var(--card-w) + var(--card-gap))` | 与 `.cardHit` 热区宽度同源 |
| `.roundCardList` | `calc(var(--card-w) * 0.66)` | 横向重叠 34% |
| `.aHand` | `var(--card-w)` | 底牌不叠，整张露出 |

没声明时 `min()` 兜底 `9999px`，等价于「只按牌宽算」→ 桌面端像素级不变。
大小王的竖排文字（`.joker`）同理，宽度约等于一个字号，也要套 `min()`。

#### 手牌不溢出的算法

```
总宽 = n × w + (n-1) × gap，gap = -ratio × w
     = w × (1 + (n-1)(1-ratio))
反解：w = avail / (1 + (n-1)(1-ratio))
```

| 屏宽 | 张数 | 重叠 | `--card-w` | 总宽 | 是否溢出 |
|---|---|---|---|---|---|
| 390px | 20 | 60% | 43px | 366px | ✓ |
| 390px | 17 | 60% | 50px | 370px | ✓ |
| 320px | 17 | 60% | 40px | 296px | ✓ |
| 412px | 20 | 60% | 45px | 387px | ✓ |
| 1280px | 20 | 46% | 76px | 855px | ✓ |

`.cardList` 保留 `overflow-x: auto` 兜底，极端情况可横向滚动（正常尺寸下 `scrollWidth === clientWidth`）。

#### 叠牌点击：热区必须等于露出区

叠牌时每张牌被后一张盖住右边一大截。如果整张牌都接收点击，**选中牌一旦被提到最上层，就会把旁边那张牌露出的点数区一起挡住**——表现就是「选中一张之后点不到旁边的牌」。

做法：

```less
.cardBox { pointer-events: none; }        // 牌面本身不接点击

.cardHit {                                 // 只覆盖自己露出的那一条
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--card-w) + var(--card-gap));  // = 露出宽度
  pointer-events: auto;
}

.cardBox:last-child > .cardHit { width: var(--card-w); }  // 最后一张整张可点
```

> ⚠️ **热区只解决「点得到」，不解决「看得见」。** 选中态如果还加 `z-index` 把整张牌提到最上层，
> 它的**牌身**（宽 `--card-w`）会盖住右边那张牌的露出区（宽约 54% 牌宽，实测 25px 里被盖掉 20px）。
> 左右两张都选中时，中间那张只剩 5px 露在外面，等于消失。
> 详见下一节「选中态不能抬 z-index」。

- 热区宽度用 `--card-w` 而不是 `100%`：`100%` 是 padding box（已扣掉两侧 1px 边框），逐张累积会留 2px 的点击缝隙
- 相邻热区严格不重叠 → 点哪儿选哪张，与 `z-index` 无关
- 选中牌只有自己的热区接点击，右侧区域对鼠标透明，点击会穿透到下面那张牌


#### 布局结构

```
.page (flex column, 100dvh)
├── .topBar        flex 0 0 auto   房间号 + 音效开关 + 退出
├── .table         flex 1 1 auto   position: relative
│   ├── .tableSurface  绝对定位的暖色椭圆桌面（纯装饰，pointer-events: none）
│   ├── .tableBrand    中央水印「斗地主」+ 房间信息
│   ├── 底牌 / 出牌区（只渲染当前一手）/ 回合提示
│   ├── .playerHeaderList  三个头像位（绝对定位）
│   └── .toolBar      右下竖排工具栏（砸番茄 / 扔鸡蛋 / 语音）
└── .myContent     flex 0 0 auto   按钮 + 手牌
```

**不再用 `top: 120px` 这类硬编码绝对定位**，纵向用 flex 三段式分配，只有牌桌内部的三个头像位用绝对定位。

#### 出牌区只放「当前一手」

`data.round` 是整局累积的出牌历史。早前整列纵向渲染，局一长就堆到十几行，超出 `max-height: 46%` 的部分被裁掉——最底下那张牌只剩半截；而且每行前面的昵称长短不一，牌行起点参差不齐。

现在：

- 只取 `roundCard[roundCard.length - 1]` 渲染，昵称单独一行居中，牌行从同一起点排
- 一手最多 20 张（飞机带翅膀），牌之间重叠 34%：`margin-right: calc(var(--card-w) * -0.34)`，
  牌宽按张数算（手机上限 50px），20 张在 320 屏也有 271px，不溢出牌桌
- 去掉 `overflow-y: auto` / `max-height`，不存在裁切
- 容器 `pointer-events: none`，不挡「瞄准道具时点空白取消」

#### 「不要」浮标

服务端处理过牌时**只把 `notUseCardCount + 1` 并移动 `current`，不动 `round`**（两家都过才清空 `round`）。
结果就是：有人点了不要，牌桌上什么变化都没有，看起来像卡住了。

前端用「前后两帧的计数差」反推是谁过的牌：

```ts
const passed =
  data.notUseCardCount === prevRoom.notUseCardCount + 1 ||
  (prevRoom.notUseCardCount === 1 && data.notUseCardCount === 0)  // 两家都过，计数归零
if (passed) setPassTip({ name: prevRoom.player?.[prevRoom.current].playerId, key: Date.now() })
```

浮标 1.8s 后自动消失，`key` 用时间戳保证连续两次过牌能重新触发入场动画。

> ⚠️ 服务端协议没改，纯前端推导。以后要是服务端改了过牌的字段语义，这里会静默失效。

服务端在两家都「不要」后会清空 `roomInfo.round`，所以最后一条天然就是当前有效的那手牌；`roundCard.length === 0` 时正好是新一轮起手，此时显示中央的回合提示条，两者互斥不会重叠。

#### 底部按钮区高度必须固定

`.btnBox` 是条件渲染的：轮到自己才出现「不要 / 出牌 / 取消」，轮到别人时整块消失。它原本只写了 `min-height: 46px`，而按钮 40px + 上下 padding 12px = **52px**，于是按钮消失时高度从 52 掉到 46。`.table` 是 `flex: 1 1 auto`，会把这 6px 全吃掉 —— 牌桌椭圆和中央水印肉眼可见地抖一下（出牌瞬间最明显）。

所以 `min-height` 必须等于「按钮高 + 上下 padding」：

| 场景 | 按钮高 | padding | `min-height` |
|---|---|---|---|
| 默认 | 40px | 12px | **52px** |
| `max-width: 480px` | 38px | 12px | **50px** |
| `max-height: 620px` | 34px | 6px | **40px** |

> ⚠️ 以后调按钮高度，记得同步改这个 `min-height`，否则又会抖。

#### 断点

| 断点 | 调整 |
|---|---|
| `max-width: 480px` | 手牌重叠 46% → 60%（牌能大一圈）、按钮 38px 高、房间列表只显 2 个头像；桌面弧度改成 `38% / 11%`（否则窄高屏会变胶囊）；工具栏按钮 38px |
| `max-height: 620px` | 横屏手机 / 小笔记本：顶栏和按钮压矮，手牌上限降到 46px；**工具栏转横排并隐藏文字标签**；信息板压成单行「昵称 · 积分」 |

> ⚠️ 头像尺寸同时看宽和高：`vp.height < 480 ? 52 : vp.isSmall ? 56 : vp.isMobile ? 64 : 80`。
> 只按宽度算的话，780×400 的横屏手机会被当成桌面端拿到 80px 头像，牌桌直接被挤没。

#### 移动端专项

| 问题 | 处理 |
|---|---|
| `100vh` 被地址栏顶掉 | `100dvh` + `100vh` 兜底 |
| 刘海 / 底部指示条 | `viewport-fit=cover` + `env(safe-area-inset-bottom)` |
| iOS 输入框聚焦放大 | `input { font-size: 16px !important }` |
| 下拉橡皮筋 | `overscroll-behavior: none` |
| 点击蓝色高亮 | `-webkit-tap-highlight-color: transparent` |
| 双指缩放误触 | `user-scalable=no` |

> ⚠️ `index.css` **不能写 `color-scheme: light dark`**。游戏页固定绿色主题，跟随系统暗色模式会让文字刷白，和背景糊在一起。

#### 手牌 z-index 陷阱

**不要**给手牌加任何 `z-index`，无论内联还是 CSS。层叠顺序只有一个来源：**DOM 顺序**。

原因：叠牌时每张牌只露出左边一条（`--card-w + --card-gap` ≈ 54% 牌宽），靠的就是「后渲染的盖住前一张的右半截」。
一旦某张牌被提到最上层，它的**整张牌身**就会盖住右边那张牌的露出区。

两个已经踩过的坑：

| 写法 | 后果 |
|---|---|
| `style={{ zIndex: 60 - card.id }}` | ID 与渲染顺序无关，小牌盖大牌，点哪儿都不对 |
| `.active { z-index: 999 }` | 选中牌整张浮到最上层，盖掉右邻居的露出区（25px 里只剩 5px）；左右都选中时中间那张直接消失 |

正确做法：`.cardBox` 不写 z-index，`.cardHit` 只在牌内部用 `z-index: 2` 保证热区在牌面之上。
选中态只靠 `transform: translateY(-0.26 * --card-w)` + 黄色描边表达。

> 描边右半边会被下一张牌切掉，这是正常的——真实的扇形手牌就是这样，选中牌也是塞在下一张底下的。

---

### 6.8 首屏加载与静态资源

手机第一次进来，正确观感是「骨架立刻出现 → 1~2 秒后登录页」。拆成四层来做：

| 层 | 文件 | 作用 |
|---|---|---|
| ① 内联骨架 | `game-ddz-web/index.html` | `<style>` + `#splash` 全内联，零外部依赖，文档解析完就能画 |
| ② gzip | `game-ddz-server/app.ts` | `compression` 中间件，产物 990KB → 290KB |
| ③ 路由懒加载 + 分包 | `router.tsx` / `vite.config.ts` | 入口 JS 8KB，页面各自成 chunk |
| ④ 长缓存 | `app.ts` 的 `express.static` | `/assets/*` immutable 一年 |

#### 骨架必须挂在 `#root` 外面

```html
<div id="root"></div>
<div id="splash">♥♠♦♣ 欢乐斗地主 正在加载…</div>
```
```less
#root:not(:empty) ~ #splash { display: none; }
```

原因：首帧路由是 `/ → /room → /login` 两次 `<Navigate>`，中间渲染 `null`。
骨架如果放在 `#root` 内部，React 清空容器时会连骨架一起清掉 —— 用户会看到
「骨架闪一下 → 纯色空屏 → 登录页」。放外面用兄弟选择器控制，空树期间骨架一直挂着。

`components/pageLoading/pageLoading.tsx` 是同一套视觉的 React 版，作为
`<Suspense fallback>`（`App.tsx` 里包住 `useRoutes`），用于懒加载 chunk 还没到位的间隙。
两套外观一致，切换是无缝的。

#### 分包策略

`vite.config.ts` 的 `manualChunks`：

| chunk | 内容 | 目的 |
|---|---|---|
| `react` | react / react-dom / scheduler / react-router | 极少变 |
| `antd` | antd / @ant-design / rc-* / @rc-component | 最大的一块，单独缓存 |
| `vendor` | 其余三方依赖 | — |
| 页面 chunk | `auth` / `DouDiZhu` / `douDiZhu` | 路由懒加载，互不牵连 |

> ⚠️ `compression` 必须注册在 `express.static` **之前**。另外默认只压 `text/*`，
> 这里额外排除 `image|audio|video` —— mp3 / 图片已是压缩格式，再压纯浪费 CPU。

#### 缓存头

| 路径 | Cache-Control |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `index.html`（含 SPA fallback） | `no-cache, must-revalidate` |
| `/voice/*`、favicon | `public, max-age=86400` |

> 入口 HTML 一旦被缓存，用户会拿着旧 HTML 去请求已经不存在的 hash 资源 → 白屏。
> 这条比「少一次请求」重要得多。

---

## 7. API 参考

### 7.1 HTTP API

所有路径前缀 `/api`。

| 方法 | 路径 | 描述 | 请求体 | 响应 |
|---|---|---|---|---|
| POST | `/api/register` | 注册 | `{ name, password }` | `{ isSuccess, token, player }` |
| POST | `/api/login` | 登录 | `{ name, password }` | `{ isSuccess, token, player }` |
| GET | `/api/me` | 当前账号资料（需 Bearer） | - | `{ isSuccess, player }` / 401 |
| GET | `/api/leaderboard` | 积分排行榜 Top 20 | - | `{ isSuccess, list }` |
| GET | `/api/roomList` | 获取房间列表 | - | `{ isSuccess, roomList: RoomInfo[] }` |
| POST | `/api/createRoom` | 创建房间 | `{ userName?: string, mode?: 'ddz' \| 'pdk' }` | `{ isSuccess, roomId: number }` |
| POST | `/api/addAI` | HTTP 添加 AI（测试用，受房主权限约束） | `{ roomId, skipAutoStart? }` | `{ isSuccess, room? }` |
| POST | `/api/removeAI` | HTTP 删除 AI（测试用，受房主权限约束） | `{ roomId, targetId }` | `{ isSuccess, room? }` |

> 注册/登录的业务失败（昵称占用、密码错）也返回 HTTP 200，用 `isSuccess: false` + `message` 区分。
> `/api/me` 未登录返回 401，前端据此跳登录页。登录失败统一提示「昵称或密码错误」，不区分账号是否存在，避免被用来探测注册情况。

---

### 7.2 WebSocket 消息协议

#### 客户端 → 服务端

所有消息都是 JSON 对象，必须包含 `type` 字段。

| type | 字段 | 说明 |
|---|---|---|
| `onJoin` | `roomId`, `token`, `playerId?` | 加入房间（重连也用这个）。**必须带 token**，`playerId` 仅为兼容旧链接，服务端一律以 token 解析出的昵称为准 |
| `onLeave` | `roomId`, `playerId` | 退出房间 |
| `addAI` | `roomId`, `playerId`, `skipAutoStart?` | **仅房主**添加 AI 玩家 |
| `removeAI` | `roomId`, `playerId`, `targetId` | **仅房主**删除指定 AI（`targetId` 是 AI 昵称） |
| `onStart` | `roomId` | 开始游戏（发牌阶段） |
| `onCall` | `roomId`, `playerId`, `position` | 抢地主 |
| `onNoCall` | `roomId`, `playerId`, `position` | 不叫地主 |
| `useCard` | `roomId`, `playerId`, `position`, `useCard[]` | 出牌 |
| `onNotUseCard` | `roomId`, `playerId`, `position` | 不要（放弃出牌） |
| `throwItem` | `roomId`, `playerId`, `targetId`, `item` | 砸道具。`item` ∈ `tomato` / `egg`；600ms 节流 |
| `quickChat` | `roomId`, `playerId`, `voiceId` | 发快捷语音，`voiceId` 必须在服务端白名单里 |
| `hint` | `roomId`, `playerId`, `seq` | 提示：返回能压上当前这手牌的第 `seq` 组候选。**只回给发起人**（`sendMesForPlay`），不改房间状态 |
| `ping` | - | 心跳 |

#### 服务端 → 客户端

服务端主要广播完整的 `RoomInfo` 对象（即 `sendMes(backData)` 发送的内容）。

| 消息类型 | 说明 |
|---|---|
| 广播 `RoomInfo` | 任何状态转移后向房间内所有在线玩家广播最新房间状态 |
| `{ type: 'throwItem', from, to, item, ts, fromAI? }` | 投掷事件。**不带房间数据**，走独立的 `sendRoomEvent()`；发起人也会收到（本地不做乐观渲染，统一由这条消息驱动） |
| `{ type: 'quickChat', from, voiceId, text, ts }` | 语音事件。前端据此播 `public/voice/<voiceId>.mp3` 并在头像上冒气泡 |
| `{ type: 'hint', seq, total, cards }` | 提示结果。`total` 是候选组数，`cards` 为空数组表示要不起；前端据此 `setActiveCardId` |
| `{ type: 'pong' }` | 心跳响应 |
| `{ isError: true, message }` | 错误提示（单独发给请求方） |
| `{ isError: true, message, needLogin: true }` | 登录态失效，前端清 token 跳登录页 |
| `{ isError: true, message, roomGone: true }` | 房间已不存在（多为服务重启），前端弹窗引导回大厅 |
| `{ isError: true, message, gameInProgress: true }` | 对局进行中拒绝中途加入，前端弹窗引导回大厅 |
| `{ status: 'maxCount' }` | 房间已满（单独发给请求方） |

---

## 8. 游戏状态机

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
  ┌──────────┐   ┌─────────────┐   有人叫地主   ┌─────┴──────┐
  │ prepare  │──▶│selectLandlord│─────────────▶│    play     │
  │ (准备)    │   │  (叫地主)    │  3人都不叫    │  (出牌)      │
  └──────────┘   └──────┬──────┘               └──────┬──────┘
       ▲                │                              │
       │                ▼                              ▼
       │           ┌──────────┐               ┌──────────┐
       │           │  reopen  │               │  useCard  │
       │           │  (重开)   │               │  (出牌中)   │
       │           └────┬─────┘               └────┬─────┘
       │                │                           │
       │                │ 自动 start                 │ 牌出完了
       │                ▼                           ▼
       │           ┌─────────────┐               ┌──────────┐
       └───────────│selectLandlord│               │   end    │
                   └─────────────┘               │  (结束)    │
                                                 └────┬─────┘
                                                      │ 房主点"继续"
                                                      ▼
                                                 ┌──────────┐
                                                 │ prepare  │
                                                 └──────────┘
```

**状态流转说明**：

| 状态 | 含义 | 允许的下一个动作 |
|---|---|---|
| `prepare` | 准备阶段（未满 3 人 / 上局结束） | `addAI`, `onStart`（≥3 人） |
| `selectLandlord` | 叫地主阶段 | `onCall`, `onNoCall` |
| `play` | 出牌阶段（新回合开始） | `useCard`, `onNotUseCard` |
| `useCard` | 出牌中（有人刚出了牌） | `useCard`, `onNotUseCard` |
| `reopen` | 3 人都不叫，重开一局 | 自动触发 `onStart` |
| `end` | 本局结束（有人出完了） | 房主点继续 → `prepare` |

---

## 9. AI 决策算法

### 三层架构

```
enumerateAll(hand)              ← 第一层：枚举全部候选
       │
       ▼
enumerateBeatCandidates()       ← 第二层：筛选能压过上家的
       │
       ▼
scoreCandidate() → sort         ← 第三层：贪心打分排序
       │
       ▼
best candidate                  ← 输出最优选择
```

### 打分函数详解

```
scoreCandidate(candidate, hand, oppRemainingMin?)

  1. 剩余 0 张 → +100000（必胜，直接选）
  2. 剩余 ≤ 2 张 → +50000 - remaining*1000
  3. 出牌数量 × 2（鼓励出多张）
  4. - mainPoint × 1（大牌不爱出）
  5. 王炸 -50，炸弹 -30（非必要保留）
  6. 长顺子(≥6) +5，长连对(≥4) +5，飞机 +8
  7. 对手快出完（≤2张）时：反转策略
       + mainPoint × 0.5（愿意用大牌压）
       王炸 +50，炸弹 +20（残局需要压）
```

### 叫地主打分

```
scoreForCalling(cards)
  双王 +15, 大王 +8, 小王 +6
  每个 2 × +4
  每个炸弹 × +6
  每个 A × +2
  每个 K × +1

decideCallLandlord(cards, callCount)
  threshold: callCount=1 → 14, callCount=2 → 10, callCount=3 → 6
  finalScore = score + random(0~3)
  finalScore >= threshold ? 'call' : 'noCall'
```

---

## 10. 依赖关系图

### 后端模块依赖

```
init.ts (cardIdList)
    │
    ▼
card.ts (getCardPoint, shuffleCard, getCard)
    │
    ├──▶ identify.ts (getCardPoint → identifyType, canBeat)
    │       │
    │       ▼
    ├──▶ enumerate.ts (getCardPoint, identifyType → enumerateAll, enumerateBeatCandidates)
    │       │
    │       ▼
    └──▶ ai.ts (getCardPoint, identifyType, enumerate.ts → decideAI)
            │
            ▼
         app.ts (引用 card, ai, init + Express + ws)
```

### 前端模块依赖

```
card.ts (INIT_CARDS, getGroupData, getIsContinuityNumber)
    │
    ▼
douDiZhu.tsx (card.ts, PlayerHeader, CardStyle, Result, request.ts, storage.ts, user.ts)
    │
    ├──▶ playerHeader.tsx
    ├──▶ cardStyle.tsx (decor.tsx)
    └──▶ result.tsx

request.ts → axios
storage.ts → localStorage
user.ts → storage.ts
```

---

## 11. 运行与部署

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 9（根目录 `package.json` 锁定 `packageManager: pnpm@9.15.9`）

### 安装依赖

```bash
pnpm install
```

pnpm workspace 会一次性装好前后端所有依赖（约 395 个包），monorepo 共享根级 `node_modules/.pnpm/`，通过软链映射到每个子包。

### 所有 scripts 清单

```bash
# ─── 安装与构建 ───
pnpm install                    # 安装所有依赖（workspace 模式）
pnpm build                      # 🎯 完整构建（前端 vite → 后端 tsc → 汇总到根 build/）
pnpm build:web                  # 只构建前端（vite build）
pnpm build:server               # 只构建后端（tsc 编译）

# ─── 启动 ───
pnpm serve                      # 构建 + 启动（生产模式，localhost:9200）
pnpm start                      # 直接启动（跳过构建，已跑过 build 时用）
pnpm dev                        # 开发模式（前后端同时启动 + HMR）
pnpm dev:web                    # 只起前端 dev server（localhost:9100）
pnpm dev:server                 # 只起后端（localhost:9200）

# ─── 🌐 内网穿透（发给朋友玩） ───
pnpm tunnel                     # ngrok（tunnel.js 默认 provider，同 tunnel:ngrok）
pnpm tunnel:ngrok               # ngrok（推荐，国内可用，需一次注册）
pnpm tunnel:lt                  # localtunnel（免注册，有 IP 验证页）
pnpm tunnel:cpolar              # cpolar（国内最快零验证页，需装客户端）
# cloudflared 需直接运行脚本：
# node scripts/tunnel.js --provider cf

# ─── 工具 ───
pnpm typecheck                  # 后端 TypeScript 类型检查
```

### 开发模式（前后端分离，HMR）

```bash
# 终端 1：后端（9200 端口，ts-node 热重载）
pnpm dev:server

# 终端 2：前端（9100 端口，Vite 自动代理 /api 和 WS 到 9200）
pnpm dev:web

# 或一条命令同时启动
pnpm dev
```

浏览器访问 `http://localhost:9100`。

### 生产模式（单服务，推荐）

```bash
pnpm build
pnpm serve
```

浏览器访问 `http://localhost:9200`。Express 一个进程同时提供 SPA + HTTP API + WebSocket。

### 构建流程详解

`pnpm build` 执行链：

```
pnpm build
  ├── pnpm --filter game-ddz-web build     ← vite build → game-ddz-web/dist/
  └── pnpm --filter game-ddz-server build  ← node scripts/build.js
        ├── Step 1: tsc 编译后端            → game-ddz-server/dist/
        ├── Step 2: 复制前端 dist            → game-ddz-server/public/  (单服务部署)
        └── Step 3: 汇总到根目录             → game-DDZ/build/           (统一产物)
```

三种部署产物位置（内容完全相同，只是给不同部署方式用）：

```
game-DDZ/
├── build/public/          ← 🎯 根目录统一产物（gitignore）
├── build/dist/
├── game-ddz-server/public/  ← 单服务部署专用（gitignore）
├── game-ddz-server/dist/
└── game-ddz-web/dist/       ← Vite 直接输出（gitignore）
```

### 单服务部署（零配置）

后端 Express 同时承载前端 SPA，一个 Node 进程搞定：

```bash
# 方式 A：上传 game-ddz-server/ 整个目录
pnpm build
# 上传 game-ddz-server/ 到服务器
cd game-ddz-server && node dist/app.js

# 方式 B：上传根 build/ + package.json + node_modules
# 服务器上：node build/dist/app.js
```

### 云托管部署（Railway / Render 等）

项目已配好自动识别文件：

| 文件 | 作用 |
|---|---|
| `package.json`（根） | build/start 脚本 + `engines.node` + `packageManager` |
| `pnpm-workspace.yaml` | 声明 monorepo，平台自动 `pnpm install` 所有子包 |
| `railway.json` | Railway 构建/部署/健康检查配置 |
| `/health` 端点 | Render / Railway 定期 ping 这个端点判断容器存活 |

步骤：

1. 推代码到 GitHub
2. 平台 Import 仓库 → 自动识别 Node + pnpm workspace
3. Build Command: `pnpm build` / Start Command: `pnpm start`
4. Health Check Path: `/health`（Render 需手动填，Railway 自动识别）
5. Deploy → 拿到公网地址

### 端口说明

| 端口 | 用途 | 启动方式 | 环境 |
|---|---|---|---|
| **9200** | 后端 HTTP API + WebSocket + SPA | `PORT=9200 node dist/app.js` | **生产 / 本地** |
| 9100 | 前端 Vite dev server（自动代理到 9200） | `pnpm dev:web` | 仅开发 |

### 多环境配置

`game-ddz-web/proxy.ts` 管理 4 种环境的 WS 地址和 API 代理：

| 环境 | proxy.target | wsAddress |
|---|---|---|
| dev | `http://localhost:9200` | `ws://localhost:9200` |
| test | `https://proxy.pule.com` | `wss://proxy.pule.com` |
| pre | Railway 生产后端 | Railway 生产 WS |
| **prod** | 空（同源） | `__AUTO__`（前端根据页面协议自动推导） |

`__AUTO__` 推导规则（前端 `resolveWsAddress`）：

```
https://your-domain.com  →  wss://your-domain.com
http://localhost:9200    →  ws://localhost:9200
```

### 健康检查端点

`GET /health` 返回：

```json
{ "ok": true, "uptime": 3.14 }
```

⚠️ 必须在 SPA fallback 路由之前注册（`app.get(/^(?!\/api\/).*/)` 是兜底通配），否则会被 SPA 匹配到返回 index.html。

---

## 12. 内网穿透脚本（scripts/tunnel.js）

**文件路径**: [scripts/tunnel.js](file:///d:/project/my/game-DDZ/scripts/tunnel.js)

### 功能

包装 4 种穿透工具，自动启动 node 游戏服务 + 穿透进程，**验证公网链接真实可达后**再用大字横幅打印。Ctrl+C 退出时自动杀掉两个进程。

ngrok 走 4040 管理 API 轮询（终端输出是交互式仪表盘，正则抓不到）；其余 provider 从进程输出里正则抓 URL。

### Provider 配置

| Provider | key | 命令 | URL 正则 | 特殊处理 |
|---|---|---|---|---|
| ngrok（默认） | `ngrok` | `ngrok http 9200` | `*.ngrok(-free)?.(dev\|app)` | **ngrok 3.x 默认输出是交互式仪表盘**，正则抓不到。改用轮询 `http://localhost:4040/api/tunnels` 管理 API，纯 JSON 100% 可靠 |
| cloudflared | `cf` | `cloudflared tunnel --url http://localhost:9200 --protocol http2` | `*.trycloudflare.com` | HTTP/2 协议绕过国内 QUIC 限制 |
| localtunnel | `lt` | `localtunnel --port 9200` | `*.loca.lt` | 无 |
| cpolar | `cpolar` | `cpolar http 9200` | `*.cpolar.cn` | 国内最快，零验证页 |

> **默认 provider 是 ngrok**：`pnpm tunnel`（不带 `:ngrok`）也跑 ngrok。要用 cloudflared 需 `node scripts/tunnel.js --provider cf`。

### 执行流程（4 步）

```
[1/4] ensureNodeRunning()   检查 9200/health → 已通就复用，否则 spawn node
[2/4] startTunnel()         记录旧 tunnel → 杀残留 → 等 4040 释放 → spawn 穿透进程
[3/4] pollApi()             轮询 4040 → 三重过滤 → 验证可达 → 打印 URL
[4/4] 挂起等待 Ctrl+C        SIGINT → cleanup() 杀掉 tunnelProc + nodeProc
```

### ⚠️ 陷阱 1：ngrok 免费版禁止 HTTP 代理

**现象**：`pnpm tunnel:ngrok` 秒退，stderr 报

```
ERROR: authentication failed: Running the agent with an http/s proxy is a
Pay-as-you-go feature. ... verify that there is no proxy_url value in your
ngrok configuration file and that the http_proxy environment variable is not set.
```

**原因**：进程环境里存在 `http_proxy` / `https_proxy`（常见于 IDE、公司网络、Clash/v2ray 等客户端注入）。ngrok 免费版把"走代理"当付费功能，直接拒绝认证。

**解法**：spawn 前剔除这些变量。

```js
function envWithoutProxy() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(k)) delete env[k];
  }
  return env;
}

spawn(cmd, args, { ...opts, env: envWithoutProxy() });
```

> 若剔除代理后仍连不上，说明该网络**必须**经代理才能访问 ngrok 服务器，ngrok 免费版无解 → 换 `pnpm tunnel:cpolar`（国内服务，无需代理）。

### ⚠️ 陷阱 2：残留进程导致打印旧链接

**现象**：终端打印的 URL 能显示，但打开不是本次启动的实例（或已离线）。

**原因链**：
1. 上次 ngrok 进程没退干净，仍占着 4040 管理端口
2. `killResiduals()` 用 `taskkill /F` 杀掉进程，但 Windows 释放端口 + ngrok 服务端注销 session 需要数秒
3. 新 ngrok 启动时撞上 `ERR_NGROK_334: endpoint already online` → 秒退
4. `pollApi()` 仍能连上 4040（旧进程残留）→ 拿到旧 tunnel 的 `public_url` → 打印

**解法**：三重过滤 + 可达性验证。

```js
// ① 启动前快照旧 tunnel，这些 URL 一律不采用
const before = await getNgrokTunnels(4040);
const staleUrls = new Set((before || []).map(t => t.public_url).filter(Boolean));

// ② 杀残留后等 4040 真正释放（不能只 sleep 500ms）
killResiduals();
await waitNgrokApiDown(8000);   // 轮询直到 4040 连不上

// ③ 只接受满足全部三个条件的 tunnel
const fresh = tunnels.filter(t =>
  t.proto === 'https' &&                    // 必须 https
  !staleUrls.has(t.public_url) &&           // 不是启动前的旧 URL
  (t.config?.addr || '').includes(`:${PORT}`) // addr 指向当前端口
);

// ④ 打印前实际请求一次 /health，确认真的能打通
if (await verifyPublicUrl(fresh[0].public_url)) printUrl(fresh[0].public_url);
```

`verifyPublicUrl()` 必须带 `ngrok-skip-browser-warning: 1` 头，否则免费版会返回警告页 HTML 而不是后端的 JSON：

```js
await fetch(url + '/health', {
  headers: { 'ngrok-skip-browser-warning': '1' },
  signal: AbortSignal.timeout(8000),
});
// 校验响应体含 "ok" 或 "uptime"
```

### ⚠️ 陷阱 3：9200 被别的服务占用

`ensureNodeRunning()` 的 `checkHealth()` 不只判断 HTTP 200，还要求响应体是 `{"ok":true,...}`：

```js
resolve(JSON.parse(data).ok === true);
```

否则 9200 上跑着任意其他服务都会被误判为"游戏服务已在运行"，穿透到一个错误的后端。

### 终端横幅宽度

`printUrl()` 用 `displayWidth()` 计算显示宽度（CJK / 全角 / emoji 算 2 列），而不是 `String.length`。否则中文行会把 `║` 右边框挤歪。

### 使用方式

```bash
# 方式 1：package.json 命令（推荐，已包含 build + serve）
pnpm tunnel            # 构建 + 启动 + ngrok（默认 provider）
pnpm tunnel:ngrok      # 同上，显式指定 ngrok
pnpm tunnel:lt         # 构建 + 启动 + localtunnel
pnpm tunnel:cpolar     # 构建 + 启动 + cpolar

# 方式 2：直接运行（假设已经 build + serve 过）
node scripts/tunnel.js                    # ngrok（默认）
node scripts/tunnel.js --provider cf      # cloudflared
node scripts/tunnel.js --provider lt      # localtunnel
node scripts/tunnel.js --provider cpolar  # cpolar
```

### 前置条件

| Provider | 前置 |
|---|---|
| **ngrok**（默认） | **ngrok.com 注册（GitHub 一键登录）+ authtoken 配置**。配置一次永久使用：`npx ngrok config add-authtoken 你的token` |
| cloudflared | 免注册。npx 自动下载。国内可能被墙。用 `--provider cf` 指定。 |
| localtunnel | 免注册。npx 自动下载。有 IP 验证页（每 IP 7 天一次）。 |
| cpolar | cpolar.com 注册 + Windows 客户端安装。国内最快零验证页。 |

### Ctrl+C 退出

脚本注册 `SIGINT` / `SIGTERM` 处理器：

```js
process.on('SIGINT', () => { cleanup(); setTimeout(() => process.exit(0), 800); });

function cleanup() {
  if (tunnelProc) tunnelProc.kill('SIGTERM');  // 杀穿透进程
  if (nodeProc)   nodeProc.kill('SIGTERM');    // 杀 node 游戏服务
  // Windows 下额外 taskkill 残留 ngrok.exe
}
```
```

### 启动脚本（Windows）

| 文件 | 用途 |
|---|---|
| `start-game.bat` | 双击运行（最简单）。内部调 PowerShell 脚本 |
| `start-game.ps1` | PowerShell 核心脚本：检查 node 版本 → 检查 build → 启动 node → 启动 Cloudflare Tunnel |

---

## 13. 构建脚本详解

### game-ddz-server/scripts/build.js

**文件路径**: [game-ddz-server/scripts/build.js](file:///d:/project/my/game-DDZ/game-ddz-server/scripts/build.js)

执行链：

```
Step 1: 前置检查
  确认 game-ddz-web/dist/index.html 存在（前端已构建）

Step 2: tsc 编译后端
  cd game-ddz-server && npx tsc
  输出 → game-ddz-server/dist/
    ├── app.js
    └── utils/ (card.js, ai.js, identify.js, enumerate.js)

Step 3: 单服务部署兼容
  镜像同步 game-ddz-web/dist/ → game-ddz-server/public/
  （逐文件覆盖 + 只删过期的旧 hash 文件）

Step 4: 汇总到根目录 build/
  镜像同步 game-ddz-web/dist/ → game-DDZ/build/public/
  镜像同步 game-ddz-server/dist/ → game-DDZ/build/dist/
```

> ⚠️ **不要改回 `rmSync(dir, {recursive:true})` 再整份复制。**
> 一次清空要删几十个文件，宿主对单轮批量删除有阈值（50）保护，
> 超了直接抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，构建半路挂掉。
> `syncDir()` 的做法是「先覆盖，再清理 src 里已不存在的条目」，
> 正常构建删除动作接近 0，中断也不会留下半个空目录。

### railway.json

**文件路径**: [railway.json](file:///d:/project/my/game-DDZ/railway.json)

```json
{
  "build": { "builder": "NIXPACKS", "buildCommand": "pnpm build" },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

NIXPACKS 构建器会自动：
- 识别根目录 `package.json` + `pnpm-lock.yaml` → 用 pnpm
- 识别 `pnpm-workspace.yaml` → 装所有 workspace 子包
- 识别 `packageManager` 字段 → 锁定 pnpm 版本

---

## 14. 关键注意事项与陷阱

### ⚠️ 位置字段命名混淆（最常见）

`RoomPlayer.position` = 角色（0=地主, 1=农民）
前端 WS 消息里的 `position` = player 数组的索引（0/1/2）

**这两个 position 含义完全不同，不要混淆！**

### ⚠️ 点数映射中的 2 和王

- `2` 的 point 是 **16**（不是 15）
- 小王 point = **17**
- 大王 point = **18**
- 顺子/连对/飞机都**不能**包含 2 或王（point ≥ 16）

### ⚠️ 前端 ruleList 与后端 identify.ts 需保持一致

两边都有牌型识别逻辑。前端用于本地校验（错误提示），后端用于最终校验和 AI 决策。
如果修改了牌型规则，需要**同时修改两边**。

> **跑得快没有再复制一份**：前端在 `mode === 'pdk'` 时直接跳过本地校验，
> 把牌发给服务端裁决，错误通过 `handleServerMessage` 的 `message.error` 提示。
> 新增玩法请照这个来，别再往前端塞第二套规则。

### ⚠️ 绝对定位 + `left: 50%` 时 `width: auto` 只剩一半宽度

`position: absolute; left: 50%; transform: translate(-50%, -50%)` 的元素，
`width` 是 `auto` 时走的是 **shrink-to-fit**，而可用宽度只有包含块的**一半**
（`left: 50%` 之后右边只剩 50%）。结果：

- `.prepare` 三个座位在 390 屏被压成竖排
- `.roundCardList` 三组牌在 320 屏被迫折成三行

两处都靠显式 `width: max-content` + `max-width: calc(100% - 20px)` 兜底修好。
**以后凡是 `left: 50%` 的浮动面板，都要显式写宽度。**

### ⚠️ `round` 与 `roundLog` 必须一起清

`round` 是规则判定用的有效出牌（最后一条 = 当前要压的牌），`roundLog` 是给前端看的完整过程（含「不要」）。
两者语义不同但生命周期完全一致：**任何清空都只能走 `clearRound(roomInfo)`**。
单独写 `roomInfo.round = []` 会让列表和规则错位（列表还在、规则已重置）。

### ⚠️ HTTP `/api/addAI` 必须广播

`onAddAI` 在凑满 3 人时会自动 `onStart`。WS 路径（`type: 'addAI'`）会 `sendMes(result)` 推给房间，
但 **HTTP `/api/addAI` 早期只把 room 塞进 HTTP 响应、没有广播**。

后果：如果开局后第一个该操作的人恰好是真人（跑得快庄家由黑桃3决定，很容易是真人），
没有任何 AI 动作会触发 `sendMes`，客户端永远收不到「开局了」这一帧，**牌桌一直停在准备页**。

已修：HTTP handler 里补了 `sendMes(room)`。以后新增任何「改变房间状态」的 HTTP 入口都要记得广播。

### ⚠️ 内存存储无持久化

所有房间数据和用户 socket 连接都存在**内存中**（`roomList` 和 `user_sockets` 数组）：

- 服务重启后所有房间丢失
- 没有登录系统，用户身份靠 `playerId` 字符串
- 重连靠同一个 `playerId` 匹配房间内的 player

### ⚠️ 单人 AI 自动开局

调用 `addAI` 时，如果房间凑满 3 人会**自动触发 `onStart`**。
AI 调度器会立即检测轮到 AI 叫地主，然后自动执行。

### ⚠️ 游戏中退出房间 = 强制重置

`onLeave` 检测到游戏进行中有人退出，会把整个房间重置回 `prepare` 状态（所有人手牌清空，地主/农民角色重置）。

### ⚠️ `notUseCardCount` 机制

连续两次 `onNotUseCard` 后（两人都不要），服务端**清空当前 round**，让最后出牌的人重新出。

### ⚠️ SPA Fallback

生产环境后端有一条特殊路由 `GET /^(?!\/api\/).*/` 把所有非 API 请求都返回 `index.html`，实现 SPA 历史路由兼容。

### ⚠️ `tsconfig.json` 没有 strict 模式

后端 `strict: false`，`noImplicitAny: false`，属于宽松配置。使用 `any` 类型较多，重构时可考虑逐步开启 strict。

### ⚠️ ngrok 免费版拒绝代理环境

进程环境里只要有 `http_proxy` / `https_proxy`，ngrok 免费版直接认证失败退出（代理属付费功能）。`scripts/tunnel.js` 已用 `envWithoutProxy()` 剔除后再 spawn。详见 §12 陷阱 1。

### ⚠️ 穿透脚本必须验证链接可达再打印

仅凭 4040 API 返回的 `public_url` 不能证明链接可用——可能是残留旧进程的 tunnel。必须同时满足：非启动前旧 URL、`config.addr` 匹配端口、实际请求 `/health` 返回 `{"ok":true}`。详见 §12 陷阱 2。

---

## 15. 跑得快（第二种玩法）

房间对象上的 `mode` 字段决定走哪套逻辑：`'ddz'`（默认）或 `'pdk'`。
**所有跑得快规则都封在 `game-ddz-server/utils/pdk.ts`**，`app.ts` 只做流程调度和积分落账。
前端不实现第二套规则，只根据服务端下发的 `mustPlay` / `mode` 做界面分支。

### 15.1 和斗地主的差异

| 项 | 斗地主 | 跑得快 |
|---|---|---|
| 牌堆 | 54 张 | **48 张**（去大小王、三张 2、一张 A） |
| 手牌 | 20 / 17 | 每人 **16 张**，无底牌 |
| 阵营 | 地主 1v2 | 各自为战 |
| 开局 | 叫地主 → `selectLandlord` | 直接 `play` |
| 三带二 | 带一个对子 | 带**任意两张** |
| 裸三张 | 随时可出 | **只有打完就出完时**才允许 |
| 连对 | ≥3 对 | **≥2 对** |
| 过牌 | 自由 | **能管必须管**（含炸弹） |
| 胜负 | 地主/农民 | **第一个出完的人赢**，并成为下局庄家 |

### 15.2 牌堆

```ts
// 剔掉红桃2 / 梅花2 / 方片2 / 方片A，剩 48 张
const PDK_EXCLUDED = new Set([26, 39, 52, 51]);
export const PDK_DECK = Array.from({ length: 52 }, (_, i) => i + 1)
  .filter((id) => !PDK_EXCLUDED.has(id));
```

- 只留一张 2（黑桃 2，id 13）——全场最大单张
- **四个 3 全在**（id 1 / 14 / 27 / 40）——「庄家有四个三改判黑桃4」的前提
- A 只剩三张

### 15.3 牌型识别 `identifyPdk(cards, handLen)`

比 `identify.ts` 多一个 `handLen` 参数，因为「裸三张」是否合法取决于**出牌人手上一共有几张**：

```ts
if (n === 3 && g.size === 1) {
  // 只有这一手打完就出完才允许裸三张
  if (handLen === n) return { type: 'triple', ... };
  return unknown(cards);   // 平时三张必须带牌
}
```

> ⚠️ 这个参数**不能省**，也不能默认成 `cards.length`。枚举 AI 候选时必须传真实手牌数，
> 否则会把「裸三张」当成合法牌型放进候选池，AI 出了被服务端拒绝 → 整局卡死。

其余差异：

| 牌型 | 跑得快实现 |
|---|---|
| `tripleWith2` | 只要求「3 张 + 另外 2 张」，不检查那 2 张是不是对子 |
| `consecutivePairs` | `n >= 4`（2 对）即可，斗地主是 `n >= 6` |
| `straight` | 仍是 `n >= 5`，不能带 2 |
| `plane*` | ≥2 组连续三张，翅膀规则同斗地主 |
| `joker22` | 不存在（牌堆没王） |

### 15.4 定庄与首出限制

```ts
export function resolveBanker(hands: number[][]): { banker: number; markerId: number } | null {
  for (let rank = 0; rank < 13; rank++) {
    const markerId = RANK_IDS[rank][0];              // 黑桃
    const holder = hands.findIndex((h) => h.includes(markerId));
    if (holder < 0) continue;
    if (RANK_IDS[rank].every((id) => hands[holder].includes(id))) continue;  // 四张全抓 → 顺延
    return { banker: holder, markerId };
  }
  return null;
}
```

- 本房间**第一局**：黑桃 3 持有者坐庄，首出必须带这张；若他抓了四个 3，顺延黑桃 4，依此类推
- 之后每局：上一局赢家坐庄（`settlePdk` 里 `roomInfo.banker = w`），`markerId = -1` 不再限制

**首出判定用 `lastUser === -1`**，不能用 `round.length === 0`：

```
startPdk → lastUser = -1        ← 本局还没人出过
onUseCard → lastUser = 索引      ← 出过之后永远 >= 0
onNotUseCard → 不动 lastUser
```

`round` 在两家都过之后会被清空，用它判断会把「新一轮重新领出」误当成「首出」。

### 15.5 能管必须管

两处拦截：

| 位置 | 判定 | 提示 |
|---|---|---|
| `onNotUseCard` | `hasAnyBeatPdk(手牌, identifyPdk(上家牌))` | 「你有能管上的牌，必须出牌」 |
| `onUseCard` | `canBeatPdk(新牌, 上家牌)` 不成立 | 「管不上，换一手或者点不要」 |

`hasAnyBeatPdk` 和 AI 的 `enumeratePdkBeats` 走**同一个** `enumeratePdkAll`，
所以「AI 认为不能压」和「服务端认为必须压」不会打架 —— 这点很关键，
一旦两边口径不一致，AI 会 pass 然后被服务端拒绝，`executeAIDecision` 不会重新调度，**整局卡死**。

前端 `mustPlay` 由服务端在每次状态变化后调用 `refreshMustPlay()` 算好下发，
「不要」按钮读它置灰并改文案为「必须管」。

### 15.6 积分：炸弹必须「挂起」

炸弹分固定 20 / 10，但**被打掉就没有分**。所以不能一出炸就落账：

```ts
// 出炸弹：挂起，直接覆盖上一颗（上一颗 = 被打掉了，自然作废）
roomInfo.pdkBomb = { by: playerIndex };

// 这一轮结束（两家都过）或牌局结束：才真正落账
function commitPdkBomb(roomInfo) {
  const bomb = roomInfo.pdkBomb;
  if (!bomb) return;
  roomInfo.pdkBomb = null;
  delta[bomb.by] += 20;
  roomInfo.player.forEach((_, i) => { if (i !== bomb.by) delta[i] -= 10; });
}
```

调用点只有两个：`onNotUseCard` 里 `notUseCardCount === 2` 的分支、`settlePdk` 开头。

剩余牌分：

```
输家剩 n 张 → 输家 -n，赢家 +n
输家剩 1 张（报单）→ 双方都不动
```

三家增减分之和恒为 0。实际一局跑出来的对账：

| 玩家 | 剩牌 | 炸弹 | 剩余牌分 | 合计 |
|---|---|---|---|---|
| test1（赢） | 0 | -10 | +17 | **+7** |
| AI-小红 | 9 | -10 | -9 | **-19** |
| AI-小明 | 8 | +20 | -8 | **+12** |

### 15.7 自检与对局脚本

| 脚本 | 用途 |
|---|---|
| `game-ddz-server/scripts/pdk-check.ts` | 39 项断言：牌堆构成 / 定庄级联 / 各牌型识别 / 压牌 / 能管判定 / 枚举 |
| `game-ddz-server/scripts/pdk-e2e.ts` | 真实连服务跑完一整局，14 项校验（含零和、首出带庄家牌、必须管被拒绝） |
| `game-ddz-server/scripts/round-hint-check.ts` | 双玩法各跑一局：`roundLog` 不变量 + 连点提示的合法性（401 项） |

```bash
cd game-ddz-server
npx ts-node scripts/pdk-check.ts          # 纯逻辑，不用起服务
npx ts-node scripts/pdk-e2e.ts            # 需要服务在 9302 跑着（BASE 环境变量可改）
npx ts-node scripts/round-hint-check.ts   # roundLog + hint，双玩法各一局
```

> ⚠️ `scripts/` 已从 `tsconfig.json` 的编译范围里排除，不会被 tsc 打进 `dist/`。
> ts-node 仍然能直接跑（它按需转译，不看 include）。

---

## 📝 版本信息

- 根目录版本：`1.0.0`
- 后端依赖 Node.js ≥ 18
- 前端 React 19 + Vite 8
- 构建工具：pnpm（monorepo）

---

*文档生成时间：2026-10-29 | 基于完整源码分析*
