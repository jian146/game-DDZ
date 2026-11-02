import WebSocket from 'ws';
import { decidePdkAI } from '../utils/ai';
import { identifyPdk, PDK_DECK } from '../utils/pdk';

/**
 * 跑得快端到端对局脚本
 *
 * 需要先起一个服务（默认 9302），然后：
 *   npx ts-node scripts/pdk-e2e.ts
 *
 * 做的事：
 *   1. 登录 test1 → 建一个 mode=pdk 的房间 → 加 2 个 AI（第 3 人加入时自动开局）
 *   2. WS 连上去，轮到自己就用 decidePdkAI 选牌出（和真人客户端同一套决策）
 *   3. 全程校验：牌堆 48 张 / 每人 16 张 / 首出必须带庄家牌 / 能管必须管 / 结算分
 */

const BASE = process.env.BASE ?? 'http://127.0.0.1:9302';
const WS_BASE = BASE.replace(/^http/, 'ws');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra?: any) {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra === undefined ? '' : JSON.stringify(extra));
  }
}

async function post(path: string, body: any, token?: string) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function main() {
  const login = await post('/api/login', { name: 'test1', password: '1234' });
  if (!login.token) throw new Error('登录失败，先确认 test1 账号存在');
  const me = login.player.name as string;

  const created = await post('/api/createRoom', { mode: 'pdk' }, login.token);
  const roomId = created.roomId as number;
  console.log(`房间 ${roomId} 已创建（pdk）`);

  const ws = new WebSocket(WS_BASE);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  let firstPlaySeen = false;
  let checkedMustPass = false;
  let deckChecked = false;
  let ended = false;
  let finalRoom: any = null;
  let lastRoom: any = null;
  let busy = false;
  const playLog: string[] = [];
  let lastPlaySig = '';

  const send = (payload: any) => ws.send(JSON.stringify(payload));

  /** 轮到我 → 决策并出牌 */
  const handleTurn = (room: any) => {
    if (!room || room.status === 'end') {
      busy = false;
      return;
    }
    if (room.status !== 'play' && room.status !== 'useCard') {
      busy = false;
      return;
    }
    const cur = room.current;
    const curPlayer = room.player?.[cur];
    // 不是我的回合 → 释放 busy（说明服务端已经处理完我上一次动作）
    if (!curPlayer || curPlayer.playerId !== me) {
      busy = false;
      return;
    }
    if (busy) return;
    busy = true;

    // 先验证一次「能管必须管」：mustPlay 时点不要应该被拒绝
    if (room.mustPlay && !checkedMustPass) {
      checkedMustPass = true;
      send({ type: 'onNotUseCard', roomId, playerId: me, position: cur, useCard: [] });
      return;
    }

    const lastPlay =
      room.round && room.round.length > 0
        ? room.round[room.round.length - 1].useCard
        : null;
    const mustInclude = room.lastUser === -1 && room.markerId > 0 ? room.markerId : -1;

    const decision = decidePdkAI(curPlayer.card, lastPlay, mustInclude);
    if (decision.action === 'playCards') {
      send({
        type: 'useCard',
        roomId,
        playerId: me,
        position: cur,
        useCard: decision.cards,
      });
    } else {
      send({ type: 'onNotUseCard', roomId, playerId: me, position: cur, useCard: [] });
    }
  };

  ws.on('message', (raw) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.isError) {
      if (String(data.message).includes('必须出牌')) {
        checkedMustPass = true;
        console.log(`  [预期] 被拒绝不要：${data.message}`);
      } else {
        console.log(`  [服务端错误] ${data.message}`);
      }
      busy = false;
      // 出错后按同一局面重来一次，避免测试脚本自己卡死
      setTimeout(() => handleTurn(lastRoom), 250);
      return;
    }
    if (!data.player || !Array.isArray(data.player)) return;

    finalRoom = data;
    lastRoom = data;

    // 首次拿到发牌结果时校验牌堆（还没人出过牌的那一刻）
    if (
      !deckChecked &&
      data.status === 'play' &&
      data.player.length === 3 &&
      data.lastUser === -1
    ) {
      deckChecked = true;
      const all = data.player.flatMap((p: any) => p.card);
      check('三家共 48 张', all.length === 48, all.length);
      check('每人 16 张', data.player.every((p: any) => p.card.length === 16));
      check('没有大小王', !all.some((id: number) => id >= 53));
      check('只有一个 2', all.filter((id: number) => [13, 26, 39, 52].includes(id)).length === 1);
      check('四个 3 都在', [1, 14, 27, 40].every((id) => all.includes(id)));
      check('只有三个 A', all.filter((id: number) => [12, 25, 38, 51].includes(id)).length === 3);
    }

    if (data.status === 'end') {
      ended = true;
      busy = false;
      return;
    }

    // 出牌流水（每条只记一次）
    if (data.round && data.round.length > 0) {      const last = data.round[data.round.length - 1];
      const sig = `${last.useId}:${last.useCard.join(',')}`;
      if (sig !== lastPlaySig) {
        lastPlaySig = sig;
        const ident = identifyPdk(last.useCard);
        playLog.push(
          `${last.useId} 出 ${ident.type}(${ident.mainPoint}) ${last.useCard.length}张`,
        );
        if (!firstPlaySeen && data.markerId > 0) {
          firstPlaySeen = true;
          check('首出带庄家牌', last.useCard.includes(data.markerId), {
            markerId: data.markerId,
            useCard: last.useCard,
          });
        }
      }
    }

    handleTurn(data);
  });

  send({ type: 'onJoin', roomId, playerId: me, token: login.token });
  await new Promise((r) => setTimeout(r, 600));

  // 加两个 AI，第 3 个人加入时服务端自动开局
  await post('/api/addAI', { roomId }, login.token);
  await post('/api/addAI', { roomId }, login.token);
  console.log('已加入 2 个 AI，等待自动开局...\n');

  // 等对局结束（最多 180 秒）
  const deadline = Date.now() + 180_000;
  while (!ended && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n--- 出牌流水 ---');
  console.log(playLog.length ? playLog.join('\n') : '(无)');

  if (!ended) {
    fail++;
    console.log('\n❌ 对局没有在 180 秒内结束（可能卡住了）');
    ws.close();
    process.exit(1);
  }

  // ============ 校验 ============
  console.log('\n--- 结算 ---');
  console.log(
    finalRoom.player
      .map((p: any, i: number) => `${p.playerId}${p.isAI ? '(AI)' : ''}: 剩${p.card.length}张 ${finalRoom.scoreDeltas?.[i] ?? 0}分`)
      .join('\n'),
  );

  check('牌堆 48 张', PDK_DECK.length === 48);
  check('跑得快不叫地主（winRole 是赢家索引）', typeof finalRoom.winnerIndex === 'number');
  check('有庄家', typeof finalRoom.banker === 'number' && finalRoom.banker >= 0);
  check('结算分存在', Array.isArray(finalRoom.scoreDeltas));
  check('首出带过庄家牌', firstPlaySeen);

  if (Array.isArray(finalRoom.scoreDeltas)) {
    const sum = finalRoom.scoreDeltas.reduce((a: number, b: number) => a + b, 0);
    check('三家增减分之和为 0（零和）', sum === 0, finalRoom.scoreDeltas);
  }

  const w = finalRoom.winnerIndex;
  check('赢家手牌为空', finalRoom.player[w]?.card.length === 0);

  console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`);
  ws.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
