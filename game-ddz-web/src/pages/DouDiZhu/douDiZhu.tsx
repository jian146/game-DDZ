import {
  INIT_CARDS,
  getCard,
  getGroupData,
  getIsContinuityNumber,
  getMyCard,
  groupBy,
  type I_Card,
  type I_groupCountData,
  type T_cardColor,
} from "@/utils/card"

import { useEffect, useRef, useState, useCallback } from "react"
import CardStyle from "./cardStyle/cardStyle"
import { Avatar, Button, message, Modal, Space, Spin, Tag } from "antd"
import styles from "./douDiZhu.module.less"
import PlayerHeader from "./components/playerHeader/playerHeader"
import Result from "./result/result"
import { useNavigate, useParams } from "react-router-dom"

// ============================
// 类型定义
// ============================
export interface I_player {
  playerId: string
  name?: string
  isOnline: boolean
  /** 是否 AI 玩家（服务端托管） */
  isAI: boolean
  score: number
  position: 0 | 1 | 2 // 0 是地主
  card: number[]
}
type T_I_onSend_type =
  | "onJoin"
  | "onLeave"
  | "onStart"
  | "onCall"
  | "onNoCall"
  | "useCard"
  | "onNotUseCard"
  | "addAI"

interface I_onSend {
  roomId: number
  playerId: string
  position: 0 | 1 | 2
  useCard: number[]
  type: T_I_onSend_type
  model?: 0 | 1
  skipAutoStart?: boolean
}
interface I_useCardItem {
  useCard: number[]
  useId: string
}
export interface I_roomData {
  roomId: number
  status:
    | "prepare"
    | "selectLandlord"
    | "reopen"
    | "play"
    | "useCard"
    | "end"
    | "exit"
    | "maxCount"
  model: 0 | 1
  allCount: number
  initPost: number
  callCount: number
  notUseCardCount: number
  player: I_player[]
  round: I_useCardItem[]
  aHand: number[]
  current: number
  initUser: number
  lastUser: number
  winRole: number
}
interface I_roundCard {
  useCard: I_Card[]
  useId: string
}

