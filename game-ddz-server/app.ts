import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsWebSocket } from 'ws';

import { getRoundNumber, getCard, getCardPoint, shuffleCard } from './utils/card';
import { decideAI, decidePdkAI, type AIDecision } from './utils/ai';
import {
  PDK_DECK,
  resolveBanker,
  identifyPdk,
  canBeatPdk,
  hasAnyBeatPdk,
  enumeratePdkAll,
  enumeratePdkBeats,
} from './utils/pdk';
import { identifyType } from './utils/identify';
import { enumerateAll, enumerateBeatCandidates } from './utils/enumerate';
import { cardIdList } from './init';
import {
  findByName,
  findById,
  createPlayer,
  updatePlayer,
  applyMatchResult,
  publicProfile,
  topPlayers,
  countPlayers,
  flushNow,
  type PlayerRecord,
} from './store';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractToken,
  validateName,
  validatePassword,
  newPlayerId,
} from './auth';

type RoomStatus = 'prepare' | 'selectLandlord' | 'reopen' | 'play' | 'end' | 'useCard';

/** 玩法：ddz=斗地主（默认）, pdk=跑得快 */
type GameMode = 'ddz' | 'pdk';

/**
 * ⚠️ PlayerPosition 字段命名警告：
 * 在 RoomPlayer 里 position 表示"角色"（0=地主, 1=农民）
 * 但前端 WS 消息里 position 传的是 player 数组的**索引**
 * 两个概念完全不同，不要混淆。
 */
type PlayerPosition = 0 | 1 | 2;

interface RoomPlayer {
  playerId: string;
  /** 角色：0=地主, 1=农民 */
  position: PlayerPosition;
  isOnline: boolean;
  /** 是否 AI 玩家（服务端托管） */
  isAI: boolean;
  score: number;
  card: number[];
}

interface RoomRound {
  useCard: number[];
  useId: string;
}

/**
 * 出牌日志条目：给前端「这一轮大家都出了什么」用的。
 * `pass` 为 true 时 `useCard` 是空数组 —— 单纯表示「这家不要」。
 */
interface RoomLogEntry {
  useId: string;
  useCard: number[];
  pass?: boolean;
}

interface RoomInfo {
  roomId: number;
  status: RoomStatus;
  model: number; // 0:随机地主, 1:轮庄
  allCount: number;
  initPost: number;
  initUser: number;
  /** 上一个出牌玩家在 player[] 里的索引 */
  lastUser: number;
  notUseCardCount: number;
  callCount: number;
  player: RoomPlayer[];
  round: RoomRound[];
  /**
   * 本轮完整出牌日志（含「不要」），只给前端展示用。
   * 和 `round` 分开维护：`round` 是规则判定用的「有效出牌」，最后一条就是当前要压的牌；
   * 而展示需要看到谁过了牌，所以另存一份带 pass 标记的日志。
   * 两者必须在同一批位置一起清空，否则会出现「列表还在、规则已重置」的错位。
   */
  roundLog: RoomLogEntry[];
  aHand: number[];
  /** 当前应该操作的玩家在 player[] 里的索引 */
  current: number;
  winRole: number; // -1未开始,0地主胜利,1/2农民胜利
  /** 本局是否已结算过积分（防止重复加分） */
  settled?: boolean;
  /** 房主昵称：第一个加入的真人。只有房主能增删 AI、开始游戏 */
  ownerName?: string;

  // ============ 以下仅跑得快使用 ============
  /** 玩法 */
  mode?: GameMode;
  /** 庄家（player[] 索引）：首局由黑桃3决定，之后由上一局赢家担任 */
  banker?: number;
  /** 首出必须带的牌 id（只有本房间第一局生效） */
  markerId?: number;
  /** 是否还需要「首出必须带庄家牌」的校验 */
  needMarker?: boolean;
  /** 本局累计积分增减（按 player[] 索引，含炸弹分） */
  pdkDelta?: number[];
  /** 当前这一轮还没被打掉的炸弹（被打掉就直接丢弃，不给分） */
  pdkBomb?: { by: number } | null;
  /** 当前玩家手里有没有能管上的牌 → 前端据此禁用「不要」 */
  mustPlay?: boolean;
  /** 跑得快赢家的 player[] 索引 */
  winnerIndex?: number;
  /** 结算后每个玩家的实际增减分，供结果面板展示 */
  scoreDeltas?: number[];
}

interface UserSocketInfo {
  socket: WsWebSocket;
  userName?: string;
  roomId: number;
  state: number;
}

/** 房间级 AI 调度定时器：roomId → setTimeoutId */
const aiTimerMap = new Map<number, NodeJS.Timeout>();

const AI_NAMES = ['AI-小红', 'AI-小明', 'AI-阿强', 'AI-小妹', 'AI-大壮'];

/**
 * 创建一个初始房间
 */
const createInitialRoom = (roomId: number, mode: GameMode = 'ddz'): RoomInfo => ({
  roomId,
  status: 'prepare',
  model: 0,
  allCount: 0,
  initPost: -1,
  initUser: 0,
  lastUser: 0,
  notUseCardCount: 0,
  callCount: 1,
  player: [],
  round: [],
  roundLog: [],
  aHand: [],
  current: -1,
  winRole: -1,
  mode,
  banker: -1,
  markerId: -1,
  needMarker: mode === 'pdk',
  pdkDelta: [0, 0, 0],
  pdkBomb: null,
  mustPlay: false,
  winnerIndex: -1,
});

const app = express();

