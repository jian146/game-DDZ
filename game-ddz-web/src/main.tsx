import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.css'
import App from './App.tsx'

/** 主题色跟牌桌保持一致，避免默认蓝色按钮在绿色背景上很跳 */
const theme = {
  token: {
    colorPrimary: '#52a83f',
    colorInfo: '#52a83f',
    colorLink: '#3f8b36',
    borderRadius: 8,
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={theme}
      // 关掉「退 出」「加 入」这种两字按钮自动插空格，中文里显得松散
      button={{ autoInsertSpace: false }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
)
