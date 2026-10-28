// Knuth-Durstenfeld shuffle 的 ES6 实现 洗牌算法
const shuffle4 = (arr: number[]) => {
  let len = arr.length;
  let random: number;
  while (len != 0) {
    // 无符号右移位运算符向下取整
    random = (Math.random() * len--) >>> 0;
    // ES6结构赋值实现变量互换
    [arr[len], arr[random]] = [arr[random], arr[len]];
  }
  return arr;
};

export const shuffleCard = (cardlist: number[]) => {
  return shuffle4(cardlist);
};

// 摸牌
export const getCard = (count: number, cardList: number[]) => {
  return cardList.splice(0, count);
};

/**
 * 获取 x 和 y 之间随机数（ra >= x && ra <= y）
 */
export const getRoundNumber = (x: number, y: number) => {
  return Math.round(Math.random() * (y - x) + x);
};

/**
 * 牌 id → 点数 point
 * - 单张数字牌 point: 3,4,5,6,7,8,9,10,J(11),Q(12),K(13),A(14),2(16)
 * - 小王 point: 17, 大王 point: 18
 */
export const getCardPoint = (id: number): number => {
  if (id === 53) return 17; // 小王
  if (id === 54) return 18; // 大王
  // id 1-52: 4 组 × 13 张，每组 point 序列相同
  const rankIndex = (id - 1) % 13;
  const pointMap = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
  return pointMap[rankIndex];
};

/**
 * 同 point 的所有 card id（可能多种花色）
 */
export const getCardsByPoint = (
  cardIds: number[],
  point: number,
): number[] => {
  return cardIds.filter((id) => getCardPoint(id) === point);
};
