const { getRoundNumber, getCard, shuffleCard } = require('./utils/cartd')
const express = require('express')
const path=require('path')
const app=express()
const WebSocket = require('ws')

const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// import WebSocket from 'ws'
const server = new WebSocket.Server({
  port: 9000
});

let user_sockets = [];
const cardIdList = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54
]
// const mockPlayer = [
//   {
//     playerId: 1,
//     position: 0,
//     isOnline: false,
//     score: 0,
//     card: []

//   },
//   {
//     playerId: 2,
//     position: 0,
//     isOnline: false,
//     score: 0,
//     card: []
//   },
//   {
//     playerId: 3,
//     position: 0,
//     isOnline: false,
//     score: 0,
//     card: []

//   }
// ]
const initRoomData = {
  roomId: 1677140369460,//new Date().getTime(),
  status: 'prepare' | 'selectLandlord'|'reopen'|'play'|'end', //准备阶段 叫地主阶段  重开  游戏阶段  
  model: 0,//0都是随机地主 1轮庄,赢的人是地主
  allCount: 0,//打了多少场次
  initPost: -1,//谁第一个是地主
  initUser:0,//第一个出牌的人
  lastUser:0,//最后出牌的人
  notUseCardCount:0,//不要的次数,不要牌的人的次数到2就是他出牌
  callCount:1,//叫地主次数
  player: [],//类型查看mockPlayer
  round: [],
  aHand: [],//斗地主的底牌
  current: -1,//当前操作者,为playerId
  winRole:-1//-1未开始   0地主胜利 1,2农民胜利
}
const roomList = [
  initRoomData
]

/**
 * 加入房间
 * @param {*} data 
 * @param {*} socket 
 * @returns 
 */
const onJoin=(data,socket)=>{

  const roomInfo = roomList.find((item)=>item.roomId==data.roomId)
  user_sockets.forEach((user)=>{
    if(user.socket==socket){
      user.userName=data.playerId
    }
  })
  console.log('加入事件roomInfo',roomInfo,roomList)
  roomInfo.status = 'prepare'
  //判断是否已经加入了
  let isJoin=false
  for(let i=0; i <roomInfo.player.length;i++){
    if(roomInfo.player[i].playerId==data.playerId){
      isJoin=true
    }    
  }
  if(isJoin){
    console.log('已经加入了')
    return roomInfo
  }else{

    const newPlayer={
      playerId:data.playerId,
      ...data.position,
      isOnline: true,
      score: 0,
      card: []
    }
    console.log('加入事件',newPlayer)
    roomInfo.player.push(newPlayer)
    return roomInfo
  }

}
const onStart = (data) => {
  const roomInfo = roomList.find((item)=>item.roomId==data.roomId)
  if (roomInfo.player.length < 3) {
    return {
      code: 0,
      isError:true,
      message: '人数不齐'
    }
  }
  const radNum = getRoundNumber(0, 2)
  roomInfo.status = 'selectLandlord'
  roomInfo.current = radNum//第一个叫地主的人
  roomInfo.initPost = radNum//第一个叫地主的人
  roomInfo.initUser=radNum//第一个出牌的人
  roomInfo.lastUser=radNum//第一个出牌的人
  roomInfo.callCount=1//叫地主次数
  roomInfo.round= []
  //洗牌
  const cardList = shuffleCard(JSON.parse(JSON.stringify(cardIdList)))//洗牌
  roomInfo.player.map(item => {
    item.card = getCard(17, cardList)
    // console.log(' item.card', item.card)
    return item
  })
  roomInfo.aHand = cardList
  return roomInfo
}
//不叫地主
const onNoCall= (data) => {
  const roomInfo = roomList.find((item)=>item.roomId==data.roomId)
  if(roomInfo.callCount<3){
    //下一位叫地主
    roomInfo.current=roomInfo.current==2?0:roomInfo.current+1
    roomInfo.callCount++
  }else{
    //都不叫地主，重开
    roomInfo.status='reopen'
  }
  return roomInfo
}
//抢地主
const onCall= (data) => {
  const roomInfo = roomList.find((item)=>item.roomId==data.roomId)

  roomInfo.status = 'play'
  roomInfo.player.forEach((player,index)=>{
    player.position= roomInfo.current==index?0:1

  })
  roomInfo.notUseCardCount=0
  roomInfo.round=[]
  roomInfo.player[roomInfo.current].card.push(...roomInfo.aHand)
  return roomInfo
}
/**
 * 出牌
 */
