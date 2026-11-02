import { Button } from "antd"
import styles from "./result.module.less"
import { playSound } from "@/utils/sound"

export interface I_ResultRow {
  name: string
  delta: number
  isMe: boolean
  isWinner: boolean
  isAI: boolean
}

interface I_Result {
  isSuccess?: boolean
  position: number
  onEndKeep: () => void
  /** 跑得快结算：显示各玩家增减分 */
  isPdk?: boolean
  /** 跑得快：我这一局的净增减 */
  delta?: number
  /** 跑得快：三家明细 */
  rows?: I_ResultRow[]
}

const Result: React.FC<I_Result> = ({
  isSuccess = true,
  position,
  onEndKeep = () => {},
  isPdk = false,
  delta,
  rows,
}) => {
  const roleNameList = ["地主", "农民", "农民"]
  const currentName = isPdk ? "" : roleNameList[position] ?? "玩家"

  return (
    <div className={styles.resultBox}>
      <div className={styles.mask} onClick={(e) => e.stopPropagation()}></div>

      <div className={styles.results}>
        <div className={styles.icon}>{isSuccess ? "🏆" : "💧"}</div>

        <div className={isSuccess ? styles.success : styles.fail}>
          {currentName}
          {isSuccess ? "胜利" : "失败"}
        </div>

        {isPdk ? (
          <>
            <div className={styles.subtitle}>
              {isSuccess ? "第一个出完牌，下局由你坐庄" : "再来一局找回场子"}
            </div>

            {typeof delta === "number" && (
              <div className={delta >= 0 ? styles.deltaBig : styles.deltaBigMinus}>
                {delta >= 0 ? "+" : ""}
                {delta} 分
              </div>
            )}

            {rows && rows.length > 0 && (
              <div className={styles.deltaList}>
                {rows.map((r) => (
                  <div
                    key={r.name}
                    className={`${styles.deltaRow} ${r.isMe ? styles.deltaMe : ""}`}
                  >
                    <span className={styles.deltaName}>
                      {r.isWinner && <span className={styles.crown}>👑</span>}
                      {r.name}
                      {r.isAI && <span className={styles.aiTag}>AI</span>}
                    </span>
                    <span
                      className={
                        r.delta > 0
                          ? styles.deltaUp
                          : r.delta < 0
                            ? styles.deltaDown
                            : styles.deltaZero
                      }
                    >
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.subtitle}>
            {isSuccess ? "漂亮的一手！" : "再来一局找回场子"}
          </div>
        )}

        <Button
          type="primary"
          size="large"
          className={styles.keepBtn}
          onClick={() => {
            playSound("click")
            onEndKeep()
          }}
        >
          继续
        </Button>
      </div>
    </div>
  )
}

export default Result
