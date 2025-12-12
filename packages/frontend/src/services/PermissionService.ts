/**
 * 权限服务 (Permission Service)
 *
 * 提供跨平台的权限管理功能：
 * - Tauri 移动端：使用原生权限 API
 * - Web 端：使用 Web Permissions API 和 MediaDevices API
 *
 * 自动检测运行环境并选择合适的实现
 */

import { isTauri } from '../utils/platform';

// ===================== 类型定义 =====================

/**
 * 权限类型
 */
export type PermissionType = 'camera' | 'microphone';

/**
 * 权限状态
 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * 权限检查结果
 */
export interface PermissionResult {
  /** 权限类型 */
  type: PermissionType;
  /** 权限状态 */
  status: PermissionStatus;
  /** 是否可以请求权限 */
  canRequest: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 权限服务接口
 */
export interface IPermissionService {
  /** 检查权限状态 */
  checkPermission(type: PermissionType): Promise<PermissionStatus>;
  /** 请求权限 */
  requestPermission(type: PermissionType): Promise<PermissionStatus>;
  /** 打开应用设置（用于手动授权） */
  openAppSettings(): Promise<void>;
  /** 是否支持原生权限管理 */
  isNativePermissionSupported(): boolean;
}

// ===================== Tauri 权限服务实现 =====================

/**
 * Tauri 原生权限服务
 * 通过 invoke 调用 Rust 命令
 */
class TauriPermissionService implements IPermissionService {
  private invokePromise: Promise<typeof import('@tauri-apps/api/core').invoke> | null = null;

  private async getInvoke() {
    if (!this.invokePromise) {
      this.invokePromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const module = (await import(/* @vite-ignore */ '@tauri-apps/api/core')) as any;
        return module.invoke;
      })();
    }
    return this.invokePromise;
  }

  async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    try {
      const invoke = await this.getInvoke();
      const result = await invoke<{
        status: string;
        error?: string;
      }>('permission_check', { permissionType: type });

      return this.normalizeStatus(result.status);
    } catch (error) {
      console.warn('[TauriPermission] 检查权限失败:', error);
      return 'unavailable';
    }
  }

  async requestPermission(type: PermissionType): Promise<PermissionStatus> {
    try {
      const invoke = await this.getInvoke();
      const result = await invoke<{
        status: string;
        error?: string;
      }>('permission_request', { permissionType: type });

      return this.normalizeStatus(result.status);
    } catch (error) {
      console.warn('[TauriPermission] 请求权限失败:', error);
      return 'unavailable';
    }
  }

  async openAppSettings(): Promise<void> {
    try {
      const invoke = await this.getInvoke();
      await invoke('permission_open_settings');
    } catch (error) {
      console.warn('[TauriPermission] 打开设置失败:', error);
      throw new Error('无法打开应用设置');
    }
  }

  isNativePermissionSupported(): boolean {
    return true;
  }

  /**
   * 标准化权限状态
   */
  private normalizeStatus(status: string): PermissionStatus {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'granted' || normalizedStatus === 'authorized') {
      return 'granted';
    }
    if (
      normalizedStatus === 'denied' ||
      normalizedStatus === 'restricted' ||
      normalizedStatus === 'permanently_denied'
    ) {
      return 'denied';
    }
    if (
      normalizedStatus === 'prompt' ||
      normalizedStatus === 'not_determined' ||
      normalizedStatus === 'undetermined'
    ) {
      return 'prompt';
    }
    return 'unavailable';
  }
}

// ===================== Web 权限服务实现 =====================

/**
 * Web 权限服务
 * 使用 Web Permissions API 和 MediaDevices API
 */
class WebPermissionService implements IPermissionService {
  /**
   * 将权限类型映射到 Web Permissions API 名称
   */
  private getPermissionName(type: PermissionType): PermissionName {
    const mapping: Record<PermissionType, PermissionName> = {
      camera: 'camera',
      microphone: 'microphone',
    };
    return mapping[type];
  }

