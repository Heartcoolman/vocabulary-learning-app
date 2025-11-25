import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // 测试超时设置（毫秒）
    testTimeout: 30000,
    // 钩子超时设置
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types/**',
        '**/index.ts', // 入口文件通常只是导出
        'prisma/**',
      ],
      // 覆盖率阈值 - 渐进式提升
      thresholds: {
        // 全局阈值
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
      // 每文件阈值（可选，更严格）
      // perFile: true,
    },
  },
});