// gzip 压缩：必须放在静态文件之前，否则前端产物按原样发出去
// （index.js 打包后 990KB，压缩后约 320KB；手机走公网穿透时这是 3 倍差距）
app.use(compression({
  // 小于 1KB 的响应不压（压完可能更大）
  threshold: 1024,
  // 只压文本类，图片/音频已经是压缩格式，再压纯浪费 CPU
  filter: (req, res) => {
    const type = String(res.getHeader('Content-Type') || '');
    if (/^(image|audio|video)\//.test(type)) return false;
    return compression.filter(req, res);
  },
}));

app.use(cors({
  origin: (origin, callback) => callback(null, origin || '*'),
  credentials: true,
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ============================
// 前端静态文件（生产模式单服务部署）
// 按优先级依次查找：
//   1) dist/../public        ← 单服务部署（public 复制到 game-ddz-server/）
//   2) ../../build/public    ← 🎯 根目录统一产物
//   3) ../../game-ddz-web/dist ← 本机开发（vite dev server 会处理，build 后也有）
// ============================
function findFrontendDist(): string | null {
  // ① 单服务部署：dist/app.js → ../public
  const deployed = path.join(__dirname, '..', 'public');
  if (fs.existsSync(path.join(deployed, 'index.html'))) return deployed;

  // ② 根目录统一产物：game-DDZ/build/public
  const buildOut = path.join(__dirname, '..', '..', 'build', 'public');
  if (fs.existsSync(path.join(buildOut, 'index.html'))) return buildOut;

  // ③ 开发 / 前端构建产物
  const dev = path.join(__dirname, '..', '..', 'game-ddz-web', 'dist');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;

  return null;
}

const frontendDist = findFrontendDist();

// 健康检查端点（Railway 会定期请求 /health）
// ⚠️ 必须在 SPA fallback 之前，否则会被正则 /^(?!\/api\/).*/ 匹配到
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

if (frontendDist) {
  console.log(`[static] 前端静态文件目录: ${frontendDist}`);
  app.use(express.static(frontendDist, {
    // 交给下面的 setHeaders 统一决定缓存策略
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      const p = filePath.replace(/\\/g, '/');
      if (p.includes('/assets/')) {
        // Vite 产物带内容 hash，文件名变了内容才变 → 可以永久缓存
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (p.endsWith('index.html')) {
        // 入口 HTML 绝不能缓存，否则用户永远拿到旧版本的资源引用
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else {
        // 语音包 / favicon 之类，名字固定但可能替换
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
  // SPA fallback：任何非 API / 非 WS 路由都返回 index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('[static] 未找到前端 dist（正常，开发环境走 vite dev server）');
}

const httpServer = createServer(app);

// ws 服务挂载到同一个 HTTP server
const server = new WebSocketServer({ server: httpServer });

let user_sockets: UserSocketInfo[] = [];
const roomList: RoomInfo[] = [];

// ============================
// 工具函数
// ============================

/** 给指定房间所有人发消息 */
const sendMes = (backData: any) => {
  if (!backData) { console.warn('[sendMes] backData 为空，跳过'); return; }
  user_sockets.forEach((s) => {
    if (s?.roomId === backData.roomId && s.socket.readyState === 1) {
      try { s.socket.send(JSON.stringify(backData)); } catch {}
    }
  });
};

/** 给指定玩家单独发消息 */
const sendMesForPlay = (userName: any, data: any) => {
  if (!data) return;
  user_sockets.forEach((s) => {
    if (s?.userName === userName) {
      try {
        s.socket.send(JSON.stringify(data));
      } catch (e) {
        console.error('sendMesForPlay 发送失败', e);
      }
    }
  });
};

/**
 * 给房间内所有人推一条"事件"消息（不带完整房间数据）
 *
 * 和 sendMes 的区别：sendMes 推的是整个 RoomInfo，前端收到会整体 setRoomData；
 * 而投掷、语音这类瞬时动作没有状态可同步，只需要广播一个通知，
 * 否则每次砸番茄都会白推一份几百字节的房间快照。
 */
const sendRoomEvent = (roomId: number, payload: Record<string, any>) => {
  const msg = JSON.stringify({ ...payload, roomId });
  user_sockets.forEach((s) => {
    if (s?.roomId === roomId && s.socket.readyState === 1) {
      try {
        s.socket.send(msg);
      } catch {}
    }
  });
};

function decodeWsMessage(msg: any): string {
  if (typeof msg === 'string') return msg;
  if (Buffer.isBuffer(msg)) return msg.toString('utf8');
  return new TextDecoder('utf-8').decode(new Uint8Array(msg));
}

/** 查找房间，找不到返回 null  */
function getRoom(roomId: number): RoomInfo | null {
  return roomList.find((item) => item.roomId == roomId) ?? null;
}

/** 取消房间上一次 AI 定时器 */
function clearAITimer(roomId: number) {
  const t = aiTimerMap.get(roomId);
  if (t) {
    clearTimeout(t);
    aiTimerMap.delete(roomId);
  }
}

// ============================
// 房主 / 断线宽限
// ============================

/**
 * 断线宽限期：刷新页面、切后台、网络抖动都会触发 socket 关闭，
 * 如果立刻把人清出座位，位置会被别人占走，牌局也会被重置。
 * 这里先只标记离线，超时没回来才真正清出去。
 */
const DISCONNECT_GRACE_MS = 90_000;
/** `${roomId}:${playerId}` → setTimeoutId */
const disconnectTimers = new Map<string, NodeJS.Timeout>();

const graceKey = (roomId: number, playerId: string) => `${roomId}:${playerId}`;

/** 是否房主（只有房主能增删 AI、开始游戏） */
function isOwner(roomInfo: RoomInfo, playerId: string): boolean {
  return !!roomInfo.ownerName && roomInfo.ownerName === playerId;
}

function clearDisconnectTimer(roomId: number, playerId: string) {
  const key = graceKey(roomId, playerId);
  const t = disconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    disconnectTimers.delete(key);
  }
}

/** 房主走了 → 转给下一个还在的真人 */
function transferOwner(roomInfo: RoomInfo) {
  const next = roomInfo.player.find((p) => !p.isAI);
  roomInfo.ownerName = next?.playerId;
  if (next) console.log(`[owner] 房主转移给 ${next.playerId}`);
}

/**
 * 清空「当前这一轮」：规则用的 round 和展示用的 roundLog 必须一起清。
 * 任何地方想让这一轮重新开始，都只调这个函数，别单独写 `round = []`。
 */
function clearRound(roomInfo: RoomInfo) {
  roomInfo.round = [];
  roomInfo.roundLog = [];
  roomInfo.notUseCardCount = 0;
}

/** 本局作废，回到准备阶段 */
function resetToPrepare(roomInfo: RoomInfo) {
  roomInfo.status = 'prepare';
  clearRound(roomInfo);
  roomInfo.callCount = 1;
  roomInfo.current = -1;
  roomInfo.winRole = -1;
  roomInfo.settled = false;
  // 跑得快的临时状态一并清掉（庄家保留，换人要重开房间）
  roomInfo.pdkBomb = null;
  roomInfo.pdkDelta = [0, 0, 0];
  roomInfo.winnerIndex = -1;
  roomInfo.scoreDeltas = undefined;
  roomInfo.mustPlay = false;
  roomInfo.player.forEach((p) => {
    p.position = 1;
    p.card = [];
  });
  clearAITimer(roomInfo.roomId);
}

/** 真正把玩家移出房间，处理房主转移、空房删除、对局作废 */
function removePlayer(roomInfo: RoomInfo, playerId: string): RoomInfo | null {
  const idx = roomInfo.player.findIndex((p) => p.playerId === playerId);
  if (idx >= 0) roomInfo.player.splice(idx, 1);
  clearDisconnectTimer(roomInfo.roomId, playerId);

  if (roomInfo.ownerName === playerId) transferOwner(roomInfo);

  // 没真人了（空房或只剩 AI）→ 删房间
  if (roomInfo.player.length === 0 || roomInfo.player.every((p) => p.isAI)) {
    console.log(`[room] ${roomInfo.roomId} 已无真人，删除房间`);
    const i = roomList.findIndex((r) => r.roomId === roomInfo.roomId);
    if (i >= 0) roomList.splice(i, 1);
    clearAITimer(roomInfo.roomId);
    // 顺手清掉这个房间的投掷节流记录，别把 Map 攒成内存泄漏
    for (const key of throwCooldown.keys()) {
      if (key.startsWith(`${roomInfo.roomId}:`)) throwCooldown.delete(key);
    }
    return null;
  }

  // 对局中有人离开 → 少人没法打，本局作废
  if (roomInfo.status !== 'prepare') {
    console.log(`[room] ${roomInfo.roomId} 对局中有人离开，本局作废`);
    resetToPrepare(roomInfo);
  }

  return roomInfo;
}

/** 断线：先保留座位，超时未归才清出去 */
function markOffline(roomInfo: RoomInfo, playerId: string) {
  const player = roomInfo.player.find((p) => p.playerId === playerId);
  if (!player || player.isAI) return;

  player.isOnline = false;
  clearDisconnectTimer(roomInfo.roomId, playerId);

  const key = graceKey(roomInfo.roomId, playerId);
  const timer = setTimeout(() => {
    disconnectTimers.delete(key);
    const fresh = getRoom(roomInfo.roomId);
    if (!fresh) return;
    const p = fresh.player.find((x) => x.playerId === playerId);
    if (!p || p.isOnline) return; // 已经回来了

    console.log(`[disconnect] ${playerId} 超时未归，清出房间 ${fresh.roomId}`);
    const after = removePlayer(fresh, playerId);
    if (after) {
      sendMes(after);
      scheduleAITurn(after);
    }
  }, DISCONNECT_GRACE_MS);

  disconnectTimers.set(key, timer);
  console.log(
    `[disconnect] ${playerId} 离线，${DISCONNECT_GRACE_MS / 1000}s 内回来保留座位`,
  );
}

/**
 * 校验：发消息的玩家是否是当前该操作的人
 * @returns null 表示通过校验；否则返回错误消息
 */
function validateTurn(roomInfo: RoomInfo, playerId: string): string | null {
  const currentPlayer = roomInfo.player[roomInfo.current];
  if (!currentPlayer) return '当前玩家不存在';
  if (currentPlayer.playerId !== String(playerId)) {
    return `还没轮到你操作（当前轮到 ${currentPlayer.playerId}）`;
  }
  return null;
}

/**
 * 校验：玩家手里是否真的有这些牌
 * @returns null 表示通过校验；否则返回错误消息
 */
function validateCardsInHand(
  roomInfo: RoomInfo,
  playerIndex: number,
  useCard: number[],
): string | null {
  const player = roomInfo.player[playerIndex];
  if (!player) return '玩家不存在';

  const hand = [...player.card];
  for (const cardId of useCard) {
    const idx = hand.indexOf(cardId);
    if (idx < 0) {
      return `牌 ${cardId} 不在你手里，无法出这组牌`;
    }
    hand.splice(idx, 1);
  }
  return null;
}

// ============================
// AI 自动调度（核心 hook）
// ============================

/**
 * AI 思考时长分档（毫秒）
 *
 * 原来的 1.5~3 秒一刀切，一局下来光等 AI 就要几十秒。现在按动作分档：
 *   - 叫地主：只是举手，没人需要看牌
 *   - 出牌：要留出看清这一手的时间，太长又拖节奏
 *   - 不要：没有牌要展示，压到最短
 * 这只是「表演时长」，决策逻辑一行没动，AI 想什么还是原来那套。
 */
const AI_THINK_MS = {
  call: [450, 700],
  play: [650, 1000],
  pass: [320, 500],
} as const;

/** 按决策类型挑一个思考时长；掉线托管的对局没人看，再快 40% */
function aiThinkDelay(decision: AIDecision, offline: boolean): number {
  const [min, max] =
    decision.action === 'pass'
      ? AI_THINK_MS.pass
      : decision.action === 'playCards'
        ? AI_THINK_MS.play
        : AI_THINK_MS.call;
  const base = min + Math.random() * (max - min);
  return Math.round(offline ? base * 0.6 : base);
}

/** 当前局面对这个玩家来说该怎么打（决策纯函数，不修改房间） */
function computeAIDecision(roomInfo: RoomInfo, player: RoomPlayer): AIDecision {
  const lastPlay =
    roomInfo.round.length > 0
      ? roomInfo.round[roomInfo.round.length - 1].useCard
      : null;

  if (roomInfo.mode === 'pdk') {
    return decidePdkAI(
      player.card,
      lastPlay,
      // 本房间第一局的第一次出牌：必须带上庄家牌
      roomInfo.lastUser === -1 && (roomInfo.markerId ?? -1) > 0
        ? (roomInfo.markerId as number)
        : -1,
    );
  }
  return decideAI(
    player.card,
    lastPlay,
    roomInfo.status === 'selectLandlord',
    roomInfo.callCount,
  );
}

/**
 * 每次房间状态转移后调用：当前玩家是 AI（或真人掉线托管）就自动执行决策
 */
function scheduleAITurn(roomInfo: RoomInfo) {
  clearAITimer(roomInfo.roomId);

  // 终局状态不再调度
  if (roomInfo.status === 'end' || roomInfo.status === 'prepare') return;

  // 当前玩家是 AI，或者真人掉线了 → 都由 AI 托管，避免牌局卡死
  const current = roomInfo.player[roomInfo.current];
  if (!current) return;
  if (!current.isAI && current.isOnline) return;

  // 先空算一遍拿决策类型，只为了决定「表演时长」；
  // 真正执行时会在定时器里用最新状态重算一次，避免用过期决策。
  const preview = computeAIDecision(roomInfo, current);
  const delay = aiThinkDelay(preview, !current.isAI);

  const timer = setTimeout(() => {
    // 防止调度过期：房间可能已经变了
    const freshRoom = getRoom(roomInfo.roomId);
    if (!freshRoom) return;
    if (freshRoom.current !== roomInfo.current) return;
    if (!['play', 'useCard', 'selectLandlord'].includes(freshRoom.status)) return;
    const player = freshRoom.player[freshRoom.current];
    if (!player) return;
    if (!player.isAI && player.isOnline) return; // 玩家回来了，让他自己打

    const host = player.isAI ? '' : '（离线托管）';
    console.log(`[AI] ${player.playerId}${host} 在思考...`);

    const decision = computeAIDecision(freshRoom, player);
    console.log(`[AI] ${player.playerId} 决策:`, decision);

    executeAIDecision(freshRoom, decision);
  }, delay);

  aiTimerMap.set(roomInfo.roomId, timer);
}

/** 执行 AI 决策 */
function executeAIDecision(roomInfo: RoomInfo, decision: AIDecision) {
  const currentPlayer = roomInfo.player[roomInfo.current];
  if (!currentPlayer) return;

  switch (decision.action) {
    case 'callLandlord': {
      const result = onCall({
        roomId: roomInfo.roomId,
        playerId: currentPlayer.playerId,
        position: roomInfo.current,
        useCard: [],
      });
      if (result && !(result as any).isError) {
        sendMes(result);
        scheduleAITurn(result as RoomInfo);
      }
      break;
    }
    case 'noCall': {
      const result = onNoCall({
        roomId: roomInfo.roomId,
        playerId: currentPlayer.playerId,
        position: roomInfo.current,
        useCard: [],
      });
      if (result && !(result as any).isError) {
        sendMes(result);
        const newRoom = result as RoomInfo;
        // 如果所有 AI 都不叫，会进入 reopen → 需要自动再 start
        if (newRoom.status === 'reopen') {
          // 自动 start
          const startResult = onStart({ roomId: newRoom.roomId });
          sendMes(startResult);
          if (startResult && !(startResult as any).isError) {
            scheduleAITurn(startResult as RoomInfo);
          }
        } else {
          scheduleAITurn(newRoom);
        }
      }
      break;
    }
    case 'playCards': {
      const result = onUseCard({
        roomId: roomInfo.roomId,
        playerId: currentPlayer.playerId,
        position: roomInfo.current,
        useCard: decision.cards,
      });
      if (result && !(result as any).isError) {
        sendMes(result);
        const newRoom = result as RoomInfo;
        if (newRoom.status !== 'end') {
          scheduleAITurn(newRoom);
        }
      }
      break;
    }
    case 'pass': {
      const result = onNotUseCard({
        roomId: roomInfo.roomId,
        playerId: currentPlayer.playerId,
        position: roomInfo.current,
      });
      if (result && !(result as any).isError) {
        sendMes(result);
        const newRoom = result as RoomInfo;
        scheduleAITurn(newRoom);
      }
      break;
    }
  }
}

// ============================
// 业务 handler
// ============================

/** 加入房间 */
const onJoin = (data: any, socket: WsWebSocket) => {
  const roomId = Number(data.roomId);

  // ⚠️ 身份只认 token，绝不用客户端传来的 playerId —— 否则改个字符串就能冒充别人
  const payload = verifyToken(data.token);
  if (!payload) {
    return {
      backData: null,
      isPass: false,
      isError: true,
      needLogin: true,
      message: '登录已过期，请重新登录',
    };
  }
  const record = findById(payload.pid);
  if (!record) {
    return {
      backData: null,
      isPass: false,
      isError: true,
      needLogin: true,
      message: '账号不存在，请重新登录',
    };
  }

  const playerId = record.name;
  const roomInfo = getRoom(roomId);
  if (!roomInfo) {
    return {
      backData: null,
      isPass: false,
      isError: true,
      isRoomGone: true,
      message: '房间不存在',
    };
  }

  // ============ 先确保 user_sockets 里的这个 socket 有正确的 roomId ============
  // 不管是新加入还是重连，都要设置（之前 isJoin=true 时跳过了 → 刷新后找不到人！）
  const match = user_sockets.find((u) => u.socket === socket);
  if (match) {
    match.userName = playerId;
    match.roomId = roomId;
  } else {
    // 保险：socket 不在列表里就新增（不应该发生，但防止对象引用匹配失败）
    user_sockets.push({ socket, userName: playerId, roomId, state: 1 });
  }

  // 判断是否已经加入
  const isJoin = roomInfo.player.some((p) => p.playerId === playerId);

  if (isJoin) {
    // 重连：恢复在线状态，取消断线宽限计时
    const self = roomInfo.player.find((p) => p.playerId === playerId)!;
    self.isOnline = true;
    // 顺手把积分同步成账号里的最新值（可能上一局刚结算过）
    self.score = record.score;
    clearDisconnectTimer(roomId, playerId);
    console.log(`[onJoin] ${playerId} 重连房间 ${roomId}（保留座位）`);
    return { backData: roomInfo, isPass: true };
  }

  // ⚠️ 对局进行中不接受新玩家 —— 否则加入时会把 status 重置成 prepare，
  //    正在打的牌局直接被顶掉重开
  if (roomInfo.status !== 'prepare') {
    console.log(`[onJoin] 房间 ${roomId} 正在对局（${roomInfo.status}），拒绝 ${playerId} 加入`);
    return {
      backData: roomInfo,
      isPass: false,
      isError: true,
      isGameInProgress: true,
      message: '这局正在打，等结束后再进吧',
    };
  }

  if (roomInfo.player.length >= 3) {
    console.log('[onJoin] 房间人数已满');
    return { backData: roomInfo, isPass: false, isMaxCount: true };
  }

  // 新玩家加入
  roomInfo.status = 'prepare';
  roomInfo.player.push({
    playerId,
    position: 1,
    isOnline: true,
    isAI: false,
    // 带上账号积分，前端信息板直接显示，不用再单独请求一次
    score: record.score,
    card: [],
  });

  // 第一个加入的真人当房主
  if (!roomInfo.ownerName) {
    roomInfo.ownerName = playerId;
    console.log(`[owner] ${playerId} 成为房间 ${roomId} 的房主`);
  }

  console.log(`[onJoin] ${playerId} 加入房间 ${roomId}`);
  return { backData: roomInfo, isPass: true };
};

/** 退出房间 */
const onLeave = (data: any, socket?: WsWebSocket): RoomInfo | null => {
  const roomId = Number(data.roomId);
  const playerId = String(data.playerId);
  const roomInfo = getRoom(roomId);
  if (!roomInfo) return null;

  console.log(`[onLeave] ${playerId} 主动退出房间 ${roomId}`);

  // 从 user_sockets 里也清掉（如果传了 socket）
  if (socket) {
    user_sockets = user_sockets.filter(
      (s) => !(s.socket === socket && s.roomId === roomId),
    );
  }

  // 主动退出立即生效，不等断线宽限
  return removePlayer(roomInfo, playerId);
};

/** 房主添加 AI 玩家 */
const onAddAI = (
  data: any,
  socket?: WsWebSocket,
): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  if (roomInfo.status !== 'prepare') {
    return { isError: true, message: '只能在准备阶段添加 AI', roomId: data.roomId };
  }

  // 只有房主能加 AI（房间还没房主时放行，兼容 HTTP 建房的测试流程）
  if (roomInfo.ownerName && !isOwner(roomInfo, String(data.playerId))) {
    return { isError: true, message: '只有房主可以添加 AI', roomId: data.roomId };
  }

  if (roomInfo.player.length >= 3) {
    return { isError: true, message: '房间已满（3 人）', roomId: data.roomId };
  }

  // 选一个没被用的 AI 名字
  const usedNames = new Set(roomInfo.player.map((p) => p.playerId));
  const aiName = AI_NAMES.find((n) => !usedNames.has(n)) ?? `AI-${Date.now()}`;

  roomInfo.player.push({
    playerId: aiName,
    position: 0,
    isOnline: true,
    isAI: true,
    score: 0,
    card: [],
  });

  console.log(`[addAI] ${aiName} 加入房间 ${roomInfo.roomId}`);

  // 满 3 人自动开局（服务端行为，跳过房主校验）
  if (roomInfo.player.length === 3 && !data.skipAutoStart) {
    const startResult = onStart({ roomId: roomInfo.roomId }, true);
    if (startResult && !(startResult as any).isError) {
      return startResult;
    }
  }
  return roomInfo;
};

/** 房主删除 AI 玩家 */
const onRemoveAI = (
  data: any,
): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  if (!isOwner(roomInfo, String(data.playerId))) {
    return { isError: true, message: '只有房主可以删除 AI', roomId: data.roomId };
  }

  if (roomInfo.status !== 'prepare') {
    return { isError: true, message: '只能在准备阶段删除 AI', roomId: data.roomId };
  }

  const targetId = String(data.targetId ?? '');
  const idx = roomInfo.player.findIndex((p) => p.playerId === targetId);
  if (idx < 0) {
    return { isError: true, message: '这个玩家不在房间里', roomId: data.roomId };
  }
  if (!roomInfo.player[idx].isAI) {
    return { isError: true, message: '只能删除 AI 玩家', roomId: data.roomId };
  }

  const removed = roomInfo.player.splice(idx, 1)[0];
  console.log(`[removeAI] ${removed.playerId} 被房主移出房间 ${roomInfo.roomId}`);
  return roomInfo;
};

// ============================
// 互动玩法：投掷道具 + 快捷语音
// ============================

/** 可投掷道具白名单（前端传什么都要在这里核对，不能直接透传） */
const THROW_ITEMS = ['tomato', 'egg'] as const;
type ThrowItem = (typeof THROW_ITEMS)[number];

/**
 * 快捷语音文案表
 * 服务端只认 id，文案以这里为准 —— 前端拿到 id 去播对应 mp3，
 * 顺带用 text 渲染气泡，避免两边文案对不上。
 */
const QUICK_CHAT_TEXT: Record<string, string> = {
  hurry: '快点吧，我等的花儿都谢了',
  hello: '大家好，很高兴见到各位',
  praise: '你的牌打得也太好了吧',
  fight: '不要走，决战到天亮',
  quiet: '不要吵了，不要吵了，专心玩游戏吧',
  bigger: '大你',
  cooperate: '和你合作真是太愉快了',
  bye: '再见了，我会想你的',
};

/** 投掷节流：`${roomId}:${playerId}` → 上次投掷时间戳 */
const throwCooldown = new Map<string, number>();
/** 两次投掷最小间隔，防止按住连点刷屏 */
const THROW_COOLDOWN_MS = 600;

/**
 * 投掷道具（番茄 / 鸡蛋）
 *
 * 纯广播型操作：不改房间状态，成功返回 null 表示"已经广播过了，不用再推房间数据"。
 */
const onThrowItem = (data: any): { isError: true; message: string } | null => {
  const roomInfo = getRoom(Number(data.roomId));
  if (!roomInfo) return { isError: true, message: '房间不存在' };

  const from = String(data.playerId ?? '');
  const to = String(data.targetId ?? '');
  const item = String(data.item ?? '');

  if (!THROW_ITEMS.includes(item as ThrowItem)) {
    return { isError: true, message: '没有这种道具' };
  }
  if (!roomInfo.player.some((p) => p.playerId === from)) {
    return { isError: true, message: '你不在这个房间里' };
  }
  const target = roomInfo.player.find((p) => p.playerId === to);
  if (!target) return { isError: true, message: '这个人不在房间里' };
  if (to === from) return { isError: true, message: '别砸自己呀' };

  const key = `${roomInfo.roomId}:${from}`;
  const now = Date.now();
  if (now - (throwCooldown.get(key) ?? 0) < THROW_COOLDOWN_MS) {
    return { isError: true, message: '手太快了，歇一下' };
  }
  throwCooldown.set(key, now);

  sendRoomEvent(roomInfo.roomId, {
    type: 'throwItem',
    from,
    to,
    item,
    ts: now,
  });

  // AI 会记仇：被砸之后有概率立刻砸回来，让 AI 别像个木头人
  if (target.isAI && Math.random() < 0.35) {
    const backItem = THROW_ITEMS[Math.floor(Math.random() * THROW_ITEMS.length)];
    setTimeout(() => {
      const fresh = getRoom(roomInfo.roomId);
      if (!fresh) return;
      // 人可能已经走了，走了就别砸空气
      if (!fresh.player.some((p) => p.playerId === from)) return;
      if (!fresh.player.some((p) => p.playerId === target.playerId)) return;

      sendRoomEvent(fresh.roomId, {
        type: 'throwItem',
        from: target.playerId,
        to: from,
        item: backItem,
        ts: Date.now(),
        fromAI: true,
      });
    }, 700 + Math.floor(Math.random() * 500));
  }

  return null;
};

/** 发送快捷语音 */
const onQuickChat = (data: any): { isError: true; message: string } | null => {
  const roomInfo = getRoom(Number(data.roomId));
  if (!roomInfo) return { isError: true, message: '房间不存在' };

  const from = String(data.playerId ?? '');
  const voiceId = String(data.voiceId ?? '');
  const text = QUICK_CHAT_TEXT[voiceId];

  if (!text) return { isError: true, message: '没有这句语音' };
  if (!roomInfo.player.some((p) => p.playerId === from)) {
    return { isError: true, message: '你不在这个房间里' };
  }

  sendRoomEvent(roomInfo.roomId, {
    type: 'quickChat',
    from,
    voiceId,
    text,
    ts: Date.now(),
  });
  return null;
};

/** 开始游戏（发牌阶段）。internal=true 表示服务端自动开局，跳过房主校验 */
const onStart = (
  data: any,
  internal = false,
): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  // 只有房主能开局
  if (!internal && roomInfo.ownerName && !isOwner(roomInfo, String(data.playerId))) {
    return { isError: true, message: '只有房主可以开始游戏', roomId: data.roomId };
  }

  if (roomInfo.player.length < 3) {
    return { isError: true, message: '人数不齐，至少 3 人才能开始', roomId: data.roomId };
  }

  // 只有在 prepare 或 reopen 或 end 状态才能开始
  if (!['prepare', 'reopen', 'end'].includes(roomInfo.status)) {
    return {
      isError: true,
      message: `当前状态 ${roomInfo.status} 不能开始游戏`,
      roomId: data.roomId,
    };
  }

  const radNum = getRoundNumber(0, 2) as PlayerPosition;
  roomInfo.status = 'selectLandlord';
  roomInfo.current = radNum;
  roomInfo.initPost = radNum;
  roomInfo.initUser = radNum;
  roomInfo.lastUser = radNum;
  roomInfo.callCount = 1;
  clearRound(roomInfo);
  roomInfo.winRole = -1;
  roomInfo.settled = false;

  // ============ 跑得快：没有叫地主，直接发牌开打 ============
  if (roomInfo.mode === 'pdk') {
    return startPdk(roomInfo);
  }

  // 洗牌发牌
  const cardList = shuffleCard(JSON.parse(JSON.stringify(cardIdList)));
  roomInfo.player.forEach((item) => {
    item.card = getCard(17, cardList);
    item.position = 1; // 重置为农民，抢地主后再设 0
  });
  roomInfo.aHand = cardList;
  return roomInfo;
};

/**
 * 跑得快开局：48 张牌三人各 16 张，直接进入出牌阶段
 *
 * 定庄：
 *   本房间第一局 → 谁抓到黑桃3 谁是庄家，且首次出牌必须带这张；
 *                  如果庄家把四张 3 全抓了，顺延到黑桃4，依此类推
 *   之后每局     → 上一局赢家坐庄，首出无限制
 */
function startPdk(roomInfo: RoomInfo): RoomInfo {
  const cardList = shuffleCard([...PDK_DECK]);
  roomInfo.player.forEach((item) => {
    item.card = getCard(16, cardList);
    item.position = 1; // 跑得快没有地主/农民，position 不参与判定
  });
  roomInfo.aHand = [];
  roomInfo.status = 'play';
  clearRound(roomInfo);
  roomInfo.lastUser = -1;
  roomInfo.winRole = -1;
  roomInfo.settled = false;
  roomInfo.pdkDelta = [0, 0, 0];
  roomInfo.pdkBomb = null;
  roomInfo.winnerIndex = -1;
  roomInfo.scoreDeltas = undefined;

  const hands = roomInfo.player.map((p) => p.card);

  if (roomInfo.needMarker) {
    // 本房间第一局：靠黑桃3（或级联后的牌）定庄
    const resolved = resolveBanker(hands);
    if (resolved) {
      roomInfo.banker = resolved.banker;
      roomInfo.markerId = resolved.markerId;
    } else {
      // 理论上不会发生（牌堆里一定有黑桃3），兜底：牌最多的坐庄
      roomInfo.banker = 0;
      roomInfo.markerId = -1;
    }
    roomInfo.needMarker = false;
  } else if (roomInfo.banker === undefined || roomInfo.banker < 0) {
    roomInfo.banker = 0;
    roomInfo.markerId = -1;
  } else {
    // 之后每局庄家由上一局赢家接任，首出不再限制
    roomInfo.markerId = -1;
  }

  roomInfo.current = roomInfo.banker;
  roomInfo.initPost = roomInfo.banker;
  roomInfo.initUser = roomInfo.banker;
  roomInfo.callCount = 1;

  refreshMustPlay(roomInfo);
  console.log(
    `[pdk] 房间 ${roomInfo.roomId} 开局 | 庄家=${roomInfo.player[roomInfo.banker]?.playerId}` +
      (roomInfo.markerId > 0 ? ` | 首出必须带 ${roomInfo.markerId}` : ''),
  );
  return roomInfo;
}

/** 不叫地主 */
const onNoCall = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  if (roomInfo.status !== 'selectLandlord') {
    return { isError: true, message: '当前不在叫地主阶段', roomId: data.roomId };
  }

  if (roomInfo.mode === 'pdk') {
    return { isError: true, message: '跑得快没有叫地主环节', roomId: data.roomId };
  }

  // AI 玩家直接跳过校验（服务端已确认 turn）
  const isAI = roomInfo.player[roomInfo.current]?.isAI;
  if (!isAI) {
    const err = validateTurn(roomInfo, data.playerId);
    if (err) return { isError: true, message: err, roomId: data.roomId };
  }

  if (roomInfo.callCount < 3) {
    roomInfo.current = roomInfo.current === 2 ? 0 : (roomInfo.current + 1);
    roomInfo.callCount++;
  } else {
    // 3 个人都不抢 → 重开
    roomInfo.status = 'reopen';
  }
  return roomInfo;
};

/** 抢地主 */
const onCall = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  if (roomInfo.status !== 'selectLandlord') {
    return { isError: true, message: '当前不在叫地主阶段', roomId: data.roomId };
  }

  if (roomInfo.mode === 'pdk') {
    return { isError: true, message: '跑得快没有叫地主环节', roomId: data.roomId };
  }

  // AI 玩家跳过校验
  const isAI = roomInfo.player[roomInfo.current]?.isAI;
  if (!isAI) {
    const err = validateTurn(roomInfo, data.playerId);
    if (err) return { isError: true, message: err, roomId: data.roomId };
  }

  roomInfo.status = 'play';
  // position：抢地主的人=0(地主)，其他人=1(农民)
  roomInfo.player.forEach((player, index) => {
    player.position = roomInfo.current === index ? (0 as PlayerPosition) : (1 as PlayerPosition);
  });
  clearRound(roomInfo);
  // 地主拿到底牌
  roomInfo.player[roomInfo.current as number].card.push(...roomInfo.aHand);
  return roomInfo;
};

/**
 * 对局结算：把结果写进玩家账号（积分 / 胜场 / 局数）
 *
 * 积分规则（地主 1v2，风险收益对等）：
 *   地主赢 → 地主 +2，两个农民各 -1
 *   农民赢 → 每个农民 +1，地主 -2
 *
 * AI 玩家、以及不在账号库里的老游客一律跳过，不影响牌局。
 */
function settleRoom(roomInfo: RoomInfo): void {
  if (roomInfo.settled) return;
  // 跑得快是另一套结算（炸弹分 + 剩余牌分），走独立分支
  if (roomInfo.mode === 'pdk') {
    settlePdk(roomInfo);
    return;
  }
  if (roomInfo.winRole < 0) return;
  roomInfo.settled = true;

  const entries: { id: string; scoreDelta: number; isWinner: boolean }[] = [];
  const parts: string[] = [];

  for (const p of roomInfo.player) {
    if (p.isAI) continue;
    const record = findByName(p.playerId);
    if (!record) continue;

    const isLandlord = p.position === 0;
    const isWinner = p.position === roomInfo.winRole;
    const scoreDelta = isLandlord
      ? isWinner ? 2 : -2
      : isWinner ? 1 : -1;

    entries.push({ id: record.id, scoreDelta, isWinner });
    parts.push(`${record.name}${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`);
  }

  if (entries.length === 0) return;

  applyMatchResult(entries);

  // 把结算后的最新积分同步回房间里的玩家对象，
  // 这样下一局开局时信息板上显示的就是新积分，不用等重连
  for (const p of roomInfo.player) {
    if (p.isAI) continue;
    const fresh = findByName(p.playerId);
    if (fresh) p.score = fresh.score;
  }

  console.log(`[settle] 房间 ${roomInfo.roomId} 地主${roomInfo.winRole === 0 ? '胜' : '负'} | ${parts.join('  ')}`);
}

// ============================
// 跑得快：积分
// ============================

/** 炸弹分：出炸者 +20，另外两家各 -10 */
const PDK_BOMB_WIN = 20;
const PDK_BOMB_LOSE = 10;

/**
 * 兑现「当前这一轮还活着」的炸弹
 *
 * 炸弹被打掉就没有分，所以这里不能一出炸就加分 —— 先挂起（pdkBomb），
 * 等这一轮结束（两家都过）或者牌局结束才真正落账。
 * 中间如果被更大的炸弹压了，pdkBomb 直接被覆盖，旧的炸弹就自然作废了。
 */
function commitPdkBomb(roomInfo: RoomInfo) {
  const bomb = roomInfo.pdkBomb;
  if (!bomb) return;
  roomInfo.pdkBomb = null;

  if (!roomInfo.pdkDelta) roomInfo.pdkDelta = [0, 0, 0];
  const delta = roomInfo.pdkDelta;
  delta[bomb.by] += PDK_BOMB_WIN;
  roomInfo.player.forEach((_, i) => {
    if (i !== bomb.by) delta[i] -= PDK_BOMB_LOSE;
  });
  console.log(
    `[pdk] 炸弹结算 ${roomInfo.player[bomb.by]?.playerId} +${PDK_BOMB_WIN}`,
  );
}

/**
 * 刷新「当前玩家能不能说不要」
 * 跑得快规则：下家能管得起就必须管，不能跳过。前端据此禁用「不要」按钮。
 */
function refreshMustPlay(roomInfo: RoomInfo) {
  if (roomInfo.mode !== 'pdk') {
    roomInfo.mustPlay = false;
    return;
  }
  if (!['play', 'useCard'].includes(roomInfo.status) || roomInfo.round.length === 0) {
    roomInfo.mustPlay = false;
    return;
  }
  const cur = roomInfo.player[roomInfo.current];
  if (!cur) {
    roomInfo.mustPlay = false;
    return;
  }
  const lastCards = roomInfo.round[roomInfo.round.length - 1].useCard;
  roomInfo.mustPlay = hasAnyBeatPdk(cur.card, identifyPdk(lastCards));
}

/**
 * 跑得快结算
 *
 *   ① 炸弹分：本轮没被打掉的炸弹，出炸者 +20，另两家各 -10
 *   ② 剩余牌分：赢家从每个输家身上按「剩几张得几分」收分
 *      —— 只剩 1 张（报单）的输家不扣分也不给分
 *   ③ 赢家下一局坐庄
 */
function settlePdk(roomInfo: RoomInfo): void {
  if (roomInfo.settled) return;
  const w = roomInfo.winnerIndex ?? -1;
  if (w < 0) return;
  roomInfo.settled = true;

  // 最后一手如果是炸弹，也要落账
  commitPdkBomb(roomInfo);

  const delta = [...(roomInfo.pdkDelta ?? [0, 0, 0])];

  roomInfo.player.forEach((p, i) => {
    if (i === w) return;
    const left = p.card.length;
    // 报单（只剩 1 张）不给分
    const contribution = left === 1 ? 0 : left;
    delta[w] += contribution;
    delta[i] -= contribution;
  });

  roomInfo.scoreDeltas = delta;

  const entries: { id: string; scoreDelta: number; isWinner: boolean }[] = [];
  const parts: string[] = [];
  roomInfo.player.forEach((p, i) => {
    parts.push(`${p.playerId}${delta[i] >= 0 ? '+' : ''}${delta[i]}`);
    if (p.isAI) return;
    const record = findByName(p.playerId);
    if (!record) return;
    entries.push({ id: record.id, scoreDelta: delta[i], isWinner: i === w });
  });

  if (entries.length > 0) applyMatchResult(entries);

  // 把最新积分同步回房间，下一局信息板直接显示新分
  for (const p of roomInfo.player) {
    if (p.isAI) continue;
    const fresh = findByName(p.playerId);
    if (fresh) p.score = fresh.score;
  }

  // 赢家坐庄
  roomInfo.banker = w;

  console.log(
    `[settle:pdk] 房间 ${roomInfo.roomId} 赢家=${roomInfo.player[w]?.playerId} | ${parts.join('  ')}`,
  );
}

/** 出牌 */
const onUseCard = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const { useCard, roomId, playerId } = data;
  const roomInfo = getRoom(roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId };

  if (!['play', 'useCard'].includes(roomInfo.status)) {
    return { isError: true, message: `当前状态 ${roomInfo.status} 不能出牌`, roomId };
  }

  const playerIndex = roomInfo.current;
  const isAI = roomInfo.player[playerIndex]?.isAI;

  // 身份校验（AI 跳过）
  if (!isAI) {
    const err1 = validateTurn(roomInfo, playerId);
    if (err1) return { isError: true, message: err1, roomId };
  }

  // 牌在手里校验（AI 和真人都需要）
  const err2 = validateCardsInHand(roomInfo, playerIndex, useCard);
  if (err2) return { isError: true, message: err2, roomId };

  if (!useCard || useCard.length === 0) {
    return { isError: true, message: '出牌不能为空', roomId };
  }

  // ============ 跑得快：牌型 / 首出 / 压牌校验 ============
  if (roomInfo.mode === 'pdk') {
    const hand = roomInfo.player[playerIndex].card;
    const ident = identifyPdk(useCard, hand.length);
    if (ident.type === 'unknown') {
      return { isError: true, message: '牌型不合法', roomId };
    }

    // 本房间第一局：庄家的第一次出牌必须带上庄家牌（黑桃3，或级联后的牌）
    // lastUser === -1 表示这一局还没人出过牌
    const isFirstPlayOfGame = roomInfo.lastUser === -1 && roomInfo.round.length === 0;
    if (
      isFirstPlayOfGame &&
      roomInfo.markerId &&
      roomInfo.markerId > 0 &&
      !useCard.includes(roomInfo.markerId)
    ) {
      const markerPoint = getCardPoint(roomInfo.markerId);
      return {
        isError: true,
        message: `首出必须带庄家牌（${markerPoint === 16 ? '2' : markerPoint} 的黑桃）`,
        roomId,
      };
    }

    // 有上家牌就必须管上
    if (roomInfo.round.length > 0) {
      const lastCards = roomInfo.round[roomInfo.round.length - 1].useCard;
      const lastIdent = identifyPdk(lastCards);
      if (!canBeatPdk(ident, lastIdent)) {
        return { isError: true, message: '管不上，换一手或者点不要', roomId };
      }
    }
  }

  roomInfo.status = 'useCard';
  roomInfo.notUseCardCount = 0;

  roomInfo.round.push({ useCard, useId: String(playerId) });
  roomInfo.roundLog.push({ useCard, useId: String(playerId) });
  roomInfo.lastUser = playerIndex;
  roomInfo.current = playerIndex === 2 ? 0 : playerIndex + 1;

  // 移除打出的牌
  roomInfo.player[playerIndex].card = roomInfo.player[playerIndex].card.filter(
    (item) => useCard.indexOf(item) < 0,
  );

  // 跑得快：炸弹挂起，等这一轮结束再落账（被压掉就不给分）
  if (roomInfo.mode === 'pdk' && identifyPdk(useCard).type === 'bomb') {
    roomInfo.pdkBomb = { by: playerIndex };
  }

  // 胜利：牌出完了
  if (roomInfo.player[playerIndex].card.length === 0) {
    if (roomInfo.mode === 'pdk') {
      roomInfo.winnerIndex = playerIndex;
      roomInfo.winRole = playerIndex;
    } else {
      roomInfo.winRole = roomInfo.player[playerIndex].position;
    }
    roomInfo.status = 'end';
    settleRoom(roomInfo);
  }

  refreshMustPlay(roomInfo);

  return roomInfo;
};

/** 放弃出牌（不要） */
const onNotUseCard = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const { roomId } = data;
  const roomInfo = getRoom(roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId };

  if (!['play', 'useCard'].includes(roomInfo.status)) {
    return { isError: true, message: `当前状态 ${roomInfo.status} 不能不要`, roomId };
  }

  const isAI = roomInfo.player[roomInfo.current]?.isAI;

  // AI 跳过身份校验
  if (!isAI) {
    const err = validateTurn(roomInfo, data.playerId);
    if (err) return { isError: true, message: err, roomId };
  }

  // 不能是第一个出牌（前面没人出过牌的情况下不能不要）
  if (roomInfo.round.length === 0) {
    return { isError: true, message: '还没人出牌，你必须出牌', roomId };
  }

  // 跑得快：能管必须管，不允许跳过
  if (roomInfo.mode === 'pdk') {
    const cur = roomInfo.player[roomInfo.current];
    const lastCards = roomInfo.round[roomInfo.round.length - 1].useCard;
    if (cur && hasAnyBeatPdk(cur.card, identifyPdk(lastCards))) {
      return { isError: true, message: '你有能管上的牌，必须出牌', roomId };
    }
  }

  // 出牌日志：记下「这家不要」，前端才能把这一轮的完整过程摆出来
  const passer = roomInfo.player[roomInfo.current];
  if (passer) {
    roomInfo.roundLog.push({ useId: passer.playerId, useCard: [], pass: true });
  }

  roomInfo.notUseCardCount = roomInfo.notUseCardCount + 1;
  roomInfo.current = roomInfo.current === 2 ? 0 : roomInfo.current + 1;

  if (roomInfo.notUseCardCount === 2) {
    // 大家都要不起 → 清空当前回合，回到最后出牌的人重新出
    clearRound(roomInfo);
    // 跑得快：这一轮结束，把还活着的炸弹落账
    if (roomInfo.mode === 'pdk') commitPdkBomb(roomInfo);
  }

  refreshMustPlay(roomInfo);

  return roomInfo;
};

// ============================
// 提示（hint）
// ============================

/** 候选按「弱 → 强」排：先普通牌型再炸弹，然后主牌点数小的优先 */
function compareHintCandidate(
  a: { cards: number[]; isNuke: boolean; mainPoint: number },
  b: { cards: number[]; isNuke: boolean; mainPoint: number },
): number {
  if (a.isNuke !== b.isNuke) return a.isNuke ? 1 : -1;
  if (a.mainPoint !== b.mainPoint) return a.mainPoint - b.mainPoint;
  return a.cards.length - b.cards.length;
}

/**
 * 提示：列出「能管上当前这手牌」的所有组合，按 seq 取第几个。
 *
 * 为什么放在服务端：
 *   牌型识别 / 压牌判定只有一份（utils/identify.ts + utils/pdk.ts），
 *   前端再实现一套必然和 AI、校验逻辑漂移。这里只是把已有的枚举函数暴露出来。
 *
 * 连点「提示」时前端把 seq +1，就能在这一轮候选里轮换，不用一次把全部候选推给前端。
 */
const onHint = (data: any) => {
  const { roomId } = data;
  const roomInfo = getRoom(roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId };

  if (!['play', 'useCard'].includes(roomInfo.status)) {
    return { isError: true, message: '现在还不能提示', roomId };
  }

  // 只允许当前该操作的人提示
  const err = validateTurn(roomInfo, data.playerId);
  if (err) return { isError: true, message: err, roomId };

  const me = roomInfo.player[roomInfo.current];
  if (!me) return { isError: true, message: '玩家不存在', roomId };

  const hand = me.card;
  const lastCards =
    roomInfo.round.length > 0
      ? roomInfo.round[roomInfo.round.length - 1].useCard
      : null;

  let raw: { cards: number[]; type: string; mainPoint: number }[] = [];

  if (roomInfo.mode === 'pdk') {
    if (lastCards) {
      raw = enumeratePdkBeats(hand, identifyPdk(lastCards)).map((c) => ({
        cards: c.cards,
        type: c.ident.type,
        mainPoint: c.ident.mainPoint,
      }));
    } else {
      raw = enumeratePdkAll(hand).map((c) => ({
        cards: c.cards,
        type: c.ident.type,
        mainPoint: c.ident.mainPoint,
      }));
      // 本房间第一局首出必须带庄家牌，提示也只给带得上的
      if (roomInfo.lastUser === -1 && (roomInfo.markerId ?? -1) > 0) {
        const marker = roomInfo.markerId as number;
        const withMarker = raw.filter((c) => c.cards.includes(marker));
        raw = withMarker.length > 0 ? withMarker : [{ cards: [marker], type: 'single', mainPoint: getCardPoint(marker) }];
      }
    }
  } else if (lastCards) {
    const lastType = identifyType(lastCards);
    // 王炸压不上，别给假提示
    raw =
      lastType.type === 'joker22'
        ? []
        : enumerateBeatCandidates(hand, lastType).map((c) => ({
            cards: c.cards,
            type: c.ident.type,
            mainPoint: c.ident.mainPoint,
          }));
  } else {
    raw = enumerateAll(hand).map((c) => ({
      cards: c.cards,
      type: c.ident.type,
      mainPoint: c.ident.mainPoint,
    }));
  }

  // 去重 + 排序：枚举里同一组牌可能被不同路径生成两次
  const seen = new Set<string>();
  const list = raw
    .map((c) => ({
      cards: c.cards,
      isNuke: c.type === 'bomb' || c.type === 'joker22',
      mainPoint: c.mainPoint,
    }))
    .filter((c) => {
      const key = [...c.cards].sort((x, y) => x - y).join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareHintCandidate);

  const seq = Math.max(0, Number(data.seq) || 0);
  const pick = list.length > 0 ? list[seq % list.length] : null;

  return {
    type: 'hint',
    roomId,
    seq,
    total: list.length,
    cards: pick ? pick.cards : [],
  };
};

// ============================
// WS 入口
// ============================
server.on('connection', function (socket) {
  let connectionIndex = -1;
  for (let i = 0; i < user_sockets.length; i++) {
    if (user_sockets[i].socket === socket) {
      connectionIndex = i;
      break;
    }
  }

  if (connectionIndex >= 0) {
    console.log('有玩家重连 (connectionIndex=', connectionIndex, ')');
  } else {
    user_sockets.push({
      socket: socket,
      userName: undefined,
      roomId: 0,
      state: 1,
    });
  }

  socket.on('message', function (msg) {
    try {
      const encData = decodeWsMessage(msg);
      const data = JSON.parse(encData);

      // 已认证的 socket：后续消息一律用绑定身份，客户端自报的 playerId 不可信
      const bound = user_sockets.find((u) => u.socket === socket);
      if (bound?.userName && (data as any).playerId !== bound.userName) {
        (data as any).playerId = bound.userName;
      }

      if ((data as any).type === 'onJoin') {
        const result = onJoin(data, socket);
        const {
          backData,
          isPass,
          isError,
          isMaxCount,
          message,
          needLogin,
          isRoomGone,
          isGameInProgress,
        } = result as any;

        if (isError) {
          // 认证失败 / 房间不存在时该 socket 还没绑定用户名，只能直接回给它
          if (needLogin) {
            try {
              socket.send(JSON.stringify({ isError: true, message, needLogin: true }));
            } catch {}
          } else if (isRoomGone) {
            try {
              socket.send(JSON.stringify({ isError: true, message, roomGone: true }));
            } catch {}
          } else if (isGameInProgress) {
            try {
              socket.send(JSON.stringify({ isError: true, message, gameInProgress: true }));
            } catch {}
          } else {
            sendMesForPlay(String((data as any).playerId), { isError: true, message });
          }
        } else if (isPass) {
          sendMes(backData);
        } else if (isMaxCount) {
          sendMesForPlay(String((data as any).playerId), { status: 'maxCount' });
        }
      } else if ((data as any).type === 'addAI') {
        const result = onAddAI(data, socket);
        if (!result) {
          sendMesForPlay(String(data.playerId), { isError: true, message: '添加 AI 失败' });
        } else if ((result as any).isError) {
          sendMesForPlay(String(data.playerId), result);
        } else {
          sendMes(result);
          scheduleAITurn(result as RoomInfo);
        }
      } else if ((data as any).type === 'removeAI') {
        const result = onRemoveAI(data);
        if ((result as any).isError) {
          sendMesForPlay(String(data.playerId), result);
        } else {
          sendMes(result);
        }
      } else if ((data as any).type === 'throwItem') {
        // 纯广播操作：成功时返回 null，房间数据不用重推
        const result = onThrowItem(data);
        if (result) sendMesForPlay(String(data.playerId), result);
      } else if ((data as any).type === 'quickChat') {
        const result = onQuickChat(data);
        if (result) sendMesForPlay(String(data.playerId), result);
      } else if ((data as any).type === 'hint') {
        // 只回给发起人，不广播、不改房间状态
        const result = onHint(data);
        sendMesForPlay(String((data as any).playerId), result);
      } else if ((data as any).type === 'onLeave') {
        const result = onLeave(data, socket);
        if (result) {
          sendMes(result);
        } else {
          // 返回 null 表示房间删了，通知所有人（其实用户已经被移除）
          console.log('[onLeave] 房间已删除，无需广播');
        }
      } else if ((data as any).type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      } else {
        // 所有需要校验的事件
        const handlers: Record<string, (d: any) => any> = {
          onStart,
          onNoCall,
          onCall,
          useCard: onUseCard,
          onNotUseCard,
        };

        const handler = handlers[(data as any).type];
        if (handler) {
          const result = handler(data);
          if (!result) {
            sendMesForPlay(String(data.playerId), {
              isError: true,
              message: '服务器内部错误，请重试',
            });
          } else if ((result as any).isError) {
            sendMesForPlay(String(data.playerId), result);
          } else {
            const room = result as RoomInfo;

            // 特殊处理：onStart 之后如果满 AI 自动发牌，需要重新 start
            let finalRoom: RoomInfo = room;
            if (finalRoom.status === 'reopen') {
              // 重开一局，自动 start（服务端行为，跳过房主校验）
              const s = onStart({ roomId: finalRoom.roomId }, true);
              if (s && !(s as any).isError) finalRoom = s as RoomInfo;
            }

            sendMes(finalRoom);
            // 状态转移后，看看下一个是不是 AI
            scheduleAITurn(finalRoom);
          }
        } else {
          console.log('未知事件:', (data as any).type);
        }
      }
    } catch (error) {
      console.log('----------服务器消息处理异常----------------', error);
      try {
        socket.send(JSON.stringify({ isError: true, message: '服务器处理异常' }));
      } catch {}
    }
  });

  socket.on('close', function () {
    // 找到这个 socket 对应的 user 信息
    const info = user_sockets.find((s) => s.socket === socket);
    if (info && info.userName) {
      // 断线不等于退出：先保留座位，超时没回来才清出去
      const room = getRoom(info.roomId);
      if (room) markOffline(room, info.userName);
    }
    user_sockets = user_sockets.filter((s) => s.socket !== socket);
  });
});

const PORT = process.env.PORT || 9200;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

// 退出前把防抖窗口内的改动写盘，避免最后一局结算丢失
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[server] 收到 ${sig}，保存数据后退出`);
    flushNow();
    process.exit(0);
  });
}

// ============================
// HTTP API
// ============================

// 获取房间列表
app.get('/api/roomList', function (req, res) {
  res.status(200).json({
    isSuccess: true,
    roomList,
  });
});

// ============================
// 账号：注册 / 登录 / 资料
// ============================

/** 注册 */
app.post('/api/register', async function (req, res) {
  const nameErr = validateName(req.body?.name);
  if (nameErr) return res.status(200).json({ isSuccess: false, message: nameErr });

  const pwdErr = validatePassword(req.body?.password);
  if (pwdErr) return res.status(200).json({ isSuccess: false, message: pwdErr });

  const name = String(req.body.name).trim();
  if (findByName(name)) {
    return res.status(200).json({ isSuccess: false, message: '这个昵称已经被占用了' });
  }

  try {
    const { hash, salt } = await hashPassword(String(req.body.password));
    const record = createPlayer({ id: newPlayerId(), name, hash, salt });
    const token = signToken(record.id, record.name);
    console.log(`[register] ${name} 注册成功，当前共 ${countPlayers()} 个账号`);
    res.status(200).json({ isSuccess: true, token, player: publicProfile(record) });
  } catch (e: any) {
    console.error('[register] 失败:', e.message);
    res.status(200).json({ isSuccess: false, message: '注册失败，请稍后重试' });
  }
});

/** 登录 */
app.post('/api/login', async function (req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !password) {
    return res.status(200).json({ isSuccess: false, message: '请输入昵称和密码' });
  }

  const record = findByName(name);
  const ok = record ? await verifyPassword(password, record.hash, record.salt) : false;

  // 昵称不存在和密码错误返回同一句，避免被用来探测账号是否注册
  if (!record || !ok) {
    return res.status(200).json({ isSuccess: false, message: '昵称或密码错误' });
  }

  updatePlayer(record.id, { lastLoginAt: Date.now() });
  const token = signToken(record.id, record.name);
  console.log(`[login] ${record.name} 登录成功`);
  res.status(200).json({ isSuccess: true, token, player: publicProfile(record) });
});

/** 当前登录账号资料（前端启动时用它校验本地 token 是否还有效） */
app.get('/api/me', function (req, res) {
  const payload = verifyToken(extractToken(req.headers.authorization));
  if (!payload) return res.status(401).json({ isSuccess: false, message: '未登录或登录已过期' });

  const record = findById(payload.pid);
  if (!record) return res.status(401).json({ isSuccess: false, message: '账号不存在' });

  res.status(200).json({ isSuccess: true, player: publicProfile(record) });
});

/** 排行榜 */
app.get('/api/leaderboard', function (_req, res) {
  res.status(200).json({ isSuccess: true, list: topPlayers(20) });
});

// 创建房间
app.post('/api/createRoom', function (req, res) {
  // 已登录时以 token 里的昵称为准，防止伪造他人身份建房
  const payload = verifyToken(extractToken(req.headers.authorization));
  const record = payload ? findById(payload.pid) : null;
  const userName = record?.name ?? (req.body?.userName ?? '匿名');
  const roomId = Date.now() + Math.floor(Math.random() * 1000);
  const mode: GameMode = req.body?.mode === 'pdk' ? 'pdk' : 'ddz';
  const newRoom = createInitialRoom(roomId, mode);
  roomList.push(newRoom);
  console.log(`[createRoom] 用户 ${userName} 创建房间 ${roomId}（${mode}）`);
  res.status(200).json({
    isSuccess: true,
    roomId,
  });
});

// HTTP 添加 AI（用于测试/自动化）
app.post('/api/addAI', function (req, res) {
  const roomId = req.body?.roomId;
  if (!roomId) {
    res.status(400).json({ isSuccess: false, message: '缺少 roomId' });
    return;
  }

  // 身份优先取 token，别让 body 里的 playerId 冒充房主
  const payload = verifyToken(extractToken(req.headers.authorization));
  const record = payload ? findById(payload.pid) : null;
  const playerId = record?.name ?? req.body?.playerId ?? 'http-user';

  const result = onAddAI({
    roomId,
    playerId,
    skipAutoStart: req.body?.skipAutoStart,
  });
  if ((result as any).isError) {
    res.status(200).json({ isSuccess: false, ...(result as any) });
    return;
  }
  const room = result as RoomInfo;
  res.status(200).json({ isSuccess: true, room });
  // 广播给房间内的真人客户端 —— 第 3 人加入会自动开局，
  // 如果这时候不推，恰好轮到真人操作（比如跑得快庄家是真人）就会一直卡住没人动
  sendMes(room);
  // 状态转移后调度 AI
  scheduleAITurn(room);
});

// HTTP 删除 AI（用于测试/自动化，同样受房主权限约束）
app.post('/api/removeAI', function (req, res) {
  const roomId = req.body?.roomId;
  if (!roomId) {
    res.status(400).json({ isSuccess: false, message: '缺少 roomId' });
    return;
  }

  const payload = verifyToken(extractToken(req.headers.authorization));
  const record = payload ? findById(payload.pid) : null;
  const playerId = record?.name ?? req.body?.playerId ?? 'http-user';

  const result = onRemoveAI({ roomId, playerId, targetId: req.body?.targetId });
  if ((result as any).isError) {
    res.status(200).json({ isSuccess: false, ...(result as any) });
    return;
  }
  res.status(200).json({ isSuccess: true, room: result });
});
