import { Suspense } from "react"
import { useRoutes } from "react-router-dom"
import { routes } from "./router"
import PageLoading from "./components/pageLoading/pageLoading"

function App() {
  const element = useRoutes(routes)

  return (
    // 路由是 lazy 的，chunk 没到位时显示加载页（视觉和 index.html 的首屏骨架一致）
    <Suspense fallback={<PageLoading />}>{element}</Suspense>
  )
}

export default App
