import { getCardPoint } from './card';
import { identifyType, type IdentifiedType, type CardType } from './identify';

/**
 * 从手里的牌枚举所有合法牌型（不考虑能不能压过上家）
 * 输出全部候选供后续打分筛选
 */

export interface Candidate {
  /** 实际的牌 */
  cards: number[];
  /** 识别出来的牌型 */
  ident: IdentifiedType;
}

/** 按 point 分组（返回 point → cardId[] 排序） */
function buildGroups(cards: number[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const id of cards) {
    const p = getCardPoint(id);
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(id);
  }
  // 每组内部按 id 升序
  for (const ids of m.values()) ids.sort((a, b) => a - b);
  return m;
}

/** 生成所有候选 */
export function enumerateAll(hand: number[]): Candidate[] {
  const groups = buildGroups(hand);
  const result: Candidate[] = [];

  const pointCardIds = (p: number): number[] => groups.get(p) ?? [];
  const allPoints = [...groups.keys()].sort((a, b) => a - b);
  const nonJokerPoints = allPoints.filter((p) => p < 17);
  const nonJokerSorted = nonJokerPoints;

  // ============ 简单牌型 ============

  // 单张：所有 point 的第一张
  for (const p of allPoints) {
    const ids = pointCardIds(p);
    result.push({ cards: [ids[0]], ident: identifyType([ids[0]]) });
  }

  // 对子：有 ≥2 张的 point 各取前 2
  for (const p of nonJokerSorted) {
    const ids = pointCardIds(p);
    if (ids.length >= 2) {
      result.push({ cards: ids.slice(0, 2), ident: identifyType(ids.slice(0, 2)) });
    }
  }

  // 三张：有 ≥3 张的 point 各取前 3
  for (const p of allPoints) {
    const ids = pointCardIds(p);
    if (ids.length >= 3) {
      result.push({ cards: ids.slice(0, 3), ident: identifyType(ids.slice(0, 3)) });
    }
  }

  // 炸弹：有 4 张的 point 取 4 张 + 王炸
  for (const p of allPoints) {
    const ids = pointCardIds(p);
    if (ids.length >= 4) {
      result.push({ cards: ids.slice(0, 4), ident: identifyType(ids.slice(0, 4)) });
    }
  }
  if (hand.includes(53) && hand.includes(54)) {
    result.push({ cards: [53, 54], ident: identifyType([53, 54]) });
  }

  // ============ 三带一 / 三带二 ============
  const triplePoints = allPoints.filter((p) => pointCardIds(p).length >= 3);
  for (const tp of triplePoints) {
    const tripleCards = pointCardIds(tp).slice(0, 3);
    // 三带一：任意一张非 triple 的单
    for (const p of allPoints) {
      if (p === tp) continue;
      const ids = pointCardIds(p);
      if (ids.length > 0) {
        result.push({
          cards: [...tripleCards, ids[0]],
          ident: identifyType([...tripleCards, ids[0]]),
        });
      }
    }
    // 三带二：任意一对非 triple 的对子
    for (const p of nonJokerSorted) {
      if (p === tp) continue;
      const ids = pointCardIds(p);
      if (ids.length >= 2) {
        result.push({
          cards: [...tripleCards, ...ids.slice(0, 2)],
          ident: identifyType([...tripleCards, ...ids.slice(0, 2)]),
        });
      }
    }
  }

  // ============ 顺子 5~12 ============
  // 从每个可能的起点开始，最长延伸
  // 起点必须在 nonJokerSorted 里
  for (let start = 0; start < nonJokerSorted.length; start++) {
    for (let len = 5; len <= nonJokerSorted.length - start; len++) {
      const sub = nonJokerSorted.slice(start, start + len);
      // 验证连续
      let ok = true;
      for (let i = 1; i < sub.length; i++) {
        if (sub[i] !== sub[i - 1] + 1) { ok = false; break; }
      }
      if (!ok) break; // 不再延伸
      // 每个 point 取第一张
      const cards: number[] = sub.map((p) => pointCardIds(p)[0]);
      result.push({ cards, ident: identifyType(cards) });
    }
  }

  // ============ 连对 3~10 ============
  // 先找出有 ≥2 张的 point 序列
  const pairAvailablePoints = nonJokerSorted.filter((p) => pointCardIds(p).length >= 2);
  for (let start = 0; start < pairAvailablePoints.length; start++) {
    for (let len = 3; len <= pairAvailablePoints.length - start; len++) {
      const sub = pairAvailablePoints.slice(start, start + len);
      let ok = true;
      for (let i = 1; i < sub.length; i++) {
        if (sub[i] !== sub[i - 1] + 1) { ok = false; break; }
      }
      if (!ok) break;
      const cards: number[] = [];
      for (const p of sub) cards.push(...pointCardIds(p).slice(0, 2));
      result.push({ cards, ident: identifyType(cards) });
    }
  }

  // ============ 飞机（不带牌）2~5 ============
  const tripleAvailablePoints = nonJokerSorted.filter((p) => pointCardIds(p).length >= 3);
  for (let start = 0; start < tripleAvailablePoints.length; start++) {
    for (let len = 2; len <= tripleAvailablePoints.length - start; len++) {
      const sub = tripleAvailablePoints.slice(start, start + len);
      let ok = true;
      for (let i = 1; i < sub.length; i++) {
        if (sub[i] !== sub[i - 1] + 1) { ok = false; break; }
      }
      if (!ok) break;
      const cards: number[] = [];
      for (const p of sub) cards.push(...pointCardIds(p).slice(0, 3));
      result.push({ cards, ident: identifyType(cards) });

      // 飞机带单：每架飞机 + 1 张单
      const n = sub.length;
      // 带的单不能来自飞机的三张（已经用了），也可以来自飞机 point 但必须是第 4+ 张
      // 简化：找 n 张"不在飞机里的单"
      const planeCardSet = new Set(cards);
      const availableSingles: number[] = [];
      for (const p of allPoints) {
        for (const id of pointCardIds(p)) {
          if (!planeCardSet.has(id)) availableSingles.push(id);
        }
      }
      if (availableSingles.length >= n) {
        // 取前 n 张（贪心）
        const take = availableSingles.slice(0, n);
        result.push({ cards: [...cards, ...take], ident: identifyType([...cards, ...take]) });
      }

      // 飞机带对：n 架飞机 + n 对
      const availablePairs: number[][] = [];
      for (const p of nonJokerSorted) {
        if (sub.includes(p)) continue; // 飞机 point 跳过
        const ids = pointCardIds(p);
        if (ids.length >= 2) availablePairs.push(ids.slice(0, 2));
      }
      if (availablePairs.length >= n) {
        const pairs = availablePairs.slice(0, n).flat();
        result.push({ cards: [...cards, ...pairs], ident: identifyType([...cards, ...pairs]) });
      }
    }
  }

  // ============ 去重：cards 相同的只保留一个 ============
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const c of result) {
    const key = c.cards.slice().sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  // ============ 过滤掉识别类型是 unknown 的（保险） ============
  return deduped.filter((c) => c.ident.type !== 'unknown');
}

/**
 * 仅生成能压过 lastPlay 的候选
 */
export function enumerateBeatCandidates(
  hand: number[],
  lastPlayType: IdentifiedType,
): Candidate[] {
  const all = enumerateAll(hand);
  return all.filter((c) => {
    // 同类型且更大（如对手是对子，这里必须是更大的对子；不能是炸弹压）
    // 或者炸弹 / 王炸（压一切）
    if (c.ident.type === 'joker22') return true;
    if (c.ident.type === 'bomb') {
      // 炸弹只能压非炸弹，或者更大的炸弹
      if (lastPlayType.type !== 'bomb') return true;
      return c.ident.mainPoint > lastPlayType.mainPoint;
    }
    // 其它牌型：必须同类型 + 同长度 + 更大 mainPoint
    if (c.ident.type !== lastPlayType.type) return false;
    if (c.ident.mainLen !== lastPlayType.mainLen) return false;
    return c.ident.mainPoint > lastPlayType.mainPoint;
  });
}