  async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    // 首先检查 MediaDevices API 是否可用
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'unavailable';
    }

    // 尝试使用 Permissions API 查询权限状态
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionName = this.getPermissionName(type);
        const result = await navigator.permissions.query({ name: permissionName });
        return this.normalizeWebPermissionState(result.state);
      } catch (error) {
        // 某些浏览器可能不支持查询特定权限
        console.warn(`[WebPermission] 无法查询 ${type} 权限:`, error);
      }
    }

    // 如果 Permissions API 不可用，返回 prompt 表示需要用户交互
    return 'prompt';
  }

  async requestPermission(type: PermissionType): Promise<PermissionStatus> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'unavailable';
    }

    try {
      // 构建媒体约束
      const constraints: MediaStreamConstraints = {
        video: type === 'camera',
        audio: type === 'microphone',
      };

      // 请求媒体访问权限
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // 立即停止所有轨道，我们只需要权限
      stream.getTracks().forEach((track) => track.stop());

      return 'granted';
    } catch (error) {
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            return 'denied';
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            return 'unavailable';
          case 'NotReadableError':
          case 'TrackStartError':
            // 设备被占用或不可读
            return 'unavailable';
          case 'OverconstrainedError':
          case 'ConstraintNotSatisfiedError':
            return 'unavailable';
          case 'SecurityError':
            // 安全限制（如非 HTTPS）
            return 'denied';
          default:
            console.warn(`[WebPermission] 请求权限时发生错误: ${error.name}`, error);
            return 'unavailable';
        }
      }
      console.warn('[WebPermission] 请求权限失败:', error);
      return 'unavailable';
    }
  }

  async openAppSettings(): Promise<void> {
    // Web 环境无法直接打开应用设置
    // 提供友好的提示信息
    throw new Error(
      '在浏览器中无法直接打开系统设置。' +
        '请手动进入浏览器设置或操作系统设置，找到站点权限/隐私设置，然后授权摄像头或麦克风访问。',
    );
  }

  isNativePermissionSupported(): boolean {
    return false;
  }

  /**
   * 标准化 Web Permission API 状态
   */
  private normalizeWebPermissionState(state: PermissionState): PermissionStatus {
    switch (state) {
      case 'granted':
        return 'granted';
      case 'denied':
        return 'denied';
      case 'prompt':
      default:
        return 'prompt';
    }
  }
}

// ===================== 混合权限服务 =====================

/**
 * 混合权限服务
 * 根据运行环境自动选择 Tauri 或 Web 实现
 */
class HybridPermissionService implements IPermissionService {
  private tauriService: TauriPermissionService | null = null;
  private webService: WebPermissionService;
  private useTauri = false;

  constructor() {
    this.webService = new WebPermissionService();

    if (isTauri()) {
      this.tauriService = new TauriPermissionService();
      this.useTauri = true;
      console.log('[HybridPermission] 使用 Tauri 原生权限服务');
    } else {
      console.log('[HybridPermission] 使用 Web 权限服务');
    }
  }

  async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    if (this.useTauri && this.tauriService) {
      try {
        return await this.tauriService.checkPermission(type);
      } catch (error) {
        console.warn('[HybridPermission] Tauri 检查权限失败，降级到 Web:', error);
      }
    }

    return this.webService.checkPermission(type);
  }

  async requestPermission(type: PermissionType): Promise<PermissionStatus> {
    if (this.useTauri && this.tauriService) {
      try {
        return await this.tauriService.requestPermission(type);
      } catch (error) {
        console.warn('[HybridPermission] Tauri 请求权限失败，降级到 Web:', error);
      }
    }

    return this.webService.requestPermission(type);
  }

  async openAppSettings(): Promise<void> {
    if (this.useTauri && this.tauriService) {
      try {
        await this.tauriService.openAppSettings();
        return;
      } catch (error) {
        console.warn('[HybridPermission] Tauri 打开设置失败，降级到 Web:', error);
      }
    }

    await this.webService.openAppSettings();
  }

  isNativePermissionSupported(): boolean {
    if (this.useTauri && this.tauriService) {
      return this.tauriService.isNativePermissionSupported();
    }
    return this.webService.isNativePermissionSupported();
  }

  /**
   * 获取当前使用的服务类型
   */
  getServiceType(): 'tauri' | 'web' {
    return this.useTauri ? 'tauri' : 'web';
  }

  /**
   * 获取详细的权限检查结果
   */
  async getPermissionResult(type: PermissionType): Promise<PermissionResult> {
    const status = await this.checkPermission(type);

    return {
      type,
      status,
      canRequest: status === 'prompt',
      error: status === 'unavailable' ? `${type} 权限不可用或设备不支持` : undefined,
    };
  }

  /**
   * 批量检查多个权限
   */
  async checkMultiplePermissions(
    types: PermissionType[],
  ): Promise<Map<PermissionType, PermissionStatus>> {
    const results = new Map<PermissionType, PermissionStatus>();

    await Promise.all(
      types.map(async (type) => {
        const status = await this.checkPermission(type);
        results.set(type, status);
      }),
    );

    return results;
  }
}

// ===================== 导出 =====================

/** 权限服务单例 */
export const permissionService = new HybridPermissionService();

export default permissionService;
