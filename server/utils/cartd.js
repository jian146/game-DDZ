

//洗牌
 const shuffleCard = (cardlist) => {
    return shuffle4(cardlist);
};


/**
* //Knuth-Durstenfeld shuffle 的 ES6 实现 洗牌算法
* @param arr 要排序的数组
* @returns
*/
 const shuffle4 = (arr) => {
    let len = arr.length,
        random;
    while (len != 0) {
        random = (Math.random() * len--) >>> 0; // 无符号右移位运算符向下取整(注意这里必须加分号，否则报错)
        [arr[len], arr[random]] = [arr[random], arr[len]]; // ES6的结构赋值实现变量互换
    }
    return arr;
};

//摸牌
 const getCard = (count, cardList) => {
    return cardList.splice(0, count)

}



/**
 * 获取x和y之间随机数  ra  >=x   <=y
 * @param x
 * @param y
 */
  const getRoundNumber = (x, y) => {
    return Math.round(Math.random() * (y - x) + x);
  };

  module.exports = {getRoundNumber,shuffleCard,getCard}