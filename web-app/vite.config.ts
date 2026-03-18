import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import proxyConfig from './proxy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envKey =
    mode === 'test' ? 'test' : mode === 'pre' ? 'pre' : ('dev' as const)

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
  }
})
