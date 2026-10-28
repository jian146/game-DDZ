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
- [6. 前端模块详解](#6-前端模块详解)
  - [6.1 路由与页面](#61-路由与页面)
  - [6.2 大厅页 RoomPage](#62-大厅页-roompage)
  - [6.3 游戏页 DouDiZhuPage](#63-游戏页-doudizhupage)
  - [6.4 前端工具模块](#64-前端工具模块)
  - [6.5 组件清单](#65-组件清单)
- [7. API 参考](#7-api-参考)
  - [7.1 HTTP API](#71-http-api)
  - [7.2 WebSocket 消息协议](#72-websocket-消息协议)
- [8. 游戏状态机](#8-游戏状态机)
- [9. AI 决策算法](#9-ai-决策算法)
- [10. 依赖关系图](#10-依赖关系图)
- [11. 运行与部署](#11-运行与部署)
- [12. 关键注意事项与陷阱](#12-关键注意事项与陷阱)

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
├── package.json                       # 根目录统一 build/start/dev 脚本
├── README.md                          # 项目说明
├── CODE_WIKI.md                       # ← 本文档
├── node_modules/                      # 根级依赖（concurrently）
│
├── game-ddz-server/                   ← 后端（Node.js + Express + ws）
│   ├── app.ts                         # 🎯 后端主入口（HTTP + WS + 静态文件）
│   ├── init.ts                        # 初始牌数组 cardIdList
│   ├── tsconfig.json
│   ├── package.json
│   ├── scripts/
│   │   └── build.js                   # 打包脚本（复制前端 dist + tsc）
│   ├── utils/
│   │   ├── card.ts                    # 洗牌 / 摸牌 / 点数映射
│   │   ├── identify.ts                # 牌型识别器（12 种牌型）
│   │   ├── enumerate.ts               # 候选牌型枚举
│   │   └── ai.ts                      # AI 决策（贪心打分）
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
    │   ├── router.tsx                 # 路由配置
    │   ├── index.css                  # 全局样式
    │   ├── components/
    │   │   └── decor/
    │   │       └── decor.tsx          # 花色图标（黑桃/红桃/梅花/方片）
    │   ├── utils/
    │   │   ├── card.ts                # 牌数据 + 牌型分组工具
    │   │   ├── request.ts             # axios 封装
    │   │   ├── storage.ts             # localStorage/sessionStorage 封装
    │   │   ├── user.ts                # 用户信息存取
    │   │   └── awaitHelper.ts         # async/await 辅助
    │   └── pages/
    │       └── DouDiZhu/
    │           ├── index.tsx          # 🎯 大厅页（房间列表 / 创建房间）
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
| `moment` | ^2.30.1 | 时间格式化 |
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

后端所有业务逻辑都集中在这个文件中，约 **832 行**。

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

优先查 `dist/../public`（部署模式），其次查 `../game-ddz-web/dist`（开发模式）。

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
  round: RoomRound[];                 // 当前出牌历史
  aHand: number[];                    // 底牌（3 张）
  current: number;                    // 当前应该操作的玩家索引
  winRole: number;                    // -1=未开始, 0=地主胜, 1/2=农民胜
}

interface RoomPlayer {
  playerId: string;                   // 玩家名（AI 也有名字）
  position: 0 | 1 | 2;                // ⚠️ 0=地主, 1/2=农民（角色！）
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
| `onJoin` | `(data, socket) → result` | 加入房间（含重连逻辑） |
| `onLeave` | `(data, socket?) → RoomInfo \| null` | 退出房间。空房间/全 AI 房间自动删除；游戏中退出重置到 prepare |
| `onAddAI` | `(data, socket?) → result` | 添加 AI 玩家。满 3 人自动开局 |
| `onStart` | `(data) → result` | 开始游戏：发牌（每人 17 张）+ 随机叫地主者 |
| `onNoCall` | `(data) → result` | 不叫地主。3 人都不叫 → `reopen` 状态 |
| `onCall` | `(data) → result` | 抢地主。设 position、地主拿底牌（+3 张） |
| `onUseCard` | `(data) → result` | 出牌。校验身份 + 校验手牌 + 胜利判断 |
| `onNotUseCard` | `(data) → result` | 不要。无人出过牌时不能不要。连续 2 次不要 → 清空当前回合 |
| `scheduleAITurn` | `(roomInfo) → void` | AI 调度 hook。1.5~3s 后触发 |
| `executeAIDecision` | `(roomInfo, decision) → void` | 执行 AI 决策（内部调用 onCall/onUseCard 等） |

#### 辅助校验函数

| 函数 | 说明 |
|---|---|
| `validateTurn(roomInfo, playerId)` | 检查发送方是否是当前该操作的玩家 |
| `validateCardsInHand(roomInfo, playerIndex, useCard)` | 检查出牌的人手里是否真的有这些牌 |
| `getRoom(roomId)` | 从 roomList 查找房间 |
| `sendMes(backData)` | 给房间内所有在线玩家广播消息 |
| `sendMesForPlay(userName, data)` | 给指定玩家单独发消息（常用于错误提示） |

---

### 5.4 AI 调度机制

AI 调度采用 **Hook 模式**：

1. 每次房间状态转移后（WS handler 执行完），调用 `scheduleAITurn(roomInfo)`
2. 检查当前 `roomInfo.current` 玩家是否是 AI
3. 如果是，设 1.5~3 秒的 `setTimeout`（模拟思考）
4. 定时器触发时做"防过期"校验（room 是否存在、current 是否还是原来的玩家）
5. 调用 `decideAI()` 决策 → `executeAIDecision()` 执行
6. 执行完后再 `sendMes()` 广播新房间 → 再次 `scheduleAITurn()` 递归链式调度

```
状态转移 → scheduleAITurn → 1.5~3s → decideAI → executeAIDecision → sendMes → scheduleAITurn → ...
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

---

## 6. 前端模块详解

### 6.1 路由与页面

**文件路径**: [game-ddz-web/src/router.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/router.tsx)

| 路径 | 组件 | 说明 |
|---|---|---|
| `/` | → 重定向 | 自动跳转大厅 |
| `/room` | `RoomPage` | 大厅：房间列表 + 创建房间 |
| `/ddz/:roomId/:userId` | `DouDiZhuPage` | 游戏页面 |
| `*` | → 重定向 | 兜底回大厅 |

---

### 6.2 大厅页 RoomPage

**文件路径**: [game-ddz-web/src/pages/DouDiZhu/index.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/pages/DouDiZhu/index.tsx)

**核心功能**：

| 功能 | 实现方式 |
|---|---|
| 用户登录 | Ant Design Form + Modal → localStorage 存 `DDZ_User` |
| 获取房间列表 | axios GET `/api/roomList` |
| 创建房间 | axios POST `/api/createRoom` → navigate 到游戏页 |
| 加入房间 | navigate 到 `/ddz/:roomId/:userId` |

**关键状态**：`userName`, `roomList`, `loading`, `isShowName`

---

### 6.3 游戏页 DouDiZhuPage

**文件路径**: [game-ddz-web/src/pages/DouDiZhu/douDiZhu.tsx](file:///d:/project/my/game-DDZ/game-ddz-web/src/pages/DouDiZhu/douDiZhu.tsx)

约 **805 行**，是整个前端的核心。

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
| `roundCard` | `I_roundCard[]` | 本轮出牌历史（用于"上家"判断） |
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

#### utils/user.ts — 用户管理

**文件路径**: [game-ddz-web/src/utils/user.ts](file:///d:/project/my/game-DDZ/game-ddz-web/src/utils/user.ts)

| 函数 | 说明 |
|---|---|
| `getUserInfo()` | 从 localStorage 读取 `DDZ_User`，返回 `{ userName, createTime, isLogin }` |
| `setUserInfo(userName)` | 写入 localStorage |

---

### 6.5 组件清单

| 组件 | 路径 | 说明 |
|---|---|---|
| `CardStyle` | `pages/DouDiZhu/cardStyle/cardStyle.tsx` | 单张扑克牌渲染（含花色图标 Decor、选中高亮、红黑颜色） |
| `PlayerHeader` | `pages/DouDiZhu/components/playerHeader/playerHeader.tsx` | 玩家头像/地主农民标识 |
| `Result` | `pages/DouDiZhu/result/result.tsx` | 游戏结算遮罩弹窗（胜利/失败 + 继续按钮） |
| `Decor` | `components/decor/decor.tsx` | 花色图标组件（黑桃♠红桃♥梅花♣方片♦） |

---

## 7. API 参考

### 7.1 HTTP API

所有路径前缀 `/api`。

| 方法 | 路径 | 描述 | 请求体 | 响应 |
|---|---|---|---|---|
| GET | `/api/roomList` | 获取房间列表 | - | `{ isSuccess, roomList: RoomInfo[] }` |
| POST | `/api/createRoom` | 创建房间 | `{ userName?: string }` | `{ isSuccess, roomId: number }` |
| POST | `/api/addAI` | HTTP 添加 AI（测试用） | `{ roomId, playerId? }` | `{ isSuccess, room? }` |

---

### 7.2 WebSocket 消息协议

#### 客户端 → 服务端

所有消息都是 JSON 对象，必须包含 `type` 字段。

| type | 字段 | 说明 |
|---|---|---|
| `onJoin` | `roomId`, `playerId` | 加入房间（重连也用这个） |
| `onLeave` | `roomId`, `playerId` | 退出房间 |
| `addAI` | `roomId`, `playerId`, `skipAutoStart?` | 添加 AI 玩家 |
| `onStart` | `roomId` | 开始游戏（发牌阶段） |
| `onCall` | `roomId`, `playerId`, `position` | 抢地主 |
| `onNoCall` | `roomId`, `playerId`, `position` | 不叫地主 |
| `useCard` | `roomId`, `playerId`, `position`, `useCard[]` | 出牌 |
| `onNotUseCard` | `roomId`, `playerId`, `position` | 不要（放弃出牌） |
| `ping` | - | 心跳 |

#### 服务端 → 客户端

服务端主要广播完整的 `RoomInfo` 对象（即 `sendMes(backData)` 发送的内容）。

| 消息类型 | 说明 |
|---|---|
| 广播 `RoomInfo` | 任何状态转移后向房间内所有在线玩家广播最新房间状态 |
| `{ type: 'pong' }` | 心跳响应 |
| `{ isError: true, message }` | 错误提示（单独发给请求方） |
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
- pnpm ≥ 9

### 开发模式

```bash
# 根目录执行
pnpm install

# 同时启动前后端（推荐）
pnpm dev

# 或分开启动
pnpm dev:server    # 后端 9200（ts-node app.ts）
pnpm dev:web       # 前端 9100（vite dev server，自动代理 /api → 9200）
```

浏览器访问 `http://localhost:9100`。

### 一键打包（单服务部署）

```bash
# 根目录执行
pnpm build
```

自动流程：
```
1. pnpm build:web      → vite build → game-ddz-web/dist/
2. node scripts/build.js → 复制 dist → game-ddz-server/public/
3. tsc 编译后端 TS → game-ddz-server/dist/
```

### 单服务部署

```bash
# 只需上传 game-ddz-server/ 目录
cd game-ddz-server

# 启动
node dist/app.js

# 自定义端口
PORT=3000 node dist/app.js
```

### 端口说明

| 端口 | 用途 | 启动方式 |
|---|---|---|
| 9200 | 后端 HTTP + WS（生产端口） | `PORT=9200 node dist/app.js` |
| 9100 | 前端 dev server（仅开发用） | `pnpm dev:web` |

### 多环境配置

`game-ddz-web/proxy.ts` 管理 4 种环境：

| 环境 | proxy.target | wsAddress |
|---|---|---|
| dev | `http://localhost:9200` | `ws://localhost:9200` |
| test | `https://proxy.pule.com` | `wss://proxy.pule.com` |
| pre | Railway 生产后端 | Railway 生产 WS |
| **prod** | 空（同源） | `__AUTO__`（自动推导） |

---

## 12. 关键注意事项与陷阱

### ⚠️ 位置字段命名混淆（最常见）

`RoomPlayer.position` = 角色（0=地主, 1/2=农民）
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

---

## 📝 版本信息

- 根目录版本：`1.0.0`
- 后端依赖 Node.js ≥ 18
- 前端 React 19 + Vite 8
- 构建工具：pnpm（monorepo）

---

*文档生成时间：2026-10-28 | 基于完整源码分析*
