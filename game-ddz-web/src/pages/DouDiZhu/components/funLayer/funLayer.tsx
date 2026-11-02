import { useLayoutEffect, useState } from "react"
import styles from "./funLayer.module.less"

/**
 * 互动特效层
 *
 * 全部是 `position: fixed` 的覆盖层，`pointer-events: none`，不影响牌桌点击。
 * 起止坐标通过 `[data-pid]` 在 DOM 里反查头像元素算出来，
 * 所以窗口缩放、手机横竖屏都不会错位（每次投掷现算一次）。
 *
 * 生命周期交给父组件：到点自动从数组里删掉，这里不做自清理。
 */

export type T_ThrowItem = "tomato" | "egg"

export interface I_ThrowFlight {
  key: number
  item: T_ThrowItem
  /** 发起人昵称 */
  from: string
  /** 目标昵称 */
  to: string
}

export interface I_ChatBubble {
  key: number
  /** 说话的人 */
  from: string
  text: string
}

interface I_Props {
  flights: I_ThrowFlight[]
  bubbles: I_ChatBubble[]
}

const ITEM_EMOJI: Record<T_ThrowItem, string> = {
  tomato: "🍅",
  egg: "🥚",
}

/** 头像中心点（视口坐标）；找不到元素返回 null，由调用方兜底 */
function centerOf(pid: string): { x: number; y: number } | null {
  if (!pid) return null
  let el: HTMLElement | null = null
  try {
    el = document.querySelector<HTMLElement>(`[data-pid="${CSS.escape(pid)}"]`)
  } catch {
    return null
  }
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** 找不到头像时的兜底坐标：发起方走屏幕下沿，目标走屏幕中部 */
const fallbackFrom = () => ({
  x: window.innerWidth / 2,
  y: window.innerHeight * 0.82,
})
const fallbackTo = () => ({
  x: window.innerWidth / 2,
  y: window.innerHeight * 0.35,
})

interface I_Geom {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 单次投掷：先飞过去，落地后炸开 */
const Flight: React.FC<{ flight: I_ThrowFlight }> = ({ flight }) => {
  const [geom, setGeom] = useState<I_Geom | null>(null)
  const [landed, setLanded] = useState(false)

  // 用 layoutEffect 保证在首帧绘制前就把坐标算好，避免闪一下左上角
  useLayoutEffect(() => {
    const a = centerOf(flight.from) ?? fallbackFrom()
    const b = centerOf(flight.to) ?? fallbackTo()
    setGeom({ x0: a.x, y0: a.y, x1: b.x, y1: b.y })
  }, [flight.from, flight.to])

  if (!geom) return null

  const dx = geom.x1 - geom.x0
  const dy = geom.y1 - geom.y0
  const emoji = ITEM_EMOJI[flight.item] ?? "🍅"

  return (
    <>
      {!landed && (
        <div
          className={styles.anchor}
          style={{ left: geom.x0, top: geom.y0 }}
        >
          <div
            className={styles.projectile}
            style={
              {
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
              } as React.CSSProperties
            }
            onAnimationEnd={() => setLanded(true)}
          >
            {emoji}
          </div>
        </div>
      )}

      {landed && (
        <div className={styles.anchor} style={{ left: geom.x1, top: geom.y1 }}>
          <div className={styles.splat}>{emoji}</div>
          <div className={styles.ring} />
          {/* 四散的碎屑：用 4 个伪元素不方便，直接铺几个小点 */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={styles.drop}
              style={
                {
                  "--angle": `${i * 60 + 15}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </>
  )
}

/** 语音气泡：浮在头像上方，2.6 秒后自动淡出 */
const Bubble: React.FC<{ bubble: I_ChatBubble }> = ({ bubble }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const p = centerOf(bubble.from) ?? fallbackTo()
    setPos(p)
  }, [bubble.from])

  if (!pos) return null

  return (
    <div className={styles.bubbleAnchor} style={{ left: pos.x, top: pos.y }}>
      <div className={styles.bubble}>{bubble.text}</div>
    </div>
  )
}

const FunLayer: React.FC<I_Props> = ({ flights, bubbles }) => (
  <div className={styles.layer} aria-hidden="true">
    {flights.map((f) => (
      <Flight key={f.key} flight={f} />
    ))}
    {bubbles.map((b) => (
      <Bubble key={b.key} bubble={b} />
    ))}
  </div>
)

export default FunLayer
