/**
 * 前端环境变量配置
 *
 * 提供类型安全的环境变量访问和验证
 * 所有环境变量都通过此文件统一访问，避免直接使用 import.meta.env
 *
 * 注意：此文件不能导入 logger，因为 logger 依赖 env，会造成循环依赖
 */

interface EnvConfig {
  apiUrl: string;
  sentryDsn: string | undefined;
  appVersion: string | undefined;
  mode: string;
  isProd: boolean;
  isDev: boolean;
}

function resolveApiUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);

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

function validateEnv(): void {
  const apiUrl = resolveApiUrl();

  if (import.meta.env.DEV) {
    console.info('[env] 运行在开发模式');
    if (!apiUrl) {
      console.info('[env] 使用同源 API（通过 Vite proxy 代理 /api）');
    } else if (apiUrl.includes('localhost')) {
      console.debug('[env] 使用本地 API 服务器');
    }
  }

  if (import.meta.env.PROD) {
    console.info('[env] 运行在生产模式');

    if (!import.meta.env.VITE_SENTRY_DSN) {
      console.warn('[env] 生产环境未配置 VITE_SENTRY_DSN，错误追踪将不可用');
    }

    if (!import.meta.env.VITE_APP_VERSION) {
      console.warn('[env] 生产环境未配置 VITE_APP_VERSION，版本追踪将不可用');
    }

    if (apiUrl && apiUrl.includes('localhost')) {
      console.warn('[env] ⚠️ 生产环境使用了 localhost API 地址，这可能是配置错误');
    }
  }
}

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

validateEnv();

export const env = createEnvConfig();

/**
 * 桌面模式下异步初始化 API URL
 * 通过 sidecar 端口构造 http://127.0.0.1:<port>
 */
export async function initDesktopApiUrl(): Promise<void> {
  const { isTauriEnvironment, getSidecarPort } = await import('../utils/tauri-bridge');
  if (!isTauriEnvironment()) return;

  const maxAttempts = 50;
  const interval = 200;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const port = await getSidecarPort();
      env.apiUrl = `http://127.0.0.1:${port}`;
      console.info(`[env] 桌面模式 API: ${env.apiUrl}`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  console.error('[env] 无法获取 sidecar 端口');
}

export type { EnvConfig };