const onUseCard = (data) => {

  const { useCard,  position, roomId,playerId}=data
  
  const roomInfo = roomList.find((item)=>item.roomId==roomId)
  roomInfo.status = 'useCard'//出牌阶段
  roomInfo.notUseCardCount=0

  roomInfo.round.push({useCard:useCard,useId:playerId})//回合牌
  roomInfo.lastUser=roomInfo.current
  roomInfo.current=roomInfo.current==2?0:roomInfo.current+1
 
  console.log('data',data)
  //设置玩家用掉的牌
  roomInfo.player[position].card = roomInfo.player[position].card.filter(item => useCard.indexOf(item) < 0)
  //胜利  牌出完了
  if(roomInfo.player[position].card.length==0){
    roomInfo.winRole=roomInfo.player[position].position
    roomInfo.status='end'
  }
  

  return roomInfo
}
/**
 * 放弃出牌
 */
const onNotUseCard = (data) => {
  const {    roomId}=data
  const roomInfo = roomList.find((item)=>item.roomId==roomId)
  console.log('roomInfo数据,放弃出牌',roomInfo)
  roomInfo.notUseCardCount=roomInfo.notUseCardCount+1
  roomInfo.current=roomInfo.current==2?0:roomInfo.current+1
  if(roomInfo.notUseCardCount== 2){//大家都要不起,最后一个出牌的人是我
    // roomInfo.current= roomInfo.lastUser
    roomInfo.round=[]
  }
  return roomInfo
}
server.on('connection', function (socket,req) {
  user_sockets.push({
    socket:socket,
    userName:undefined,
    state:1
  });
  //_readyState属性:
  //   CONNECTING：值为0，表示正在连接。
  // OPEN：值为1，表示连接成功，可以通信了。
  // CLOSING：值为2，表示连接正在关闭。
  // CLOSED：值为3，表示连接已经关闭，或者打开连接失败。

  // When you receive a message, send that message to every socket.
  socket.on('message', function (msg) {
    try {

      var enc = new TextDecoder("utf-8");
      var uint8_msg = new Uint8Array(msg);
      const encData = enc.decode(uint8_msg)
      const data = JSON.parse(encData)
      console.log('data', data)
      // console.log('sockets',sockets)
      if (data.type === 'onJoin') {
        //加入房间事件

        const backData = onJoin(data,socket)
        backData&&user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
       
      }else if (data.type === 'onStart') {
        //开始事件
        const backData = onStart(data)
        console.log('开始事件,开始洗牌', backData)
        user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
      } else if (data.type === 'onNoCall') {
        const backData = onNoCall(data)
        console.log('不叫地主', backData)
        user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
      }else if (data.type === 'onCall') {
        const backData = onCall(data)
        console.log('叫地主', backData)
        user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
      }else if (data.type === 'useCard') {
        const backData = onUseCard(data)
        console.log('进入了出牌', backData)
        user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
      } else if (data.type === 'onNotUseCard') {
        const backData = onNotUseCard(data)
        console.log('进入了放弃出牌', backData)
        user_sockets.forEach(s => s.socket.send(JSON.stringify(backData)));
      }         
      else {

        console.log('其它事件')
        user_sockets.forEach(s => s.socket.send(JSON.stringify(data)));
      }
    } catch (error) {
      console.log('----------服务器崩溃----------------')
      user_sockets.forEach(s => s.socket.send(JSON.stringify({ err: '服务器崩溃' })));
      user_sockets=[]
    }


  });



  // When a socket closes, or disconnects, remove it from the array.
  socket.on('close', function (e) {
    // console.log('有人失去链接了',socket)
    user_sockets = user_sockets.filter(s => s.socket !== socket);
  });

});
app.listen(9002, ()=> {
  console.log('Example app listening on port 9003!');
});

//获取房间数据
app.get('/api/roomList',function(req,res) {
  res.status(200).json({
    isSuccess:true,
    roomList
  })
})

//获取房间数据
app.post('/api/creatRoom',function(req,res) {

  const data={ userName: '测试' }
  console.log('req',req.body)
  // console.log('res',res)
  res.status(200).json({
    isSuccess:true,
  })
})