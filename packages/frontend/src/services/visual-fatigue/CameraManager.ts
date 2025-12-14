/**
 * 摄像头管理器
 *
 * 负责：
 * - getUserMedia 权限请求
 * - 摄像头生命周期管理（启动/停止/切换）
 * - 视频流配置
 * - 错误处理和降级
 */

import type { CameraPermissionStatus, VisualFatigueConfig } from '@danci/shared';

/**
 * 摄像头状态
 */
export interface CameraState {
  /** 权限状态 */
  permission: CameraPermissionStatus;
  /** 是否正在运行 */
  isRunning: boolean;
  /** 当前设备ID */
  deviceId: string | null;
  /** 错误信息 */
  error: string | null;
  /** 视频尺寸 */
  videoSize: { width: number; height: number } | null;
}

/**
 * 摄像头配置
 */
export interface CameraConfig {
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
  /** 帧率 */
  frameRate: number;
  /** 优先使用前置摄像头 */
  facingMode: 'user' | 'environment';
  /** 设备ID（可选） */
  deviceId?: string;
}

/**
 * 默认摄像头配置
 */
export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  width: 640,
  height: 480,
  frameRate: 15,
  facingMode: 'user',
};

/**
 * 摄像头事件类型
 */
export type CameraEventType = 'start' | 'stop' | 'error' | 'permission_change';

/**
 * 摄像头事件回调
 */
export type CameraEventCallback = (event: { type: CameraEventType; data?: unknown }) => void;

/**
 * 摄像头管理器类
 */
export class CameraManager {
  private config: CameraConfig;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private state: CameraState = {
    permission: 'not_requested',
    isRunning: false,
    deviceId: null,
    error: null,
    videoSize: null,
  };
  private eventListeners: Set<CameraEventCallback> = new Set();

