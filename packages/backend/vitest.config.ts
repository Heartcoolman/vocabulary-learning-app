import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'], // 移除 html/json 以减少内存占用
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      reportsDirectory: './coverage',
      // 覆盖率阈值要求
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    reporters: ['verbose'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

// 测试分组配置 - 用于 vitest workspace
export const testGroups = {
  // 第一部分：Backend 单元测试 - Services
  'backend:unit:services': {
    include: ['tests/unit/services/**/*.test.ts'],
    name: 'Backend Unit - Services',
  },
  // 第二部分：Backend 单元测试 - AMAS 模块
  'backend:unit:amas': {
    include: ['tests/unit/amas/**/*.test.ts'],
    name: 'Backend Unit - AMAS',
  },
  // 第三部分：Backend 单元测试 - Middleware
  'backend:unit:middleware': {
    include: ['tests/unit/middleware/**/*.test.ts'],
    name: 'Backend Unit - Middleware',
  },
  // 第四部分：Backend 集成测试 - API Routes
  'backend:integration': {
    include: ['tests/integration/**/*.test.ts'],
    name: 'Backend Integration - API',
  },
  // 第五部分：Backend 性能测试
  'backend:performance': {
    include: ['tests/performance/**/*.test.ts'],
    name: 'Backend Performance',
  },
};
