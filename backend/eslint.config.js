import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript 规则
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Console 规则 - 禁止在源代码中使用 console
      'no-console': [
        'error',
        {
          allow: [], // 不允许任何 console 方法
        },
      ],
    },
  },
  // 测试文件豁免
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts', '**/__tests__/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // logger 模块豁免 (需要使用 console 输出)
  {
    files: ['**/logger/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 脚本文件豁免
  {
    files: ['**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 忽略文件
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '*.config.js', '*.config.ts'],
  },
];
