/**
 * 权限管理 Hook
 *
 * 提供统一的权限管理能力：
 * - 检查权限状态
 * - 请求权限
 * - 监听权限变化
 * - 跨平台支持 (Web/Tauri)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlatform } from './usePlatform';

// ===================== 类型定义 =====================

/** 权限类型 */
export type PermissionType = 'camera' | 'microphone';

/** 权限状态 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * 权限 Hook 返回值接口
 */
export interface UsePermissionReturn {
  /** 当前权限状态 */
  status: PermissionStatus;
  /** 是否正在加载/检查权限 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 请求权限 */
  request: () => Promise<void>;
  /** 打开系统设置 */
  openSettings: () => Promise<void>;
  /** 是否支持原生权限 API */
  isNativeSupported: boolean;
}

/** 权限名称映射 (Web Permissions API) */
const PERMISSION_NAME_MAP: Record<PermissionType, PermissionName> = {
  camera: 'camera',
  microphone: 'microphone',
};

/** 权限类型中文名称 */
const PERMISSION_DISPLAY_NAME: Record<PermissionType, string> = {
  camera: '摄像头',
  microphone: '麦克风',
};

// ===================== 辅助函数 =====================

/**
 * 将 Web Permission API 状态转换为统一状态
 */
function mapWebPermissionState(state: globalThis.PermissionState): PermissionStatus {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'prompt':
      return 'prompt';
    default:
      return 'unavailable';
  }
}

/**
 * 检查 Web Permissions API 是否可用
 */
function isPermissionsAPIAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'permissions' in navigator;
}

/**
 * 检查 MediaDevices API 是否可用
 */
function isMediaDevicesAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

// ===================== Hook 实现 =====================

/**
 * 权限管理 Hook
 *
 * 提供权限检查、请求和监听功能，支持 Web 和 Tauri 环境。
 *
 * @param type - 权限类型 ('camera' | 'microphone')
 * @returns 权限状态和操作方法
 *
 * @example
 * ```tsx
 * function CameraComponent() {
 *   const {
 *     status,
 *     isLoading,
 *     error,
 *     request,
 *     openSettings,
 *     isNativeSupported,
 *   } = usePermission('camera');
 *
 *   if (isLoading) {
 *     return <Loading />;
 *   }
 *
 *   if (status === 'denied') {
 *     return (
 *       <div>
 *         <p>摄像头权限被拒绝</p>
 *         <button onClick={openSettings}>打开设置</button>
 *       </div>
 *     );
 *   }
 *
 *   if (status === 'prompt') {
 *     return <button onClick={request}>请求摄像头权限</button>;
 *   }
 *
 *   return <CameraView />;
 * }
 * ```
 */
