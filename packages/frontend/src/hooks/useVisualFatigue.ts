/**
 * 视觉疲劳检测 Hook
 *
 * 封装视觉疲劳检测器的生命周期管理：
 * - 自动初始化检测器
 * - 实时指标订阅
 * - 后端上报逻辑
 * - 摄像头权限管理
 * - 校准流程
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVisualFatigueStore } from '../stores/visualFatigueStore';
import {
  VisualFatigueDetector,
  createVisualFatigueDetector,
  type DetectionResult,
} from '../services/visual-fatigue';
import { visualFatigueClient } from '../services/client';
import type { VisualFatigueMetrics, CameraPermissionStatus } from '@danci/shared';

/**
 * Hook 配置选项
 */
export interface UseVisualFatigueOptions {
  /** 是否自动开始检测 */
  autoStart?: boolean;
  /** 后端上报间隔（毫秒） */
  reportIntervalMs?: number;
  /** 检测结果回调 */
  onDetection?: (result: DetectionResult) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 获取当前会话ID */
  getSessionId?: () => string | undefined;
}

/**
 * Hook 返回值
 */
export interface UseVisualFatigueReturn {
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 是否已初始化 */
  isInitialized: boolean;
  /** 是否支持 */
  isSupported: boolean;
  /** 当前 FPS */
  currentFps: number;
  /** 摄像头权限状态 */
  cameraPermission: CameraPermissionStatus;
  /** 错误信息 */
  error: string | null;
  /** 实时指标 */
  metrics: {
    ear: number;
    perclos: number;
    blinkRate: number;
    yawnCount: number;
    visualFatigueScore: number;
    confidence: number;
  };
  /** 是否需要校准 */
  needsCalibration: boolean;
  /** 校准进度 */
  calibrationProgress: number;
  /** 请求摄像头权限 */
  requestCameraPermission: () => Promise<CameraPermissionStatus>;
  /** 开始检测 */
  start: (videoElement: HTMLVideoElement) => Promise<boolean>;
  /** 停止检测 */
  stop: () => void;
  /** 开始校准 */
  startCalibration: () => void;
  /** 取消校准 */
  cancelCalibration: () => void;
  /** 重置 */
  reset: () => void;
}

/**
 * 视觉疲劳检测 Hook
 */
