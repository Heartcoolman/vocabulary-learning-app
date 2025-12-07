/// <reference types="vite/client" />

/**
 * 前端环境变量类型定义
 * 用于提供 import.meta.env 的类型安全访问
 */

interface ImportMetaEnv {
  /**
   * 后端 API 地址
   * @example "http://localhost:3000"
   */
  readonly VITE_API_URL: string;

  /**
   * Sentry DSN（可选）
   * 用于错误追踪和监控
   * @example "https://xxxx@xxxx.ingest.sentry.io/xxxx"
   */
  readonly VITE_SENTRY_DSN?: string;

  /**
   * 应用版本号（可选）
   * 用于 Sentry release 追踪
   * @example "1.0.0"
   */
  readonly VITE_APP_VERSION?: string;

  /**
   * Vite 内置环境变量
   */
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
