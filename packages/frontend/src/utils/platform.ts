/**
 * 平台检测工具函数
 *
 * 提供运行时平台和功能检测能力：
 * - Tauri 环境检测
 * - 操作系统检测
 * - 功能支持检测
 */

// ===================== 类型定义 =====================

/** 操作系统类型 */
export type PlatformOS = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

/** Tauri 平台类型 */
export type TauriPlatform = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | null;

/** 支持的功能类型 */
export type SupportedFeature =
  | 'camera'
  | 'tts'
  | 'notifications'
  | 'filesystem'
  | 'clipboard'
  | 'haptics'
  | 'biometrics'
  | 'share'
  | 'deepLinks';

// ===================== Tauri 检测 =====================

/**
 * 检测是否在 Tauri 环境中运行
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * 检测是否在 Tauri 移动端环境中运行
 */
export function isTauriMobile(): boolean {
  if (!isTauri()) return false;

  const os = getPlatformOS();
  return os === 'ios' || os === 'android';
}

/**
 * 检测是否在 Tauri 桌面端环境中运行
 */
export function isTauriDesktop(): boolean {
  if (!isTauri()) return false;

  const os = getPlatformOS();
  return os === 'windows' || os === 'macos' || os === 'linux';
}

/**
 * 获取 Tauri 平台类型
 */
export function getTauriPlatform(): TauriPlatform {
  if (!isTauri()) return null;

  const os = getPlatformOS();
  if (os === 'unknown') return null;

  return os;
}

// ===================== 操作系统检测 =====================

/**
 * 获取当前操作系统
 * 优先使用 Tauri 的 os 模块，回退到 User Agent 检测
 */
export function getPlatformOS(): PlatformOS {
  if (typeof window === 'undefined') return 'unknown';

  // 优先检查 Tauri 环境变量
  if (isTauri()) {
    // Tauri v2 通过 __TAURI_INTERNALS__ 暴露平台信息
    const tauriInternals = (
      window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentPlatform?: string } } }
    ).__TAURI_INTERNALS__;
    if (tauriInternals?.metadata?.currentPlatform) {
      const platform = tauriInternals.metadata.currentPlatform.toLowerCase();
      if (platform.includes('windows')) return 'windows';
      if (platform.includes('macos') || platform.includes('darwin')) return 'macos';
      if (platform.includes('linux')) return 'linux';
      if (platform.includes('ios')) return 'ios';
      if (platform.includes('android')) return 'android';
    }
  }

  // 回退到 User Agent 检测
  const ua = navigator.userAgent.toLowerCase();

  // iOS 检测 (需要在 macOS 之前，因为 iPad 可能伪装成 macOS)
  if (/iphone|ipad|ipod/.test(ua) || (navigator.maxTouchPoints > 1 && /macintosh/.test(ua))) {
    return 'ios';
  }

  // Android 检测
  if (/android/.test(ua)) {
    return 'android';
  }

  // 桌面系统检测
  if (/windows/.test(ua) || /win32|win64/.test(ua)) {
    return 'windows';
  }

  if (/macintosh|mac os x/.test(ua)) {
    return 'macos';
  }

  if (/linux/.test(ua)) {
    return 'linux';
  }

  return 'unknown';
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  const os = getPlatformOS();
  return os === 'ios' || os === 'android';
}

/**
 * 检测是否为桌面设备
 */
export function isDesktopDevice(): boolean {
  const os = getPlatformOS();
  return os === 'windows' || os === 'macos' || os === 'linux';
}

// ===================== 功能支持检测 =====================

/**
 * 检测特定功能是否支持
 */
export function supportsFeature(feature: SupportedFeature): boolean {
  switch (feature) {
    case 'camera':
      return supportsCameraAPI();
    case 'tts':
      return supportsTTS();
    case 'notifications':
      return supportsNotifications();
    case 'filesystem':
      return supportsFilesystem();
    case 'clipboard':
      return supportsClipboard();
    case 'haptics':
      return supportsHaptics();
    case 'biometrics':
      return supportsBiometrics();
    case 'share':
      return supportsShare();
    case 'deepLinks':
      return supportsDeepLinks();
    default:
      return false;
  }
}

/**
 * 检测摄像头 API 支持
 */
