import {getUserInfo, setUserInfo} from "@/utils/user"

import {Modal, Form, Button, Avatar, Input, message, List, Tag} from "antd"

import {useState, useEffect} from "react"
import styles from "./index.module.less"
import newRequest from "@/utils/request"
import {I_roomData} from "./douDiZhu"
import moment from "moment"
import {useNavigate} from "react-router-dom"
// console.log('process.env',process.env.NODE_ENV)
const RoomPage = () => {
  const navigate = useNavigate()
  const [userName, setUserName] = useState<string>()
  const [isShowName, setIsShowName] = useState(false)
  const [roomList, setRoomList] = useState<I_roomData[]>([])
  const [form] = Form.useForm()

  /**
   * 检查用户是否注册了
   */
  const checkUser = () => {
    const user = getUserInfo()

    if (user.isLogin) {
      setUserName(user.userName)
    } else {
      // setIsShowName(true);
    }
  }
  const getRoomList = async () => {
    newRequest({
      url: "/api/roomList",
      options: {
        method: "GET",
        // params: params,
      },
    }).then((res: {isSuccess: boolean; roomList: I_roomData[]}) => {
      if (res && res.isSuccess) {
        setRoomList(res.roomList)
      }
    })
  }
  const onCreateRoom = async () => {
    newRequest({
      url: "/api/createRoom",
      options: {
        method: "post",
        data: {
          userName: userName,
        },
        // params: params,
      },
    }).then((res: {isSuccess: boolean; roomList: I_roomData[]}) => {
      if (res && res.isSuccess) {
      }
    })
  }
  const onFinish = (values: {userName: string}) => {
    if (values.userName.trim() !== "") {
      console.log("Success:", values)
      setUserName(values.userName)
      setUserInfo(values.userName)
      setIsShowName(false)
      message.success("创建成功!")
    } else {
      message.info("名称不能是空格!")
    }
  }
  const onJoin = (roomItem: I_roomData) => {
    if (userName) {
      navigate(`/ddz/${roomItem.roomId}/${userName}`)
      // history.push(`/doutDiZhu/${roomItem.roomId}/${userName}`);
    } else {
      setIsShowName(true)
    }
  }
  const onCreatAccount = () => {
    setIsShowName(true)
  }
  useEffect(() => {
    checkUser()
    getRoomList()
  }, [])
  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.user}>
          {/* <Avatar size={64} icon={<UserOutlined />} /> */}
          <div className={styles.userName}>{userName ?? "未创建"}</div>
        </div>
      </div>
      <div className={styles.content}>
        {userName ? (
          <div className={styles.roomList}>
            <List
              // header={<div>Header</div>}
              footer={
                <div className={styles.listFooter}>
                  <Button onClick={onCreateRoom} type="primary">
                    创建房间
                  </Button>
                </div>
              }
              bordered
              dataSource={roomList}
              renderItem={(item) => (
                <List.Item key={item.roomId}>
                  <div className={styles.create}>
                    <span className={styles.value}>
                      {moment(item.roomId).format("YYYY-MM-DD DD:hh")}
                    </span>
                  </div>
                  <div className={styles.player}>
                    {/* <span>成员:</span> */}
                    {item.player.length == 0 && <Tag>空无一人</Tag>}
                    {item.player.map((playerItem, index) => {
                      return (
                        <Avatar
                          key={index}
                          style={{
                            backgroundColor: "#ffbf00",
                            verticalAlign: "middle",
                          }}
                          size="large"
                        >
                          {playerItem.playerId}
                        </Avatar>
                      )
                    })}
                    {/* <span className={styles.playerItem}>张三</span>
                    <span className={styles.playerItem}>李四</span>
                    <span className={styles.playerItem}>王五</span> */}
                  </div>
                  <div>
                    <Button
                      onClick={() => onJoin(item)}
                      type="primary"
                      size="small"
                    >
                      加入房间
                    </Button>
                  </div>
                </List.Item>
              )}
            />
          </div>
        ) : (
          <Button onClick={onCreatAccount}>创建账号</Button>
        )}
      </div>
      <Modal
        open={isShowName}
        onCancel={() => {
          setIsShowName(false)
        }}
        onOk={() => {
          form.submit()
        }}
        cancelText="取消"
        okText="确定"
      >
        <div style={{paddingTop: 24}}>
          <Form onFinish={onFinish} form={form}>
            <Form.Item
              label="用户名"
              name="userName"
              rules={[
                {required: true, message: "请输入用户名!"},
                {max: 5, message: "长度不能超过5字符"},
              ]}
            >
              <Input />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  )
}

export default RoomPage
