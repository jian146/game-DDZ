/**
 *
 * @param num 毫秒为单位
 * @returns
 */
 export const formatTime=(num:number) =>{
    return '0'.repeat(2 - String(Math.floor(num / 3600)).length) + Math.floor(num / 3600) + ':' + '0'.repeat(2 - String(Math.floor((num%3600) / 60)).length) + Math.floor((num%3600) / 60) + ':' + '0'.repeat(2 - String(Math.floor((num%3600) % 60)).length) + Math.floor((num%3600) % 60)
  }
  export const awaitFun=async(delaytime = 3000) => {
    return new Promise(resolve => setTimeout(resolve, delaytime))
  }