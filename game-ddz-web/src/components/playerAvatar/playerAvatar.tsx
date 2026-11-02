import styles from "./playerAvatar.module.less"

/**
 * 默认头像：不依赖任何图片资源。
 * 用昵称做稳定哈希 → 从预设渐变色板里挑一个 → 显示首字符。
 * 同一个人每次进来颜色一致，不同人颜色区分度高。
 */

const GRADIENTS: [string, string][] = [
  ["#FF9A8B", "#FF6A88"], // 珊瑚红
  ["#4FACFE", "#00C6FB"], // 天蓝
  ["#43E97B", "#38F9D7"], // 青绿
  ["#FA709A", "#FEE140"], // 蜜桃黄
  ["#A18CD1", "#FBC2EB"], // 薰衣草
  ["#F6D365", "#FDA085"], // 杏橙
  ["#5EE7DF", "#B490CA"], // 薄荷紫
  ["#FF7E5F", "#FEB47B"], // 落日橙
  ["#6A11CB", "#2575FC"], // 深蓝紫
  ["#00B4DB", "#0083B0"], // 深海蓝
  ["#F093FB", "#F5576C"], // 玫红
  ["#0BA360", "#3CBA92"], // 翡翠绿
]

/** 稳定字符串哈希（FNV-1a 变体），保证同名同色 */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 取昵称首字符：中文取第一个字，英文取首字母大写 */
function firstChar(name: string): string {
  const trimmed = (name || "").trim()
  if (!trimmed) return "?"
  const ch = Array.from(trimmed)[0]
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
}

export interface I_PlayerAvatar {
  name: string
  isAI?: boolean
  /** 是否地主（显示皇冠角标） */
  isLandlord?: boolean
  /** 当前是否轮到该玩家（呼吸光圈） */
  isActive?: boolean
  /** 是否在线（离线灰显） */
  isOnline?: boolean
  /** 直径，px */
  size?: number
  className?: string
}

const PlayerAvatar: React.FC<I_PlayerAvatar> = ({
  name,
  isAI = false,
  isLandlord = false,
  isActive = false,
  isOnline = true,
  size = 56,
  className = "",
}) => {
  const [c1, c2] = isAI
    ? ["#8E7CFF", "#5B4BDB"]
    : GRADIENTS[hashString(name) % GRADIENTS.length]

  const fontSize = Math.round(size * 0.42)

  return (
    <div
      className={`${styles.wrap} ${isActive ? styles.active : ""} ${
        !isOnline ? styles.offline : ""
      } ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      <div
        className={styles.avatar}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          fontSize,
        }}
      >
        {isAI ? <span className={styles.aiIcon}>🤖</span> : firstChar(name)}
      </div>

      {isLandlord && (
        <span
          className={styles.crown}
          style={{ fontSize: Math.round(size * 0.34) }}
        >
          👑
        </span>
      )}

      {!isOnline && <span className={styles.offlineDot}>离线</span>}
    </div>
  )
}

export default PlayerAvatar
