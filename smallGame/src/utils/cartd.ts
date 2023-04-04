export type T_decorStr = 'spade' | 'heart' | 'plumBlossom' | 'block'
export type T_cardColor = 0 | 1 | 2 | 3//花色  黑桃 红桃 梅花 方片
export interface I_Card {
    id: number
    point: number,
    name: string,
    color: T_cardColor//花色  黑桃 红桃 梅花 方片
}

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
    let useCard: I_Card[] = [];

    cardIdList.forEach((element) => {
      useCard.push(initCard[element - 1]);
    });
    return useCard.sort((a, b) => a.point - b.point);
  }

/**
* //Knuth-Durstenfeld shuffle 的 ES6 实现 洗牌算法
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
        let value = o[attr];
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