export function useVisualFatigue(options: UseVisualFatigueOptions = {}): UseVisualFatigueReturn {
  const {
    autoStart = false,
    reportIntervalMs = 5000,
    onDetection,
    onError,
    getSessionId,
  } = options;

  // Store 状态
  const {
    enabled,
    detectorState,
    cameraPermission,
    cameraError,
    metrics: storeMetrics,
    calibration,
    personalBaseline,
    setEnabled,
    updateDetectorState,
    setCameraPermission,
    setCameraError,
    updateMetrics,
    setFullMetrics,
    updateCalibration,
    setPersonalBaseline,
    reset: resetStore,
  } = useVisualFatigueStore();

  // 本地状态
  const [isSupported] = useState(() => VisualFatigueDetector.isSupported());

  // Refs
  const detectorRef = useRef<VisualFatigueDetector | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metricsBufferRef = useRef<VisualFatigueMetrics[]>([]);
  // 用于在 cleanup effect 中访问最新的 stop 函数，避免依赖数组问题
  const stopRef = useRef<() => void>(() => {});

  /**
   * 获取或创建检测器
   */
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      detectorRef.current = createVisualFatigueDetector();
    }
    return detectorRef.current;
  }, []);

  /**
   * 处理检测结果
   */
  const handleDetection = useCallback(
    (result: DetectionResult) => {
      // 更新 store 中的实时指标
      if (result.faceDetected) {
        // 调试日志 - 前10次和每30次输出一次
        const bufferLen = metricsBufferRef.current.length;
        if (bufferLen < 10 || bufferLen % 30 === 0) {
          const hp = result.metrics.headPose;
          console.log('[useVisualFatigue] Updating metrics (#' + bufferLen + '):', {
            ear: result.metrics.eyeAspectRatio?.toFixed(3),
            blinkRate: result.metrics.blinkRate?.toFixed(1),
            headPose: hp
              ? {
                  pitch: (hp.pitch * 45).toFixed(1) + '°',
                  yaw: (hp.yaw * 45).toFixed(1) + '°',
                  roll: (hp.roll * 45).toFixed(1) + '°',
                }
              : 'undefined',
          });
        }

        // 显式创建 headPose 对象，确保值被正确传递
        const hp = result.metrics.headPose;
        const headPoseValue = {
          pitch: hp?.pitch ?? 0,
          yaw: hp?.yaw ?? 0,
          roll: hp?.roll ?? 0,
        };

        updateMetrics({
          ear: result.metrics.eyeAspectRatio,
          perclos: result.metrics.perclos,
          blinkRate: result.metrics.blinkRate,
          avgBlinkDuration: result.metrics.avgBlinkDuration,
          yawnCount: result.metrics.yawnCount,
          headPose: headPoseValue,
          visualFatigueScore: result.metrics.visualFatigueScore,
          confidence: result.metrics.confidence,
        });

        // 添加到上报缓冲区
        metricsBufferRef.current.push(result.metrics);
      }

      // 调用外部回调
      onDetection?.(result);
    },
    [updateMetrics, onDetection],
  );

  /**
   * 上报指标到后端
   */
  const reportMetrics = useCallback(async () => {
    if (metricsBufferRef.current.length === 0) {
      return;
    }

    // 获取最新的指标
    const latestMetrics = metricsBufferRef.current[metricsBufferRef.current.length - 1];
    metricsBufferRef.current = [];

    // 保存完整指标
    setFullMetrics(latestMetrics);

    // 上报到后端
    try {
      await visualFatigueClient.submitMetrics({
        score: latestMetrics.visualFatigueScore,
        perclos: latestMetrics.perclos,
        blinkRate: latestMetrics.blinkRate,
        yawnCount: latestMetrics.yawnCount,
        headPitch: latestMetrics.headPose?.pitch,
        headYaw: latestMetrics.headPose?.yaw,
        headRoll: latestMetrics.headPose?.roll,
        confidence: latestMetrics.confidence,
        timestamp: latestMetrics.timestamp,
        sessionId: getSessionId?.(),
        // Extended fields for TFM algorithm
        eyeAspectRatio: latestMetrics.eyeAspectRatio,
        avgBlinkDuration: latestMetrics.avgBlinkDuration,
        headStability: latestMetrics.headStability,
        squintIntensity: latestMetrics.squintIntensity,
        gazeOffScreenRatio: latestMetrics.gazeOffScreenRatio,
        expressionFatigueScore: latestMetrics.expressionFatigueScore,
        browDownIntensity: latestMetrics.browDownIntensity,
        mouthOpenRatio: latestMetrics.mouthOpenRatio,
      });
      console.log('[useVisualFatigue] Metrics reported to backend');
    } catch (error) {
      console.error('[useVisualFatigue] Failed to report metrics:', error);
      // 不阻塞用户体验，静默失败
    }
  }, [setFullMetrics, getSessionId]);

  /**
   * 请求摄像头权限
   */
  const requestCameraPermission = useCallback(async (): Promise<CameraPermissionStatus> => {
    const detector = getDetector();
    const cameraManager = detector.getCameraManager();

    const permission = await cameraManager.requestPermission();
    setCameraPermission(permission);

    if (permission !== 'granted') {
      setCameraError(cameraManager.getState().error);
    } else {
      setCameraError(null);
    }

    return permission;
  }, [getDetector, setCameraPermission, setCameraError]);

  /**
   * 开始检测
   */
  const start = useCallback(
    async (videoElement: HTMLVideoElement): Promise<boolean> => {
      if (!isSupported) {
        const error = new Error('浏览器不支持视觉疲劳检测');
        setCameraError(error.message);
        onError?.(error);
        return false;
      }

      try {
        const detector = getDetector();
        videoElementRef.current = videoElement;

        console.log('[useVisualFatigue] Initializing detector...');
        // 初始化检测器
        const initialized = await detector.initialize();
        console.log('[useVisualFatigue] Initialized:', initialized);
        if (!initialized) {
          throw new Error(detector.getState().error ?? '初始化失败');
        }

        updateDetectorState({
          isInitialized: true,
          isSupported: true,
        });

        console.log('[useVisualFatigue] Starting camera...');
        // 启动摄像头
        const cameraManager = detector.getCameraManager();
        const stream = await cameraManager.start(videoElement);
        console.log('[useVisualFatigue] Camera stream:', !!stream);
        if (!stream) {
          throw new Error(cameraManager.getState().error ?? '摄像头启动失败');
        }

        setCameraPermission('granted');

        console.log('[useVisualFatigue] Starting detection loop...');
        // 开始检测
        const started = await detector.start(videoElement, handleDetection);
        console.log('[useVisualFatigue] Detection started:', started);
        if (!started) {
          throw new Error(detector.getState().error ?? '检测启动失败');
        }

        updateDetectorState({
          isDetecting: true,
          error: null,
        });

        setEnabled(true);

        // 启动上报定时器
        if (reportTimerRef.current) {
          clearInterval(reportTimerRef.current);
        }
        reportTimerRef.current = setInterval(reportMetrics, reportIntervalMs);

        // 同步启用状态到后端（用于统计启用率）
        visualFatigueClient.updateConfig({ enabled: true }).catch((err) => {
          console.warn('[useVisualFatigue] Failed to sync enabled state:', err);
        });

        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('未知错误');
        updateDetectorState({
          isDetecting: false,
          error: err.message,
        });
        setCameraError(err.message);
        onError?.(err);
        return false;
      }
    },
    [
      isSupported,
      getDetector,
      handleDetection,
      updateDetectorState,
      setCameraPermission,
      setCameraError,
      setEnabled,
      reportMetrics,
      reportIntervalMs,
      onError,
    ],
  );

  /**
   * 停止检测
   */
  const stop = useCallback(() => {
    // 停止上报
    if (reportTimerRef.current) {
      clearInterval(reportTimerRef.current);
      reportTimerRef.current = null;
    }

    // 停止检测器
    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current.getCameraManager().stop();
    }

    updateDetectorState({
      isDetecting: false,
      currentFps: 0,
    });

    setEnabled(false);
    videoElementRef.current = null;

    // 同步关闭状态到后端
    visualFatigueClient.updateConfig({ enabled: false }).catch((err) => {
      console.warn('[useVisualFatigue] Failed to sync disabled state:', err);
    });
  }, [updateDetectorState, setEnabled]);

  // 保持 stopRef 指向最新的 stop 函数
  stopRef.current = stop;

  /**
   * 开始校准
   */
  const startCalibration = useCallback(() => {
    const detector = getDetector();
    const calibrator = detector.getCalibrator();

    calibrator.startCalibration((progress, state) => {
      updateCalibration({
        state,
        progress,
        error: state === 'failed' ? '校准失败，请重试' : null,
      });

      if (state === 'completed') {
        setPersonalBaseline(calibrator.getBaseline());
      }
    });

    updateCalibration({
      state: 'calibrating',
      progress: 0,
      error: null,
    });
  }, [getDetector, updateCalibration, setPersonalBaseline]);

  /**
   * 取消校准
   */
  const cancelCalibration = useCallback(() => {
    const detector = getDetector();
    const calibrator = detector.getCalibrator();
    calibrator.cancelCalibration();

    updateCalibration({
      state: 'idle',
      progress: 0,
      error: null,
    });
  }, [getDetector, updateCalibration]);

  /**
   * 重置
   */
  const reset = useCallback(() => {
    stop();

    if (detectorRef.current) {
      detectorRef.current.reset();
      detectorRef.current.getCalibrator().reset();
    }

    metricsBufferRef.current = [];
    resetStore();
  }, [stop, resetStore]);

  // 自动开始
  useEffect(() => {
    if (autoStart && enabled && videoElementRef.current && !detectorState.isDetecting) {
      start(videoElementRef.current);
    }
  }, [autoStart, enabled, detectorState.isDetecting, start]);

  // 清理 - 组件卸载时停止检测并释放资源
  // 使用 stopRef 避免 stop 函数变化导致 effect 重新执行
  useEffect(() => {
    return () => {
      // 清除上报定时器
      if (reportTimerRef.current) {
        clearInterval(reportTimerRef.current);
        reportTimerRef.current = null;
      }

      // 调用最新的 stop 函数
      stopRef.current();

      // 释放检测器资源
      if (detectorRef.current) {
        detectorRef.current.dispose();
        detectorRef.current = null;
      }
    };
  }, []); // 空依赖数组，只在组件卸载时执行

  // 更新 FPS
  useEffect(() => {
    if (detectorRef.current && detectorState.isDetecting) {
      const interval = setInterval(() => {
        const state = detectorRef.current?.getState();
        if (state) {
          updateDetectorState({ currentFps: state.currentFps });
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [detectorState.isDetecting, updateDetectorState]);

  return {
    isDetecting: detectorState.isDetecting,
    isInitialized: detectorState.isInitialized,
    isSupported,
    currentFps: detectorState.currentFps,
    cameraPermission,
    error: detectorState.error ?? cameraError,
    metrics: {
      ear: storeMetrics.ear,
      perclos: storeMetrics.perclos,
      blinkRate: storeMetrics.blinkRate,
      yawnCount: storeMetrics.yawnCount,
      visualFatigueScore: storeMetrics.visualFatigueScore,
      confidence: storeMetrics.confidence,
    },
    needsCalibration: !personalBaseline?.isCalibrated,
    calibrationProgress: calibration.progress,
    requestCameraPermission,
    start,
    stop,
    startCalibration,
    cancelCalibration,
    reset,
  };
}

export default useVisualFatigue;
