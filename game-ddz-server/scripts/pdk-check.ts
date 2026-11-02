import { getCardPoint } from '../utils/card';
import {
  PDK_DECK,
  resolveBanker,
  identifyPdk,
  canBeatPdk,
  hasAnyBeatPdk,
  enumeratePdkAll,
} from '../utils/pdk';

let pass = 0;
let fail = 0;

function eq(name: string, actual: any, expect: any) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expect);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log(`✗ ${name}\n   实际 ${a}\n   期望 ${e}`);
  }
}

/** 按点数找 id：3→1, 4→2 ... 2→13；第 n 个花色 +13 */
const id = (point: number, suit = 0) => {
  const rank = point === 16 ? 12 : point - 3;
  return rank + 1 + suit * 13;
};

// ============ 1. 牌堆 ============
eq('牌堆张数', PDK_DECK.length, 48);
eq('牌堆无王', PDK_DECK.filter((i) => i >= 53).length, 0);

const countOfPoint = (p: number) => PDK_DECK.filter((i) => getCardPoint(i) === p).length;
eq('3 有四张', countOfPoint(3), 4);
eq('2 只剩一张', countOfPoint(16), 1);
eq('A 只剩三张', countOfPoint(14), 3);
eq('K 有四张', countOfPoint(13), 4);
eq('黑桃3 在牌堆里', PDK_DECK.includes(1), true);

// ============ 2. 定庄 ============
{
  // 常规：黑桃3 在 1 号位
  const hands = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  eq('定庄·常规', resolveBanker(hands), { banker: 0, markerId: 1 });
}
{
  // 0 号位抓了四个 3 → 顺延到黑桃4
  const hands = [
    [1, 14, 27, 40, 9, 10],
    [2, 3, 4],
    [5, 6, 7],
  ];
  eq('定庄·四个3顺延黑桃4', resolveBanker(hands), { banker: 1, markerId: 2 });
}
{
  // 0 号位四个3、1 号位四个4 → 再顺延到黑桃5
  const hands = [
    [1, 14, 27, 40],
    [2, 15, 28, 41],
    [3, 4, 5],
  ];
  eq('定庄·级联到黑桃5', resolveBanker(hands), { banker: 2, markerId: 3 });
}
{
  // 黑桃3 在 1 号位但只拿了两张 3 → 不触发顺延
  const hands = [
    [9, 10],
    [1, 14, 2],
    [3, 4],
  ];
  eq('定庄·只有两张3不顺延', resolveBanker(hands), { banker: 1, markerId: 1 });
}

// ============ 3. 牌型识别 ============
const t = (cards: number[], handLen?: number) =>
  identifyPdk(cards, handLen ?? cards.length).type;

eq('单张', t([id(3)]), 'single');
eq('对子', t([id(3), id(3, 1)]), 'pair');
eq('炸弹', t([id(3), id(3, 1), id(3, 2), id(3, 3)]), 'bomb');

// 裸三张：只有打完就出完才允许
eq('裸三张·手牌正好3张', t([id(5), id(5, 1), id(5, 2)], 3), 'triple');
eq('裸三张·手里还有别的牌', t([id(5), id(5, 1), id(5, 2)], 10), 'unknown');

// 三带一
eq('三带一', t([id(5), id(5, 1), id(5, 2), id(9)]), 'tripleWith1');

// 三带二：带的两张可以不是对子
eq('三带二·散牌', t([id(5), id(5, 1), id(5, 2), id(9), id(11)]), 'tripleWith2');
eq('三带二·对子', t([id(5), id(5, 1), id(5, 2), id(9), id(9, 1)]), 'tripleWith2');

// 顺子
eq('顺子5张', t([id(3), id(4), id(5), id(6), id(7)]), 'straight');
eq('顺子4张不算', t([id(3), id(4), id(5), id(6)]), 'unknown');
eq('顺子不能带2', t([id(10), id(11), id(12), id(13), id(14), id(16)]), 'unknown');

// 连对：2 对即可
eq('连对2对', t([id(3), id(3, 1), id(4), id(4, 1)]), 'consecutivePairs');
eq('连对3对', t([id(3), id(3, 1), id(4), id(4, 1), id(5), id(5, 1)]), 'consecutivePairs');

// 飞机
eq('飞机2组', t([id(3), id(3, 1), id(3, 2), id(4), id(4, 1), id(4, 2)]), 'plane');
eq(
  '飞机带单',
  t([id(3), id(3, 1), id(3, 2), id(4), id(4, 1), id(4, 2), id(9), id(10)]),
  'planeWith1',
);
eq(
  '飞机带对',
  t([
    id(3), id(3, 1), id(3, 2),
    id(4), id(4, 1), id(4, 2),
    id(9), id(9, 1), id(10), id(10, 1),
  ]),
  'planeWith2',
);

// ============ 4. 压牌 ============
const ident = (cards: number[], handLen?: number) => identifyPdk(cards, handLen ?? cards.length);

eq('大对压小对', canBeatPdk(ident([id(4), id(4, 1)]), ident([id(3), id(3, 1)])), true);
eq('小对压不了大对', canBeatPdk(ident([id(3), id(3, 1)]), ident([id(4), id(4, 1)])), false);
eq(
  '炸弹压对子',
  canBeatPdk(ident([id(3), id(3, 1), id(3, 2), id(3, 3)]), ident([id(14), id(14, 1)])),
  true,
);
eq(
  '大炸弹压小炸弹',
  canBeatPdk(
    ident([id(4), id(4, 1), id(4, 2), id(4, 3)]),
    ident([id(3), id(3, 1), id(3, 2), id(3, 3)]),
  ),
  true,
);
eq(
  '对子压不了单张',
  canBeatPdk(ident([id(9), id(9, 1)]), ident([id(3)])),
  false,
);
eq(
  '三带二压三带一（牌型不同）',
  canBeatPdk(
    ident([id(9), id(9, 1), id(9, 2), id(5), id(6)]),
    ident([id(3), id(3, 1), id(3, 2), id(7)]),
  ),
  false,
);

// ============ 5. 能管必须管 ============
{
  const hand = [id(4), id(4, 1), id(9), id(10)];
  const last = ident([id(3), id(3, 1)]);
  eq('手里有更大的对子 → 必须管', hasAnyBeatPdk(hand, last), true);
}
{
  const hand = [id(3), id(5), id(9), id(10)];
  const last = ident([id(4), id(4, 1)]);
  eq('手里凑不出对子 → 可以不要', hasAnyBeatPdk(hand, last), false);
}
{
  // 只有炸弹能管：也必须炸
  const hand = [id(9), id(9, 1), id(9, 2), id(9, 3), id(5)];
  const last = ident([id(3), id(3, 1)]);
  eq('只有炸弹能管 → 也必须炸', hasAnyBeatPdk(hand, last), true);
}

// ============ 6. 枚举 ============
{
  const hand = [id(3), id(3, 1), id(4), id(4, 1), id(9)];
  const all = enumeratePdkAll(hand);
  eq('枚举结果非空', all.length > 0, true);
  eq('枚举无 unknown', all.every((c) => c.ident.type !== 'unknown'), true);
  eq(
    '枚举里没有裸三张（手牌5张，三张打完还剩2张）',
    all.some((c) => c.ident.type === 'triple'),
    false,
  );
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
