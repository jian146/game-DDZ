import { getCardPoint } from './card';

/**
 * 跑得快（Pao De Kuai）规则模块
 * ------------------------------------------------------------------
 * 和斗地主的差异，全部集中在这个文件里，app.ts 只负责流程调度。
 *
 * 牌堆 48 张：去掉大小王、三张 2（保留黑桃 2）、一张 A（去掉方片 A）
 *   → 3 人各 16 张，正好发完
 *   → 四个 3 都在，所以「庄家有四个三就改判黑桃4」这条级联规则真的会触发
 *
 * 牌型：单张 / 对子 / 三张 / 三带一 / 三带二 / 顺子 / 连对 / 飞机 / 炸弹
 *   ① 三带二 的「二」可以是任意两张，不要求对子
 *   ② 裸三张（333 不带）只有「这一手打完就出完」时才允许
 *   ③ 连对 ≥2 对、顺子 ≥5 张、飞机 ≥2 组
 *   ④ 没有王炸（牌堆里没有王）
 */

// ============================
// 牌堆
// ============================

/** 从 52 张标准牌里剔掉的 id：红桃2 / 梅花2 / 方片2 / 方片A */
const PDK_EXCLUDED = new Set([26, 39, 52, 51]);

/** 跑得快 48 张牌堆（id 口径与 INIT_CARDS 一致） */
export const PDK_DECK: number[] = Array.from({ length: 52 }, (_, i) => i + 1).filter(
  (id) => !PDK_EXCLUDED.has(id),
);

/** 黑桃 3 的 id —— 首局庄家标记 */
export const SPADE_3 = 1;

/**
 * 每个点数对应的四张牌 id（黑桃/红桃/梅花/方片，步长 13）
 * 跑得快牌堆里 2 只剩一张，所以 rank 12 只会有 1 张
 */
const RANK_IDS: number[][] = Array.from({ length: 13 }, (_, r) => [
  r + 1,
  r + 14,
  r + 27,
  r + 40,
]);

/**
 * 定庄：从黑桃3开始，谁手里有这张牌谁就是庄家。
 * 如果庄家把这个点数的四张全抓在手里（例如四个 3），
 * 规则延续到下一点数（黑桃4），依此类推到黑桃2。
 *
 * @param hands 三个玩家的手牌（id 数组）
 * @returns 庄家索引 + 首出必须带的那张牌 id；找不到返回 null
 */
export function resolveBanker(hands: number[][]): { banker: number; markerId: number } | null {
  for (let rank = 0; rank < RANK_IDS.length; rank++) {
    const markerId = RANK_IDS[rank][0]; // 黑桃
    const holder = hands.findIndex((hand) => hand.includes(markerId));
    if (holder < 0) continue; // 这张牌不在牌堆里（例如唯一的 2 被剔掉了）

    // 庄家是否把这个点数的牌全抓了？全抓则顺延到下一点数
    const hasWholeRank = RANK_IDS[rank].every((id) => hands[holder].includes(id));
    if (hasWholeRank) continue;

    return { banker: holder, markerId };
  }
  return null;
}

// ============================
// 牌型
// ============================

export type PdkType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'tripleWith1'
  | 'tripleWith2'
  | 'straight'
  | 'consecutivePairs'
  | 'plane'
  | 'planeWith1'
  | 'planeWith2'
  | 'bomb'
  | 'unknown';

export interface PdkIdent {
  type: PdkType;
  /** 主牌点数（顺子取最大、连对取最大对、飞机取最小三张） */
  mainPoint: number;
  /** 主牌组长度（顺子张数、连对对数、飞机组数），单/对/三/炸为 1 或 4 */
  mainLen: number;
  cards: number[];
}

function unknown(cards: number[]): PdkIdent {
  return { type: 'unknown', mainPoint: 0, mainLen: 0, cards };
}

function groupByPoint(cards: number[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const id of cards) {
    const p = getCardPoint(id);
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(id);
  }
  return m;
}

