type EnvName = 'dev' | 'test' | 'pre'

export type EnvConfig = {
  proxy: Record<string, { target: string; changeOrigin: boolean }>
  wsAddress: string
}

export type ProxyEnvConfig = Record<EnvName, EnvConfig>

const proxyConfig: ProxyEnvConfig = {
  dev: {
    proxy: {
      '/api': {
        target: 'http://localhost:9200',
        changeOrigin: true,
      },
    },
    wsAddress: 'ws://localhost:9201',
  },
  test: {
    proxy: {
      '/api': {
        target: 'https://proxy.pule.com',
        changeOrigin: true,
      },
    },
    wsAddress: 'wss://proxy.pule.com',
  },
  pre: {
    proxy: {
      '/api': {
        target: 'http://game-ddz-server-production.up.railway.app',
        changeOrigin: true,
      },
    },
    wsAddress: 'wss://game-ddz-server-production.up.railway.app',
  },
}

export default proxyConfig