  constructor(config: Partial<CameraConfig> = {}) {
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };
  }

  /**
   * 获取当前状态
   */
  getState(): CameraState {
    return { ...this.state };
  }

  /**
   * 检查浏览器是否支持摄像头
   */
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * 检查权限状态
   */
  async checkPermission(): Promise<CameraPermissionStatus> {
    if (!CameraManager.isSupported()) {
      this.state.permission = 'unavailable';
      return 'unavailable';
    }

    try {
      // 使用 Permissions API 查询（如果可用）
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (result.state === 'granted') {
          this.state.permission = 'granted';
        } else if (result.state === 'denied') {
          this.state.permission = 'denied';
        } else {
          this.state.permission = 'not_requested';
        }
      }
    } catch {
      // Permissions API 不可用，保持 not_requested
      this.state.permission = 'not_requested';
    }

    return this.state.permission;
  }

  /**
   * 请求摄像头权限
   */
  async requestPermission(): Promise<CameraPermissionStatus> {
    if (!CameraManager.isSupported()) {
      this.state.permission = 'unavailable';
      this.state.error = '浏览器不支持摄像头访问';
      return 'unavailable';
    }

    try {
      // 尝试获取媒体流来触发权限请求
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          facingMode: this.config.facingMode,
        },
      });

      // 立即停止，只是为了获取权限
      stream.getTracks().forEach((track) => track.stop());

      this.state.permission = 'granted';
      this.state.error = null;
      this.emit({ type: 'permission_change', data: 'granted' });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          this.state.permission = 'denied';
          this.state.error = '用户拒绝了摄像头访问权限';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          this.state.permission = 'unavailable';
          this.state.error = '未找到摄像头设备';
        } else {
          this.state.permission = 'unavailable';
          this.state.error = error.message;
        }
      }
      this.emit({ type: 'permission_change', data: this.state.permission });
    }

    return this.state.permission;
  }

  /**
   * 启动摄像头
   * @param videoElement 用于显示视频的 HTMLVideoElement（可选）
   */
  async start(videoElement?: HTMLVideoElement): Promise<MediaStream | null> {
    if (this.state.isRunning && this.stream) {
      return this.stream;
    }

    if (!CameraManager.isSupported()) {
      this.state.error = '浏览器不支持摄像头访问';
      this.emit({ type: 'error', data: this.state.error });
      return null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: this.config.width, max: 1280 },
          height: { ideal: this.config.height, max: 720 },
          frameRate: { ideal: this.config.frameRate, max: 30 },
          facingMode: this.config.facingMode,
          ...(this.config.deviceId ? { deviceId: { exact: this.config.deviceId } } : {}),
        },
        audio: false,
      };

      console.log('[CameraManager] Getting user media with constraints:', constraints);
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(
        '[CameraManager] Got stream:',
        !!this.stream,
        'tracks:',
        this.stream.getTracks().length,
      );

      // 获取实际视频尺寸
      const videoTrack = this.stream.getVideoTracks()[0];
      console.log(
        '[CameraManager] Video track:',
        videoTrack?.label,
        'enabled:',
        videoTrack?.enabled,
      );
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        this.state.videoSize = {
          width: settings.width ?? this.config.width,
          height: settings.height ?? this.config.height,
        };
        this.state.deviceId = settings.deviceId ?? null;
      }

      // 如果提供了视频元素，绑定流
      if (videoElement) {
        this.videoElement = videoElement;
        videoElement.srcObject = this.stream;
        console.log('[CameraManager] Set srcObject on video element, calling play()...');
        await videoElement.play();
        console.log(
          '[CameraManager] Video playing, readyState:',
          videoElement.readyState,
          'videoWidth:',
          videoElement.videoWidth,
          'videoHeight:',
          videoElement.videoHeight,
        );
      }

      this.state.isRunning = true;
      this.state.permission = 'granted';
      this.state.error = null;

      this.emit({ type: 'start' });

      return this.stream;
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  /**
   * 停止摄像头
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.state.isRunning = false;
    this.state.videoSize = null;

    this.emit({ type: 'stop' });
  }

  /**
   * 获取当前视频流
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * 获取视频元素
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * 设置视频元素
   */
  setVideoElement(element: HTMLVideoElement | null): void {
    if (this.videoElement && this.videoElement !== element) {
      this.videoElement.srcObject = null;
    }

    this.videoElement = element;

    if (element && this.stream) {
      element.srcObject = this.stream;
      element.play().catch(() => {
        // 忽略自动播放错误
      });
    }
  }

  /**
   * 获取可用摄像头列表
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    if (!CameraManager.isSupported()) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  /**
   * 切换摄像头
   */
  async switchCamera(deviceId: string): Promise<boolean> {
    this.config.deviceId = deviceId;

    if (this.state.isRunning) {
      this.stop();
      const stream = await this.start(this.videoElement ?? undefined);
      return stream !== null;
    }

    return true;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CameraConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 添加事件监听器
   */
  addEventListener(callback: CameraEventCallback): void {
    this.eventListeners.add(callback);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(callback: CameraEventCallback): void {
    this.eventListeners.delete(callback);
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    this.stop();
    this.eventListeners.clear();
  }

  /**
   * 从 VisualFatigueConfig 创建配置
   */
  static fromVisualFatigueConfig(config: VisualFatigueConfig): CameraConfig {
    return {
      width: config.videoWidth,
      height: config.videoHeight,
      frameRate: Math.round(1000 / config.detectionIntervalMs),
      facingMode: 'user',
    };
  }

  /**
   * 触发事件
   */
  private emit(event: { type: CameraEventType; data?: unknown }): void {
    this.eventListeners.forEach((callback) => {
      try {
        callback(event);
      } catch {
        // 忽略回调错误
      }
    });
  }

  /**
   * 处理错误
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          this.state.permission = 'denied';
          this.state.error = '用户拒绝了摄像头访问权限';
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          this.state.permission = 'unavailable';
          this.state.error = '未找到摄像头设备';
          break;
        case 'NotReadableError':
        case 'TrackStartError':
          this.state.error = '摄像头被其他应用占用';
          break;
        case 'OverconstrainedError':
          this.state.error = '摄像头不支持请求的分辨率';
          break;
        default:
          this.state.error = error.message;
      }
    } else {
      this.state.error = '未知错误';
    }

    this.emit({ type: 'error', data: this.state.error });
  }
}

/**
 * 创建摄像头管理器实例
 */
export function createCameraManager(config?: Partial<CameraConfig>): CameraManager {
  return new CameraManager(config);
}
