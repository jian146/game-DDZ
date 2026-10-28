import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket as WsWebSocket } from 'ws';

import { getRoundNumber, getCard, shuffleCard } from './utils/card';
import { decideAI, type AIDecision } from './utils/ai';
import { cardIdList } from './init';

type RoomStatus = 'prepare' | 'selectLandlord' | 'reopen' | 'play' | 'end' | 'useCard';

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
  aHand: number[];
  /** 当前应该操作的玩家在 player[] 里的索引 */
  current: number;
  winRole: number; // -1未开始,0地主胜利,1/2农民胜利
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
const createInitialRoom = (roomId: number): RoomInfo => ({
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
  aHand: [],
  current: -1,
  winRole: -1,
});

const app = express();

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
  app.use(express.static(frontendDist));
  // SPA fallback：任何非 API / 非 WS 路由都返回 index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
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
 * 每次房间状态转移后调用：如果当前玩家是 AI，2 秒后自动执行决策
 */
function scheduleAITurn(roomInfo: RoomInfo) {
  clearAITimer(roomInfo.roomId);

  // 终局状态不再调度
  if (roomInfo.status === 'end' || roomInfo.status === 'prepare') return;

  // 当前玩家必须存在且是 AI
  const current = roomInfo.player[roomInfo.current];
  if (!current || !current.isAI) return;

  const delay = 1500 + Math.floor(Math.random() * 1500); // 1.5~3 秒，模拟思考

  const timer = setTimeout(() => {
    // 防止调度过期：房间可能已经变了
    const freshRoom = getRoom(roomInfo.roomId);
    if (!freshRoom) return;
    if (freshRoom.current !== roomInfo.current) return;
    const player = freshRoom.player[freshRoom.current];
    if (!player || !player.isAI) return;

    console.log(`[AI] ${player.playerId} 在思考...`);
    const decision = decideAI(
      player.card,
      freshRoom.round.length > 0 ? freshRoom.round[freshRoom.round.length - 1].useCard : null,
      freshRoom.status === 'selectLandlord',
      freshRoom.callCount,
    );
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
  const playerId = String(data.playerId);
  const roomInfo = getRoom(roomId);
  if (!roomInfo) {
    return { backData: null, isPass: false, isError: true, message: '房间不存在' };
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
    console.log(`[onJoin] ${playerId} 重连房间 ${roomId}（已加入）`);
    return { backData: roomInfo, isPass: true };
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
    score: 0,
    card: [],
  });

  console.log(`[onJoin] ${playerId} 加入房间 ${roomId}`);
  return { backData: roomInfo, isPass: true };
};

/** 退出房间 */
const onLeave = (data: any, socket?: WsWebSocket): RoomInfo | null => {
  const roomId = Number(data.roomId);
  const playerId = String(data.playerId);
  const roomInfo = getRoom(roomId);
  if (!roomInfo) return null;

  console.log(`[onLeave] ${playerId} 退出房间 ${roomId}`);

  // 从 player 数组里移除
  const idx = roomInfo.player.findIndex((p) => p.playerId === playerId);
  if (idx >= 0) {
    roomInfo.player.splice(idx, 1);
  }

  // 从 user_sockets 里也清掉（如果传了 socket）
  if (socket) {
    user_sockets = user_sockets.filter(
      (s) => !(s.socket === socket && s.roomId === roomId),
    );
  }

  // 如果房间空了（没人），从 roomList 移除
  if (roomInfo.player.length === 0) {
    console.log(`[onLeave] 房间 ${roomId} 没人了，删除`);
    const i = roomList.findIndex((r) => r.roomId === roomId);
    if (i >= 0) roomList.splice(i, 1);
    clearAITimer(roomId);
    return null;
  }

  // 如果房间只剩 AI，清空（避免 AI 自己玩）
  if (roomInfo.player.every((p) => p.isAI)) {
    console.log(`[onLeave] 房间 ${roomId} 只剩 AI，清空删除`);
    const i = roomList.findIndex((r) => r.roomId === roomId);
    if (i >= 0) roomList.splice(i, 1);
    clearAITimer(roomId);
    // 但要通知剩下的 AI sockets（其实 AI 没 socket）
    return null;
  }

  // 如果游戏进行中有人退出，结束当前局（简化处理：保留房间，重置到 prepare）
  if (roomInfo.status !== 'prepare') {
    console.log(`[onLeave] 游戏中有人退出，重置房间 ${roomId} 到 prepare`);
    roomInfo.status = 'prepare';
    roomInfo.round = [];
    roomInfo.callCount = 1;
    roomInfo.notUseCardCount = 0;
    roomInfo.current = -1;
    roomInfo.winRole = -1;
    roomInfo.player.forEach((p) => {
      p.position = 1;
      p.card = [];
    });
    clearAITimer(roomId);
  }

  return roomInfo;
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

  if (roomInfo.player.length >= 3) {
    return { isError: true, message: '房间已满（3 人）', roomId: data.roomId };
  }

  // 允许任何玩家添加 AI（不限房主），方便空房间/测试
  // 但如果房间里有真人且不是添加者本人，也允许（因为方便快速组局）

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

  // 满 3 人自动开局
  if (roomInfo.player.length === 3 && !data.skipAutoStart) {
    const startResult = onStart({ roomId: roomInfo.roomId });
    if (startResult && !(startResult as any).isError) {
      return startResult;
    }
  }
  return roomInfo;
};

/** 开始游戏（发牌阶段） */
const onStart = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

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
  roomInfo.notUseCardCount = 0;
  roomInfo.round = [];
  roomInfo.winRole = -1;

  // 洗牌发牌
  const cardList = shuffleCard(JSON.parse(JSON.stringify(cardIdList)));
  roomInfo.player.forEach((item) => {
    item.card = getCard(17, cardList);
    item.position = 1; // 重置为农民，抢地主后再设 0
  });
  roomInfo.aHand = cardList;
  return roomInfo;
};

