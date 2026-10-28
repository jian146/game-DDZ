import { getUserInfo, setUserInfo } from "@/utils/user"

import { Modal, Form, Button, Avatar, Input, message, List, Tag, Empty, Spin } from "antd"

import { useState, useEffect, useCallback } from "react"
import styles from "./index.module.less"
import newRequest from "@/utils/request"
import type { I_roomData } from "./douDiZhu"
import moment from "moment"
import { useNavigate } from "react-router-dom"

const RoomPage = () => {
  const navigate = useNavigate()
  const [userName, setUserName] = useState<string>()
  const [isShowName, setIsShowName] = useState(false)
  const [roomList, setRoomList] = useState<I_roomData[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const checkUser = useCallback(() => {
    const user = getUserInfo()
    if (user.isLogin) {
      setUserName(user.userName)
    }
  }, [])

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

  const onCreateRoom = async () => {
    if (!userName) return
    setLoading(true)
    try {
      const res: { isSuccess: boolean; roomId: number } | null =
        await newRequest({
          url: "/api/createRoom",
          options: {
            method: "POST",
            data: { userName },
          },
        })
      if (res && res.isSuccess) {
        message.success("创建房间成功，正在进入...")
        navigate(`/ddz/${res.roomId}/${userName}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const onFinish = (values: { userName: string }) => {
    const trimmed = values.userName.trim()
    if (trimmed === "") {
      message.info("名称不能是空格!")
      return
    }
    setUserName(trimmed)
    setUserInfo(trimmed)
    setIsShowName(false)
    message.success(`欢迎，${trimmed}！`)
  }

  const onJoin = (roomItem: I_roomData) => {
    if (!userName) {
      setIsShowName(true)
      return
    }
    navigate(`/ddz/${roomItem.roomId}/${userName}`)
  }

  useEffect(() => {
    checkUser()
    getRoomList()
  }, [checkUser, getRoomList])

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.user}>
          <div className={styles.userName}>{userName ?? "未登录"}</div>
        </div>
      </div>

      <div className={styles.content}>
        {userName ? (
          <div className={styles.roomList}>
            <Spin spinning={loading}>
              {roomList.length === 0 ? (
                <Empty
                  description="暂无房间"
                  style={{ padding: "40px 0" }}
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
                      <Button style={{ marginLeft: 12 }} onClick={getRoomList}>
                        刷新
                      </Button>
                    </div>
                  }
                  bordered
                  dataSource={roomList}
                  renderItem={(item) => (
                    <List.Item key={item.roomId}>
                      <div className={styles.create}>
                        <span className={styles.value}>
                          {moment(item.roomId).format("YYYY-MM-DD HH:mm")}
                        </span>
                      </div>
                      <div className={styles.player}>
                        {item.player.length === 0 && <Tag>空无一人</Tag>}
                        {item.player.map((playerItem, idx) => (
                          <Avatar
                            key={playerItem.playerId || idx}
                            style={{
                              backgroundColor: playerItem.isAI ? "#722ed1" : "#ffbf00",
                              verticalAlign: "middle",
                            }}
                            size="large"
                          >
                            {playerItem.isAI ? "🤖" : playerItem.playerId.charAt(0)}
                          </Avatar>
                        ))}
                      </div>
                      <div>
                        <Button
                          onClick={() => onJoin(item)}
                          type="primary"
                          size="small"
                          disabled={item.player.length >= 3}
                        >
                          {item.player.length >= 3 ? "已满" : "加入房间"}
                        </Button>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          </div>
        ) : (
          <Button type="primary" size="large" onClick={() => setIsShowName(true)}>
            创建账号开始游戏
          </Button>
        )}
      </div>

      <Modal
        open={isShowName}
        onCancel={() => setIsShowName(false)}
        onOk={() => form.submit()}
        cancelText="取消"
        okText="确定"
        title="设置用户名"
      >
        <div style={{ paddingTop: 8 }}>
          <Form onFinish={onFinish} form={form}>
            <Form.Item
              label="用户名"
              name="userName"
              rules={[
                { required: true, message: "请输入用户名!" },
                { max: 10, message: "长度不能超过10字符" },
              ]}
            >
              <Input placeholder="输入你的昵称" />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  )
}

export default RoomPage
