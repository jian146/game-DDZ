import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import proxyConfig from './proxy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envKey =
    mode === 'test' ? 'test'
    : mode === 'pre' ? 'pre'
    : mode === 'production' ? 'prod'
    : ('dev' as const)

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@/utils': path.resolve(__dirname, 'src/utils'),
      },
    },
    define: {
      __WS_ADDRESS__: JSON.stringify(proxyConfig[envKey].wsAddress),
    },
    server: {
      port: 9100,
      strictPort: true,
      proxy: proxyConfig[envKey].proxy,
    },
    // 构建输出到 dist（默认就是 dist，但显式写出来清楚）
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // 单文件超过 500KB 时 Vite 会警告，这里拆包后不会再触发
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          /**
           * 手动分包：把「几乎不变」的依赖和「天天改」的业务代码分开。
           * 静态资源已经设成 immutable 长缓存，拆开之后改业务代码
           * 不会让用户重新下载 500KB 的 antd。
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (
              /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)
            ) {
              return 'react'
            }
            if (
              /[\\/]node_modules[\\/](antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/.test(id)
            ) {
              return 'antd'
            }
            return 'vendor'
          },
        },
      },
    },
  }
})
