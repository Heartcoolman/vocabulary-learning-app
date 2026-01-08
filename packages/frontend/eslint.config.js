// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import designSystemRules from './eslint-rules/design-system.js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'design-system': { rules: designSystemRules.rules },
    },
    rules: {
      // TypeScript 规则
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // React Hooks 规则
      ...reactHooks.configs.recommended.rules,

      // React Refresh 规则
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Console 规则 - 禁止在源代码中使用 console
      'no-console': 'error',

      // 设计规范规则 - 禁止非语义化类名
      'design-system/no-non-semantic-classes': 'warn',
      // 建议使用预定义按钮类 (可选，设为 off 可关闭)
      'design-system/prefer-btn-classes': 'off',
    },
  },
  // 测试文件豁免
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/tests/**/*.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      'no-console': 'off',
      'no-useless-catch': 'off',
      'react/display-name': 'off',
    },
  },
  // logger.ts 豁免 (需要使用 console 输出)
  {
    files: ['**/utils/logger.ts', '**/logger/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 性能分析和监控工具豁免
  {
    files: [
      '**/services/sentry.ts',
      '**/utils/performanceProfiler.tsx',
      '**/utils/performanceTest.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // Storybook 文件豁免（演示代码可使用 console）
  {
    files: ['**/stories/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  // Admin/Ops 监控组件豁免（需要 console 进行调试）
  {
    files: ['**/components/admin/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  // 配置和工具文件豁免
  {
    files: [
      '**/config/**/*.{ts,tsx}',
      '**/utils/abTesting.ts',
      '**/utils/notificationService.ts',
      '**/utils/emergency.ts',
      '**/utils/monitoring.ts',
      '**/utils/rolloutMonitoring.ts',
      '**/hooks/queries/useAuth.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // Web Worker 文件豁免（需要 console 进行调试）
  {
    files: ['**/workers/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  // 视觉疲劳检测服务豁免（需要 console 进行调试）
  {
    files: [
      '**/services/visual-fatigue/**/*.{ts,tsx}',
      '**/components/visual-fatigue/**/*.{ts,tsx}',
      '**/hooks/useVisualFatigue.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // 调试页面豁免
  {
    files: [
      '**/pages/admin/SystemDebugPage.tsx',
      '**/pages/admin/WordQualityPage.tsx',
      '**/pages/admin/word-quality/**/*.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // 忽略文件
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.ts',
    ],
  },
  ...storybook.configs['flat/recommended'],
);
