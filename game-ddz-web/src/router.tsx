import { lazy, type ReactNode } from "react"
import type { RouteObject } from "react-router-dom"
import { Navigate, useLocation } from "react-router-dom"
import { isLoggedIn } from "./utils/auth"

/**
 * 路由级懒加载
 *
 * 三个页面拆成独立 chunk，首屏只下载「框架 + 登录页」用得到的那部分。
 * 游戏页（douDiZhu.tsx + 卡牌 + 特效 + 音效）一千多行，不该挡住登录页。
 */
const AuthPage = lazy(() => import("./pages/Auth/auth"))
const RoomPage = lazy(() => import("./pages/DouDiZhu"))
const DouDiZhuPage = lazy(() => import("./pages/DouDiZhu/douDiZhu"))

/**
 * 登录守卫：未登录跳登录页，并记住原本要去的地址，
 * 登录成功后 AuthPage 会把用户送回这里。
 */
const RequireAuth = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  if (!isLoggedIn()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }
  return <>{children}</>
}

export const routes: RouteObject[] = [
  {
    // 默认进大厅，未登录时由守卫转到登录页
    path: "/",
    element: <Navigate to="/room" replace />,
  },
  {
    path: "/login",
    element: <AuthPage />,
  },
  {
    path: "/room",
    element: (
      <RequireAuth>
        <RoomPage />
      </RequireAuth>
    ),
  },
  {
    // userId 段保留只为兼容旧链接，实际身份以登录 token 为准
    path: "/ddz/:roomId/:userId",
    element: (
      <RequireAuth>
        <DouDiZhuPage />
      </RequireAuth>
    ),
  },
  {
    // 兜底：未匹配路由 → 回大厅
    path: "*",
    element: <Navigate to="/room" replace />,
  },
]
