import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

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
    // 动态注入 API 预连接
    {
      name: 'inject-api-preconnect',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          // 从环境变量获取 API URL
          const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';

          // 解析 URL 以提取 origin (协议 + 域名 + 端口)
          let apiOrigin: string;
          try {
            const url = new URL(apiUrl);
            // 生产环境自动升级到 HTTPS (排除 localhost)
            if (
              process.env.NODE_ENV === 'production' &&
              url.protocol === 'http:' &&
              !url.hostname.includes('localhost') &&
              !url.hostname.includes('127.0.0.1')
            ) {
              url.protocol = 'https:';
            }
            apiOrigin = url.origin;
          } catch (error) {
            // 如果解析失败，使用默认值
            apiOrigin =
              process.env.NODE_ENV === 'production'
                ? 'https://api.example.com'
                : 'http://localhost:3000';
          }

          // 注入 preconnect 和 dns-prefetch 标签
          const preconnectTags = `
    <!-- API 资源预连接 (动态注入) -->
    <link rel="preconnect" href="${apiOrigin}" crossorigin>
    <link rel="dns-prefetch" href="${apiOrigin}">`;

          // 在 </head> 标签之前插入
          return html.replace('</head>', `${preconnectTags}\n  </head>`);
        },
      },
    },
  ],

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

  // 构建优化配置（保守方案）
  build: {
    // 启用 CSS 代码分割
    cssCodeSplit: true,

    // 设置 chunk 大小警告限制（500kb）
    chunkSizeWarningLimit: 500,

    // 生成 sourcemap 用于生产环境调试
    sourcemap: false,

    // 提升到现代浏览器目标，提高性能和减小体积
    target: 'es2020',

    rollupOptions: {
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

    // 使用 esbuild 压缩（保守方案：保留console，不激进压缩）
    minify: 'esbuild',

    // esbuild 压缩配置（保守配置）
    esbuild: {
      // 保留console语句，避免生产环境调试困难
      drop: [],
      // 保持合理的压缩级别
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
    },
  },
});
