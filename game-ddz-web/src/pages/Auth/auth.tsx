import { useEffect, useState } from "react"
import { Button, Form, Input, message, Tabs } from "antd"
import { useLocation, useNavigate } from "react-router-dom"
import styles from "./auth.module.less"
import { apiLogin, apiRegister, isLoggedIn, setAuth } from "@/utils/auth"
import { playSound, sound } from "@/utils/sound"

type Mode = "login" | "register"

interface I_FormValues {
  name: string
  password: string
  confirm?: string
}

const AuthPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>("login")
  const [loading, setLoading] = useState(false)
  const [loginForm] = Form.useForm<I_FormValues>()
  const [registerForm] = Form.useForm<I_FormValues>()

  // 被守卫拦下来时记住原本要去的地址，登录后原路返回
  const from = (location.state as { from?: string } | null)?.from ?? "/room"

  useEffect(() => {
    if (isLoggedIn()) {
      navigate(from, { replace: true })
    }
  }, [from, navigate])

  const onSubmit = async (values: I_FormValues) => {
    const name = values.name.trim()
    setLoading(true)
    try {
      const res =
        mode === "login"
          ? await apiLogin(name, values.password)
          : await apiRegister(name, values.password)

      if (!res.isSuccess || !res.token || !res.player) {
        message.error(res.message ?? "操作失败，请重试")
        return
      }

      setAuth(res.token, res.player)
      sound.unlock()
      playSound(mode === "login" ? "join" : "win")
      message.success(
        mode === "login"
          ? `欢迎回来，${res.player.name}`
          : `注册成功，${res.player.name}！`,
      )
      navigate(from, { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (key: string) => {
    setMode(key as Mode)
    playSound("click")
  }

  return (
    <div className={styles.page} onPointerDown={() => sound.unlock()}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.suits} aria-hidden>
            <span className={styles.red}>♥</span>
            <span>♠</span>
            <span className={styles.red}>♦</span>
            <span>♣</span>
          </div>
          <h1 className={styles.title}>欢乐斗地主</h1>
          <p className={styles.subtitle}>
            {mode === "login" ? "登录后继续你的战绩" : "注册一个账号，积分永久保存"}
          </p>
        </div>

        <Tabs
          activeKey={mode}
          onChange={switchMode}
          centered
          items={[
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
          ]}
        />

        {mode === "login" ? (
          <Form
            form={loginForm}
            layout="vertical"
            requiredMark={false}
            onFinish={onSubmit}
            autoComplete="on"
          >
            <Form.Item
              label="昵称"
              name="name"
              rules={[{ required: true, message: "请输入昵称" }]}
            >
              <Input
                size="large"
                placeholder="你的昵称"
                maxLength={10}
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                size="large"
                placeholder="你的密码"
                maxLength={32}
                autoComplete="current-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              className={styles.submit}
            >
              登录
            </Button>
          </Form>
        ) : (
          <Form
            form={registerForm}
            layout="vertical"
            requiredMark={false}
            onFinish={onSubmit}
            autoComplete="off"
          >
            <Form.Item
              label="昵称"
              name="name"
              rules={[
                { required: true, message: "请输入昵称" },
                { min: 2, message: "昵称至少 2 个字符" },
                { max: 10, message: "昵称最多 10 个字符" },
                {
                  pattern: /^[\u4e00-\u9fa5A-Za-z0-9_]+$/,
                  message: "只能包含中文、字母、数字和下划线",
                },
              ]}
            >
              <Input
                size="large"
                placeholder="2~10 个字符，注册后不可重复"
                maxLength={10}
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: "请设置密码" },
                { min: 4, message: "密码至少 4 位" },
                { max: 32, message: "密码最多 32 位" },
              ]}
            >
              <Input.Password
                size="large"
                placeholder="至少 4 位"
                maxLength={32}
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item
              label="确认密码"
              name="confirm"
              dependencies={["password"]}
              rules={[
                { required: true, message: "请再输入一次密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error("两次输入的密码不一致"))
                  },
                }),
              ]}
            >
              <Input.Password
                size="large"
                placeholder="再输入一次"
                maxLength={32}
                autoComplete="new-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              className={styles.submit}
            >
              注册并进入
            </Button>
          </Form>
        )}

        <p className={styles.tip}>
          {mode === "login" ? "还没有账号？" : "已经有账号了？"}
          <a
            onClick={() =>
              switchMode(mode === "login" ? "register" : "login")
            }
          >
            {mode === "login" ? "立即注册" : "去登录"}
          </a>
        </p>
      </div>
    </div>
  )
}

export default AuthPage
