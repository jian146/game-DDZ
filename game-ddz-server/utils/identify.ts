import { getCardPoint } from './card';

/**
 * 完整牌型识别器
 * 与前端 douDiZhu.tsx 里的 ruleList 口径一致
 *
 * 牌型枚举：
 *   joker22       王炸 (大小王)
 *   bomb          炸弹 (4 张同 point)
 *   single        单张
 *   pair          对子 (不含王炸)
 *   triple        纯三张
 *   tripleWith1   三带一 (三张 + 1 单张)
 *   tripleWith2   三带二 (三张 + 1 对子)
 *   straight      顺子 (≥5 连续单, 不含 2/王)
 *   consecutivePairs  连对 (≥3 连续对子, 不含 2/王)
 *   plane         飞机 (≥2 连续三张, 不带牌)
 *   planeWith1    飞机带单 (n 飞机 + n 单张)
 *   planeWith2    飞机带对 (n 飞机 + n 对子)
 */

export type CardType =
  | 'joker22'
  | 'bomb'
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
  | 'unknown';

export interface IdentifiedType {
  type: CardType;
  /** 主牌点数：顺子最大、对子点数、三张点数、炸弹点数、飞机最小三张点数 */
  mainPoint: number;
  /** 主牌组的长度（顺子 5/6/7/8/9/10/12，连对 3/4/5/6，飞机 2/3/4） */
  mainLen: number;
  /** 原始 cards */
  cards: number[];
}

/** 按 point 分组 */
function groupByPoint(cards: number[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const id of cards) {
    const p = getCardPoint(id);
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(id);
  }
  return m;
}

/** 排序后的 point 数组 */
function sortedPoints(cards: number[]): number[] {
  return [...groupByPoint(cards).keys()].sort((a, b) => a - b);
}

/** 判断一组连续 point */
function isConsecutive(points: number[]): boolean {
  if (points.length <= 1) return true;
  for (let i = 1; i < points.length; i++) {
    if (points[i] !== points[i - 1] + 1) return false;
  }
  return true;
}

/** 不含 2(16) 和 王(17/18) */
function noTwoOrJoker(points: number[]): boolean {
  return points.every((p) => p < 16);
}

/** 王炸？ */
function checkJoker22(cards: number[]): IdentifiedType | null {
  if (cards.length === 2 && cards.includes(53) && cards.includes(54)) {
    return { type: 'joker22', mainPoint: 18, mainLen: 1, cards };
  }
  return null;
}

/** 炸弹？ */
function checkBomb(cards: number[]): IdentifiedType | null {
  if (cards.length !== 4) return null;
  const grouped = groupByPoint(cards);
  if (grouped.size === 1) {
    const p = [...grouped.keys()][0];
    return { type: 'bomb', mainPoint: p, mainLen: 4, cards };
  }
  return null;
}

/** 单张 */
function checkSingle(cards: number[]): IdentifiedType | null {
  if (cards.length === 1) {
    return { type: 'single', mainPoint: getCardPoint(cards[0]), mainLen: 1, cards };
  }
  return null;
}

/** 对子 */
function checkPair(cards: number[]): IdentifiedType | null {
  if (cards.length !== 2) return null;
  const grouped = groupByPoint(cards);
  if (grouped.size === 1) {
    const p = [...grouped.keys()][0];
    if (p >= 17) return null; // 王不算对子（大小王是王炸）
    return { type: 'pair', mainPoint: p, mainLen: 1, cards };
  }
  return null;
}

/** 三张 */
function checkTriple(cards: number[]): IdentifiedType | null {
  if (cards.length !== 3) return null;
  const grouped = groupByPoint(cards);
  if (grouped.size === 1) {
    const p = [...grouped.keys()][0];
    return { type: 'triple', mainPoint: p, mainLen: 1, cards };
  }
  return null;
}

/** 三带一 */
function checkTripleWith1(cards: number[]): IdentifiedType | null {
  if (cards.length !== 4) return null;
  const grouped = groupByPoint(cards);
  const groups = [...grouped.entries()];
  // 结构: 3 + 1
  const triple = groups.find(([, ids]) => ids.length === 3);
  const single = groups.find(([, ids]) => ids.length === 1);
  if (triple && single) {
    return { type: 'tripleWith1', mainPoint: triple[0], mainLen: 1, cards };
  }
  return null;
}

/** 三带二 */
function checkTripleWith2(cards: number[]): IdentifiedType | null {
  if (cards.length !== 5) return null;
  const grouped = groupByPoint(cards);
  const groups = [...grouped.entries()];
  const triple = groups.find(([, ids]) => ids.length === 3);
  const pair = groups.find(([, ids]) => ids.length === 2);
  if (triple && pair) {
    return { type: 'tripleWith2', mainPoint: triple[0], mainLen: 1, cards };
  }
  return null;
}

