/**
 * Tauri Desktop Bridge
 * 检测 Tauri 环境并提供 invoke 调用封装
 */

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * 检测当前是否运行在 Tauri 桌面环境中
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

/**
 * 调用 Tauri 命令
 * @param cmd 命令名称
 * @param args 命令参数
 */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    throw new Error('Not running in Tauri environment');
  }
  return window.__TAURI__!.core.invoke<T>(cmd, args);
}

/**
 * 桌面模式下的固定本地用户 ID
 */
export const DESKTOP_LOCAL_USER_ID = '1';

/**
 * 桌面模式下的固定本地用户名
 */
export const DESKTOP_LOCAL_USERNAME = 'local_user';

/**
 * 获取桌面模式下的模拟用户信息
 */
export function getDesktopLocalUser() {
  return {
    id: DESKTOP_LOCAL_USER_ID,
    email: 'local@localhost',
    username: DESKTOP_LOCAL_USERNAME,
    role: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * API 模式枚举
 */
export type ApiMode = 'http' | 'tauri';

/**
 * 获取当前 API 模式
 * 桌面模式优先使用 Tauri invoke，Web 模式使用 HTTP
 */
export function getApiMode(): ApiMode {
  return isTauriEnvironment() ? 'tauri' : 'http';
}

/**
 * 通用 API 调用包装器
 * 根据环境自动选择 HTTP fetch 或 Tauri invoke
 *
 * @param httpCall HTTP 模式下的调用函数
 * @param tauriCall Tauri 模式下的调用函数（可选，未实现时回退到 HTTP）
 */
export async function apiCall<T>(
  httpCall: () => Promise<T>,
  tauriCall?: () => Promise<T>,
): Promise<T> {
  if (isTauriEnvironment() && tauriCall) {
    try {
      return await tauriCall();
    } catch (error) {
      // Tauri 命令未实现时的错误包含 "Not implemented"
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Not implemented')) {
        console.warn('[TauriBridge] Command not implemented, falling back to HTTP');
        return httpCall();
      }
      throw error;
    }
  }
  return httpCall();
}
