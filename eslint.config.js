import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLAudioElement: 'readonly',
        Audio: 'readonly',
        MediaSource: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBTransaction: 'readonly',
        IDBObjectStore: 'readonly',
        IDBRequest: 'readonly',
        IDBCursor: 'readonly',
        IDBKeyRange: 'readonly',
        Notification: 'readonly',
        ServiceWorker: 'readonly',
        caches: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // TypeScript 规则
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // React Hooks 规则
      ...reactHooks.configs.recommended.rules,

      // React Refresh 规则
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

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
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  // logger.ts 豁免 (需要使用 console 输出)
  {
    files: ['**/utils/logger.ts', '**/logger/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 忽略文件
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '*.config.js', '*.config.ts', 'vite.config.ts'],
  },
];
