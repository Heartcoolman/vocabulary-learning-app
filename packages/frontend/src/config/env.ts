/**
 * 前端环境变量配置
 *
 * 提供类型安全的环境变量访问和验证
 * 所有环境变量都通过此文件统一访问，避免直接使用 import.meta.env
 */

import { logger } from '../utils/logger';

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

/**
 * 验证必需的环境变量
 */
function validateEnv(): void {
  const missingVars: string[] = [];

  // 验证必需的环境变量
  if (!import.meta.env.VITE_API_URL) {
    missingVars.push('VITE_API_URL');
  }

  if (missingVars.length > 0) {
    const errorMsg = `缺少必需的环境变量: ${missingVars.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // 验证 API URL 格式
  try {
    new URL(import.meta.env.VITE_API_URL);
  } catch {
    const errorMsg = `VITE_API_URL 格式无效: ${import.meta.env.VITE_API_URL}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // 开发环境警告
  if (import.meta.env.DEV) {
    logger.info('运行在开发模式');
    if (import.meta.env.VITE_API_URL.includes('localhost')) {
      logger.debug('使用本地 API 服务器');
    }
  }

  // 生产环境检查
  if (import.meta.env.PROD) {
    logger.info('运行在生产模式');

    // 生产环境建议配置 Sentry
    if (!import.meta.env.VITE_SENTRY_DSN) {
      logger.warn('生产环境未配置 VITE_SENTRY_DSN，��误追踪将不可用');
    }

    // 生产环境建议配置版本号
    if (!import.meta.env.VITE_APP_VERSION) {
      logger.warn('生产环境未配置 VITE_APP_VERSION，版本追踪将不可用');
    }

    // 生产环境不应该使用 localhost
    if (import.meta.env.VITE_API_URL.includes('localhost')) {
      logger.warn('⚠️ 生产环境使用了 localhost API 地址，这可能是配置错误');
    }
  }
}

/**
 * 创建环境变量配置对象
 */
function createEnvConfig(): EnvConfig {
  return {
    apiUrl: import.meta.env.VITE_API_URL,
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
