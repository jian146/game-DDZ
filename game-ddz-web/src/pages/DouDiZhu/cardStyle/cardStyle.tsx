import Decor from "@/components/decor/decor"

import styles from "./cardStyle.module.less"
import type { I_Card } from "@/utils/card"

interface I_CardStyle {
  card: I_Card
  activeCardId: number[]
  onClickCard: (card: I_Card) => void
  /** 只展示不可点（出牌区、底牌用），省掉 hover 抬升和手型光标 */
  disabled?: boolean
}

const CardStyle: React.FC<I_CardStyle> = ({
  card,
  onClickCard,
  activeCardId,
  disabled = false,
}) => {
  const isActive = activeCardId.indexOf(card.id) >= 0
  const isRed = card.color === 1 || card.color === 3

  return (
    <div
      className={[
        styles.cardBox,
        isActive && styles.active,
        isRed && styles.redColor,
        disabled && styles.noPointer,
      ]
        .filter(Boolean)
        .join(" ")}
      // 不写内联 zIndex：交给 DOM 顺序决定层叠（后渲染的盖前面的，
      // 每张牌露出左侧点数区）。选中态由 CSS .active 提升到最上层。
    >
      {/*
        点击热区：只覆盖「这张牌自己露出来的那一条」，宽度 = 牌宽 + 重叠量。
        牌本身 pointer-events: none，点击只能落在热区上。
        否则叠牌时整张牌都接收点击，选中牌一旦被提到最上层，
        就会把旁边那张牌露出的点数区一起挡住 —— 表现为「点不到旁边的牌」。
      */}
      {!disabled && (
        <div
          className={styles.cardHit}
          data-card-hit={card.id}
          onClick={(e) => {
            onClickCard(card)
            e.stopPropagation()
          }}
        />
      )}

      {/* 左上角：点数 + 花色 */}
      <div className={styles.cardName}>
        {card.point < 17 ? (
          <>
            <div>{card.name}</div>
            <Decor cardColor={card.color} point={card.point} />
          </>
        ) : (
          <div className={styles.joker}>{card.name}</div>
        )}
      </div>

      {/* 中间大花色 / 大小王文字 */}
      <div className={styles.content}>
        {card.point < 17 ? (
          <Decor cardColor={card.color} point={card.point} />
        ) : (
          <div className={styles.jokerContent}>
            {card.point === 17 ? "小王" : "大王"}
          </div>
        )}
      </div>
    </div>
  )
}

export default CardStyle
