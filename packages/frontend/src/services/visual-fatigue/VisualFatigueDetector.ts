/**
 * 视觉疲劳检测器 (Worker 版)
 *
 * 核心检测器，负责：
 * - 管理 Web Worker 生命周期
 * - 视频帧采集 (ImageBitmap)
 * - 与 Worker 异步通信
 * - 结果分发
 */

import type {
  VisualFatigueConfig,
  VisualFatigueMetrics,
  VisualFatigueDetectorState,
  BlinkEvent,
  YawnEvent,
} from '@danci/shared';

// 导入 Worker 类型
import type { WorkerResponse, WorkerInitConfig } from '../../workers/visual-fatigue.worker';

import { CameraManager } from './CameraManager';
import { PersonalizedCalibrator } from './PersonalizedCalibrator';
import { DeviceCapabilityDetector } from './DeviceCapabilityDetector';

/**
 * 检测器配置
 */
export interface DetectorConfig {
  /** 检测间隔（毫秒） */
  detectionIntervalMs: number;
  /** 是否启用 Blendshapes */
  enableBlendshapes: boolean;
  /** 是否使用 GPU */
  useGPU: boolean;
  /** MediaPipe 模型路径 */
  modelPath: string;
}

/**
 * 默认检测器配置
 */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  detectionIntervalMs: 100, // 10 FPS (WASM优化后提升)
  enableBlendshapes: true,
  useGPU: false, // 暂时禁用 GPU 以排查 Worker 兼容性问题
  modelPath: '/models/mediapipe/face_landmarker.task',
};

/**
 * 检测结果
 */
export interface DetectionResult {
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
}

/**
 * 检测回调
 */
export type DetectionCallback = (result: DetectionResult) => void;

/**
 * 视觉疲劳检测器类
 */
export class VisualFatigueDetector {
  private config: DetectorConfig;
  private state: VisualFatigueDetectorState = {
    isDetecting: false,
    isInitialized: false,
    isSupported: false,
    currentFps: 0,
    error: null,
  };

  // Web Worker
  private worker: Worker | null = null;
  private initPromise: Promise<boolean> | null = null;

  // 辅助模块
  private cameraManager: CameraManager;
  private calibrator: PersonalizedCalibrator;
  private deviceDetector: DeviceCapabilityDetector;

  // 检测循环
  private detectionCallback: DetectionCallback | null = null;
  private animationFrameId: number | null = null;
  private lastDetectionTime: number = 0;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private resultCount: number = 0;

  // 视频元素
  private videoElement: HTMLVideoElement | null = null;

