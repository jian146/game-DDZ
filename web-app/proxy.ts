type EnvName = 'dev' | 'test' | 'pre'

export type ProxyEnvConfig = Record<
  EnvName,
  Record<string, { target: string; changeOrigin: boolean }>
>

// Vite server proxy 配置映射（对应你的 umi proxy 示例 dev/test/pre）
const proxyConfig: ProxyEnvConfig = {
  dev: {
    '/api': {
      target: 'http://localhost:9200',
      changeOrigin: true,
    },
  },
  test: {
    '/api': {
      target: 'https://proxy.pule.com',
      changeOrigin: true,
    },
  },
  pre: {
    '/api': {
      target: 'https://yyk.pule.com',
      changeOrigin: true,
    },
  },
}

export default proxyConfig

