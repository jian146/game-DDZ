import { useCallback, useEffect, useState } from "react"
import { Button, Empty, List, message, Popconfirm, Segmented, Spin } from "antd"
import { useNavigate } from "react-router-dom"
import styles from "./index.module.less"
import newRequest from "@/utils/request"
import type { I_roomData } from "./douDiZhu"
import PlayerAvatar from "@/components/playerAvatar/playerAvatar"
import { playSound, sound } from "@/utils/sound"
import { apiMe, getPlayer, logout, type I_Player } from "@/utils/auth"

/** 玩法：斗地主 / 跑得快 */
type T_Mode = "ddz" | "pdk"

const MODE_LABEL: Record<T_Mode, string> = {
  ddz: "斗地主",
  pdk: "跑得快",
}

/**
 * 房间号就是创建时间戳，这里只用来显示「MM-DD HH:mm」。
 * 之前引了 moment —— 为了格式化一个日期，多打进去 70KB，不值。
 */
const formatRoomTime = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const RoomPage = () => {
  const navigate = useNavigate()
  // 先用本地缓存渲染，避免首屏空白；随后用服务端数据校准
  const [player, setPlayer] = useState<I_Player | null>(() => getPlayer())
  const [roomList, setRoomList] = useState<I_roomData[]>([])
  const [loading, setLoading] = useState(false)
  /** 建房时选的玩法 */
  const [mode, setMode] = useState<T_Mode>("ddz")

  const getRoomList = useCallback(async () => {
    setLoading(true)
    try {
      const res: { isSuccess: boolean; roomList: I_roomData[] } | null =
        await newRequest({ url: "/api/roomList", options: { method: "GET" } })
      if (res && res.isSuccess) {
        setRoomList(res.roomList)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true

    // 校验本地 token 是否还有效，顺便刷新积分（可能刚打完一局回来）
    apiMe().then((p) => {
      if (!alive) return
      if (!p) {
        message.warning("登录已过期，请重新登录")
        logout()
        navigate("/login", { replace: true })
        return
      }
      setPlayer(p)
    })

    getRoomList()
    return () => {
      alive = false
    }
  }, [getRoomList, navigate])

  const onCreateRoom = async () => {
    if (!player) return
    playSound("click")
    setLoading(true)
    try {
      const res: { isSuccess: boolean; roomId: number } | null =
        await newRequest({
          url: "/api/createRoom",
          options: { method: "POST", data: { userName: player.name, mode } },
        })
      if (res && res.isSuccess) {
        message.success(`创建${MODE_LABEL[mode]}房间成功，正在进入...`)
        navigate(`/ddz/${res.roomId}/${player.name}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const onJoin = (roomItem: I_roomData) => {
    if (!player) return
    playSound("click")
    navigate(`/ddz/${roomItem.roomId}/${player.name}`)
  }

  const onLogout = () => {
    playSound("click")
    logout()
    message.success("已退出登录")
    navigate("/login", { replace: true })
  }

  return (
    <div className={styles.page} onPointerDown={() => sound.unlock()}>
      {/* 顶部账号信息 */}
      <div className={styles.headRow}>
        <div className={styles.user}>
          <PlayerAvatar name={player?.name ?? "游客"} size={52} isOnline />

          <div className={styles.userMeta}>
            <div className={styles.userName}>{player?.name ?? "未登录"}</div>
            <div className={styles.userStats}>
              <span className={styles.score}>{player?.score ?? 0} 分</span>
              <span className={styles.sep}>·</span>
              <span>
                {player?.wins ?? 0} 胜 / {player?.games ?? 0} 局
              </span>
            </div>
          </div>

          <Popconfirm
            title="退出登录？"
            description="积分和胜场都已保存在服务器，随时可以回来"
            okText="退出"
            cancelText="留下"
            onConfirm={onLogout}
          >
            <Button size="small" danger>
              退出
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.roomList}>
          <div className={styles.listTitle}>
            <span>房间列表</span>
            <span className={styles.count}>{roomList.length} 个</span>
          </div>

          {/* 玩法选择：只影响「创建房间」，加入别人的房间以房间本身为准 */}
          <div className={styles.modeBar}>
            <Segmented
              size="small"
              value={mode}
              onChange={(v) => {
                playSound("click")
                setMode(v as T_Mode)
              }}
              options={[
                { label: "斗地主", value: "ddz" },
                { label: "跑得快", value: "pdk" },
              ]}
            />
            <span className={styles.modeHint}>
              {mode === "pdk"
                ? "48 张牌 · 能管必须管 · 先出完为胜"
                : "54 张牌 · 叫地主 · 2 打 1"}
            </span>
          </div>

          <Spin spinning={loading}>
            {roomList.length === 0 ? (
              <Empty
                description="暂无房间"
                style={{ padding: "32px 0" }}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" onClick={onCreateRoom}>
                  创建第一个房间
                </Button>
              </Empty>
            ) : (
              <List
                footer={
                  <div className={styles.listFooter}>
                    <Button
                      onClick={onCreateRoom}
                      type="primary"
                      loading={loading}
                    >
                      创建房间
                    </Button>
                    <Button onClick={getRoomList}>刷新</Button>
                  </div>
                }
                dataSource={roomList}
                renderItem={(item) => {
                  const isFull = item.player.length >= 3
                  return (
                    <List.Item key={item.roomId}>
                      <div className={styles.roomRow}>
                        <div className={styles.roomInfo}>
                          <div className={styles.roomTime}>
                            <span
                              className={
                                item.mode === "pdk" ? styles.tagPdk : styles.tagDdz
                              }
                            >
                              {MODE_LABEL[(item.mode as T_Mode) ?? "ddz"]}
                            </span>
                            {formatRoomTime(item.roomId)}
                          </div>
                          <div className={styles.roomIdText}>#{item.roomId}</div>
                        </div>

                        <div className={styles.player}>
                          {item.player.length === 0 && (
                            <span className={styles.emptyHint}>空无一人</span>
                          )}
                          {item.player.map((playerItem, idx) => (
                            <PlayerAvatar
                              key={playerItem.playerId || idx}
                              name={playerItem.playerId}
                              isAI={playerItem.isAI}
                              size={34}
                            />
                          ))}
                        </div>

                        <Button
                          onClick={() => onJoin(item)}
                          type="primary"
                          size="small"
                          disabled={isFull}
                          className={styles.joinBtn}
                        >
                          {isFull ? "已满" : "加入"}
                        </Button>
                      </div>
                    </List.Item>
                  )
                }}
              />
            )}
          </Spin>
        </div>
      </div>
    </div>
  )
}

export default RoomPage
