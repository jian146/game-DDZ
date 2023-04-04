import { defineConfig } from 'umi';
import proxy from './config/proxy'

export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  proxy: proxy[ 'dev'],
  routes: [
    { path: '/', redirect:'/doutDiZhu/room'},
    // { path: '/', component: '@/pages/DouDiZhu/douDiZhu' },
    { path: '/doutDiZhu/room', component: '@/pages/DouDiZhu/index' },
    { path: '/doutDiZhu/:roomId/:userId', component: '@/pages/DouDiZhu/douDiZhu' },
    { path: '/h5', component: '@/pages/index' },
  ],
  fastRefresh: {},
  mfsu: {} //mfsu快速构建
});
