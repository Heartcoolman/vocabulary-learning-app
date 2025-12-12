/**
 * Tauri 插件类型声明
 *
 * 这些类型声明用于在 Web 环境编译时避免 TypeScript 错误
 * 实际运行时，这些模块只在 Tauri 环境中可用
 */

// @tauri-apps/api/core
declare module '@tauri-apps/api/core' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

// @tauri-apps/plugin-http
declare module '@tauri-apps/plugin-http' {
  export function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

// @tauri-apps/plugin-store
declare module '@tauri-apps/plugin-store' {
  export interface Store {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    save(): Promise<void>;
  }

  export function load(name: string, options?: { autoSave?: boolean }): Promise<Store>;
}

// 权限相关类型
declare module '@anthropic/tauri-plugin-permission' {
  /**
   * 权限类型枚举
   */
  export type PermissionType =
    | 'camera'
    | 'microphone'
    | 'location'
    | 'notifications'
    | 'photos'
    | 'contacts'
    | 'calendar'
    | 'reminders'
    | 'bluetooth'
    | 'speech_recognition'
    | 'health'
    | 'motion'
    | 'media_library'
    | 'tracking';

  /**
   * 权限状态枚举
   */
  export type PermissionStatus = 'granted' | 'denied' | 'not_determined' | 'restricted' | 'limited';

  /**
   * 权限错误类型
   */
  export interface PermissionError {
    code: string;
    message: string;
  }

  /**
   * 检查指定权限的当前状态
   */
  export function check_permission(permission: PermissionType): Promise<PermissionStatus>;

  /**
   * 请求指定权限
   */
  export function request_permission(permission: PermissionType): Promise<PermissionStatus>;

  /**
   * 打开应用设置页面（用于用户手动修改权限）
   */
  export function open_app_settings(): Promise<void>;

  /**
   * 检查是否应该显示权限请求说明（Android）
   */
  export function should_show_rationale(permission: PermissionType): Promise<boolean>;

  /**
   * 检查当前平台是否支持原生权限管理
   */
  export function is_native_permission_supported(): Promise<boolean>;
}

// Tauri invoke 命令类型扩展
declare module '@tauri-apps/api/core' {
  import type { PermissionType, PermissionStatus } from '@anthropic/tauri-plugin-permission';

  export interface InvokeCommands {
    check_permission: {
      args: { permission: PermissionType };
      return: PermissionStatus;
    };
    request_permission: {
      args: { permission: PermissionType };
      return: PermissionStatus;
    };
    open_app_settings: {
      args: Record<string, never>;
      return: void;
    };
    should_show_rationale: {
      args: { permission: PermissionType };
      return: boolean;
    };
    is_native_permission_supported: {
      args: Record<string, never>;
      return: boolean;
    };
  }
}