// ============================
// WS 配置
// ============================
// 同源自动模式：根据当前页面协议/主机动态拼 WS 地址
// 生产部署时前端被后端承载，同源即可
function resolveWsAddress(raw: string): string {
  if (raw === '__AUTO__') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}`
  }
  return raw
}

const WS_ADDRESS: string = resolveWsAddress(__WS_ADDRESS__)
const PING_INTERVAL = 20000    // 20 秒一次心跳
const RECONNECT_DELAY = 3000  // 3 秒后重连
const MAX_RECONNECT = 10      // 最多重连 10 次

const DouDiZhuPage = () => {
  const navigate = useNavigate()
  const params = useParams<{ userId: string; roomId: string }>()

  const userId = params.userId ?? "1"
  const roomId = parseInt(params.roomId ?? "1")

  // ============================
  // WS 引用 + 重连状态
  // ============================
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const joinedRef = useRef(false)

  // ============================
  // UI 状态
  // ============================
  const [loading, setLoading] = useState(true)
  const [activeCardId, setActiveCardId] = useState<number[]>([])
  const [roundCard, setRoundCard] = useState<I_roundCard[]>([])
  const [roomData, setRoomData] = useState<I_roomData>()
  const [isShowResult, setIsShowResult] = useState(false)

  // ============================
  // 派生数据
  // ============================
  const currentPlayerIndex = roomData?.player.findIndex(
    (p) => p.playerId === userId,
  ) ?? -1

  const myPlayer = roomData?.player[currentPlayerIndex]
  const myCardIds = myPlayer?.card ?? []
  const myCards: I_Card[] = getMyCard(myCardIds, INIT_CARDS)

  // 是否是第一个出牌（上一个出牌的人是自己）
  const isDisNoUseCard = roomData?.lastUser === currentPlayerIndex

  // ============================
  // 发送封装
  // ============================
  const send = useCallback((data: I_onSend) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      message.warning("连接已断开，请稍候重试")
    }
  }, [])

  // ============================
  // 连接 WS
  // ============================
  const connectWs = useCallback(() => {
    // 清掉旧连接
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }

    console.log(`[WS] 正在连接 ${WS_ADDRESS} ...`)
    const ws = new WebSocket(WS_ADDRESS)
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[WS] 连接成功")
      reconnectCountRef.current = 0
      setLoading(false)

      // 重新加入房间
      joinedRef.current = false
      const joinData: I_onSend = {
        roomId,
        playerId: userId,
        position: 0,
        useCard: [],
        type: "onJoin",
      }
      send(joinData)

      // 启动心跳
      pingTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "ping" }))
        }
      }, PING_INTERVAL)
    }

    ws.onclose = () => {
      console.log("[WS] 连接关闭")
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
      setLoading(true)

      // 自动重连
      if (reconnectCountRef.current < MAX_RECONNECT) {
        reconnectCountRef.current++
        console.log(`[WS] ${RECONNECT_DELAY}ms 后第 ${reconnectCountRef.current} 次重连`)
        reconnectTimerRef.current = setTimeout(() => {
          connectWs()
        }, RECONNECT_DELAY)
      } else {
        message.error("连接失败次数过多，请刷新页面重试")
      }
    }

    ws.onerror = (err) => {
      console.error("[WS] 错误", err)
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)

        // 心跳 pong
        if (data.type === "pong") return

        handleServerMessage(data)
      } catch (e) {
        console.error("[WS] 解析消息失败", e)
      }
    }
  }, [roomId, userId, send])

  // ============================
  // 处理服务端消息
  // ============================
  const handleServerMessage = useCallback((data: any) => {
    // 错误消息
    if (data.isError) {
      message.error(data.message ?? "发生错误")
      return
    }

    switch (data.status) {
      case "maxCount":
        message.info("房间已满，请重新选择房间")
        navigate("/room")
        return
      case "prepare":
      case "selectLandlord":
        // 回到准备/叫地主阶段时清空上一局的出牌记录
        setRoundCard([])
        setIsShowResult(false)
        setRoomData({ ...data })
        break
      case "reopen":
        message.info("没有人抢地主，重开一局")
        // 触发 onStart
        const startData: I_onSend = {
          roomId,
          playerId: userId,
          position: 0,
          useCard: [],
          type: "onStart",
          model: 0,
        }
        send(startData)
        break
      case "play":
        setRoundCard([])
        setIsShowResult(false)
        setRoomData({ ...data })
        break
      case "useCard": {
        const roundList: I_roundCard[] = data.round.map((item: I_useCardItem) => ({
          useId: item.useId,
          useCard: getMyCard(item.useCard, INIT_CARDS),
        }))
        setRoundCard([...roundList])
        setRoomData({ ...data })
        break
      }
      case "end": {
        const roundList: I_roundCard[] = data.round.map((item: I_useCardItem) => ({
          useId: item.useId,
          useCard: getMyCard(item.useCard, INIT_CARDS),
        }))
        setRoundCard([...roundList])
        setRoomData({ ...data })
        setIsShowResult(true)
        break
      }
      default:
        setRoomData({ ...data })
    }
  }, [roomId, userId, navigate, send])

  // ============================
  // 生命周期
  // ============================
  useEffect(() => {
    connectWs()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
    }
  }, [connectWs])

  // ============================
  // 交互逻辑
  // ============================
  const onCardClick = (card: I_Card) => {
    setActiveCardId((prev) => {
      const idx = prev.indexOf(card.id)
      if (idx >= 0) {
        const next = prev.slice()
        next.splice(idx, 1)
        return next
      }
      return [...prev, card.id]
    })
  }

  const reloadCard = () => setActiveCardId([])

  /** 校验牌型 + 出牌 */
  const useCard = (useCardId: number[]) => {
    const useCardObjs: I_Card[] = useCardId.map((id) => INIT_CARDS[id - 1])
    useCardObjs.sort((a, b) => a.point - b.point)

    const lastRoundCard =
      roundCard.length === 0 ? [] : roundCard[roundCard.length - 1].useCard

    const groupData = getGroupData(useCardObjs)
    const firstUse = roundCard.length === 0

    const isJoker22 = (cards: I_Card[] = useCardObjs) =>
      cards.length === 2 && cards[0].point === 17 && cards[1].point === 18

    const ruleList = [
      () => isJoker22(useCardObjs),
      () => {
        // 单张
        const lengthOk = (firstUse || lastRoundCard.length === 1) && useCardObjs.length === 1
        const canBeat = firstUse || useCardObjs[0].point > lastRoundCard[0].point
        return lengthOk && canBeat
      },
      () => {
        // 对子（王炸单独处理了）
        if (useCardObjs.length !== 2) return false
        if (useCardObjs[0].point !== useCardObjs[1].point) return false
        const lengthOk = firstUse || lastRoundCard.length === 2
        if (!lengthOk) return false
        const canBeat = firstUse || useCardObjs[0].point > lastRoundCard[0].point
        return canBeat
      },
      () => {
        // 顺子 (5 张及以上连续单牌，不能含 2 和王)
        if (useCardObjs.length < 5) return false
        if (groupData[2].length !== 0 || groupData[3].length !== 0 || groupData[4].length !== 0) return false
        if (groupData[1].length < 5) return false
        // 不能包含 2(point=16) 或 王(point>=17)
        const hasBad = useCardObjs.some((c) => c.point >= 16)
        if (hasBad) return false
        const isSeq = getIsContinuityNumber(groupData, "1")
        if (!isSeq) return false
        if (!firstUse && lastRoundCard.length < 5) return false
        if (lastRoundCard.length >= 5) {
          const lastGroup = getGroupData(lastRoundCard)
          if (lastGroup[1].length !== lastRoundCard.length) return false
          if (groupData[1].length !== lastRoundCard.length) return false
          if (groupData[1][0][0].point <= lastRoundCard[0].point) return false
        }
        return true
      },
      () => {
        // 连对 (3 对及以上连续对子，不含 2 和王)
        if (useCardObjs.length < 6 || useCardObjs.length % 2 !== 0) return false
        if (groupData[1].length !== 0 || groupData[3].length !== 0 || groupData[4].length !== 0) return false
        if (groupData[2].length < 3) return false
        const hasBad = useCardObjs.some((c) => c.point >= 16)
        if (hasBad) return false
        const isSeq = getIsContinuityNumber(groupData, "2")
        if (!isSeq) return false
        if (!firstUse && lastRoundCard.length < 6) return false
        if (lastRoundCard.length >= 6) {
          if (groupData[2].length !== getGroupData(lastRoundCard)[2].length) return false
          if (groupData[2][0][0].point <= lastRoundCard[0].point) return false
        }
        return true
      },
      () => {
        // 三张 / 三带一 / 三带二 / 飞机
        if (groupData[3].length === 0) return false
        const lastGroup = getGroupData(lastRoundCard)

        // 不带牌
        if (groupData[1].length === 0 && groupData[2].length === 0) {
          if (groupData[3].length === 1) {
            // 单三张
            if (!firstUse && lastGroup[3].length !== 1) return false
            if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
            return true
          }
          // 飞机(不带牌)
          const isAir = getIsContinuityNumber(groupData, "3")
          if (!isAir) return false
          if (!firstUse && lastGroup[3].length !== groupData[3].length) return false
          if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
          return true
        }

        // 三带一：3 张 + 1 单张
        if (groupData[3].length === groupData[1].length && groupData[2].length === 0) {
          if (groupData[3].length === 1) {
            // 单三带一
            if (!firstUse && (lastGroup[3].length !== 1 || lastGroup[1].length !== 1)) return false
            if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
            return true
          }
          // 飞机带单
          const isAir = getIsContinuityNumber(groupData, "3")
          if (!isAir) return false
          if (!firstUse && lastGroup[3].length !== groupData[3].length) return false
          if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
          return true
        }

        // 三带二：3 张 + 1 对子
        if (groupData[3].length === groupData[2].length && groupData[1].length === 0) {
          if (groupData[3].length === 1) {
            // 单三带二
            if (!firstUse && (lastGroup[3].length !== 1 || lastGroup[2].length !== 1)) return false
            if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
            return true
          }
          // 飞机带对
          const isAir = getIsContinuityNumber(groupData, "3")
          if (!isAir) return false
          if (!firstUse && lastGroup[3].length !== groupData[3].length) return false
          if (lastGroup[3].length > 0 && groupData[3][0][0].point <= lastGroup[3][0][0].point) return false
          return true
        }

        return false
      },
      () => {
        // 炸弹 4444 / 4 带 2
        if (groupData[4].length === 0) return false
        const lastGroup = getGroupData(lastRoundCard)

        // 纯炸弹
        if (groupData[1].length === 0 && groupData[2].length === 0 && groupData[3].length === 0) {
          if (lastGroup[4].length > 0 && groupData[4][0][0].point <= lastGroup[4][0][0].point) return false
          return true
        }

        // 4 带 2（总牌数 = 4×n + 2×n，即每种炸弹带 2 张散牌）
        // 这里简化：炸弹 ×2 = 所有其它牌数量
        const otherCount = groupData[1].length + groupData[2].length * 2 + groupData[3].length * 3
        if (groupData[4].length * 2 !== otherCount) return false

        if (!firstUse) {
          if (lastGroup[4].length !== groupData[4].length) return false
          const lastOther = lastGroup[1].length + lastGroup[2].length * 2 + lastGroup[3].length * 3
          if (lastGroup[4].length * 2 !== lastOther) return false
        }
        if (lastGroup[4].length > 0 && groupData[4][0][0].point <= lastGroup[4][0][0].point) return false
        return true
      },
    ]

    // 如果上家出了王炸，除了王炸谁都不能压
    if (lastRoundCard.length >= 2 && isJoker22(lastRoundCard)) {
      if (!isJoker22(useCardObjs)) {
        message.error("王炸在手，还能怎么出？")
        return
      }
    }

    let isPass = false
    for (let i = 0; i < ruleList.length; i++) {
      if (ruleList[i]()) {
        isPass = true
        break
      }
    }

    if (!isPass) {
      message.error("出牌不合法")
      return
    }

    message.success("出牌成功")
    const sendData: I_onSend = {
      playerId: userId,
      position: currentPlayerIndex as 0 | 1 | 2,
      model: 0,
      type: "useCard",
      roomId,
      useCard: useCardId,
    }
    send(sendData)
    reloadCard()
  }

  const onNotUseCard = () => {
    if (isDisNoUseCard) {
      message.info("你是第一个出牌的人，不能不要")
      return
    }
    const sendData: I_onSend = {
      playerId: userId,
      position: currentPlayerIndex as 0 | 1 | 2,
      model: 0,
      type: "onNotUseCard",
      roomId,
      useCard: [],
    }
    send(sendData)
  }

  const onStart = () => {
    const data: I_onSend = {
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "onStart",
      model: 0,
    }
    setIsShowResult(false)
    setRoundCard([])
    send(data)
  }

  /** 退出房间 */
  const onLeave = () => {
    const data: I_onSend = {
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "onLeave",
    }
    // 先通知后端
    send(data)
    // 再关 WS 并回大厅
    try {
      wsRef.current?.close()
    } catch {}
    message.success("已退出房间")
    navigate("/room")
  }

  /** 房主添加 AI 玩家 */
  const onAddAI = () => {
    if (!roomData || roomData.player.length >= 3) return
    if (currentPlayerIndex !== 0) {
      message.warning("只有房主可以添加 AI")
      return
    }
    const data: I_onSend = {
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "addAI",
      model: 0,
    }
    send(data)
  }

  const isOnCall = (isCall: boolean) => {
    const data: I_onSend = {
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: isCall ? "onCall" : "onNoCall",
      model: 0,
    }
    send(data)
  }

  // 调整玩家顺序：自己拍第一个
  const sortPlayer = (playerList: I_player[]): I_player[] => {
    if (currentPlayerIndex < 0 || playerList.length === 0) return playerList
    if (currentPlayerIndex >= playerList.length) return playerList
    return playerList
      .slice(currentPlayerIndex, playerList.length)
      .concat(playerList.slice(0, currentPlayerIndex))
  }

  // 继续（只有房主能点开始）
  const onEndKeep = () => {
    // 房主 = player[0]
    if (currentPlayerIndex === 0) {
      onStart()
    } else {
      setIsShowResult(false)
      message.info("等待房主开始下一局...")
    }
  }

  // ============================
  // 渲染
  // ============================
  return (
    <Spin spinning={loading} tip="正在连接房间...">
      <div className={styles.page}>
        {/* 顶部：房间信息 + 退出 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
          <span style={{ fontSize: 14, color: "#888" }}>
            房间号：{roomId} {roomData?.status && `· ${roomData.status}`}
          </span>
          <Button
            danger
            size="small"
            onClick={() => {
              Modal.confirm({
                title: "确定退出房间吗？",
                content: roomData?.status !== "prepare"
                  ? "游戏进行中退出将重置本局，其他人也会被退回准备阶段"
                  : "退出后房间仍保留，随时可以再回来",
                okText: "退出",
                cancelText: "留下",
                onOk: onLeave,
              })
            }}
          >
            🚪 退出房间
          </Button>
        </div>

        {roomData && (
          <>
            {/* 准备阶段 */}
            {roomData.status === "prepare" && (
              <div className={styles.prepare}>
                {roomData.player.map((item, index) => (
                  <div className={styles.item} key={item.playerId || index}>
                    <div
                      className={styles.head}
                      style={{
                        background: item.isAI
                          ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                          : undefined,
                        color: item.isAI ? "#fff" : undefined,
                        fontSize: 24,
                      }}
                    >
                      {item.isAI ? "🤖" : null}
                    </div>
                    <div className={styles.name}>
                      {item.playerId}
                      {item.isAI && (
                        <Tag color="purple" style={{ marginLeft: 4, fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>
                          AI
                        </Tag>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 游戏中：出牌区 + 玩家信息 */}
            {(roomData.status === "play" || roomData.status === "useCard") && (
              <>
                {/* 底牌 */}
                <div className={styles.aHand}>
                  {getMyCard(roomData.aHand, INIT_CARDS).map((card) => (
                    <CardStyle
                      key={card.id + "-Ahand"}
                      card={card}
                      activeCardId={[]}
                      onClickCard={() => {}}
                    />
                  ))}
                </div>
                {/* 打出的牌 */}
                <div className={styles.roundCardList}>
                  {roundCard.map((listItem, index) => (
                    <div className={styles.roundListItem} key={index}>
                      <span className={styles.roundListItemUserName}>
                        玩家{listItem.useId}:
                      </span>
                      {listItem.useCard.map((item) => (
                        <CardStyle
                          key={item.id + "-round"}
                          card={item}
                          activeCardId={[]}
                          onClickCard={() => {}}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {/* 玩家头像区 */}
                <div className={styles.playerHeaderList}>
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

            {/* 我的牌 + 操作按钮 */}
            <div className={styles.myContent}>
              <div className={styles.btnBox}>
                {roomData.status === "prepare" && currentPlayerIndex === 0 && (
                  <Space>
                    <Button
                      onClick={onAddAI}
                      disabled={roomData.player.length >= 3}
                    >
                      🤖 添加 AI ({roomData.player.length}/3)
                    </Button>
                    <Button
                      type="primary"
                      onClick={onStart}
                      disabled={roomData.player.length < 3}
                    >
                      开始游戏
                    </Button>
                  </Space>
                )}

                {roomData.status === "selectLandlord" &&
                  currentPlayerIndex === roomData.current && (
                    <Space>
                      <Button type="primary" onClick={() => isOnCall(true)}>
                        抢地主
                      </Button>
                      <Button onClick={() => isOnCall(false)}>
                        不抢
                      </Button>
                    </Space>
                  )}

                {(roomData.status === "play" || roomData.status === "useCard") &&
                  currentPlayerIndex === roomData.current && (
                    <Space>
                      {!isDisNoUseCard && (
                        <Button
                          type="primary"
                          danger
                          style={{ marginRight: 10, marginLeft: 10 }}
                          onClick={onNotUseCard}
                        >
                          不要
                        </Button>
                      )}
                      <Button
                        type="primary"
                        onClick={() => useCard(activeCardId)}
                      >
                        出牌
                      </Button>
                      <Button onClick={reloadCard}>取消出牌</Button>
                    </Space>
                  )}
              </div>

              <div className={styles.cardList}>
                {myCards
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

            {/* 结束：结果界面 */}
            {roomData.status === "end" && isShowResult && (
              <div>
                <Result
                  onEndKeep={onEndKeep}
                  position={myPlayer?.position ?? -1}
                  isSuccess={myPlayer?.position === roomData.winRole}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Spin>
  )
}

export default DouDiZhuPage