export function usePermission(type: PermissionType): UsePermissionReturn {
  const platform = usePlatform();
  const [status, setStatus] = useState<PermissionStatus>('prompt');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // 检查是否支持原生权限管理
  const isNativeSupported = platform.isTauri;

  /**
   * 查询当前权限状态 (Web)
   */
  const queryWebPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (!isPermissionsAPIAvailable()) {
      // 如果 Permissions API 不可用，但 MediaDevices 可用，返回 prompt
      if (isMediaDevicesAvailable()) {
        return 'prompt';
      }
      return 'unavailable';
    }

    try {
      const permissionName = PERMISSION_NAME_MAP[type];
      const result = await navigator.permissions.query({ name: permissionName });
      return mapWebPermissionState(result.state);
    } catch {
      // 某些浏览器可能不支持特定权限查询
      if (isMediaDevicesAvailable()) {
        return 'prompt';
      }
      return 'unavailable';
    }
  }, [type]);

  /**
   * 查询当前权限状态 (Tauri)
   */
  const queryTauriPermission = useCallback(async (): Promise<PermissionStatus> => {
    try {
      // Tauri v2 插件 API - 动态导入
      // 注意：需要根据实际使用的 Tauri 插件调整
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cameraPlugin = await import('@tauri-apps/plugin-camera' as any).catch(() => null);

      if (cameraPlugin && type === 'camera') {
        const result = await cameraPlugin.checkPermissions();
        if (result.camera === 'granted') return 'granted';
        if (result.camera === 'denied') return 'denied';
        return 'prompt';
      }

      // 麦克风权限或插件不可用时，回退到 Web API
      return queryWebPermission();
    } catch {
      // 插件可能不存在或出错，回退到 Web API
      return queryWebPermission();
    }
  }, [type, queryWebPermission]);

  /**
   * 检查权限状态
   */
  const checkPermission = useCallback(async () => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      let permissionStatus: PermissionStatus;

      if (isNativeSupported) {
        permissionStatus = await queryTauriPermission();
      } else {
        permissionStatus = await queryWebPermission();
      }

      if (isMountedRef.current) {
        setStatus(permissionStatus);
        retryCountRef.current = 0; // 成功后重置重试计数
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage =
          err instanceof Error ? err.message : `检查${PERMISSION_DISPLAY_NAME[type]}权限失败`;
        setError(errorMessage);
        setStatus('unavailable');

        // 重试逻辑
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(() => {
            checkPermission();
          }, 1000 * retryCountRef.current); // 递增延迟重试
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isNativeSupported, queryTauriPermission, queryWebPermission, type]);

  /**
   * 请求权限 (Web)
   */
  const requestWebPermission = useCallback(async () => {
    if (!isMediaDevicesAvailable()) {
      throw new Error(`${PERMISSION_DISPLAY_NAME[type]}功能不可用`);
    }

    const constraints: MediaStreamConstraints =
      type === 'camera' ? { video: true } : { audio: true };

    // 请求媒体权限
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // 立即停止流，我们只需要权限
    stream.getTracks().forEach((track) => track.stop());
  }, [type]);

  /**
   * 请求权限 (Tauri)
   */
  const requestTauriPermission = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cameraPlugin = await import('@tauri-apps/plugin-camera' as any).catch(() => null);

      if (cameraPlugin && type === 'camera') {
        await cameraPlugin.requestPermissions();
        return;
      }

      // 麦克风权限或插件不可用时，回退到 Web API
      await requestWebPermission();
    } catch {
      // 回退到 Web API
      await requestWebPermission();
    }
  }, [type, requestWebPermission]);

  /**
   * 请求权限
   */
  const request = useCallback(async () => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      if (isNativeSupported) {
        await requestTauriPermission();
      } else {
        await requestWebPermission();
      }

      // 重新检查权限状态
      await checkPermission();
    } catch (err) {
      if (isMountedRef.current) {
        let errorMessage: string;

        if (err instanceof Error) {
          // 处理常见的权限错误
          if (err.name === 'NotAllowedError') {
            errorMessage = `${PERMISSION_DISPLAY_NAME[type]}权限被拒绝`;
            setStatus('denied');
          } else if (err.name === 'NotFoundError') {
            errorMessage = `未找到${PERMISSION_DISPLAY_NAME[type]}设备`;
            setStatus('unavailable');
          } else if (err.name === 'NotReadableError') {
            errorMessage = `${PERMISSION_DISPLAY_NAME[type]}设备正在被其他应用使用`;
          } else {
            errorMessage = err.message;
          }
        } else {
          errorMessage = `请求${PERMISSION_DISPLAY_NAME[type]}权限失败`;
        }

        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isNativeSupported, requestTauriPermission, requestWebPermission, checkPermission, type]);

  /**
   * 打开系统设置 (Tauri)
   */
  const openTauriSettings = useCallback(async () => {
    try {
      // Tauri v2 可以打开系统设置
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openerPlugin = await import('@tauri-apps/plugin-opener' as any).catch(() => null);

      if (!openerPlugin) {
        throw new Error('无法打开系统设置，请手动前往设置页面授权');
      }

      // 根据平台打开不同的设置页面
      if (platform.isAndroid) {
        await openerPlugin.openUrl('package:' + 'com.android.settings');
      } else if (platform.isIOS) {
        await openerPlugin.openUrl('app-settings:');
      } else if (platform.isMacOS) {
        await openerPlugin.openUrl(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
        );
      } else if (platform.isWindows) {
        await openerPlugin.openUrl('ms-settings:privacy-webcam');
      }
    } catch {
      // 打开设置失败，显示提示
      throw new Error('无法打开系统设置，请手动前往设置页面授权');
    }
  }, [platform]);

  /**
   * 打开系统设置 (Web)
   */
  const openWebSettings = useCallback(async () => {
    // Web 端无法直接打开系统设置
    // 提供引导信息
    throw new Error(
      `请在浏览器设置中允许${PERMISSION_DISPLAY_NAME[type]}访问，或点击地址栏左侧的锁图标进行设置`,
    );
  }, [type]);

  /**
   * 打开系统设置
   */
  const openSettings = useCallback(async () => {
    setError(null);

    try {
      if (isNativeSupported) {
        await openTauriSettings();
      } else {
        await openWebSettings();
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : '打开设置失败';
        setError(errorMessage);
      }
    }
  }, [isNativeSupported, openTauriSettings, openWebSettings]);

  // 初始化时检查权限
  useEffect(() => {
    isMountedRef.current = true;
    checkPermission();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkPermission]);

  // 监听权限变化 (Web)
  useEffect(() => {
    if (isNativeSupported || !isPermissionsAPIAvailable()) {
      return;
    }

    let permissionStatus: globalThis.PermissionStatus | null = null;

    const handleChange = () => {
      if (permissionStatus && isMountedRef.current) {
        setStatus(mapWebPermissionState(permissionStatus.state));
      }
    };

    const setupListener = async () => {
      try {
        const permissionName = PERMISSION_NAME_MAP[type];
        permissionStatus = await navigator.permissions.query({ name: permissionName });
        permissionStatus.addEventListener('change', handleChange);
      } catch {
        // 某些浏览器可能不支持权限监听
      }
    };

    setupListener();

    return () => {
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handleChange);
      }
    };
  }, [type, isNativeSupported]);

  return {
    status,
    isLoading,
    error,
    request,
    openSettings,
    isNativeSupported,
  };
}

export default usePermission;
