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

import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react"
import CardStyle from "./cardStyle/cardStyle"
import { Button, message, Modal, Popover, Space, Spin, Tooltip } from "antd"
import styles from "./douDiZhu.module.less"
import PlayerHeader from "./components/playerHeader/playerHeader"
import PlayerAvatar from "@/components/playerAvatar/playerAvatar"
import FunLayer, {
  type I_ChatBubble,
  type I_ThrowFlight,
  type T_ThrowItem,
} from "./components/funLayer/funLayer"
import Result from "./result/result"
import { useNavigate, useParams } from "react-router-dom"
import { sound, playSound } from "@/utils/sound"
import { QUICK_CHAT, playVoice, preloadVoice, quickChatText } from "@/utils/voice"
import { useViewport } from "@/utils/useViewport"
import {
  getPlayer,
  getToken,
  apiMe,
  logout,
  type I_Player as I_Account,
} from "@/utils/auth"

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
  | "removeAI"
  | "throwItem"
  | "quickChat"
  | "hint"

interface I_onSend {
  roomId: number
  playerId: string
  position: 0 | 1 | 2
  useCard: number[]
  type: T_I_onSend_type
  model?: 0 | 1
  /** onJoin 时带上登录凭证，服务端据此确定真实身份 */
  token?: string
  /** removeAI / throwItem 的目标昵称 */
  targetId?: string
  /** throwItem 的道具类型 */
  item?: T_ThrowItem
  /** quickChat 的语音 id */
  voiceId?: string
  /** hint 的第几组候选：连点「提示」就递增，在这一轮候选里轮换 */
  seq?: number
  skipAutoStart?: boolean
}
interface I_useCardItem {
  useCard: number[]
  useId: string
  /** true 表示这一条是「不要」，此时 useCard 为空 */
  pass?: boolean
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
  /** 本轮完整出牌日志（含「不要」）；老服务端没有这个字段时回退到 round */
  roundLog?: I_useCardItem[]
  aHand: number[]
  current: number
  initUser: number
  lastUser: number
  winRole: number
  /** 房主昵称，只有房主能增删 AI / 开始游戏 */
  ownerName?: string

  // ============ 跑得快专用 ============
  /** 玩法，缺省按斗地主处理（老房间没有这个字段） */
  mode?: "ddz" | "pdk"
  /** 庄家（player 数组索引） */
  banker?: number
  /** 本房间第一局首出必须带的牌 id */
  markerId?: number
  /** 当前玩家手里有能管上的牌 → 「不要」不可点 */
  mustPlay?: boolean
  /** 赢家的 player 索引 */
  winnerIndex?: number
  /** 结算后每个玩家的增减分 */
  scoreDeltas?: number[]
}
interface I_roundCard {
  useCard: I_Card[]
  useId: string
  /** 这一条是「不要」 */
  pass?: boolean
}

/**
 * 服务端房间数据 → 出牌区渲染用的列表
 *
 * 优先用 `roundLog`（含「不要」），老服务端没有就退回 `round`（只有出牌）。
 * 这里统一把牌 id 转成牌对象，后面所有渲染都只认 I_roundCard。
 */
function buildRoundList(data: any): I_roundCard[] {
  const src: I_useCardItem[] = data?.roundLog ?? data?.round ?? []
  return src.map((item) => ({
    useId: item.useId,
    pass: !!item.pass,
    useCard: item.pass ? [] : getMyCard(item.useCard, INIT_CARDS),
  }))
}

/** 判断一手牌是不是炸弹 / 王炸，用于触发爆炸音效 */
function isBombCards(cards: I_Card[]): boolean {
  if (cards.length === 2) {
    const pts = cards.map((c) => c.point).sort((a, b) => a - b)
    return pts[0] === 17 && pts[1] === 18
  }
  if (cards.length === 4) {
    return cards.every((c) => c.point === cards[0].point)
  }
  return false
}

/** 房间状态 → 顶栏中文标签 */
const STATUS_TEXT: Record<string, string> = {
  prepare: "准备中",
  selectLandlord: "叫地主",
  play: "出牌中",
  useCard: "出牌中",
  end: "本局结束",
  reopen: "重新发牌",
  exit: "已退出",
  maxCount: "房间已满",
}

/**
 * 能点头像砸道具的阶段。
 * 头像（PlayerHeader）只在叫地主和出牌阶段渲染，准备阶段的座位卡没有投掷热区，
 * 所以准备阶段既不该显示这两个按钮，也不该保留已经选中的道具。
 */
