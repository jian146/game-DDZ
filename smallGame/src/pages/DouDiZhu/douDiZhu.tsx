import {
  getCard,

  getGroupData,
  getIsContinuityNumber,
  getMyCard,
  groupBy,
  I_Card,
  I_groupCountData,
  T_cardColor,
} from '@/utils/cartd';
import { UserOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import CardStyle from './cardStyle/cardStyle';
import { Avatar, Button, message, Select, Space, Spin } from 'antd';
import { history, useParams } from 'umi';
import styles from './douDiZhu.less';
import PlayerHeader from './components/playerHeader/playerHeader';
import Result from './result/result';
const initCard: I_Card[] = [
  {
    id: 1,
    point: 3,
    name: '3',
    color: 0,
  },
  {
    id: 2,
    point: 4,
    name: '4',
    color: 0,
  },
  {
    id: 3,
    point: 5,
    name: '5',
    color: 0,
  },
  {
    id: 4,
    point: 6,
    name: '6',
    color: 0,
  },
  {
    id: 5,
    point: 7,
    name: '7',
    color: 0,
  },
  {
    id: 6,
    point: 8,
    name: '8',
    color: 0,
  },
  {
    id: 7,
    point: 9,
    name: '9',
    color: 0,
  },
  {
    id: 8,
    point: 10,
    name: '10',
    color: 0,
  },
  {
    id: 9,
    point: 11,
    name: 'J',
    color: 0,
  },
  {
    id: 10,
    point: 12,
    name: 'Q',
    color: 0,
  },
  {
    id: 11,
    point: 13,
    name: 'K',
    color: 0,
  },
  {
    id: 12,
    point: 14,
    name: 'A',
    color: 0,
  },
  {
    id: 13,
    point: 16,
    name: '2',
    color: 0,
  },
  {
    id: 14,
    point: 3,
    name: '3',
    color: 1,
  },
  {
    id: 15,
    point: 4,
    name: '4',
    color: 1,
  },
  {
    id: 16,
    point: 5,
    name: '5',
    color: 1,
  },
  {
    id: 17,
    point: 6,
    name: '6',
    color: 1,
  },
  {
    id: 18,
    point: 7,
    name: '7',
    color: 1,
  },
  {
    id: 19,
    point: 8,
    name: '8',
    color: 1,
  },
  {
    id: 20,
    point: 9,
    name: '9',
    color: 1,
  },
  {
    id: 21,
    point: 10,
    name: '10',
    color: 1,
  },
  {
    id: 22,
    point: 11,
    name: 'J',
    color: 1,
  },
  {
    id: 23,
    point: 12,
    name: 'Q',
    color: 1,
  },
  {
    id: 24,
    point: 13,
    name: 'K',
    color: 1,
  },
  {
    id: 25,
    point: 14,
    name: 'A',
    color: 1,
  },
  {
    id: 26,
    point: 16,
    name: '2',
    color: 1,
  },
  {
    id: 27,
    point: 3,
    name: '3',
    color: 2,
  },
  {
    id: 28,
    point: 4,
    name: '4',
    color: 2,
  },
  {
    id: 29,
    point: 5,
    name: '5',
    color: 2,
  },
  {
    id: 30,
    point: 6,
    name: '6',
    color: 2,
  },
  {
    id: 31,
    point: 7,
    name: '7',
    color: 2,
  },
  {
    id: 32,
    point: 8,
    name: '8',
    color: 2,
  },
  {
    id: 33,
    point: 9,
    name: '9',
    color: 2,
  },
  {
    id: 34,
    point: 10,
    name: '10',
    color: 2,
  },
  {
    id: 35,
    point: 11,
    name: 'J',
    color: 2,
  },
  {
    id: 36,
    point: 12,
    name: 'Q',
    color: 2,
  },
  {
    id: 37,
    point: 13,
    name: 'K',
    color: 2,
  },
  {
    id: 38,
    point: 14,
    name: 'A',
    color: 2,
  },
  {
    id: 39,
    point: 16,
    name: '2',
    color: 2,
  },
  {
    id: 40,
    point: 3,
    name: '3',
    color: 3,
  },
  {
    id: 41,
    point: 4,
    name: '4',
    color: 3,
  },
  {
    id: 42,
    point: 5,
    name: '5',
    color: 3,
  },
  {
    id: 43,
    point: 6,
    name: '6',
    color: 3,
  },
  {
    id: 44,
    point: 7,
    name: '7',
    color: 3,
  },
  {
    id: 45,
    point: 8,
    name: '8',
    color: 3,
  },
  {
    id: 46,
    point: 9,
    name: '9',
    color: 3,
  },
  {
    id: 47,
    point: 10,
    name: '10',
    color: 3,
  },
  {
    id: 48,
    point: 11,
    name: 'J',
    color: 3,
  },
  {
    id: 49,
    point: 12,
    name: 'Q',
    color: 3,
  },
  {
    id: 50,
    point: 13,
    name: 'K',
    color: 3,
  },
  {
    id: 51,
    point: 14,
    name: 'A',
    color: 3,
  },
  {
    id: 52,
    point: 16,
    name: '2',
    color: 3,
  },
  {
    id: 53,
    point: 17,
    name: 'Joker',
    color: 0,
  },
  {
    id: 54,
    point: 18,
    name: 'Joker',
    color: 1,
  },
];

export interface I_player {
  playerId: string;
  name?: string;
  isOnline: boolean;
  score: number;
  position: 0 | 1 | 2; //0是地主
  card: number[];
}
type T_I_onSend_type =
  | 'onJoin'
  | 'onLeave'
  | 'onStart'
  | 'onCall'
  | 'onNoCall'
  | 'useCard'
  | 'onNotUseCard';

interface I_ServerError {
  code: number,
  isError:boolean,
  message: string
}
interface I_onSend {
  roomId: number;
  playerId: string;
  position: 0 | 1 | 2; //0是地主
  useCard: number[];
  type: T_I_onSend_type;
  model?: 0; //0随机地主,1轮庄
}
interface I_useCardItem{
  useCard:number[],
  useId:string
}
export interface I_roomData {
  roomId: number;//也为创建时间
  status: 'prepare' | 'selectLandlord' | 'reopen' | 'play' | 'useCard'|'end'|'exit'|'maxCount'; //准备阶段 叫地主阶段  重开  游戏阶段  结束阶段 退出  人数已满
  model: 0 | 1; //0都是随机地主 1轮庄,赢的人是地主
  allCount: number; //打了多少场次
  initPost: number; //地主
  callCount: number; //叫地主的次数
  notUseCardCount: number; //不要的次数
  player: I_player[];
  round: I_useCardItem[];
  aHand: number[]; //斗地主的底牌
  current: number; //当前操作者,为playerId
  initUser: number; //第一个出牌的人
  lastUser: number;
  winRole:number;//结果 胜利的那个人的角色position
}
interface I_roundCard{
  useCard:I_Card[],
  useId:string
}

//process.env.NODE_ENV="production"//生产环境   "development"开发环境
const wsAddress=process.env.NODE_ENV=='development'?'ws://localhost:9100':'ws://47.97.23.119:9000'
const ws = new WebSocket(wsAddress);
ws.binaryType = 'arraybuffer';
(ws as any).AuserName='我是自定义属性'
const DouDiZhuPage = () => {
  
  const params: { userId: string,roomId:string } = useParams();
  const [cadrData, setCadrData] = useState<I_Card[]>([]);

  const userId = params.userId ?? '1'
  const roomId= parseInt(params.roomId ?? '1')
  ws.addEventListener('getUser', ()=> {return {userName:userId,roomId}}  )
  // const [myCard, setMyCard] = useState<I_Card[]>([]);
  const [activeCardId, setActiveCardId] = useState<number[]>([]);
  const [roundCard, setRoundCard] = useState<I_roundCard[]>([]);
  const [currentPlayerId, setCurrentPlayer] = useState<string>(userId);
  const [loading, setLoading] = useState(false);
  const [isShowResult,setIsShowResult]=useState(false);
  const [roomData, setRoomData] = useState<I_roomData>();
  const [logList, setLogList] = useState<{ target: string; message: string }[]>(
    [],
  );
  
  const myCardid =
    roomData?.player.find((player) => player.playerId == currentPlayerId)?.card ??
    [];
  const myCard: I_Card[] = getMyCard(myCardid, initCard);
  //我的角色信息
  const currentPlayer = roomData?.player.find(
    (player) => player.playerId == currentPlayerId,
  );
  //当前玩家索引
  const currentPlayerIndex = roomData?.player.findIndex(
    (player) => player.playerId == currentPlayerId,
  );
//是否额能够出牌
const isDisNoUseCard=roomData?.lastUser===currentPlayerIndex
  useEffect(() => {
    // init();
    return ()=>{
      
    }
  }, []);
  const init = () => {
    const list: I_Card[][] = [];
    const list2: I_Card[] = [];
    let id = 0;
    for (let i = 0; i <= 3; i++) {
      const colorlist: I_Card[] = [];
      for (let j = 3; j <= 15; j++) {
        id++;
        const newCard = {
          id: id,
          point: j <= 14 ? j : 16,
          name: j < 14 ? j + '' : j == 14 ? 'A' : '2',
          color: i as T_cardColor,
        };
        list2.push(newCard);
        colorlist.push(newCard);
      }
      list.push(colorlist);
    }

    list2.map((item) => {
      item.point == 11 ? (item.name = 'J') : item;
      item.point == 12 ? (item.name = 'Q') : item;
      item.point == 13 ? (item.name = 'K') : item;
      return item;
    });
    // console.log('list2',list2);
    setCadrData(list2);

  };

  const onCardClick = (card: I_Card) => {
    const idIndex = activeCardId.indexOf(card.id);
    if (idIndex >= 0) {
      activeCardId.splice(idIndex, 1);
    } else {
      activeCardId.push(card.id);
    }
    setActiveCardId([...activeCardId]);
  };

  const useCard = (useCardId: number[]) => {
    let useCard: I_Card[] = [];

    console.log('roomData', roomData);
    useCardId.forEach((element) => {
      useCard.push(initCard[element - 1]);
    });
    useCard.sort((a, b) => a.point - b.point);
    console.log('使用的牌', useCard);

    const lastRoundCard =
      roundCard.length === 0 ? [] : roundCard[roundCard.length - 1].useCard;
    const backData = getGroupData(useCard);
    /**
     * 是否是第一个出牌
     */
    const firthUse = roundCard.length === 0;
    /**
     * 是否是王炸
     * @returns
     */
    const isJoker22 = (jokerCard:I_Card[]=useCard) => {
      return (
        jokerCard.length==2&&
        jokerCard[0].point === 17 &&
        jokerCard[1].point === 18 
      
      );
    };
    const is1 = () => {
      //长度是否相等
      const lengthRage =
        (firthUse || roundCard[0].useCard.length === 1) && useCard.length === 1;
      //是否可以使用
      const isCanUse = firthUse || useCard[0].point > lastRoundCard[0].point;
      return isCanUse && lengthRage;
    };
    const is22 = () => {
      //长度是否相等
      const lengthRage =
        (firthUse || roundCard[0].useCard.length === 2) && useCard.length === 2;
      if (!lengthRage) {
        return false;
      } else if (isJoker22(useCard)) {
        return true;
      } else if (useCard[0].point !== useCard[1].point) {
        //是否是相等的
        return false;
      }
      //是否可以使用
      const isCanUse =
        lastRoundCard.length === 0 ||
        (useCard[0].point === useCard[1].point &&
          useCard[0].point > lastRoundCard[0].point);
      return isCanUse;
    };
    const is334455 = () => {
      //有单排,3牌和4牌
      if (
        backData[1].length !== 0 ||
        backData[3].length !== 0 ||
        backData[4].length !== 0 ||
        backData[2].length < 3
      ) {
        return false;
      }
      let isPass = getIsContinuityNumber(backData, '2');
      //比较大小
      if (lastRoundCard.length>=5&&backData[1].length!==lastRoundCard.length) {
        return false
      }

      return isPass;
    };
    const is34567 = () => {
      //有2排,3牌和4牌
      if (
        backData[2].length !== 0 ||
        backData[3].length !== 0 ||
        backData[4].length !== 0 ||
        backData[1].length < 5
      ) {
        return false;
      }
      let isPass = getIsContinuityNumber(backData, '1');
      //比较大小
      if (lastRoundCard.length>=5&&backData[1].length!==lastRoundCard.length&&backData[1][0][0].point <= lastRoundCard[0].point) {
        return false
      }
      return isPass;
    };
   

    const new333 = () => {
      //不满足顺子
      if (backData[3].length === 0) return false;

      const lastCard = getGroupData(lastRoundCard);
      //必须不是第一个出,并且上家也是这个牌型
      if (!firthUse && backData[3].length !== lastCard[3].length) {
        return false;
      }
      //比较大小
      if (lastCard[3].length>0&&backData[3][0][0].point <= lastCard[3][0][0].point) {
        return false
      }
      //3337,4447,5557 这种拆牌
      if (
        backData[3].length - 1 ===
        backData[2].length * 2 + backData[1].length + 3
      ) {
        const leftData: I_groupCountData = { ...backData, 3: [] };
        const rightData: I_groupCountData = { ...backData, 3: [] };
        backData[3].forEach((item, index) => {
          if (index !== 0) {
            leftData[3].push(item);
          }
          if (index !== backData[3].length - 1) {
            rightData[3].push(item);
          }
        });
        const leftOk = getIsContinuityNumber(leftData, '3');
        const rightOk = getIsContinuityNumber(rightData, '3');
        return leftOk || rightOk;
      }
      //顺子不带牌
      if (backData[1].length === 0 && backData[2].length === 0) {
        //考虑是否是连顺
        if (backData[3].length !== 1) {
          //是否是多飞机
          return getIsContinuityNumber(backData, '3');
        } else {
          return true;
        }
      }
      //3带1
      if (backData[3].length === backData[2].length * 2 + backData[1].length) {
        //考虑是否是连顺
        if (backData[3].length !== 1) {
          //是否是多飞机
          return getIsContinuityNumber(backData, '3');
        } else {
          return true;
        }
      }

      //3带2
      if (
        backData[3].length === backData[2].length &&
        backData[1].length === 0
      ) {
        //考虑是否是连顺
        if (backData[3].length !== 1) {
          //是否是多飞机
          return getIsContinuityNumber(backData, '3');
        } else {
          return true;
        }
      }

      return false;
    };
    const is4444 = () => {
      //有2排,3牌和4牌
      if (
        backData[1].length === 0 &&
        backData[2].length === 0 &&
        backData[3].length === 0 &&
        backData[4].length === 1
      ) {
        const lastCard = getGroupData(lastRoundCard);
        //比较大小
        if (lastCard[4].length>0&&backData[4][0][0].point <= lastCard[3][0][0].point) {
          return false
        }
        return true;
      }

      return false;
    };
    const is444422 = () => {
      //不满足顺子
      if (backData[4].length === 0) return false;

      // //4带1
      // if (backData[4].length ===backData[3].length * 3+ backData[2].length * 2 + backData[1].length) {
      //   //考虑是否是连顺
      //   if (backData[4].length !== 1) {
      //     //是否是多飞机
      //     return getIsContinuityNumber(backData, '4');
      //   } else {
      //     return true;
      //   }
      // }
      //4带2
      if (
        backData[4].length * 2 ===
        backData[3].length * 3 + backData[2].length * 2 + backData[1].length
      ) {
        //考虑是否是连顺
        if (backData[4].length !== 1) {
          //是否是多飞机
          return getIsContinuityNumber(backData, '4');
        } else {
          return true;
        }
      }

      return false;
    };

    const ruleList = [
      isJoker22,
      is4444,
      is1,
      is22,
      is334455,
      is34567,
      new333,
      is444422,
    ];
    let isPass = false;
    if(lastRoundCard.length>=1&&isJoker22(lastRoundCard)){
      //判断是否是王炸,上一个是王炸全部要不起

    }else{
      for (let i = 0; i < ruleList.length; i++) {
        if (ruleList[i]()) {
          isPass = true;
          break;
        }
      }
    }

    isPass ? message.success('出牌成功') : message.error('出牌失败');

    if (isPass) {
      const sendData: I_onSend = {
        playerId: currentPlayerId,
        position: currentPlayerIndex as 0 | 1 | 2, //0是地主
        model: 0, //0随机地主,1轮庄
        type: 'useCard',
        roomId: roomId,
        useCard: useCardId,
      };
      console.log('出牌给后端的属性', sendData);
      onSend(sendData);
      roloadCard();
    }
  };
  /**
   * 不出牌
   */
  const onNotuseCard = () => {
    
    if(isDisNoUseCard) return '你是第一个出牌的人'
   
    const sendData: I_onSend = {
      playerId: currentPlayerId,
      position: currentPlayerIndex as 0 | 1 | 2, //0是地主
      model: 0, //0随机地主,1轮庄
      type: 'onNotUseCard',
      roomId: roomId,
      useCard: [],
    };
    console.log('出牌给后端的属性', sendData);
    onSend(sendData);
  };
  const roloadCard = () => {
    setActiveCardId([]);
  };

  /**
   * 链接成功
   */
  ws.onopen = () => {
    onJoin();
    setLoading(false);
  };
  /**
   * 连接失败或者关闭的回调
   */
  ws.onclose = () => {
    setLoading(true);
  };
  
  /**
   * 监听后端发送的信息
   * @param msg
   */
  ws.onmessage = (msg) => {
    const data: I_roomData = JSON.parse(msg.data);
    if((data as any as I_ServerError).isError){
      message.error((data as any as I_ServerError).message)

    }else if(data.status == 'prepare') {
      //准备阶段--玩家进入
      setRoomData({ ...data });
    } else if (data.status == 'selectLandlord') {
      //选地主
      setRoomData({ ...data });
    } else if (data.status == 'reopen') {
      //没人叫地主，重开
      message.info('没有人抢地主，重开');
      onStart();
    } else if (data.status == 'maxCount') {
      //超出最大人数
      message.info('房间已满，请重新选择房间');
      history.push('/doutDiZhu')
    }else if (data.status == 'play') {
      //有人叫地主了，正式开始
      setRoundCard([]);
      setRoomData({ ...data });
    } else if (data.status == 'useCard') {
      const roundList: I_roundCard[] = [];
      data.round.forEach((listItem) => {

        const roundCard: I_Card[] = getMyCard(listItem.useCard, initCard);
        roundList.push({useId:listItem.useId,useCard:roundCard});
      });

      setRoundCard([...roundList]);
      setRoomData({ ...data });
    } else if (data.status == 'end') {
      const roundList: I_roundCard[] = [];
      data.round.forEach((listItem) => {
        const roundCard: I_Card[] = getMyCard(listItem.useCard, initCard);
        roundList.push({useId:listItem.useId,useCard:roundCard});
      });
      setRoundCard([...roundList]);
      setRoomData({ ...data });
      setIsShowResult(true)
    }

    console.log('onmessage', data);
  };
  const onSend = (data: I_onSend) => {
    ws.send(JSON.stringify(data));
  };
  //抢地主
  const landlord = () => {};
  const onStart = () => {
    const data: I_onSend = {
      roomId: roomId,
      playerId: currentPlayerId,
      position: 0, //0是地主
      useCard: [],
      type: 'onStart',
      model: 0,
    };
    setIsShowResult(false)
    setRoundCard([])
    ws.send(JSON.stringify(data));
  };
  const onJoin = () => {
    const data: I_onSend = {
      roomId: roomId,
      playerId: currentPlayerId,
      position: 0, //0是地主
      useCard: [],
      type: 'onJoin',
    };

    ws.send(JSON.stringify(data));
  };
  /**
   * 抢地主 ,不抢地主
   */
  const isOnCall = (isCall: boolean) => {
    const data: I_onSend = {
      roomId: roomId,
      playerId: currentPlayerId,
      position: 0, //0是地主
      useCard: [],
      type: isCall ? 'onCall' : 'onNoCall',
      model: 0,
    };
    ws.send(JSON.stringify(data));
  };

  //调整玩家位置，当前玩家拍到第一个
  const sortPlayer = (player: I_player[]): I_player[] => {
    player = player
      .slice(currentPlayerIndex, player.length)
      .concat(player.slice(0, currentPlayerIndex));

    return player;
  };
  //结束后继续
  const onEndKeep=()=>{
    //如果是房主
    if(currentPlayerIndex == 0){
      
      onStart()
    }else{
      setIsShowResult(false)
    }

  }
  console.log('roomData',roomData)
  return (
    <Spin spinning={loading} tip="正在重新连接...">
      <div className={styles.page}>
        {roomData && (
          <>
            {roomData.status == 'prepare' && (
              <div className={styles.prepare}>
                {roomData.player.map((item, index) => {
                  return (
                    <div className={styles.item} key={index}>
                      <div className={styles.head}>
                        <Avatar size={64} icon={<UserOutlined />} />
                      </div>
                      <div className={styles.name}>{item.playerId}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {(roomData.status == 'play' || roomData.status == 'useCard') && (
              <>
                <div className={styles.aHand}>
                  {/* 地主牌 */}
                  {getMyCard(roomData.aHand, initCard).map((card) => (
                    <CardStyle
                      key={card.id + '-Ahand'}
                      card={card}
                      activeCardId={[]}
                      onClickCard={() => {}}
                    />
                  ))}
                </div>
                {/* 打出的牌 */}
                <div className={styles.roundCardList}>
                  {roundCard.map((listItem, index) => {
                    return (
                      <div className={styles.roundListItem} key={index}>
                        <span className={styles.roundListItemUserName}>玩家{listItem.useId}:</span>
                        {listItem.useCard.map((item) => {
                          return (
                            <CardStyle
                              key={item.id + '-round'}
                              card={item}
                              activeCardId={[]}
                              onClickCard={() => {}}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className={styles.playerHeaderList}>
                  {/* 头像 */}
                  {sortPlayer(roomData.player).map((player, index) => (
                    <PlayerHeader
                      index={index}
                      key={player.playerId}
                      player={player}
                    />
                  ))}
                </div>
              </>
            )}

            {/* 玩家出牌区 */}
            <div className={styles.myContent}>
              <div className={styles.btnBox}>
                {/* 人齐了开始,只有房主显示 */}
                {roomData.status === 'prepare' && currentPlayerIndex == 0 && (
                  <Space>
                    <Button type="primary" onClick={onStart}>
                      开始
                    </Button>
                  </Space>
                )}
                {/* 抢地主 */}
                {roomData.status === 'selectLandlord' &&
                  currentPlayerIndex == roomData.current && (
                    <Space>
                      <Button type="primary" onClick={() => isOnCall(true)}>
                        抢地主
                      </Button>
                      <Button
                        onClick={() => {
                          isOnCall(false);
                        }}
                      >
                        不抢
                      </Button>
                    </Space>
                  )}
                {/* 到我的回合,出牌和不出牌 */}
                {(roomData.status === 'play' || roomData.status == 'useCard') &&
                  currentPlayerIndex == roomData.current && (
                    <Space>
                      {
                        !isDisNoUseCard&&   <Button
                        type="primary"
                        style={{ marginRight: 10, marginLeft: 10 }}
                        onClick={() => {
                          onNotuseCard();
                        }}
                      >
                        不要
                      </Button>
                      }
                   
                      <Button
                        type="primary"
                        onClick={() => {
                          useCard(activeCardId);
                        }}
                      >
                        出牌
                      </Button>
                      <Button onClick={roloadCard}>取消出牌</Button>
                    </Space>
                  )}
              </div>
              <div className={styles.cardList}>
                {myCard
                  .sort((a, b) => b.point - a.point)
                  .map((card) => (
                    <CardStyle
                      key={card.id}
                      card={card}
                      activeCardId={activeCardId}
                      onClickCard={onCardClick}
                    />
                  ))}
              </div>
            </div>
            {/* 结果胜负界面 */}
            {
              roomData.status === 'end'&&isShowResult&& <div>
              <Result onEndKeep={onEndKeep} position={currentPlayer?.position??-1} isSuccess={currentPlayer?.position==roomData.winRole} />
            </div>
            }
           
          </>
        )}
      </div>
    </Spin>
  );
};
export default DouDiZhuPage;