/** 不叫地主 */
const onNoCall = (data: any): RoomInfo | { isError: true; message: string; roomId: number } => {
  const roomInfo = getRoom(data.roomId);
  if (!roomInfo) return { isError: true, message: '房间不存在', roomId: data.roomId };

  if (roomInfo.status !== 'selectLandlord') {
    return { isError: true, message: '当前不在叫地主阶段', roomId: data.roomId };
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
  roomInfo.notUseCardCount = 0;
  roomInfo.round = [];
  // 地主拿到底牌
  roomInfo.player[roomInfo.current as number].card.push(...roomInfo.aHand);
  return roomInfo;
};

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

  roomInfo.status = 'useCard';
  roomInfo.notUseCardCount = 0;

  roomInfo.round.push({ useCard, useId: String(playerId) });
  roomInfo.lastUser = playerIndex;
  roomInfo.current = playerIndex === 2 ? 0 : playerIndex + 1;

  // 移除打出的牌
  roomInfo.player[playerIndex].card = roomInfo.player[playerIndex].card.filter(
    (item) => useCard.indexOf(item) < 0,
  );

  // 胜利：牌出完了
  if (roomInfo.player[playerIndex].card.length === 0) {
    roomInfo.winRole = roomInfo.player[playerIndex].position;
    roomInfo.status = 'end';
  }

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

  roomInfo.notUseCardCount = roomInfo.notUseCardCount + 1;
  roomInfo.current = roomInfo.current === 2 ? 0 : roomInfo.current + 1;

  if (roomInfo.notUseCardCount === 2) {
    // 大家都要不起 → 清空当前回合，回到最后出牌的人重新出
    roomInfo.round = [];
    roomInfo.notUseCardCount = 0;
  }
  return roomInfo;
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

      if ((data as any).type === 'onJoin') {
        const result = onJoin(data, socket);
        const { backData, isPass, isError, isMaxCount, message } = result as any;

        if (isError) {
          sendMesForPlay(String(data.playerId), { isError: true, message });
        } else if (isPass) {
          sendMes(backData);
        } else if (isMaxCount) {
          sendMesForPlay(String(data.playerId), { status: 'maxCount' });
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
              // 重开一局，自动 start
              const s = onStart({ roomId: finalRoom.roomId });
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
      // 从房间里移除（模拟退出）
      onLeave({ roomId: info.roomId, playerId: info.userName });
    }
    user_sockets = user_sockets.filter((s) => s.socket !== socket);
  });
});

const PORT = process.env.PORT || 9200;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

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

// 创建房间
app.post('/api/createRoom', function (req, res) {
  const userName = req.body?.userName ?? '匿名';
  const roomId = Date.now() + Math.floor(Math.random() * 1000);
  const newRoom = createInitialRoom(roomId);
  roomList.push(newRoom);
  console.log(`[createRoom] 用户 ${userName} 创建房间 ${roomId}`);
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
  const result = onAddAI({ roomId, playerId: req.body?.playerId ?? 'http-user' });
  if ((result as any).isError) {
    res.status(200).json({ isSuccess: false, ...(result as any) });
    return;
  }
  const room = result as RoomInfo;
  res.status(200).json({ isSuccess: true, room });
  // 状态转移后调度 AI
  scheduleAITurn(room);
});
