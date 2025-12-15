/**
 * 前端环境变量配置
 *
 * 提供类型安全的环境变量访问和验证
 * 所有环境变量都通过此文件统一访问，避免直接使用 import.meta.env
 *
 * 注意：此文件不能导入 logger，因为 logger 依赖 env，会造成循环依赖
 */

/**
 * 环境变量配置接口
 */
interface EnvConfig {
  /** 后端 API 地址 */
  apiUrl: string;
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
}

function resolveApiUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);

    // 仅保留 origin，避免误把路径拼进 baseUrl 导致 /api/api 重复
    if (url.pathname !== '/' || url.search || url.hash) {
      console.warn('[env] VITE_API_URL 建议仅包含 origin，将忽略路径/参数部分');
    }

    return url.origin;
  } catch {
    const errorMsg = `VITE_API_URL 格式无效: ${import.meta.env.VITE_API_URL}`;
    console.error('[env]', errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * 验证必需的环境变量
 */
function validateEnv(): void {
  const apiUrl = resolveApiUrl();

  // 开发环境警告
  if (import.meta.env.DEV) {
    console.info('[env] 运行在开发模式');
    if (!apiUrl) {
      console.info('[env] 使用同源 API（通过 Vite proxy 代理 /api）');
    } else if (apiUrl.includes('localhost')) {
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

    // 生产环境不应该使用 localhost
    if (apiUrl && apiUrl.includes('localhost')) {
      console.warn('[env] ⚠️ 生产环境使用了 localhost API 地址，这可能是配置错误');
    }
  }
}

/**
 * 创建环境变量配置对象
 */
function createEnvConfig(): EnvConfig {
  return {
    apiUrl: resolveApiUrl(),
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    appVersion: import.meta.env.VITE_APP_VERSION,
    mode: import.meta.env.MODE,
    isProd: import.meta.env.PROD,
    isDev: import.meta.env.DEV,
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
