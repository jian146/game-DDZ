import WebSocket from 'ws';
import { decideAI, decidePdkAI } from '../utils/ai';
import { identifyPdk, canBeatPdk } from '../utils/pdk';
import { identifyType, canBeat } from '../utils/identify';

/**
 * 出牌日志（roundLog）+ 提示（hint）端到端校验
 *
 * 需要先起服务，然后：
 *   npx ts-node scripts/round-hint-check.ts            # 默认 9200
 *   BASE=http://127.0.0.1:9301 npx ts-node scripts/round-hint-check.ts
 *
 * 做的事：
 *   1. 跑一局跑得快 + 一局斗地主，全程用 AI 决策替我出牌
 *   2. 每一帧校验 roundLog 不变量：
 *        - pass 条目 useCard 必须为空
 *        - round 里的每一手都必须按顺序出现在 roundLog 里
 *        - round 清空时 roundLog 也必须清空
 *   3. 我每次轮到出牌且场上有牌时，连点 3 次提示，校验返回的牌
 *        合法（都在我手里）、能压上（identify/canBeat 判定）、且服务端接受
 */

const BASE = process.env.BASE ?? 'http://127.0.0.1:9200';
const WS_BASE = BASE.replace(/^http/, 'ws');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra?: any) {
  if (ok) pass++;
  else {
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

type Mode = 'pdk' | 'ddz';

async function runGame(mode: Mode) {
  const tag = mode === 'pdk' ? '跑得快' : '斗地主';
  console.log(`\n=========== ${tag} ===========`);

  const login = await post('/api/login', { name: 'test1', password: '1234' });
  if (!login.token) throw new Error('登录失败，先确认 test1 账号存在');
  const me = login.player.name as string;

  const created = await post('/api/createRoom', { mode }, login.token);
  const roomId = created.roomId as number;
  console.log(`房间 ${roomId}（${mode}）`);

  const ws = new WebSocket(WS_BASE);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const send = (payload: any) => ws.send(JSON.stringify(payload));

  let ended = false;
  let lastRoom: any = null;
  /**
   * 每个「局面」只动作一次。
   * 之前用 busy 布尔量，结果斗地主叫完地主后局面直接变成「轮到我出牌」，
   * 新帧到达时 busy 还是 true，脚本把自己锁死。
   * 改成局面指纹：状态 + 当前玩家 + 本轮手数 + 我的剩牌数。
   */
  let actedKey = '';
  let errCount = 0;
  let hintTurns = 0; // 已经验证过的提示回合数
  let pendingHintSeq = -1;
  let hintLastCards: number[] | null = null;

  const sendHint = (room: any, seq: number) => {
    pendingHintSeq = seq;
    hintLastCards = room.round[room.round.length - 1].useCard;
    send({ type: 'hint', roomId, playerId: me, position: room.current, useCard: [], seq });
  };

  const playNormally = (room: any) => {
    const cur = room.current;
    const curPlayer = room.player[cur];
    const lastPlay =
      room.round && room.round.length > 0
        ? room.round[room.round.length - 1].useCard
        : null;

    const decision =
      mode === 'pdk'
        ? decidePdkAI(
            curPlayer.card,
            lastPlay,
            room.lastUser === -1 && room.markerId > 0 ? room.markerId : -1,
          )
        : decideAI(curPlayer.card, lastPlay, room.status === 'selectLandlord', room.callCount);

    if (decision.action === 'playCards') {
      send({ type: 'useCard', roomId, playerId: me, position: cur, useCard: decision.cards });
    } else if (decision.action === 'callLandlord') {
      send({ type: 'onCall', roomId, playerId: me, position: cur, useCard: [] });
    } else if (decision.action === 'noCall') {
      send({ type: 'onNoCall', roomId, playerId: me, position: cur, useCard: [] });
    } else {
      send({ type: 'onNotUseCard', roomId, playerId: me, position: cur, useCard: [] });
    }
  };

  const handleTurn = (room: any) => {
    if (!room) return;
    const mine = room.player?.[room.current]?.playerId === me;
    if (!mine) return;

    const isCall = room.status === 'selectLandlord';
    const isPlay = room.status === 'play' || room.status === 'useCard';
    if (!isCall && !isPlay) return;

    // 同一局面只动作一次。
    // ⚠️ 不能只用 round.length 当指纹：一轮打完会清空，下一轮又攒到同样手数，
    //    「current + 手数 + 我的剩牌数」就会和上一轮撞上，脚本直接卡死（实测斗地主会超时）。
    //    必须带上「最后出的那手牌」本身。
    const lastEntry = room.round?.[room.round?.length - 1];
    const key = [
      room.status,
      room.current,
      lastEntry ? `${lastEntry.useId}:${lastEntry.useCard.join(',')}` : 'lead',
      room.player[room.current]?.card.length ?? 0,
    ].join('|');
    if (key === actedKey) return;
    actedKey = key;

    // 场上有牌 + 还没测够 3 个回合 → 用提示出牌
    if (isPlay && hintTurns < 3 && room.round && room.round.length > 0) {
      sendHint(room, 0);
      return;
    }
    playNormally(room);
  };

  ws.on('message', (raw) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ---- 提示响应 ----
    if (data.type === 'hint') {
      const room = lastRoom;
      const cards: number[] = data.cards ?? [];
      check(`提示返回 total=${data.total}`, typeof data.total === 'number');
      if (cards.length > 0 && room) {
        const cur = room.player[room.current];
        check(
          `提示的牌都在手里（seq=${pendingHintSeq}）`,
          cards.every((id: number) => cur.card.includes(id)),
          { cards, hand: cur.card },
        );
        if (hintLastCards) {
          const ok =
            mode === 'pdk'
              ? canBeatPdk(identifyPdk(cards, cur.card.length), identifyPdk(hintLastCards))
              : canBeat(identifyType(cards), identifyType(hintLastCards));
          check(`提示的牌能压上（seq=${pendingHintSeq}）`, ok, {
            cards,
            last: hintLastCards,
          });
        }
      }

      if (pendingHintSeq < 2 && data.total > 1) {
        sendHint(room, pendingHintSeq + 1);
        return;
      }

      // 提示用完 → 直接用提示的牌出，顺便验证服务端认这手牌
      pendingHintSeq = -1;
      hintTurns++;
      if (cards.length > 0) {
        send({ type: 'useCard', roomId, playerId: me, position: room.current, useCard: cards });
      } else {
        send({ type: 'onNotUseCard', roomId, playerId: me, position: room.current, useCard: [] });
      }
      return;
    }

    if (data.isError) {
      console.log(`  [服务端错误] ${data.message}`);
      errCount++;
      if (errCount <= 3) {
        actedKey = '';
        setTimeout(() => handleTurn(lastRoom), 300);
      }
      return;
    }
    if (!data.player || !Array.isArray(data.player)) return;

    lastRoom = data;

    // ---- roundLog 不变量 ----
    const round: any[] = data.round ?? [];
    const log: any[] = data.roundLog ?? [];
    check('roundLog 字段存在', Array.isArray(data.roundLog));
    if (Array.isArray(data.roundLog)) {
      check(
        'round 为空时 roundLog 也必须为空',
        !(round.length === 0 && log.length > 0),
        { round: round.length, log: log.length },
      );
      check(
        'roundLog 至少包含 round 的全部出牌',
        log.filter((e) => !e.pass).length >= round.length,
        { round: round.length, logPlays: log.filter((e) => !e.pass).length },
      );
      check(
        'pass 条目 useCard 必须为空',
        log.every((e) => !e.pass || (Array.isArray(e.useCard) && e.useCard.length === 0)),
      );
      const logPlays = log.filter((e) => !e.pass);
      check(
        'roundLog 里的出牌与 round 顺序一致',
        round.every((r, i) => {
          const l = logPlays[i];
          return l && l.useId === r.useId && l.useCard.join(',') === r.useCard.join(',');
        }),
      );
    }

    if (data.status === 'end') {
      ended = true;
      return;
    }

    handleTurn(data);
  });

  send({ type: 'onJoin', roomId, playerId: me, token: login.token });
  await new Promise((r) => setTimeout(r, 600));
  await post('/api/addAI', { roomId }, login.token);
  await post('/api/addAI', { roomId }, login.token);
  console.log('已加入 2 个 AI，等待对局…');

  const started = Date.now();
  const deadline = started + 180_000;
  while (!ended && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`对局结束，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
  check('对局正常结束', ended);
  check('至少验证过 1 个提示回合', hintTurns >= 1, { hintTurns });

  ws.close();
}

async function main() {
  await runGame('pdk');
  await runGame('ddz');
  console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
