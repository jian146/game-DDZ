import type {RouteObject} from "react-router-dom"
import {Link, Outlet, useParams, useSearchParams} from "react-router-dom"
import DouDiZhuPage from "./pages/DouDiZhu/douDiZhu"
import RoomPage from "./pages/DouDiZhu"

function Home() {
  return (
    <div>
      <h1>首页</h1>
      <p>这是 Home 页面。</p>
    </div>
  )
}

function About() {
  return (
    <div>
      <h1>关于</h1>
      <p>这是 About 页面。</p>
    </div>
  )
}

function UserLayout() {
  return (
    <div>
      <h2>用户中心</h2>
      {/* 二级路由的内容会渲染在这里 */}
      <Outlet />
    </div>
  )
}

function UserList() {
  const users = [
    {id: "1", name: "张三"},
    {id: "2", name: "李四"},
  ]

  return (
    <div>
      <h3>用户列表</h3>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {/* 动态路径参数 + query 参数 ?from=list */}
            <Link to={`/user/${u.id}?from=list`}>{u.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UserDetail() {
  // 1. 获取动态路径参数 /user/:id
  const {id} = useParams<{id: string}>()

  // 2. 获取 query 参数，例如 ?from=list&tab=info
  const [searchParams] = useSearchParams()
  const from = searchParams.get("from")
  const tab = searchParams.get("tab")

  return (
    <div>
      <h3>用户详情</h3>
      <p>当前用户 ID：{id}</p>
      <p>from 参数：{from ?? "无"}</p>
      <p>tab 参数：{tab ?? "无"}</p>

      {/* 一个示例链接：设置/修改 query 参数 */}
      <div style={{marginTop: 16}}>
        <Link to={`/user/${id}?from=detail&tab=info`}>
          设置 query 参数 tab=info
        </Link>
      </div>
    </div>
  )
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/about",
    element: <About />,
  },
  {
    path: "/user",
    element: <UserLayout />,
    children: [
      {
        path: "list", // 完整路径是 /user/list
        element: <UserList />,
      },
      {
        path: ":id", // 完整路径是 /user/:id
        element: <UserDetail />,
      },
    ],
  },
  {
    path: "/ddz/:roomId/:userId",
    element: <DouDiZhuPage />,
  },
  {
    path: "/room",
    element: <RoomPage />,
  },
]
