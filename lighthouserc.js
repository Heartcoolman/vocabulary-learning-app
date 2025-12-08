module.exports = {
  ci: {
    collect: {
      // 收集配置
      numberOfRuns: 3, // 运行3次取平均值
      startServerCommand: 'pnpm run preview', // 启动预览服务器
      startServerReadyPattern: 'Local:', // 服务器就绪标志
      startServerReadyTimeout: 30000, // 服务器启动超时时间
      url: ['http://localhost:4173'], // 要测试的URL
      settings: {
        // Lighthouse 设置
        preset: 'desktop', // 使用桌面配置
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        // Chrome 标志
        chromeFlags: '--no-sandbox --headless --disable-gpu',
        // 跳过审计
        skipAudits: ['uses-http2'],
        // 性能预算配置
        budgets: [
          {
            resourceSizes: [
              { resourceType: 'total', budget: 450 }, // 总资源大小 < 450KB
              { resourceType: 'script', budget: 300 }, // JS 大小 < 300KB
              { resourceType: 'stylesheet', budget: 50 }, // CSS 大小 < 50KB
              { resourceType: 'image', budget: 100 }, // 图片大小 < 100KB
              { resourceType: 'font', budget: 100 }, // 字体大小 < 100KB
            ],
            timings: [
              { metric: 'first-contentful-paint', budget: 2000 }, // FCP < 2s
              { metric: 'interactive', budget: 3000 }, // TTI < 3s
              { metric: 'largest-contentful-paint', budget: 2500 }, // LCP < 2.5s
            ],
          },
        ],
        // 节流配置 (模拟真实网络)
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
      },
    },
    assert: {
      // 断言配置 - 性能阈值
      assertions: {
        // 性能分数阈值 (0-1)
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.85 }],
        'categories:seo': ['error', { minScore: 0.9 }],

        // Core Web Vitals 阈值
        // LCP (Largest Contentful Paint) < 2.5s
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        // CLS (Cumulative Layout Shift) < 0.1
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // FID/TBT (Total Blocking Time) < 200ms
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        // FCP (First Contentful Paint) < 1.8s
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        // TTI (Time to Interactive) < 3s
        interactive: ['error', { maxNumericValue: 3000 }],
        // Speed Index < 3s
        'speed-index': ['error', { maxNumericValue: 3000 }],

        // 资源优化
        'uses-text-compression': 'warn',
        'uses-responsive-images': 'warn',
        'offscreen-images': 'warn',
        'unminified-css': 'error',
        'unminified-javascript': 'error',
        'unused-css-rules': 'warn',
        'unused-javascript': 'warn',
        'modern-image-formats': 'warn',
        'uses-optimized-images': 'warn',
        'efficient-animated-content': 'warn',

        // 缓存策略
        'uses-long-cache-ttl': 'warn',

        // 可访问性
        'color-contrast': 'error',
        'image-alt': 'error',
        'button-name': 'error',
        'link-name': 'error',
        'document-title': 'error',
        'html-has-lang': 'error',
        'meta-viewport': 'error',

        // SEO
        'meta-description': 'error',
        'robots-txt': 'warn',
        canonical: 'warn',

        // 最佳实践
        'errors-in-console': 'warn',
        'no-vulnerable-libraries': 'error',
        'csp-xss': 'warn',
      },
    },
    upload: {
      // 上传配置
      target: 'temporary-public-storage', // 使用临时公共存储
      // 或者使用 LHCI Server:
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.example.com',
      // token: process.env.LHCI_TOKEN,
    },
  },
};