/** 顺子 ≥5 */
function checkStraight(cards: number[]): IdentifiedType | null {
  if (cards.length < 5) return null;
  const points = sortedPoints(cards);
  if (!noTwoOrJoker(points)) return null;
  if (!isConsecutive(points)) return null;
  if (groupByPoint(cards).size !== cards.length) return null; // 每个 point 只能出现一次
  return { type: 'straight', mainPoint: points[points.length - 1], mainLen: points.length, cards };
}

/** 连对 ≥3 对 */
function checkConsecutivePairs(cards: number[]): IdentifiedType | null {
  if (cards.length < 6 || cards.length % 2 !== 0) return null;
  const grouped = groupByPoint(cards);
  const points = [...grouped.entries()].filter(([, ids]) => ids.length === 2).map(([p]) => p).sort((a, b) => a - b);
  if (points.length !== cards.length / 2) return null;
  if (!noTwoOrJoker(points)) return null;
  if (!isConsecutive(points)) return null;
  return { type: 'consecutivePairs', mainPoint: points[points.length - 1], mainLen: points.length, cards };
}

/**
 * 飞机（不带牌 / 带单 / 带对）
 * 先抽所有三张组，看是不是连续的
 */
function checkPlane(cards: number[]): IdentifiedType | null {
  const grouped = groupByPoint(cards);
  const tripleGroups = [...grouped.entries()].filter(([, ids]) => ids.length >= 3).sort((a, b) => a[0] - b[0]);
  const triplePoints = tripleGroups.map(([p]) => p);

  if (triplePoints.length < 2) return null;
  if (!noTwoOrJoker(triplePoints)) return null;
  if (!isConsecutive(triplePoints)) return null;

  // 取出所有三张
  const tripleCards: number[] = [];
  for (const [, ids] of tripleGroups) {
    tripleCards.push(...ids.slice(0, 3));
  }

  const restCards = cards.filter((id) => !tripleCards.includes(id));
  const n = triplePoints.length;

  if (restCards.length === 0) {
    // 纯飞机
    return { type: 'plane', mainPoint: triplePoints[0], mainLen: n, cards };
  }

  // 飞机带单：剩余 n 张，且每张 point 独立（或可重复的单）
  if (restCards.length === n) {
    // 带单：允许相同 point
    // 但不能出现又组成三张的情况（如果 restCards 里有三张同 point 就不对了）
    const restGrouped = groupByPoint(restCards);
    const hasTripleInRest = [...restGrouped.values()].some((ids) => ids.length >= 3);
    if (!hasTripleInRest) {
      return { type: 'planeWith1', mainPoint: triplePoints[0], mainLen: n, cards };
    }
  }

  // 飞机带对：剩余 2n 张，且每个 point 恰好 2 张
  if (restCards.length === 2 * n) {
    const restGrouped = groupByPoint(restCards);
    const allPairs = [...restGrouped.values()].every((ids) => ids.length === 2);
    if (allPairs) {
      return { type: 'planeWith2', mainPoint: triplePoints[0], mainLen: n, cards };
    }
  }

  return null;
}

/** 识别牌型入口（按优先级：王炸 > 炸弹 > 其它） */
export function identifyType(cards: number[]): IdentifiedType {
  if (cards.length === 0) return { type: 'unknown', mainPoint: 0, mainLen: 0, cards };

  // 炸弹类
  const j22 = checkJoker22(cards);
  if (j22) return j22;
  const bomb = checkBomb(cards);
  if (bomb) return bomb;

  // 简单牌型
  const single = checkSingle(cards);
  if (single) return single;
  const pair = checkPair(cards);
  if (pair) return pair;
  const triple = checkTriple(cards);
  if (triple) return triple;
  const tWith1 = checkTripleWith1(cards);
  if (tWith1) return tWith1;
  const tWith2 = checkTripleWith2(cards);
  if (tWith2) return tWith2;

  // 复杂牌型
  const straight = checkStraight(cards);
  if (straight) return straight;
  const pairs = checkConsecutivePairs(cards);
  if (pairs) return pairs;
  const plane = checkPlane(cards);
  if (plane) return plane;

  return { type: 'unknown', mainPoint: 0, mainLen: 0, cards };
}

/**
 * 能不能压过：返回 true 表示 a 能压 b
 * 规则：
 *   王炸 > 炸弹 > 其它牌型
 *   同类型且同结构（相同 type + 相同 mainLen），a.mainPoint > b.mainPoint
 *   炸弹压非炸弹、更大炸弹压更小炸弹
 *   非炸弹非王炸的不同类型之间不能互压
 */
export function canBeat(a: IdentifiedType, b: IdentifiedType): boolean {
  if (a.type === 'unknown' || b.type === 'unknown') return false;

  // a 是王炸，压一切
  if (a.type === 'joker22') return true;

  // a 是炸弹
  if (a.type === 'bomb') {
    return b.type !== 'joker22' && (b.type !== 'bomb' || a.mainPoint > b.mainPoint);
  }

  // 非炸弹 / 非王炸
  if (b.type === 'joker22' || b.type === 'bomb') return false;

  // 必须同类型 + 同结构
  if (a.type !== b.type) return false;
  if (a.mainLen !== b.mainLen) return false;

  return a.mainPoint > b.mainPoint;
}
