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

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    throw new Error('Not running in Tauri environment');
  }
  return window.__TAURI__!.core.invoke<T>(cmd, args);
}

export interface TauriAppSettings {
  daily_goal: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  theme: string;
  telemetry_enabled: boolean;
  onboarding_completed: boolean;
}

export async function getTauriAppSettings(): Promise<TauriAppSettings> {
  return tauriInvoke<TauriAppSettings>('get_settings');
}

export async function updateTauriAppSettings(settings: TauriAppSettings): Promise<void> {
  await tauriInvoke('update_settings', { settings });
}

export async function resetTauriWindowLayout(): Promise<void> {
  await tauriInvoke('reset_window_layout');
}

export async function getSidecarPort(): Promise<number> {
  return tauriInvoke<number>('get_sidecar_port');
}

export const DESKTOP_LOCAL_USER_ID = '1';

export const DESKTOP_LOCAL_USERNAME = 'local_user';

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
