/**
 * 视觉疲劳检测平台抽象层
 *
 * 提供跨平台的视觉疲劳检测接口：
 * - Web 端：使用 MediaPipe JS (Web Worker)
 * - Android Tauri：使用 MediaPipe Android SDK (原生桥接)
 *
 * 自动检测运行环境并选择合适的实现
 */

import { isTauri } from '../../utils/platform';
import type {
  VisualFatigueMetrics,
  VisualFatigueDetectorState,
  BlinkEvent,
  YawnEvent,
} from '@danci/shared';

// ===================== 类型定义 =====================

/**
 * 检测结果
 */
export interface FatigueDetectionResult {
  /** 指标数据 */
  metrics: VisualFatigueMetrics;
  /** 是否检测到面部 */
  faceDetected: boolean;
  /** 眨眼事件（如果有） */
  blinkEvent: BlinkEvent | null;
  /** 打哈欠事件（如果有） */
  yawnEvent: YawnEvent | null;
  /** 处理时间（毫秒） */
  processingTime: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 检测器配置
 */
export interface FatigueDetectorConfig {
  /** 检测间隔（毫秒） */
  detectionIntervalMs: number;
  /** 是否启用 Blendshapes (仅 Android 完整支持) */
  enableBlendshapes: boolean;
  /** 是否使用 GPU */
  useGPU: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_FATIGUE_CONFIG: FatigueDetectorConfig = {
  detectionIntervalMs: 200, // 5 FPS
  enableBlendshapes: true,
  useGPU: false,
};

/**
 * 平台能力信息
 */
export interface PlatformCapability {
  /** 是否支持视觉疲劳检测 */
  supported: boolean;
  /** 面部关键点数量 (Web: 468, Android MediaPipe: 478) */
  landmarkCount: number;
  /** 是否支持 Blendshapes (Web: 部分, Android: 52个完整支持) */
  hasBlendshapes: boolean;
  /** Blendshapes 数量 */
  blendshapeCount: number;
  /** 平台标识 */
  platform: 'web' | 'android' | 'ios' | 'desktop';
  /** 不支持的原因 */
  unsupportedReason?: string;
}

/**
 * 检测回调
 */
export type FatigueDetectionCallback = (result: FatigueDetectionResult) => void;

/**
 * 视觉疲劳检测服务接口
 */
export interface IFatigueDetectionService {
  /** 初始化 */
  initialize(): Promise<boolean>;
  /** 开始检测 */
  startDetection(videoElement: HTMLVideoElement, callback: FatigueDetectionCallback): Promise<void>;
  /** 停止检测 */
  stopDetection(): Promise<void>;
  /** 暂停检测 */
  pause(): void;
  /** 恢复检测 */
  resume(): Promise<void>;
  /** 获取状态 */
  getState(): VisualFatigueDetectorState;
  /** 获取平台能力 */
  getPlatformCapability(): PlatformCapability;
  /** 销毁资源 */
  destroy(): Promise<void>;
}

// ===================== Tauri Android 实现 =====================

/**
 * Tauri Android 视觉疲劳检测服务
 * 通过 invoke 调用原生 MediaPipe Android SDK
 *
 * 注意：实际的原生实现需要在 Kotlin 侧完成
 * 目前返回不支持状态，让应用降级到 Web 实现
 */
class TauriFatigueDetectionService implements IFatigueDetectionService {
  private state: VisualFatigueDetectorState = {
    isDetecting: false,
    isInitialized: false,
    isSupported: false,
    currentFps: 0,
    error: null,
  };

  async initialize(): Promise<boolean> {
    // TODO: 实现 Android MediaPipe SDK 初始化
    // 需要在 Kotlin 侧实现 FatigueDetector 类，并通过 Tauri 插件暴露
    //
    // Kotlin 代码示例:
    // val faceLandmarker = FaceLandmarker.createFromOptions(context, options)
    //
    // 然后通过 JNI 桥接到 Rust

    console.log('[TauriFatigueDetection] Android MediaPipe SDK 尚未实现，将降级到 Web 版本');

    this.state = {
      ...this.state,
      isSupported: false,
      error: 'Android MediaPipe SDK 原生实现开发中',
    };

    return false;
  }

  async startDetection(
    _videoElement: HTMLVideoElement,
    _callback: FatigueDetectionCallback,
  ): Promise<void> {
    throw new Error('Android 原生视觉疲劳检测尚未实现');
  }

  async stopDetection(): Promise<void> {
    this.state.isDetecting = false;
  }

  pause(): void {
    this.state.isDetecting = false;
  }

  async resume(): Promise<void> {
    throw new Error('Android 原生视觉疲劳检测尚未实现');
  }

  getState(): VisualFatigueDetectorState {
    return { ...this.state };
  }

  getPlatformCapability(): PlatformCapability {
    return {
      supported: false,
      landmarkCount: 478, // MediaPipe Android SDK 支持 478 个关键点
      hasBlendshapes: true, // 完整支持 52 个 Blendshapes
      blendshapeCount: 52,
      platform: 'android',
      unsupportedReason: 'Android MediaPipe SDK 原生实现开发中，请使用 Web 版本',
    };
  }

  async destroy(): Promise<void> {
    this.state = {
      isDetecting: false,
      isInitialized: false,
      isSupported: false,
      currentFps: 0,
      error: null,
    };
  }
}

// ===================== Web 实现适配器 =====================

/**
 * Web 视觉疲劳检测服务适配器
 * 包装现有的 VisualFatigueDetector
 */
class WebFatigueDetectionService implements IFatigueDetectionService {
  private detector: import('./VisualFatigueDetector').VisualFatigueDetector | null = null;
  private detectorPromise: Promise<import('./VisualFatigueDetector').VisualFatigueDetector> | null =
    null;