function isConsecutive(sorted: number[]): boolean {
  if (sorted.length <= 1) return true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

/** 顺子 / 连对 / 飞机不能带 2（point 16） */
function belowTwo(points: number[]): boolean {
  return points.every((p) => p < 16);
}

/**
 * 识别一手牌
 *
 * @param cards 要出的牌
 * @param handLen 出牌人**出牌前**的手牌总数。
 *   裸三张只有在 handLen === cards.length（打完就出完）时才合法，
 *   所以这个参数必须传真实手牌数，不能省。
 */
export function identifyPdk(cards: number[], handLen: number = cards.length): PdkIdent {
  const n = cards.length;
  if (n === 0) return unknown(cards);

  const g = groupByPoint(cards);
  const points = [...g.keys()].sort((a, b) => a - b);
  const countOf = (p: number) => g.get(p)!.length;

  // ---------- 炸弹 ----------
  if (n === 4 && g.size === 1) {
    return { type: 'bomb', mainPoint: points[0], mainLen: 4, cards };
  }

  // ---------- 单张 ----------
  if (n === 1) {
    return { type: 'single', mainPoint: points[0], mainLen: 1, cards };
  }

  // ---------- 对子 ----------
  if (n === 2 && g.size === 1) {
    return { type: 'pair', mainPoint: points[0], mainLen: 1, cards };
  }

  // ---------- 三张（只有打完就出完才允许裸出）----------
  if (n === 3 && g.size === 1) {
    if (handLen === n) {
      return { type: 'triple', mainPoint: points[0], mainLen: 1, cards };
    }
    return unknown(cards);
  }

  // ---------- 三带一 ----------
  if (n === 4) {
    const triplePoint = points.find((p) => countOf(p) === 3);
    if (triplePoint !== undefined && g.size === 2) {
      return { type: 'tripleWith1', mainPoint: triplePoint, mainLen: 1, cards };
    }
  }

  // ---------- 三带二（带的两张任意，不要求是对子）----------
  if (n === 5) {
    const triplePoint = points.find((p) => countOf(p) === 3);
    if (triplePoint !== undefined) {
      const restCount = cards.length - countOf(triplePoint);
      if (restCount === 2) {
        return { type: 'tripleWith2', mainPoint: triplePoint, mainLen: 1, cards };
      }
    }
  }

  // ---------- 顺子 ≥5 ----------
  if (n >= 5 && g.size === n && belowTwo(points) && isConsecutive(points)) {
    return { type: 'straight', mainPoint: points[n - 1], mainLen: n, cards };
  }

  // ---------- 连对 ≥2 对 ----------
  if (n >= 4 && n % 2 === 0) {
    const allPairs = points.every((p) => countOf(p) === 2);
    if (allPairs && belowTwo(points) && isConsecutive(points)) {
      return {
        type: 'consecutivePairs',
        mainPoint: points[points.length - 1],
        mainLen: points.length,
        cards,
      };
    }
  }

  // ---------- 飞机（≥2 组连续三张）----------
  const triplePoints = points.filter((p) => countOf(p) >= 3).sort((a, b) => a - b);
  if (triplePoints.length >= 2 && belowTwo(triplePoints) && isConsecutive(triplePoints)) {
    const k = triplePoints.length;
    const used: number[] = [];
    for (const p of triplePoints) used.push(...g.get(p)!.slice(0, 3));
    const wings = cards.filter((id) => !used.includes(id));

    if (wings.length === 0) {
      return { type: 'plane', mainPoint: triplePoints[0], mainLen: k, cards };
    }
    // 飞机带单：k 张翅膀
    if (wings.length === k) {
      return { type: 'planeWith1', mainPoint: triplePoints[0], mainLen: k, cards };
    }
    // 飞机带对：2k 张翅膀且每个点数恰好两张
    if (wings.length === 2 * k) {
      const wingGroups = [...groupByPoint(wings).values()];
      if (wingGroups.every((ids) => ids.length === 2)) {
        return { type: 'planeWith2', mainPoint: triplePoints[0], mainLen: k, cards };
      }
    }
  }

  return unknown(cards);
}

/**
 * a 能不能压过 b
 *   炸弹 > 一切非炸弹；大炸弹 > 小炸弹
 *   其它必须同牌型 + 同主牌长度，比主牌点数
 */
export function canBeatPdk(a: PdkIdent, b: PdkIdent): boolean {
  if (a.type === 'unknown' || b.type === 'unknown') return false;

  if (a.type === 'bomb') {
    return b.type !== 'bomb' || a.mainPoint > b.mainPoint;
  }
  if (b.type === 'bomb') return false;

  if (a.type !== b.type) return false;
  if (a.mainLen !== b.mainLen) return false;
  return a.mainPoint > b.mainPoint;
}

// ============================
// 候选枚举（AI 决策 + 「能不能管上」判定共用）
// ============================

export interface PdkCandidate {
  cards: number[];
  ident: PdkIdent;
}

/**
 * 枚举手里所有合法出牌组合
 * 张数不多（16 张），直接暴力生成 + 去重，够用
 */
export function enumeratePdkAll(hand: number[]): PdkCandidate[] {
  const g = groupByPoint(hand);
  const points = [...g.keys()].sort((a, b) => a - b);
  const idsOf = (p: number) => g.get(p)!;
  const out: PdkCandidate[] = [];

  const push = (cards: number[]) => {
    const ident = identifyPdk(cards, hand.length);
    if (ident.type !== 'unknown') out.push({ cards, ident });
  };

  // 单张
  for (const p of points) push([idsOf(p)[0]]);

  // 对子
  for (const p of points) {
    if (idsOf(p).length >= 2) push(idsOf(p).slice(0, 2));
  }

  // 三张（只有打完就出完才合法，identifyPdk 内部会挡掉）
  for (const p of points) {
    if (idsOf(p).length >= 3) push(idsOf(p).slice(0, 3));
  }

  // 炸弹
  for (const p of points) {
    if (idsOf(p).length >= 4) push(idsOf(p).slice(0, 4));
  }

  // 三带一 / 三带二（三带二的「二」任意两张）
  for (const tp of points) {
    const tripleIds = idsOf(tp);
    if (tripleIds.length < 3) continue;
    const triple = tripleIds.slice(0, 3);

    // 带一张
    for (const p of points) {
      if (p === tp) continue;
      push([...triple, idsOf(p)[0]]);
    }

    // 带两张：从剩余牌里任取两张
    const rest = hand.filter((id) => !triple.includes(id));
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        push([...triple, rest[i], rest[j]]);
      }
    }
  }

  // 顺子 ≥5
  const straightPoints = points.filter((p) => p < 16);
  for (let start = 0; start < straightPoints.length; start++) {
    for (let len = 5; len <= straightPoints.length - start; len++) {
      const sub = straightPoints.slice(start, start + len);
      if (!isConsecutive(sub)) break;
      push(sub.map((p) => idsOf(p)[0]));
    }
  }

  // 连对 ≥2 对
  const pairPoints = points.filter((p) => p < 16 && idsOf(p).length >= 2);
  for (let start = 0; start < pairPoints.length; start++) {
    for (let len = 2; len <= pairPoints.length - start; len++) {
      const sub = pairPoints.slice(start, start + len);
      if (!isConsecutive(sub)) break;
      const cards: number[] = [];
      for (const p of sub) cards.push(...idsOf(p).slice(0, 2));
      push(cards);
    }
  }

  // 飞机（≥2 组）
  const triplePoints = points.filter((p) => p < 16 && idsOf(p).length >= 3);
  for (let start = 0; start < triplePoints.length; start++) {
    for (let len = 2; len <= triplePoints.length - start; len++) {
      const sub = triplePoints.slice(start, start + len);
      if (!isConsecutive(sub)) break;
      const body: number[] = [];
      for (const p of sub) body.push(...idsOf(p).slice(0, 3));
      push(body);

      const k = sub.length;
      const bodySet = new Set(body);
      const spare = hand.filter((id) => !bodySet.has(id));

      // 带单：任取 k 张
      if (spare.length >= k) {
        const take = spare.slice(0, k);
        push([...body, ...take]);
      }

      // 带对：任取 k 个不同点数的对子
      const sparePairs = points
        .filter((p) => !sub.includes(p))
        .map((p) => idsOf(p))
        .filter((ids) => ids.length >= 2);
      if (sparePairs.length >= k) {
        const wings = sparePairs.slice(0, k).flatMap((ids) => ids.slice(0, 2));
        push([...body, ...wings]);
      }
    }
  }

  // 去重
  const seen = new Set<string>();
  const deduped: PdkCandidate[] = [];
  for (const c of out) {
    const key = [...c.cards].sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

/**
 * 手里有没有能压过 last 的牌 —— 「能管必须管」的判定依据
 * 注意：炸弹也算，规则要求能炸必须炸
 */
export function hasAnyBeatPdk(hand: number[], last: PdkIdent): boolean {
  if (last.type === 'unknown') return false;
  return enumeratePdkAll(hand).some((c) => canBeatPdk(c.ident, last));
}

/** 仅保留能压过 last 的候选 */
export function enumeratePdkBeats(hand: number[], last: PdkIdent): PdkCandidate[] {
  return enumeratePdkAll(hand).filter((c) => canBeatPdk(c.ident, last));
}
