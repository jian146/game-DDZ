type EnvName = 'dev' | 'test' | 'pre' | 'prod'

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
    wsAddress: 'ws://localhost:9200',
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
  // ===== 单服务部署：前端被后端承载，同源 WS =====
  prod: {
    proxy: {},
    // 自动用当前页面协议（https→wss, http→ws）和 host，同源连接
    wsAddress: '__AUTO__',
  },
}

export default proxyConfig

