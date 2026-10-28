export type T_decorStr = 'spade' | 'heart' | 'plumBlossom' | 'block'
export type T_cardColor = 0 | 1 | 2 | 3//花色  黑桃 红桃 梅花 方片
export interface I_Card {
    id: number
    point: number,
    name: string,
    color: T_cardColor//花色  黑桃 红桃 梅花 方片
}

/**
 * 完整 54 张牌数据（4 花色 × 13 点数 + 大小王）
 * 与后端 cardIdList 一一对应：id 即为牌的 ID
 * - 点数 point：3=3, 4=4, ..., 14=A, 16=2, 17=小王, 18=大王
 * - 花色 color：0=黑桃, 1=红桃, 2=梅花, 3=方片
 */
export const INIT_CARDS: I_Card[] = [
  { id: 1,  point: 3,  name: "3",  color: 0 },
  { id: 2,  point: 4,  name: "4",  color: 0 },
  { id: 3,  point: 5,  name: "5",  color: 0 },
  { id: 4,  point: 6,  name: "6",  color: 0 },
  { id: 5,  point: 7,  name: "7",  color: 0 },
  { id: 6,  point: 8,  name: "8",  color: 0 },
  { id: 7,  point: 9,  name: "9",  color: 0 },
  { id: 8,  point: 10, name: "10", color: 0 },
  { id: 9,  point: 11, name: "J",  color: 0 },
  { id: 10, point: 12, name: "Q",  color: 0 },
  { id: 11, point: 13, name: "K",  color: 0 },
  { id: 12, point: 14, name: "A",  color: 0 },
  { id: 13, point: 16, name: "2",  color: 0 },
  { id: 14, point: 3,  name: "3",  color: 1 },
  { id: 15, point: 4,  name: "4",  color: 1 },
  { id: 16, point: 5,  name: "5",  color: 1 },
  { id: 17, point: 6,  name: "6",  color: 1 },
  { id: 18, point: 7,  name: "7",  color: 1 },
  { id: 19, point: 8,  name: "8",  color: 1 },
  { id: 20, point: 9,  name: "9",  color: 1 },
  { id: 21, point: 10, name: "10", color: 1 },
  { id: 22, point: 11, name: "J",  color: 1 },
  { id: 23, point: 12, name: "Q",  color: 1 },
  { id: 24, point: 13, name: "K",  color: 1 },
  { id: 25, point: 14, name: "A",  color: 1 },
  { id: 26, point: 16, name: "2",  color: 1 },
  { id: 27, point: 3,  name: "3",  color: 2 },
  { id: 28, point: 4,  name: "4",  color: 2 },
  { id: 29, point: 5,  name: "5",  color: 2 },
  { id: 30, point: 6,  name: "6",  color: 2 },
  { id: 31, point: 7,  name: "7",  color: 2 },
  { id: 32, point: 8,  name: "8",  color: 2 },
  { id: 33, point: 9,  name: "9",  color: 2 },
  { id: 34, point: 10, name: "10", color: 2 },
  { id: 35, point: 11, name: "J",  color: 2 },
  { id: 36, point: 12, name: "Q",  color: 2 },
  { id: 37, point: 13, name: "K",  color: 2 },
  { id: 38, point: 14, name: "A",  color: 2 },
  { id: 39, point: 16, name: "2",  color: 2 },
  { id: 40, point: 3,  name: "3",  color: 3 },
  { id: 41, point: 4,  name: "4",  color: 3 },
  { id: 42, point: 5,  name: "5",  color: 3 },
  { id: 43, point: 6,  name: "6",  color: 3 },
  { id: 44, point: 7,  name: "7",  color: 3 },
  { id: 45, point: 8,  name: "8",  color: 3 },
  { id: 46, point: 9,  name: "9",  color: 3 },
  { id: 47, point: 10, name: "10", color: 3 },
  { id: 48, point: 11, name: "J",  color: 3 },
  { id: 49, point: 12, name: "Q",  color: 3 },
  { id: 50, point: 13, name: "K",  color: 3 },
  { id: 51, point: 14, name: "A",  color: 3 },
  { id: 52, point: 16, name: "2",  color: 3 },
  { id: 53, point: 17, name: "小王", color: 0 },
  { id: 54, point: 18, name: "大王", color: 1 },
];

//洗牌
export const shuffleCard = <T>(cardlist: T[]) => {
    return shuffle4(cardlist);
};

/**
 * 根据牌的id获取牌的数据
 * @param cardIdList 牌的id
 * @param initCard 整幅牌
 * @returns 
 */
export  const getMyCard=(cardIdList: number[],initCard: I_Card[])=>{
    const useCard: I_Card[] = [];

    cardIdList.forEach((element) => {
      useCard.push(initCard[element - 1]);
    });
    return useCard.sort((a, b) => a.point - b.point);
  }

/**
* Knuth-Durstenfeld shuffle 的 ES6 实现 洗牌算法
* @param arr 要排序的数组
* @returns
*/
export const shuffle4 = <T>(arr: T[]) => {
    let len = arr.length,
        random;
    while (len != 0) {
        random = (Math.random() * len--) >>> 0; // 无符号右移位运算符向下取整(注意这里必须加分号，否则报错)
        [arr[len], arr[random]] = [arr[random], arr[len]]; // ES6的结构赋值实现变量互换
    }
    return arr;
};

//摸牌
export const getCard = (count: number, cardList: I_Card[]) => {
    return cardList.splice(0, count)

}

export const groupByPoint = (cardList: I_Card[]) => {
    const keyList: I_Card[][] = []
    cardList.forEach(item => {
        if (keyList.length === 0) {
            keyList.push([item])
        } else {

        }

    })
}

export const groupBy = <T>(list: T[], attr: string) => {
    const groups: any = {};
    list.forEach((o: any) => {
        const value = o[attr];
        groups[value] = groups[value] || [];
        groups[value].push(o);
    });
    // return Object.keys(groups).map(function (group) {
    //     return groups[group];
    // });
    return groups;
}
//根据数量分组
export interface I_groupCountData {
    4: I_Card[][];
    3: I_Card[][];
    2: I_Card[][];
    1: I_Card[][];
    [propName: string]: any;
}

/**
 * 
 * @param useCard 要分组的牌
 * @returns 
 */
export const getGroupData = (useCard: I_Card[]): I_groupCountData => {
    const groupData = groupBy(useCard, 'point');

    const backData: I_groupCountData = {
        4:[],
        3: [],
        2: [],
        1: [],
    };
    Object.keys(groupData).forEach((key) => {
        if (groupData[key].length === 4) {
            backData['4'].push(groupData[key]);
        }else if (groupData[key].length === 3) {
            backData['3'].push(groupData[key]);
        } else if (groupData[key].length === 2) {
            backData['2'].push(groupData[key]);
        } else if (groupData[key].length === 1) {
            backData['1'].push(groupData[key]);
        }
    });
    console.log('backData', backData);
    return backData
}

/**
* 判断是否是龙或者连顺
* @param backData 验证的数据源
* @param type '4'|'3'|'2'|'1' 判断是几连顺
* @returns
*/
export const getIsContinuityNumber = (
    backData: I_groupCountData,
    type: '3' | '2' | '1'|'4',
) => {
    if (backData[type].length > 1) {
        let isPass = true;
        for (let i = 0; i < backData[type].length; i++) {
            if (backData[type].length !== i + 1) {
                if (
                    backData[type][i][0].point + 1 !==
                    backData[type][i + 1][0].point
                ) {
                    isPass = false;
                    break;
                }
            }
        }
        return isPass;
    }
    return true
};