const THROWABLE_STATUS = new Set(["selectLandlord", "play", "useCard"])

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

  // 身份以登录账号为准；URL 里的 userId 只作兼容兜底（旧链接仍能打开）
  const [me, setMe] = useState<I_Account | null>(() => getPlayer())
  const userId = me?.name ?? params.userId ?? ""
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
  const [soundOn, setSoundOn] = useState(sound.enabled)
  /**
   * 提示轮换游标：`key` 记录「这一手是什么局面」，局面变了就从第一组候选重新开始；
   * 局面没变就 seq+1，连点「提示」依次看下一组能管上的牌。
   */
  const hintRef = useRef<{ key: string; seq: number }>({ key: "", seq: -1 })

  /** 已选中待投掷的道具；非空时点谁的头像就砸谁 */
  const [aiming, setAiming] = useState<T_ThrowItem | null>(null)
  /** 语音面板开合（受控，选完自动收起，否则会挡住气泡） */
  const [chatOpen, setChatOpen] = useState(false)
  /** 正在飞的道具 */
  const [flights, setFlights] = useState<I_ThrowFlight[]>([])
  /** 正在显示的语音气泡 */
  const [bubbles, setBubbles] = useState<I_ChatBubble[]>([])
  /** 刚被砸中的玩家，用来触发头像抖动 */
  const [hitMap, setHitMap] = useState<Record<string, boolean>>({})

  /** 特效唯一 key */
  const fxSeqRef = useRef(0)
  /** playerId → 抖动复位定时器，重复命中时先清掉上一个 */
  const hitTimersRef = useRef(new Map<string, number>())

  /** 上一次的房间状态，用于判断"发牌"这类一次性音效 */
  const prevStatusRef = useRef<string>("")

  /** 上一帧的房间数据，用来识别「谁点了不要」（服务端只加计数，不动 round） */
  const prevRoomRef = useRef<any>(null)
  /** 「不要」浮标：谁不要了，1.8 秒后自动消失 */
  const [passTip, setPassTip] = useState<{ name: string; key: number } | null>(null)

  // 语音素材预热，避免第一次点要等半秒
  useEffect(() => {
    preloadVoice()
  }, [])

  // 「不要」浮标自动消失
  useEffect(() => {
    if (!passTip) return
    const t = window.setTimeout(() => setPassTip(null), 1800)
    return () => window.clearTimeout(t)
  }, [passTip])

  // ============================
  // 互动特效
  // ============================

  /** 播一次投掷：飞出 → 砸中 → 清理 */
  const spawnFlight = useCallback(
    (item: T_ThrowItem, from: string, to: string) => {
      const key = ++fxSeqRef.current
      setFlights((prev) => [...prev, { key, item, from, to }])
      playSound("throw")

      // 和 CSS 里的飞行时长（600ms）对齐
      window.setTimeout(() => playSound("splat"), 600)

      // 头像抖一下
      setHitMap((prev) => ({ ...prev, [to]: true }))
      const old = hitTimersRef.current.get(to)
      if (old) window.clearTimeout(old)
      const t = window.setTimeout(() => {
        hitTimersRef.current.delete(to)
        setHitMap((prev) => {
          const next = { ...prev }
          delete next[to]
          return next
        })
      }, 520)
      hitTimersRef.current.set(to, t)

      window.setTimeout(() => {
        setFlights((prev) => prev.filter((f) => f.key !== key))
      }, 1400)
    },
    [],
  )

  /** 冒一个语音气泡 */
  const spawnBubble = useCallback((from: string, text: string) => {
    const key = ++fxSeqRef.current
    setBubbles((prev) => [...prev, { key, from, text }])
    window.setTimeout(() => {
      setBubbles((prev) => prev.filter((b) => b.key !== key))
    }, 2700)
  }, [])

  // 卸载时清掉抖动定时器，避免对已卸载组件 setState
  useEffect(() => {
    const timers = hitTimersRef.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
    }
  }, [])

  // 视口信息：只用于给头像传像素尺寸
  const vp = useViewport()
  // 头像是牌桌上的视觉主角，但矮屏（横屏手机）必须让位给牌桌本身
  const avatarSize = vp.height < 480 ? 52 : vp.isSmall ? 56 : vp.isMobile ? 64 : 80

  // 首次交互解锁音频（浏览器自动播放策略要求）
  useEffect(() => {
    const unlock = () => sound.unlock()
    document.addEventListener("pointerdown", unlock, { once: true })
    return () => document.removeEventListener("pointerdown", unlock)
  }, [])

  // 本地没有账号缓存（例如直接打开链接）时，用 token 换一次资料
  useEffect(() => {
    if (me) return
    apiMe().then((p) => {
      if (p) {
        setMe(p)
        return
      }
      message.warning("请先登录")
      logout()
      navigate("/login", { replace: true })
    })
  }, [me, navigate])

  // ============================
  // 派生数据
  // ============================
  const currentPlayerIndex = roomData?.player.findIndex(
    (p) => p.playerId === userId,
  ) ?? -1

  const myPlayer = roomData?.player[currentPlayerIndex]
  const myCardIds = myPlayer?.card ?? []
  const myCards: I_Card[] = getMyCard(myCardIds, INIT_CARDS)

  /**
   * 跑得快：没有叫地主、没有底牌、能管必须管。
   * 牌型校验以服务端为准（前端不再维护第二套规则，避免两边口径漂移），
   * 这里只负责界面分支。
   */
  const isPdk = roomData?.mode === "pdk"

  /** 只有房主能增删 AI、开始游戏 */
  const amOwner = !!roomData?.ownerName && roomData.ownerName === userId

  /**
   * 砸番茄 / 扔鸡蛋必须先选道具再点头像，而头像只在叫地主和出牌阶段渲染
   * （准备阶段的座位卡没有投掷热区，点了没反应）。
   * 所以准备阶段把这两个按钮收起来：既是无效 UI，又能让出右下角给座位面板
   * —— 手机窄屏上两者原本只差 1px 就叠在一起了。
   */
  const canThrow = !!roomData && THROWABLE_STATUS.has(roomData.status)

  /**
   * 牌桌中央显示「这一轮大家都出了什么」：
   * 服务端把本轮每一手都放在 `roundLog` 里（含「不要」），两家都过之后才清空，
   * 所以直接把整个列表摆出来就是完整的一轮。
   *
   * `lastRound` 仍然只指「最后真正出的那一手」—— 压牌校验、「我是不是第一个出」、
   * 回合提示都靠它判断，不能把「不要」算进去。
   */
  const playRounds = roundCard.filter((item) => !item.pass)
  const lastRound = playRounds.length > 0 ? playRounds[playRounds.length - 1] : null

  // ============================
  // 牌面尺寸：按「张数 + 视口宽度」算，不用固定 clamp
  // ============================
  /**
   * 之前尺寸是 CSS 里写死的 clamp，手机上 `--card-w` 只有 34px、
   * 出牌区 `--table-card-w` 只有 21px（点数 7px 高，等于看不见）。
   * 问题是 clamp 不知道「这一手有几张牌」，只能按最坏情况（20 张）取最小值。
   *
   * 改成 JS 算：牌宽 × 系数 = 可用宽度，系数 = 1 + (n-1) × 露出比例。
   * 张数少就自动变大（封顶 maxW），张数多就自动缩小，始终铺满且不溢出。
   */
  /**
   * 重叠比例。注意一个反直觉的结论：屏幕宽度固定时，
   *   「牌宽」和「每张露出的宽度」是此消彼长的 —— 总宽 = 牌宽 + (n-1) × 露出宽。
   * 所以 20 张牌时不管怎么调，露出宽都稳定在 17px 左右。
   * 想让牌看起来更大，只能加大牌宽（也就是加大重叠），露出的条数不变但牌更高、点数更大。
   * 手机按 60% 重叠：390 屏 20 张 → 牌宽 43 / 高 58（原来 34 / 46）。
   */
  const HAND_GAP_RATIO = vp.isSmall ? 0.6 : 0.46 // 和 CSS 里的 --card-gap 保持一致
  const maxHandCardW = vp.isSmall ? 56 : vp.isMobile ? 64 : 76
  const handCardW = (() => {
    const n = myCards.length
    if (n <= 0) return maxHandCardW
    const avail = vp.width - 20 // .cardList 左右各 8px padding + 2px 余量，防止刚好顶出滚动条
    const need = 1 + (n - 1) * (1 - HAND_GAP_RATIO)
    return Math.max(26, Math.min(maxHandCardW, Math.floor(avail / need)))
  })()

  /**
   * 出牌区：现在一轮里可能摆着好几手牌（每家一手），牌宽按「总张数 + 组数」一起算。
   * 单组公式：牌宽 × (1 + (n-1) × 露出比例)；
   * 多组再加每组的间距和「昵称可能比牌还宽」的兜底余量。
   */
  const ROUND_GAP_RATIO = 0.34
  const maxRoundCardW = vp.isMobile ? 50 : 40
  const roundTotalCards = playRounds.reduce((sum, r) => sum + r.useCard.length, 0)
  const roundGroupCount = Math.max(1, playRounds.length)
  const roundCardW = (() => {
    const n = roundTotalCards
    if (n <= 0) return maxRoundCardW
    const avail = Math.min(vp.width - 40, vp.isMobile ? 9999 : 560)
    // 组间距 12px + 每组 20px 余量（昵称比单张牌还宽时靠这段撑住）
    const reserved = (roundGroupCount - 1) * 12 + roundGroupCount * 20
    const need =
      roundGroupCount + (n - roundGroupCount) * (1 - ROUND_GAP_RATIO)
    return Math.max(
      18,
      Math.min(maxRoundCardW, Math.floor((avail - reserved) / need)),
    )
  })()

  /**
   * ⚠️ 自定义属性是「声明它的那个元素上」完成 var() 替换的，不是使用处。
   * `--card-h: calc(var(--card-w) * 1.34)` 写在 `.page` 上，
   * 就固定用 `.page` 的 `--card-w` 算死了；在 `.cardList` 上改 `--card-w`
   * 根本带不动 `--card-h` 和 `--card-gap`（实测牌宽 50 了，高度还停在 46，
   * 而且间距还是按 34px 算的，17 张牌直接撑到 520px 溢出屏幕）。
   * 所以这三个值一起从 JS 传，别指望 CSS 级联。
   */
  const handCardVars = {
    "--card-w": `${handCardW}px`,
    "--card-h": `${Math.round(handCardW * 1.34)}px`,
    "--card-gap": `${-Math.round(handCardW * HAND_GAP_RATIO)}px`,
  } as CSSProperties

  const roundCardVars = {
    "--table-card-w": `${roundCardW}px`,
    "--table-card-h": `${Math.round(roundCardW * 1.34)}px`,
  } as CSSProperties

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
        token: getToken() ?? "",
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
    // ===== 互动事件：投掷 / 快捷语音 =====
    // 服务端把事件广播给房间内所有人（含发起人），本地不做乐观渲染，
    // 统一由这条消息驱动，这样"被限流拦下"时也不会出现假动画。
    if (data.type === "throwItem") {
      spawnFlight(data.item as T_ThrowItem, data.from, data.to)
      return
    }
    if (data.type === "quickChat") {
      playVoice(data.voiceId)
      spawnBubble(data.from, data.text || quickChatText(data.voiceId))
      return
    }

    // ===== 提示：服务端算好的候选，直接置为选中 =====
    if (data.type === "hint") {
      const cards: number[] = data.cards ?? []
      if (cards.length === 0) {
        message.info(
          data.total === 0 ? "没有能管上的牌" : "没有可提示的牌",
        )
        return
      }
      playSound("select")
      setActiveCardId(cards)
      return
    }

    // 错误消息
    if (data.isError) {
      // 登录态失效：清掉本地凭证回登录页
      if (data.needLogin) {
        message.warning(data.message ?? "登录已过期，请重新登录")
        logout()
        navigate("/login", { replace: true })
        return
      }

      // 房间已不存在（多半是服务重启过）：别把用户丢在空白页上
      if (data.roomGone) {
        setLoading(false)
        Modal.warning({
          title: "房间已失效",
          content:
            "这个房间已经不存在了。服务重启会清空所有房间，回大厅重新开一局吧。",
          okText: "回大厅",
          onOk: () => navigate("/room", { replace: true }),
        })
        return
      }

      // 对局进行中，不接受中途加入
      if (data.gameInProgress) {
        setLoading(false)
        Modal.warning({
          title: "这局正在打",
          content:
            "房间正在对局中，中途加入会打断别人。等这局结束再进来吧。",
          okText: "回大厅",
          onOk: () => navigate("/room", { replace: true }),
        })
        return
      }

      message.error(data.message ?? "发生错误")
      return
    }

    const prevStatus = prevStatusRef.current
    prevStatusRef.current = data.status

    // 一局结束回到准备阶段时把准星收掉，否则选中的道具会带到下一局
    if (!THROWABLE_STATUS.has(data.status)) setAiming(null)

    // ---- 识别「不要」 ----
    // 服务端处理「不要」时只把 notUseCardCount +1、current 后移，round 一点不动，
    // 所以从牌面上完全看不出发生了什么 —— 这就是"看不到出牌记录"的另一半原因。
    // 这里靠计数差判断，再用上一帧的 current 找出是谁不要的。
    const prevRoom = prevRoomRef.current
    prevRoomRef.current = data
    if (
      prevRoom &&
      typeof data.notUseCardCount === "number" &&
      ["play", "useCard"].includes(data.status) &&
      ["play", "useCard"].includes(prevRoom.status)
    ) {
      const passed =
        data.notUseCardCount === prevRoom.notUseCardCount + 1 ||
        // 两家都过 → 服务端把 round 清空、计数归零
        (prevRoom.notUseCardCount === 1 && data.notUseCardCount === 0)
      if (passed) {
        const passer = prevRoom.player?.[prevRoom.current]
        if (passer) setPassTip({ name: passer.playerId, key: Date.now() })
      }
    }

    switch (data.status) {
      case "maxCount":
        message.info("房间已满，请重新选择房间")
        navigate("/room")
        return
      case "prepare":
      case "selectLandlord":
        // 从准备阶段进入发牌 → 播发牌音效
        if (data.status === "selectLandlord" && prevStatus !== "selectLandlord") {
          playSound("deal")
        }
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
        const roundList = buildRoundList(data)
        // 只对本次新增的那手牌发声，避免重连时把所有历史牌都播一遍
        const latest = [...roundList].reverse().find((item) => !item.pass)
        if (latest && latest.useCard.length > 0) {
          playSound(isBombCards(latest.useCard) ? "bomb" : "play")
        }
        setRoundCard(roundList)
        setRoomData({ ...data })
        break
      }
      case "end": {
        const roundList = buildRoundList(data)
        const meIndex = data.player.findIndex(
          (p: I_player) => p.playerId === userId,
        )
        const myPos = data.player[meIndex]?.position
        playSound(myPos === data.winRole ? "win" : "lose")
        setRoundCard(roundList)
        setRoomData({ ...data })
        setIsShowResult(true)
        break
      }
      default:
        setRoomData({ ...data })
    }
  }, [roomId, userId, navigate, send, spawnFlight, spawnBubble])

  // ============================
  // 生命周期
  // ============================
  useEffect(() => {
    // 身份还没确定时先不连，否则会带着空的 playerId 进房间
    if (!userId) return

    connectWs()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
    }
  }, [connectWs, userId])

  // ============================
  // 交互逻辑
  // ============================
  const onCardClick = (card: I_Card) => {
    const isSelected = activeCardId.includes(card.id)
    playSound(isSelected ? "unselect" : "select")
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

  const reloadCard = () => {
    playSound("click")
    setActiveCardId([])
  }

  /**
   * 提示：让服务端算「能管上这一手」的候选，前端只负责选中。
   *
   * 局面指纹 = 轮到谁 + 要压的那手牌 + 状态。局面没变就连点轮换下一组，
   * 变了（别人出了新牌 / 轮到我新一轮）就从头开始。
   */
  const onHint = () => {
    if (!roomData) return
    const key = [
      roomData.status,
      roomData.current,
      lastRound?.useCard.map((c) => c.id).join(",") ?? "",
    ].join("|")
    const seq = hintRef.current.key === key ? hintRef.current.seq + 1 : 0
    hintRef.current = { key, seq }

    playSound("click")
    send({
      playerId: userId,
      position: currentPlayerIndex as 0 | 1 | 2,
      model: 0,
      type: "hint",
      roomId,
      useCard: [],
      seq,
    })
  }

  /** 校验牌型 + 出牌 */
  const useCard = (useCardId: number[]) => {
    // ============ 跑得快：交给服务端校验 ============
    // 跑得快的牌型规则（三带二任意两张、裸三张仅收尾、能管必须管…）
    // 只维护一份在服务端 utils/pdk.ts，前端不复刻，避免两边口径漂移。
    // 服务端返回错误会走 handleServerMessage 里的 message.error 分支。
    if (isPdk) {
      if (useCardId.length === 0) {
        message.warning("请先选牌")
        return
      }
      playSound("play")
      send({
        playerId: userId,
        position: currentPlayerIndex as 0 | 1 | 2,
        model: 0,
        type: "useCard",
        roomId,
        useCard: useCardId,
      })
      reloadCard()
      return
    }

    const useCardObjs: I_Card[] = useCardId.map((id) => INIT_CARDS[id - 1])
    useCardObjs.sort((a, b) => a.point - b.point)

    // 压牌比的是「最后真正出的那一手」，不是列表最后一条（可能是「不要」）
    const lastRoundCard = lastRound?.useCard ?? []

    const groupData = getGroupData(useCardObjs)
    const firstUse = !lastRound

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
    playSound("pass")
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
    if (!amOwner) {
      message.warning("只有房主可以添加 AI")
      return
    }
    playSound("click")
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

  /** 房主删除 AI 玩家 */
  const onRemoveAI = (targetId: string) => {
    if (!roomData) return
    if (!amOwner) {
      message.warning("只有房主可以删除 AI")
      return
    }
    playSound("click")
    const data: I_onSend = {
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "removeAI",
      model: 0,
      targetId,
    }
    send(data)
  }

  /** 投掷道具：先选好道具，再点谁的头像就砸谁 */
  const throwAt = (targetId: string) => {
    if (!aiming) return
    if (!targetId) return
    if (targetId === userId) {
      message.warning("别砸自己呀")
      return
    }
    playSound("click")
    send({
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "throwItem",
      targetId,
      item: aiming,
    })
    setAiming(null)
  }

  /**
   * 牌桌点击（事件委托）
   * 瞄准状态下点谁的头像就砸谁；点空白处取消瞄准。
   * 用委托而不是给每个头像加 onClick，准备阶段和打牌阶段两套渲染都能复用。
   */
  const onTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!aiming) return
    const el = (e.target as HTMLElement).closest("[data-pid]") as HTMLElement | null
    if (!el) {
      setAiming(null)
      return
    }
    throwAt(el.dataset.pid ?? "")
  }

  /** 发一条快捷语音（音效由服务端回推触发，本地不重复播） */
  const sendQuickChat = (voiceId: string) => {
    send({
      roomId,
      playerId: userId,
      position: 0,
      useCard: [],
      type: "quickChat",
      voiceId,
    })
  }

  const isOnCall = (isCall: boolean) => {
    playSound(isCall ? "call" : "nocall")
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

  // 继续下一局（后端 onStart 不限房主，谁点都能开）
  const onEndKeep = () => {
    onStart()
  }

  // ============================
  // 渲染
  // ============================
  return (
    <Spin spinning={loading} tip="正在连接房间...">
      <div className={styles.page}>
        {/* ===== 顶部栏：房间号 + 音效开关 + 退出 ===== */}
        <div className={styles.topBar}>
          <div className={styles.roomInfo}>
            <span className={styles.roomId}>房间 {roomId}</span>
            {roomData?.mode && (
              <span className={isPdk ? styles.modeTagPdk : styles.modeTagDdz}>
                {isPdk ? "跑得快" : "斗地主"}
              </span>
            )}
            {roomData?.status && (
              <span className={styles.statusTag}>
                {STATUS_TEXT[roomData.status] ?? roomData.status}
              </span>
            )}
          </div>

          <div className={styles.topActions}>
            <Tooltip title={soundOn ? "关闭音效" : "开启音效"}>
              <button
                type="button"
                className={styles.soundBtn}
                onClick={() => {
                  const next = sound.toggle()
                  setSoundOn(next)
                  if (next) playSound("click")
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {soundOn ? (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  ) : (
                    <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
                  )}
                </svg>
              </button>
            </Tooltip>

            <Button
              danger
              size="small"
              onClick={() => {
                playSound("click")
                Modal.confirm({
                  title: "确定退出房间吗？",
                  content:
                    roomData?.status !== "prepare"
                      ? "游戏进行中退出将重置本局，其他人也会被退回准备阶段"
                      : "退出后房间仍保留，随时可以再回来",
                  okText: "退出",
                  cancelText: "留下",
                  onOk: onLeave,
                })
              }}
            >
              退出
            </Button>
          </div>
        </div>

        {/* ===== 牌桌区 ===== */}
        <div
          className={`${styles.table} ${aiming ? styles.aiming : ""}`}
          onClick={onTableClick}
        >
          {/* 桌面本体（纯装饰，不吃点击） */}
          <div className={styles.tableSurface} aria-hidden="true" />

          {/* 桌面中央水印：品牌字 + 房间信息 */}
          <div className={styles.tableBrand} aria-hidden="true">
            <div className={styles.brandTitle}>{isPdk ? "跑得快" : "斗地主"}</div>
            <div className={styles.brandSub}>
              房间 {roomId}
              {roomData?.status
                ? ` · ${STATUS_TEXT[roomData.status] ?? roomData.status}`
                : ""}
            </div>
          </div>

          {roomData && (
            <>
              {/* 回合提示：叫地主阶段 / 新一轮起手时，告诉用户在等谁 */}
              {(() => {
                const cur = roomData.player[roomData.current]
                const isMyTurn =
                  currentPlayerIndex >= 0 &&
                  roomData.current === currentPlayerIndex
                const waiting = `等待 ${cur?.playerId ?? "对手"}`

                if (roomData.status === "selectLandlord") {
                  return (
                    <div
                      className={`${styles.turnHint} ${isMyTurn ? styles.mine : ""}`}
                    >
                      {isMyTurn ? "轮到你叫地主" : `${waiting} 叫地主…`}
                    </div>
                  )
                }
                if (
                  (roomData.status === "play" ||
                    roomData.status === "useCard") &&
                  !lastRound
                ) {
                  return (
                    <div
                      className={`${styles.turnHint} ${isMyTurn ? styles.mine : ""}`}
                    >
                      {isMyTurn ? "轮到你出牌" : `${waiting} 出牌…`}
                    </div>
                  )
                }
                return null
              })()}

              {/* 「不要」浮标：谁点了不要，在牌桌中央偏上闪一下 */}
              {passTip && (
                <div className={styles.passTip} key={passTip.key}>
                  {passTip.name} 不要
                </div>
              )}
              {/* 准备阶段：三个座位 */}
              {roomData.status === "prepare" && (
                <div className={styles.prepare}>
                  {[0, 1, 2].map((slotIndex) => {
                    const p = roomData.player[slotIndex]
                    // 房主可以移除 AI，真人和自己都不能删
                    const canRemove = amOwner && !!p && p.isAI
                    return (
                      <div
                        className={`${styles.item} ${!p ? styles.empty : ""}`}
                        key={p?.playerId ?? `empty-${slotIndex}`}
                      >
                        {p ? (
                          <div
                            className={`${styles.avatarSlot} ${
                              hitMap[p.playerId] ? styles.hitShake : ""
                            }`}
                            /* 投掷特效层靠这个属性反查头像位置 */
                            data-pid={p.playerId}
                          >
                            <PlayerAvatar
                              name={p.playerId}
                              isAI={p.isAI}
                              isOnline={p.isOnline}
                              size={vp.isMobile ? 58 : 68}
                            />
                            {canRemove && (
                              <button
                                type="button"
                                className={styles.removeAi}
                                title="移除这个 AI"
                                aria-label={`移除 ${p.playerId}`}
                                onClick={() => onRemoveAI(p.playerId)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className={styles.emptySlot}>+</div>
                        )}
                        <div className={styles.name}>
                          {p ? p.playerId : "等待加入"}
                        </div>
                        {p && (
                          <div className={styles.seatScore}>
                            <span className={styles.seatCoin} />
                            {p.score}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* 跑得快规则和斗地主差别大，开局前给一句提示 */}
                  {isPdk && (
                    <div className={styles.pdkRule}>
                      48 张 · 每人 16 张 · 先出完为胜 · 能管必须管
                    </div>
                  )}
                </div>
              )}

              {/* 底牌 + 出牌区：仅出牌阶段 */}
              {(roomData.status === "play" ||
                roomData.status === "useCard") && (
                <>
                  {roomData.aHand.length > 0 && (
                    <div className={styles.aHand}>
                      <span className={styles.aHandLabel}>底牌</span>
                      {getMyCard(roomData.aHand, INIT_CARDS).map((card) => (
                        <CardStyle
                          key={card.id + "-Ahand"}
                          card={card}
                          activeCardId={[]}
                          onClickCard={() => {}}
                          disabled
                        />
                      ))}
                    </div>
                  )}

                  {roundCard.length > 0 && (
                    <div
                      className={styles.roundCardList}
                      data-round-area
                      style={roundCardVars}
                    >
                      {roundCard.map((item, groupIndex) => (
                        <div
                          className={styles.roundGroup}
                          key={`${item.useId}-${groupIndex}`}
                          data-round-group
                        >
                          <span className={styles.roundCardUser}>
                            {item.useId}
                          </span>
                          {item.pass ? (
                            <span className={styles.roundPass}>不要</span>
                          ) : (
                            <div className={styles.roundCardRow} data-round-row>
                              {item.useCard.map((card) => (
                                <CardStyle
                                  key={card.id + "-round"}
                                  card={card}
                                  activeCardId={[]}
                                  onClickCard={() => {}}
                                  disabled
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* 玩家头像：叫地主阶段也要显示，否则看不出谁在叫 */}
              {(roomData.status === "selectLandlord" ||
                roomData.status === "play" ||
                roomData.status === "useCard") && (
                <div className={styles.playerHeaderList}>
                  {sortPlayer(roomData.player).map((player, index) => (
                    <PlayerHeader
                      index={index}
                      key={player.playerId}
                      player={player}
                      avatarSize={avatarSize}
                      isHit={!!hitMap[player.playerId]}
                      isActive={
                        roomData.current >= 0 &&
                        roomData.player[roomData.current]?.playerId ===
                          player.playerId
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ===== 右侧竖排工具栏：砸道具 / 快捷语音 ===== */}
          <div
            className={styles.toolBar}
            onClick={(e) => e.stopPropagation()}
          >
            {aiming && (
              <div className={styles.aimHint}>
                <span>点头像</span>
                <button
                  type="button"
                  className={styles.aimCancel}
                  onClick={() => setAiming(null)}
                >
                  取消
                </button>
              </div>
            )}

            {canThrow && (
              <>
                <Tooltip title="砸番茄：选好后点头像" placement="left">
                  <div
                    className={styles.toolItem}
                    onClick={() => {
                      playSound("click")
                      setAiming((prev) => (prev === "tomato" ? null : "tomato"))
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.toolBtn} ${
                        aiming === "tomato" ? styles.on : ""
                      }`}
                      aria-label="砸番茄"
                    >
                      🍅
                    </button>
                    <span className={styles.toolLabel}>砸番茄</span>
                  </div>
                </Tooltip>

                <Tooltip title="扔鸡蛋：选好后点头像" placement="left">
                  <div
                    className={styles.toolItem}
                    onClick={() => {
                      playSound("click")
                      setAiming((prev) => (prev === "egg" ? null : "egg"))
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.toolBtn} ${
                        aiming === "egg" ? styles.on : ""
                      }`}
                      aria-label="扔鸡蛋"
                    >
                      🥚
                    </button>
                    <span className={styles.toolLabel}>扔鸡蛋</span>
                  </div>
                </Tooltip>
              </>
            )}

            <Popover
              trigger="click"
              placement="leftBottom"
              title="发一句语音"
              open={chatOpen}
              onOpenChange={setChatOpen}
              content={
                <div className={styles.chatPanel}>
                  {QUICK_CHAT.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={styles.chatItem}
                      onClick={() => {
                        setChatOpen(false)
                        sendQuickChat(c.id)
                      }}
                    >
                      <span className={styles.chatIcon}>{c.icon}</span>
                      <span className={styles.chatText}>{c.text}</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className={styles.toolItem}>
                <button
                  type="button"
                  className={styles.toolBtn}
                  aria-label="快捷语音"
                  onClick={() => playSound("click")}
                >
                  💬
                </button>
                <span className={styles.toolLabel}>语音</span>
              </div>
            </Popover>
          </div>
        </div>

        {/* ===== 底部：操作按钮 + 我的手牌 ===== */}
        {roomData && (
          <div className={styles.myContent}>
            <div className={styles.btnBox}>
              {/* 准备阶段：只有房主能补 AI / 开局 */}
              {roomData.status === "prepare" &&
                (amOwner ? (
                  <Space>
                    {roomData.player.length < 3 && (
                      <Button
                        onClick={() => {
                          playSound("click")
                          onAddAI()
                        }}
                      >
                        🤖 添加 AI ({roomData.player.length}/3)
                      </Button>
                    )}
                    <Button
                      type="primary"
                      onClick={() => {
                        playSound("click")
                        onStart()
                      }}
                      disabled={roomData.player.length < 3}
                    >
                      开始游戏
                    </Button>
                  </Space>
                ) : (
                  <span className={styles.waitHint}>
                    等待房主 {roomData.ownerName ?? ""} 开局…
                  </span>
                ))}

              {roomData.status === "selectLandlord" &&
                currentPlayerIndex === roomData.current && (
                  <Space>
                    <Button type="primary" onClick={() => isOnCall(true)}>
                      抢地主
                    </Button>
                    <Button onClick={() => isOnCall(false)}>不抢</Button>
                  </Space>
                )}

              {(roomData.status === "play" ||
                roomData.status === "useCard") &&
                currentPlayerIndex === roomData.current && (
                  <Space>
                    <Button onClick={onHint} title="自动选中能管上的牌，连点换下一组">
                      提示
                    </Button>
                    {!isDisNoUseCard && (
                      <Button
                        type="primary"
                        danger
                        onClick={onNotUseCard}
                        // 跑得快：手里有能管上的牌就必须出，不能跳过
                        disabled={isPdk && !!roomData.mustPlay}
                        title={
                          isPdk && roomData.mustPlay ? "你有能管上的牌，必须出牌" : undefined
                        }
                      >
                        {isPdk && roomData.mustPlay ? "必须管" : "不要"}
                      </Button>
                    )}
                    <Button
                      type="primary"
                      onClick={() => useCard(activeCardId)}
                    >
                      出牌
                    </Button>
                    <Button onClick={reloadCard}>取消</Button>
                  </Space>
                )}
            </div>

            <div className={styles.cardList} style={handCardVars}>
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
        )}

        {/* ===== 结果 ===== */}
        {roomData?.status === "end" && isShowResult && (
          <Result
            onEndKeep={onEndKeep}
            position={myPlayer?.position ?? -1}
            isSuccess={
              isPdk
                ? currentPlayerIndex === roomData.winnerIndex
                : myPlayer?.position === roomData.winRole
            }
            isPdk={isPdk}
            delta={isPdk ? roomData.scoreDeltas?.[currentPlayerIndex] : undefined}
            rows={
              isPdk && roomData.scoreDeltas
                ? roomData.player.map((p, i) => ({
                    name: p.playerId,
                    delta: roomData.scoreDeltas![i] ?? 0,
                    isMe: i === currentPlayerIndex,
                    isWinner: i === roomData.winnerIndex,
                    isAI: p.isAI,
                  }))
                : undefined
            }
          />
        )}

        {/* ===== 投掷 / 语音特效层（fixed 覆盖，不挡点击） ===== */}
        <FunLayer flights={flights} bubbles={bubbles} />
      </div>
    </Spin>
  )
}

export default DouDiZhuPage