  /**
   * 延迟加载 Web 检测器
   */
  private async getDetector() {
    if (this.detector) {
      return this.detector;
    }

    if (!this.detectorPromise) {
      this.detectorPromise = (async () => {
        const { VisualFatigueDetector } = await import('./VisualFatigueDetector');
        this.detector = new VisualFatigueDetector();
        return this.detector;
      })();
    }

    return this.detectorPromise;
  }

  async initialize(): Promise<boolean> {
    try {
      const detector = await this.getDetector();
      return detector.initialize();
    } catch (error) {
      console.error('[WebFatigueDetection] 初始化失败:', error);
      return false;
    }
  }

  async startDetection(
    videoElement: HTMLVideoElement,
    callback: FatigueDetectionCallback,
  ): Promise<void> {
    const detector = await this.getDetector();
    await detector.start(videoElement, (result) => {
      callback({
        metrics: result.metrics,
        faceDetected: result.faceDetected,
        blinkEvent: result.blinkEvent,
        yawnEvent: result.yawnEvent,
        processingTime: result.processingTime,
        timestamp: Date.now(),
      });
    });
  }

  async stopDetection(): Promise<void> {
    if (this.detector) {
      this.detector.stop();
    }
  }

  pause(): void {
    if (this.detector) {
      this.detector.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.detector) {
      await this.detector.resume();
    }
  }

  getState(): VisualFatigueDetectorState {
    if (this.detector) {
      return this.detector.getState();
    }
    return {
      isDetecting: false,
      isInitialized: false,
      isSupported: false,
      currentFps: 0,
      error: null,
    };
  }

  getPlatformCapability(): PlatformCapability {
    // Web 端使用 MediaPipe JS
    const supported =
      typeof window !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;

    return {
      supported,
      landmarkCount: 468, // MediaPipe JS 提供 468 个关键点
      hasBlendshapes: true, // 部分支持
      blendshapeCount: 52, // 理论上支持，但需要特定模型
      platform: 'web',
      unsupportedReason: supported ? undefined : '浏览器不支持摄像头或 Web Worker',
    };
  }

  async destroy(): Promise<void> {
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
    }
    this.detectorPromise = null;
  }
}

// ===================== 混合服务 =====================

/**
 * 混合视觉疲劳检测服务
 * 优先使用原生实现，如果不可用则降级到 Web 实现
 */
class HybridFatigueDetectionService implements IFatigueDetectionService {
  private tauriService: TauriFatigueDetectionService | null = null;
  private webService: WebFatigueDetectionService;
  private activeService: IFatigueDetectionService | null = null;
  private initialized = false;

  constructor() {
    this.webService = new WebFatigueDetectionService();

    if (isTauri()) {
      this.tauriService = new TauriFatigueDetectionService();
    }
  }

  async initialize(): Promise<boolean> {
    if (this.initialized && this.activeService) {
      return this.activeService.getState().isSupported;
    }

    // 优先尝试 Tauri 原生实现
    if (this.tauriService) {
      const tauriAvailable = await this.tauriService.initialize();
      if (tauriAvailable) {
        this.activeService = this.tauriService;
        this.initialized = true;
        console.log('[HybridFatigueDetection] 使用 Tauri 原生检测');
        return true;
      }
    }

    // 降级到 Web 实现
    const webAvailable = await this.webService.initialize();
    this.activeService = this.webService;
    this.initialized = true;
    console.log('[HybridFatigueDetection] 使用 Web 检测');
    return webAvailable;
  }

  async startDetection(
    videoElement: HTMLVideoElement,
    callback: FatigueDetectionCallback,
  ): Promise<void> {
    if (!this.activeService) {
      await this.initialize();
    }

    if (!this.activeService) {
      throw new Error('视觉疲劳检测服务未初始化');
    }

    await this.activeService.startDetection(videoElement, callback);
  }

  async stopDetection(): Promise<void> {
    if (this.activeService) {
      await this.activeService.stopDetection();
    }
  }

  pause(): void {
    if (this.activeService) {
      this.activeService.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.activeService) {
      await this.activeService.resume();
    }
  }

  getState(): VisualFatigueDetectorState {
    if (this.activeService) {
      return this.activeService.getState();
    }
    return {
      isDetecting: false,
      isInitialized: false,
      isSupported: false,
      currentFps: 0,
      error: null,
    };
  }

  getPlatformCapability(): PlatformCapability {
    if (this.activeService) {
      return this.activeService.getPlatformCapability();
    }

    // 返回 Web 默认能力
    return this.webService.getPlatformCapability();
  }

  async destroy(): Promise<void> {
    if (this.tauriService) {
      await this.tauriService.destroy();
    }
    await this.webService.destroy();
    this.activeService = null;
    this.initialized = false;
  }

  /**
   * 获取当前使用的服务类型
   */
  getServiceType(): 'tauri' | 'web' | null {
    if (!this.activeService) return null;
    return this.activeService === this.tauriService ? 'tauri' : 'web';
  }
}

// ===================== 导出 =====================

/** 视觉疲劳检测服务单例 */
export const fatigueDetectionService = new HybridFatigueDetectionService();

export default fatigueDetectionService;
