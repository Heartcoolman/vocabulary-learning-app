import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // 开发服务器配置
  server: {
    // 启用强缓存，减少重复请求
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
  },

  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@phosphor-icons/react',
    ],
  },

  // @ts-ignore - vitest 配置在 Vite 5.x 中需要特殊类型
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
