import type { RouteObject } from "react-router-dom"
import { Navigate } from "react-router-dom"
import DouDiZhuPage from "./pages/DouDiZhu/douDiZhu"
import RoomPage from "./pages/DouDiZhu"

export const routes: RouteObject[] = [
  {
    // 默认重定向到大厅
    path: "/",
    element: <Navigate to="/room" replace />,
  },
  {
    path: "/room",
    element: <RoomPage />,
  },
  {
    path: "/ddz/:roomId/:userId",
    element: <DouDiZhuPage />,
  },
  {
    // 兜底：未匹配路由 → 回大厅
    path: "*",
    element: <Navigate to="/room" replace />,
  },
]
