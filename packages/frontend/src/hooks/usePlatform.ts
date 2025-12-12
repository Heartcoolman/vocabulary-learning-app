/**
 * 平台检测 Hook
 *
 * 提供响应式的平台检测能力：
 * - 检测运行环境 (Web/Tauri)
 * - 检测操作系统
 * - 检测功能支持
 */

import { useMemo } from 'react';
import { isTauri, isTauriMobile, getPlatformOS, supportsFeature } from '../utils/platform';

// ===================== 类型定义 =====================

/**
 * 平台信息接口
 */
export interface PlatformInfo {
  /** 是否为 Web 环境 */
  isWeb: boolean;
  /** 是否为 Tauri 环境 */
  isTauri: boolean;
  /** 是否为 Tauri 移动端 */
  isTauriMobile: boolean;
  /** 是否为 Android */
  isAndroid: boolean;
  /** 是否为 iOS */
  isIOS: boolean;
  /** 是否为 macOS */
  isMacOS: boolean;
  /** 是否为 Windows */
  isWindows: boolean;
  /** 是否为 Linux */
  isLinux: boolean;
  /** 是否支持原生 API */
  supportsNativeAPI: boolean;
  /** 是否支持摄像头 */
  supportsCamera: boolean;
  /** 是否支持 TTS */
  supportsTTS: boolean;
}

// ===================== Hook 实现 =====================

/**
 * 平台检测 Hook
 *
 * @returns 平台信息对象
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const platform = usePlatform();
 *
 *   if (platform.isTauriMobile) {
 *     return <MobileLayout />;
 *   }
 *
 *   if (platform.supportsCamera) {
 *     return <CameraFeature />;
 *   }
 *
 *   return <WebLayout />;
 * }
 * ```
 */
export function usePlatform(): PlatformInfo {
  // 使用 useMemo 缓存平台信息，因为这些值在运行时不会改变
  const platformInfo = useMemo<PlatformInfo>(() => {
    const inTauri = isTauri();
    const inTauriMobile = isTauriMobile();
    const os = getPlatformOS();

    return {
      // 环境检测
      isWeb: !inTauri,
      isTauri: inTauri,
      isTauriMobile: inTauriMobile,

      // 操作系统检测
      isAndroid: os === 'android',
      isIOS: os === 'ios',
      isMacOS: os === 'macos',
      isWindows: os === 'windows',
      isLinux: os === 'linux',

      // 功能支持
      supportsNativeAPI: inTauri,
      supportsCamera: supportsFeature('camera'),
      supportsTTS: supportsFeature('tts'),
    };
  }, []);

  return platformInfo;
}

// ===================== 导出类型 =====================

export type { PlatformOS, TauriPlatform, SupportedFeature } from '../utils/platform';

export default usePlatform;
