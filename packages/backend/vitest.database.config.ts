/**
 * Vitest 配置 - 数据库代理测试
 *
 * 这些测试不需要外部 PostgreSQL 连接
 * 使用内存 SQLite 和模拟适配器
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/database/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // 不使用全局 setup，因为这些测试不需要 PostgreSQL
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
