import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// 检测是否在 Tauri 环境中运行
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

export default defineConfig({
  plugins: [
    react(),
    // Bundle 分析可视化
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],

  // Tauri 需要使用相对路径
  base: './',

  // 确保 WASM 和模型文件正确处理
  assetsInclude: ['**/*.wasm', '**/*.task'],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@danci/shared': path.resolve(__dirname, '../shared/src'),
    },
  },

  // 开发服务器配置
  server: {
    // Tauri Mobile 开发需要监听所有网络接口
    host: isTauri ? '0.0.0.0' : 'localhost',
    // 确保端口固定，Tauri 配置依赖此端口
    strictPort: true,
    // 启用强缓存，减少重复请求
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
    // API 代理配置
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // 优化依赖预构建
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@phosphor-icons/react'],
    // 排除 MediaPipe（动态加载 WASM）
    exclude: ['@mediapipe/tasks-vision'],
  },

  // Worker 配置
  worker: {
    format: 'es', // 使用 ES 模块格式，避免与 code-splitting 冲突
    rollupOptions: {
      output: {
        // Worker 独立打包，不参与主 bundle 的代码分割
        inlineDynamicImports: true,
      },
    },
  },

  // 构建优化配置
  build: {
    // 启用 CSS 代码分割
    cssCodeSplit: true,

    // 设置 chunk 大小警告限制（500kb）
    chunkSizeWarningLimit: 500,

    // 生成 sourcemap 用于生产环境调试
    sourcemap: false,

    // Tauri Mobile 兼容性目标
    target: isTauri ? ['es2021', 'chrome100', 'safari15'] : 'es2015',

    rollupOptions: {
      // 在非 Tauri 环境下，将 Tauri 相关模块标记为外部依赖
      // 这些模块在 Web 端不可用，但代码中使用动态导入并有运行时检查
      external: isTauri ? [] : [/^@tauri-apps\/.*/],

      output: {
        // 手动代码分割策略
        manualChunks: (id) => {
          // 将 node_modules 中的包分离到 vendor chunk
          if (id.includes('node_modules')) {
            // React 核心库单独打包
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }

            // React Router 单独打包
            if (id.includes('react-router-dom')) {
              return 'router-vendor';
            }

            // Framer Motion 动画库单独打包
            if (id.includes('framer-motion')) {
              return 'animation-vendor';
            }

            // Sentry 监控库单独打包
            if (id.includes('@sentry')) {
              return 'sentry-vendor';
            }

            // Phosphor Icons 图标库单独打包
            if (id.includes('@phosphor-icons')) {
              return 'icons-vendor';
            }

            // 其他第三方库统一打包
            return 'vendor';
          }

          // 将共享模块单独打包
          if (id.includes('@danci/shared')) {
            return 'shared';
          }
        },

        // 自定义 chunk 文件名
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },

    // 压缩选项
    minify: 'esbuild',
  },

  // 定义全局常量
  define: {
    // Tauri 环境标识
    __TAURI__: isTauri,
  },

  // 环境变量前缀
  envPrefix: ['VITE_', 'TAURI_'],
});
