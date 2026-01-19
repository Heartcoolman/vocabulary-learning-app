import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { execSync } from 'child_process';

function getGitVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${date}-${hash}`;
  } catch {
    return '0.0.0';
  }
}

function resolveApiConnectionTargets(
  apiUrl: string,
  isProduction: boolean,
): { apiOrigin: string; dnsPrefetchHref: string } {
  try {
    const url = new URL(apiUrl);

    // 生产环境自动升级到 HTTPS (排除 localhost)
    if (
      isProduction &&
      url.protocol === 'http:' &&
      !url.hostname.includes('localhost') &&
      !url.hostname.includes('127.0.0.1')
    ) {
      url.protocol = 'https:';
    }

    return { apiOrigin: url.origin, dnsPrefetchHref: `//${url.host}` };
  } catch {
    const fallback = isProduction ? 'https://api.example.com' : 'http://localhost:3000';
    const url = new URL(fallback);
    return { apiOrigin: url.origin, dnsPrefetchHref: `//${url.host}` };
  }
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const appVersion = getGitVersion();

  // Vite 配置文件运行在 Node 侧，需显式加载 packages/frontend/.env* 供此处使用
  const env = loadEnv(mode, __dirname, 'VITE_');
  const apiUrlRaw = (env.VITE_API_URL ?? '').trim();

  // 代理目标：即使 VITE_API_URL 为空（同源模式），开发环境仍需要 proxy 转发 /api
  const apiUrlForProxy = apiUrlRaw || 'http://localhost:3000';
  const { apiOrigin: proxyTargetOrigin } = resolveApiConnectionTargets(
    apiUrlForProxy,
    isProduction,
  );

  // 预连接：仅在明确配置了跨域 API URL 时注入（同源模式无需预连接）
  const preconnectTargets = apiUrlRaw ? resolveApiConnectionTargets(apiUrlRaw, isProduction) : null;

  return {
    // 定义环境变量（构建时注入）
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },

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
            if (!preconnectTargets) {
              return html;
            }

            const { apiOrigin, dnsPrefetchHref } = preconnectTargets;
            const preconnectTags = `
    <!-- API 资源预连接 (动态注入) -->
    <link rel="preconnect" href="${apiOrigin}" crossorigin>
    <link rel="dns-prefetch" href="${dnsPrefetchHref}">`;

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
      // API 代理配置（保持与 VITE_API_URL 一致，避免硬编码 localhost）
      proxy: {
        '/api': {
          target: proxyTargetOrigin,
          changeOrigin: true,
          cookieDomainRewrite: '',
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
  };
});