  // 暂停时保存的状态（用于 resume）
  private pausedVideoElement: HTMLVideoElement | null = null;
  private pausedCallback: DetectionCallback | null = null;
  // Canvas (用于降级或辅助，目前主要用 ImageBitmap)
  private offscreenCanvas: OffscreenCanvas | null = null;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };

    // 初始化辅助模块
    this.cameraManager = new CameraManager();
    this.calibrator = new PersonalizedCalibrator();
    this.deviceDetector = new DeviceCapabilityDetector();
  }

  /**
   * 获取当前状态
   */
  getState(): VisualFatigueDetectorState {
    return { ...this.state };
  }

  /**
   * 检查是否支持
   */
  static isSupported(): boolean {
    return (
      CameraManager.isSupported() &&
      typeof window !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
    );
  }

  /**
   * 初始化检测器
   */
  async initialize(): Promise<boolean> {
    if (this.state.isInitialized) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<boolean> {
    try {
      console.log('[VisualFatigue] Initializing Worker...');

      // 检测设备能力
      const capabilities = await this.deviceDetector.detect();
      const recommendedConfig = capabilities.recommendedConfig;

      // 根据设备能力调整配置
      this.config.enableBlendshapes = recommendedConfig.enableBlendshapes;
      // this.config.useGPU = recommendedConfig.delegate === 'GPU'; // 强制禁用 GPU
      this.config.useGPU = false;

      // 创建 Worker
      this.worker = new Worker(new URL('../../workers/visual-fatigue.worker.ts', import.meta.url));

      // 设置消息监听
      this.worker.onmessage = this.handleWorkerMessage.bind(this);

      // 发送初始化消息
      const initConfig: WorkerInitConfig = {
        modelPath: this.config.modelPath,
        useGPU: this.config.useGPU,
        enableBlendshapes: this.config.enableBlendshapes,
      };

      // 等待初始化响应
      return new Promise((resolve) => {
        const INIT_TIMEOUT = 30000;

        const handler = (e: MessageEvent<WorkerResponse>) => {
          if (e.data.type === 'init-result') {
            clearTimeout(timeoutId);
            this.worker?.removeEventListener('message', handler);

            if (e.data.success) {
              console.log('[VisualFatigue] Worker initialized successfully');
              this.state.isInitialized = true;
              this.state.isSupported = true;
              this.state.error = null;
              resolve(true);
            } else {
              console.error('[VisualFatigue] Worker init failed:', e.data.error);
              this.state.error = e.data.error ?? 'Worker initialization failed';
              this.state.isSupported = false;
              resolve(false);
            }
          }
        };

        const timeoutId = setTimeout(() => {
          this.worker?.removeEventListener('message', handler);
          console.error('[VisualFatigue] Worker init timeout');
          this.state.error = 'Worker initialization timeout';
          this.state.isSupported = false;
          resolve(false);
        }, INIT_TIMEOUT);

        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'init', config: initConfig });
      });
    } catch (error) {
      console.error('[VisualFatigue] Detector initialization error:', error);
      this.state.error = error instanceof Error ? error.message : '初始化失败';
      this.state.isSupported = false;
      return false;
    }
  }

  /**
   * 处理 Worker 消息
   */
  private handleWorkerMessage(e: MessageEvent<WorkerResponse>) {
    const { type } = e.data;

    switch (type) {
      case 'detect-result':
        if ('result' in e.data) {
          this.handleDetectionResult(e.data.result);
        }
        break;
      case 'init-result':
        // 初始化消息主要在 doInitialize 中处理，这里作为一个兜底或日志
        break;
    }
  }

  /**
   * 处理检测结果
   */
  private handleDetectionResult(result: DetectionResult) {
    // 调试日志：每 50 次输出一次
    this.resultCount = (this.resultCount || 0) + 1;
    if (this.resultCount <= 5 || this.resultCount % 50 === 0) {
      console.log(`[VisualFatigue] Result #${this.resultCount}:`, {
        faceDetected: result.faceDetected,
        hasCallback: !!this.detectionCallback,
        score: result.metrics?.visualFatigueScore?.toFixed(2),
      });
    }

    // 在线更新校准基线 (这部分逻辑保留在主线程可能更方便访问 Store，或者也移入 Worker？
    // 目前 Calibrator 在主线程，需要保留)
    const earValue = result.metrics?.earValue;
    const marValue = result.metrics?.marValue;
    if (earValue !== undefined && earValue > 0 && marValue !== undefined && marValue > 0) {
      this.calibrator.updateBaselineOnline(earValue, marValue);
    }

    if (this.detectionCallback) {
      this.detectionCallback(result);
    }
  }

  /**
   * 开始检测
   */
  async start(videoElement: HTMLVideoElement, callback: DetectionCallback): Promise<boolean> {
    if (!this.state.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    if (this.state.isDetecting) return true;

    this.videoElement = videoElement;
    this.detectionCallback = callback;

    try {
      if (videoElement.paused) {
        await videoElement.play();
      }
    } catch (e) {
      console.error('[VisualFatigue] Video play error:', e);
      this.state.error = '视频播放失败';
      return false;
    }

    this.state.isDetecting = true;
    this.state.error = null;
    this.lastDetectionTime = 0;
    this.frameCount = 0;
    this.fpsUpdateTime = performance.now();

    this.startDetectionLoop();
    return true;
  }

  /**
   * 停止检测
   */
  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.state.isDetecting = false;
    this.state.currentFps = 0;
    this.detectionCallback = null;
    this.videoElement = null;
    this.resultCount = 0; // 重置日志计数器
  }

  /**
   * 暂停检测（保留状态以便恢复）
   */
  pause(): void {
    // 保存当前状态用于恢复
    this.pausedVideoElement = this.videoElement;
    this.pausedCallback = this.detectionCallback;

    // 只停止检测循环，不清除 videoElement 和 detectionCallback
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.state.isDetecting = false;
    this.state.currentFps = 0;
  }

  /**
   * 恢复检测
   */
  resume(): void {
    // 使用暂停时保存的状态恢复
    const videoElement = this.pausedVideoElement || this.videoElement;
    const callback = this.pausedCallback || this.detectionCallback;

    if (videoElement && callback) {
      this.start(videoElement, callback);
    }

    // 清除暂停状态
    this.pausedVideoElement = null;
    this.pausedCallback = null;
  }

  /**
   * 检测循环
   */
  private startDetectionLoop(): void {
    const detect = async (timestamp: number) => {
      if (!this.state.isDetecting || !this.videoElement) {
        return;
      }

      // 检查间隔
      const elapsed = timestamp - this.lastDetectionTime;
      if (elapsed >= this.config.detectionIntervalMs) {
        this.lastDetectionTime = timestamp;

        // 执行检测 (发送给 Worker)
        await this.performWorkerDetection(timestamp);

        this.updateFps(timestamp);
      }

      this.animationFrameId = requestAnimationFrame(detect);
    };

    this.animationFrameId = requestAnimationFrame(detect);
  }

  /**
   * 发送帧给 Worker
   */
  private async performWorkerDetection(timestamp: number) {
    if (!this.worker || !this.videoElement || this.videoElement.readyState < 2) {
      return;
    }

    // console.log('[VisualFatigue Debug] Sending frame to worker'); // 减少日志量, 仅需确认是否在跑

    let bitmap: ImageBitmap | undefined;
    try {
      // 核心性能点：使用 createImageBitmap 零拷贝传输
      bitmap = await createImageBitmap(this.videoElement);

      this.worker.postMessage(
        { type: 'detect', image: bitmap, timestamp },
        [bitmap], // Transferable，移交所有権，Worker 用完需 close
      );
    } catch (error) {
      bitmap?.close();
      console.error('[VisualFatigue] Frame capture error:', error);
    }
  }

  /**
   * 更新 FPS
   */
  private updateFps(timestamp: number): void {
    this.frameCount++;
    const elapsed = timestamp - this.fpsUpdateTime;
    if (elapsed >= 1000) {
      this.state.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      // console.log('[VisualFatigue] Worker FPS:', this.state.currentFps);
      this.frameCount = 0;
      this.fpsUpdateTime = timestamp;
    }
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.stop();

    if (this.worker) {
      this.worker.postMessage({ type: 'close' });
      this.worker.terminate();
      this.worker = null;
    }

    this.state.isInitialized = false;
    this.initPromise = null;
  }

  // getters
  getCameraManager() {
    return this.cameraManager;
  }
  getCalibrator() {
    return this.calibrator;
  }
  getDeviceDetector() {
    return this.deviceDetector;
  }

  // reset
  reset() {
    // Worker 无法简单 reset 内部算法状态除非发送 reset 消息
    // 目前没有实现 reset 消息，可以根据需要添加，或者忽略（算法通常是无状态或快速收敛的）
  }

  static fromConfig(config: VisualFatigueConfig): VisualFatigueDetector {
    return new VisualFatigueDetector({
      detectionIntervalMs: config.detectionIntervalMs,
    });
  }
}

/**
 * 工厂函数
 */
export function createVisualFatigueDetector(
  config?: Partial<DetectorConfig>,
): VisualFatigueDetector {
  return new VisualFatigueDetector(config);
}
