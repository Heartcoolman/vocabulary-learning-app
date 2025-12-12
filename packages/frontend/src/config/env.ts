/**
 * 前端环境变量配置
 *
 * 提供类型安全的环境变量访问和验证
 * 所有环境变量都通过此文件统一访问，避免直接使用 import.meta.env
 *
 * 注意：此文件不能导入 logger，因为 logger 依赖 env，会造成循环依赖
 */

/**
 * 检测是否在 Tauri 环境中运行
 */
function isTauriEnvironment(): boolean {
  // 检查 Tauri 全局标识（Vite 构建时注入）
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    return true;
  }
  // 运行时检查 Tauri API 是否存在
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return true;
  }
  return false;
}

/**
 * 获取 API 地址
 * Tauri 环境下优先使用 VITE_TAURI_API_URL
 */
function getApiUrl(): string {
  const isTauri = isTauriEnvironment();

  // Tauri 环境下优先使用专用的 API 地址
  if (isTauri && import.meta.env.VITE_TAURI_API_URL) {
    return import.meta.env.VITE_TAURI_API_URL;
  }

  // 默认使用标准 API 地址
  return import.meta.env.VITE_API_URL;
}

/**
 * 环境变量配置接口
 */
interface EnvConfig {
  /** 后端 API 地址 */
  apiUrl: string;
  /** Tauri 专用 API 地址（可选） */
  tauriApiUrl: string | undefined;
  /** Sentry DSN（可选） */
  sentryDsn: string | undefined;
  /** 应用版本号（可选） */
  appVersion: string | undefined;
  /** 当前环境模式 */
  mode: string;
  /** 是否为生产环境 */
  isProd: boolean;
  /** 是否为开发环境 */
  isDev: boolean;
  /** 是否在 Tauri 环境中运行 */
  isTauri: boolean;
}

/**
 * 验证必需的环境变量
 */
function validateEnv(): void {
  const missingVars: string[] = [];
  const isTauri = isTauriEnvironment();

  // 验证必需的环境变量
  if (!import.meta.env.VITE_API_URL) {
    missingVars.push('VITE_API_URL');
  }

  if (missingVars.length > 0) {
    const errorMsg = `缺少必需的环境变量: ${missingVars.join(', ')}`;
    console.error('[env]', errorMsg);
    throw new Error(errorMsg);
  }

  // 验证 API URL 格式
  const apiUrl = getApiUrl();
  try {
    new URL(apiUrl);
  } catch {
    const errorMsg = `API URL 格式无效: ${apiUrl}`;
    console.error('[env]', errorMsg);
    throw new Error(errorMsg);
  }

  // Tauri 环境信息
  if (isTauri) {
    console.info('[env] 运行在 Tauri 环境');
    if (import.meta.env.VITE_TAURI_API_URL) {
      console.info('[env] 使用 Tauri 专用 API 地址:', import.meta.env.VITE_TAURI_API_URL);
    }
  }

  // 开发环境警告
  if (import.meta.env.DEV) {
    console.info('[env] 运行在开发模式');
    if (apiUrl.includes('localhost')) {
      console.debug('[env] 使用本地 API 服务器');
    }
  }

  // 生产环境检查
  if (import.meta.env.PROD) {
    console.info('[env] 运行在生产模式');

    // 生产环境建议配置 Sentry
    if (!import.meta.env.VITE_SENTRY_DSN) {
      console.warn('[env] 生产环境未配置 VITE_SENTRY_DSN，错误追踪将不可用');
    }

    // 生产环境建议配置版本号
    if (!import.meta.env.VITE_APP_VERSION) {
      console.warn('[env] 生产环境未配置 VITE_APP_VERSION，版本追踪将不可用');
    }

    // 生产环境不应该使用 localhost（Tauri 除外）
    if (!isTauri && apiUrl.includes('localhost')) {
      console.warn('[env] 生产环境使用了 localhost API 地址，这可能是配置错误');
    }
  }
}

/**
 * 创建环境变量配置对象
 */
function createEnvConfig(): EnvConfig {
  return {
    apiUrl: getApiUrl(),
    tauriApiUrl: import.meta.env.VITE_TAURI_API_URL,
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    appVersion: import.meta.env.VITE_APP_VERSION,
    mode: import.meta.env.MODE,
    isProd: import.meta.env.PROD,
    isDev: import.meta.env.DEV,
    isTauri: isTauriEnvironment(),
  };
}

// 验证环境变量
validateEnv();

/**
 * 导出环境变量配置
 *
 * @example
 * ```ts
 * import { env } from './config/env';
 *
 * const apiClient = new ApiClient(env.apiUrl);
 * ```
 */
export const env = createEnvConfig();

/**
 * 类型导出
 */
export type { EnvConfig };