function supportsCameraAPI(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 环境下通过插件支持
  if (isTauri()) {
    // Tauri 移动端通过相机插件支持
    // 桌面端通过 WebRTC 支持
    return true;
  }

  // Web 环境检测 MediaDevices API
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

/**
 * 检测 TTS (文字转语音) 支持
 */
function supportsTTS(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 环境下可通过原生 TTS 插件支持
  if (isTauri()) {
    return true;
  }

  // Web 环境检测 Web Speech API
  return 'speechSynthesis' in window;
}

/**
 * 检测通知支持
 */
function supportsNotifications(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 环境下通过通知插件支持
  if (isTauri()) {
    return true;
  }

  // Web 环境检测 Notification API
  return 'Notification' in window;
}

/**
 * 检测文件系统访问支持
 */
function supportsFilesystem(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 环境下通过 fs 插件支持
  if (isTauri()) {
    return true;
  }

  // Web 环境检测 File System Access API
  return 'showOpenFilePicker' in window;
}

/**
 * 检测剪贴板支持
 */
function supportsClipboard(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 环境下通过剪贴板插件支持
  if (isTauri()) {
    return true;
  }

  // Web 环境检测 Clipboard API
  return !!(navigator.clipboard && typeof navigator.clipboard.writeText === 'function');
}

/**
 * 检测触觉反馈支持
 */
function supportsHaptics(): boolean {
  if (typeof window === 'undefined') return false;

  // 仅 Tauri 移动端支持触觉反馈
  if (isTauriMobile()) {
    return true;
  }

  // Web 环境检测 Vibration API
  return 'vibrate' in navigator;
}

/**
 * 检测生物识别支持
 */
function supportsBiometrics(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 移动端通过生物识别插件支持
  if (isTauriMobile()) {
    return true;
  }

  // Web 环境检测 Web Authentication API
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
}

/**
 * 检测分享功能支持
 */
function supportsShare(): boolean {
  if (typeof window === 'undefined') return false;

  // Tauri 移动端通过分享插件支持
  if (isTauriMobile()) {
    return true;
  }

  // Web 环境检测 Web Share API
  return 'share' in navigator;
}

/**
 * 检测深度链接支持
 */
function supportsDeepLinks(): boolean {
  // 仅 Tauri 环境支持深度链接
  return isTauri();
}

// ===================== 工具函数 =====================

/**
 * 获取完整的平台信息
 */
export function getPlatformInfo() {
  return {
    isWeb: !isTauri(),
    isTauri: isTauri(),
    isTauriMobile: isTauriMobile(),
    isTauriDesktop: isTauriDesktop(),
    isAndroid: getPlatformOS() === 'android',
    isIOS: getPlatformOS() === 'ios',
    isMacOS: getPlatformOS() === 'macos',
    isWindows: getPlatformOS() === 'windows',
    isLinux: getPlatformOS() === 'linux',
    isMobile: isMobileDevice(),
    isDesktop: isDesktopDevice(),
    os: getPlatformOS(),
    supportsNativeAPI: isTauri(),
    supportsCamera: supportsFeature('camera'),
    supportsTTS: supportsFeature('tts'),
  };
}

/**
 * 平台特定代码执行
 */
export function runOnPlatform<T>(handlers: {
  web?: () => T;
  tauri?: () => T;
  tauriMobile?: () => T;
  tauriDesktop?: () => T;
  ios?: () => T;
  android?: () => T;
  macos?: () => T;
  windows?: () => T;
  linux?: () => T;
  default?: () => T;
}): T | undefined {
  const os = getPlatformOS();

  // 优先匹配具体 OS
  if (os === 'ios' && handlers.ios) return handlers.ios();
  if (os === 'android' && handlers.android) return handlers.android();
  if (os === 'macos' && handlers.macos) return handlers.macos();
  if (os === 'windows' && handlers.windows) return handlers.windows();
  if (os === 'linux' && handlers.linux) return handlers.linux();

  // 匹配平台类型
  if (isTauriMobile() && handlers.tauriMobile) return handlers.tauriMobile();
  if (isTauriDesktop() && handlers.tauriDesktop) return handlers.tauriDesktop();
  if (isTauri() && handlers.tauri) return handlers.tauri();
  if (!isTauri() && handlers.web) return handlers.web();

  // 默认处理
  return handlers.default?.();
}
