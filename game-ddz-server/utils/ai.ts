import { getCardPoint } from './card';
import { identifyType, canBeat, type IdentifiedType } from './identify';
import { enumerateAll, enumerateBeatCandidates, type Candidate } from './enumerate';

/**
 * AI 决策模块 v3 —— 完整牌型识别 + 贪心打分
 *
 * 策略：
 *   1. 自由出牌（没人出过 / 清空后）：枚举全部候选 → 打分 → 选最优
 *   2. 压牌：枚举能压过 lastPlay 的候选 → 打分 → 选最优；压不上就 pass
 *   3. 残局（剩 ≤ 5 张）：强制枚举"一手能出完"的组合优先
 *
 * 打分维度（越大越好）：
 *   - winNow: 出完手中牌数是否刚好 0（∞）
 *   - remainingFriendly: 出完后剩余牌数（越小越好，越大分）
 *   - pointValue: 打出的牌主牌点数（越小越好，保留大牌）
 *   - typeBonus: 复杂牌型小加分（鼓励出牌）
 */

export type AIDecision =
  | { action: 'callLandlord' }
  | { action: 'noCall' }
  | { action: 'playCards'; cards: number[] }
  | { action: 'pass' };

// ============ 叫地主（保留原逻辑，够用） ============

function scoreForCalling(cards: number[]): number {
  let score = 0;
  const hasSmallJoker = cards.includes(53);
  const hasBigJoker = cards.includes(54);
  if (hasSmallJoker && hasBigJoker) score += 15;
  else if (hasBigJoker) score += 8;
  else if (hasSmallJoker) score += 6;
  const numTwos = cards.filter((id) => getCardPoint(id) === 16).length;
  score += numTwos * 4;
  const pointCount = new Map<number, number>();
  for (const id of cards) {
    const p = getCardPoint(id);
    pointCount.set(p, (pointCount.get(p) ?? 0) + 1);
  }
  for (const cnt of pointCount.values()) {
    if (cnt === 4) score += 6;
  }
  const numA = cards.filter((id) => getCardPoint(id) === 14).length;
  const numK = cards.filter((id) => getCardPoint(id) === 13).length;
  score += numA * 2 + numK * 1;
  return score;
}

export function decideCallLandlord(
  cards: number[],
  callCount: number,
): 'call' | 'noCall' {
  const score = scoreForCalling(cards);
  const threshold = callCount === 1 ? 14 : callCount === 2 ? 10 : 6;
  const finalScore = score + Math.floor(Math.random() * 4);
  return finalScore >= threshold ? 'call' : 'noCall';
}

// ============ 打分函数 ============

/**
 * 对一个候选出牌打分数（越大越好）
 * 自由出牌 & 压牌共用这个打分
 */
function scoreCandidate(
  candidate: Candidate,
  hand: number[],
  oppRemainingMin?: number,
): number {
  const remaining = hand.length - candidate.cards.length;
  const ident = candidate.ident;

  // 1. 一手出完（必胜！）
  if (remaining === 0) return 100000;

  // 2. 残局：出完 ≤ 2 张 → 非常好的选择
  if (remaining <= 2) return 50000 - remaining * 1000;

  let score = 0;

  // 3. 剩余牌越少越好（线性鼓励）
  score += (hand.length - remaining) * 2;

  // 4. 大牌惩罚：主牌点数越大，越不爱出
  //    打出去的主牌点数越高，手里剩下的大牌越少 → 不太好
  score -= ident.mainPoint * 1;

  // 5. 炸弹/王炸惩罚：非必要别用（压牌时除外）
  if (ident.type === 'joker22') score -= 50;
  if (ident.type === 'bomb') score -= 30;

  // 6. 复杂牌型小加分（鼓励顺子/连对/飞机等一次出多张）
  if (ident.type === 'straight' && ident.mainLen >= 6) score += 5;
  if (ident.type === 'consecutivePairs' && ident.mainLen >= 4) score += 5;
  if (ident.type.startsWith('plane')) score += 8;

  // 7. 如果知道对手快出完了，加分（愿意出大牌压）
  if (oppRemainingMin !== undefined && oppRemainingMin <= 2) {
    // 出大牌没关系，因为要压对手
    score += ident.mainPoint * 0.5;
    // 王炸/炸弹在残局对手快赢时反而加分！
    if (ident.type === 'joker22') score += 50;
    if (ident.type === 'bomb') score += 20;
  }

  return score;
}

// ============ 主决策入口 ============

export function decideAI(
  cards: number[],
  lastPlay: number[] | null,
  callPhase: boolean,
  callCount: number,
): AIDecision {
  // 叫地主阶段
  if (callPhase) {
    const r = decideCallLandlord(cards, callCount);
    return r === 'call' ? { action: 'callLandlord' } : { action: 'noCall' };
  }

  // 自由出牌
  if (!lastPlay || lastPlay.length === 0) {
    return decideFreePlay(cards);
  }

  // 压牌
  return decideBeatPlay(cards, lastPlay);
}

/** 自由出牌 */
function decideFreePlay(cards: number[]): AIDecision {
  const candidates = enumerateAll(cards);
  if (candidates.length === 0) {
    // 理论上不可能（单张总能出）
    return { action: 'pass' };
  }

  // 打分排序
  candidates.sort((a, b) => scoreCandidate(b, cards) - scoreCandidate(a, cards));

  const best = candidates[0];
  console.log(
    `[AI-free] 最优: ${best.ident.type}(main=${best.ident.mainPoint}, len=${best.ident.mainLen}), ` +
    `剩余 ${cards.length - best.cards.length} 张, 打出 ${best.cards.length} 张, 总候选数=${candidates.length}`,
  );
  return { action: 'playCards', cards: best.cards };
}

/** 压牌 */
function decideBeatPlay(cards: number[], lastPlay: number[]): AIDecision {
  const lastType = identifyType(lastPlay);

  // 如果上家是王炸 → 压不上，pass
  if (lastType.type === 'joker22') {
    console.log('[AI-beat] 上家是王炸，pass');
    return { action: 'pass' };
  }

  const candidates = enumerateBeatCandidates(cards, lastType);

  if (candidates.length === 0) {
    console.log('[AI-beat] 没有能压的，pass');
    return { action: 'pass' };
  }

  // 打分排序
  candidates.sort((a, b) => scoreCandidate(b, cards) - scoreCandidate(a, cards));

  const best = candidates[0];
  console.log(
    `[AI-beat] 最优: ${best.ident.type}(main=${best.ident.mainPoint}, len=${best.ident.mainLen}), ` +
    `vs 上家 ${lastType.type}(main=${lastType.mainPoint}, len=${lastType.mainLen})`,
  );
  return { action: 'playCards', cards: best.cards };
}
