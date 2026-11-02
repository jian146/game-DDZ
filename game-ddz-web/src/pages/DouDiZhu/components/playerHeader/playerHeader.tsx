import styles from "./playerHeader.module.less"
import PlayerAvatar from "@/components/playerAvatar/playerAvatar"
import type { I_player } from "../../douDiZhu"

/**
 * 玩家头像位
 *
 * 版式参考手游牌桌：
 *   ┌─────┐
 *   │ 头像 │  ②   ← 蓝色方块角标 = 剩余牌数
 *   └─────┘
 *   ┌──────────┐
 *   │ 昵称      │  ← 深色信息板，两行
 *   │ ● 积分    │
 *   └──────────┘
 */
interface I_PlayerHeader {
  player: I_player
  /** 0=自己 1=右家 2=左家（已按自己优先排序） */
  index: number
  /** 是否轮到该玩家操作 */
  isActive?: boolean
  /** 头像直径 px */
  avatarSize?: number
  /** 传了就在头像右上角显示移除按钮（只有房主、准备阶段、目标是 AI 时才传） */
  onRemove?: () => void
  /** 刚被道具砸中：抖动一下（父组件 500ms 后置回 false） */
  isHit?: boolean
}

const PlayerHeader: React.FC<I_PlayerHeader> = ({
  player,
  index,
  isActive = false,
  avatarSize = 52,
  onRemove,
  isHit = false,
}) => {
  const isLandlord = player.position === 0
  /** 牌数只在发牌之后显示，准备阶段手上没牌 */
  const showCount = player.card.length > 0

  return (
    <div
      className={`${styles.playerSlot} ${styles["slot" + index] || ""}`}
      /* 投掷特效层靠这个属性反查头像位置 */
      data-pid={player.playerId}
    >
      <div className={`${styles.avatarWrap} ${isHit ? styles.hit : ""}`}>
        <PlayerAvatar
          name={player.playerId}
          isAI={player.isAI}
          isLandlord={isLandlord}
          isActive={isActive}
          isOnline={player.isOnline}
          size={avatarSize}
        />

        {showCount && (
          <span
            className={styles.cardCount}
            title={`还剩 ${player.card.length} 张`}
          >
            {player.card.length}
          </span>
        )}

        {onRemove && (
          <button
            type="button"
            className={styles.removeBtn}
            title="移除这个 AI"
            aria-label={`移除 ${player.playerId}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.plate}>
        <div className={styles.nameRow}>
          {/* 名字本身已带 "AI" 前缀时不再重复加徽章 */}
          {player.isAI && !/^AI/i.test(player.playerId) && (
            <span className={styles.aiBadge}>AI</span>
          )}
          <span className={styles.nameText}>{player.playerId}</span>
        </div>

        <div className={styles.scoreRow}>
          <span className={styles.coin} />
          <span className={styles.scoreValue}>{player.score}</span>
        </div>
      </div>
    </div>
  )
}

export default PlayerHeader
