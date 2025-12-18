/**
 * 视觉疲劳状态管理
 *
 * 管理视觉疲劳检测的全局状态：
 * - 检测器配置
 * - 实时指标
 * - 摄像头状态
 * - 校准进度
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  VisualFatigueConfig,
  VisualFatigueMetrics,
  VisualFatigueDetectorState,
  CameraPermissionStatus,
  HeadPose,
  PersonalBaseline,
} from '@danci/shared';
import { STORAGE_KEYS } from '../constants/storageKeys';

/**
 * 实时指标数据
 */
interface RealtimeMetrics {
  /** 当前 EAR 值 */
  ear: number;
  /** 当前 PERCLOS 值 */
  perclos: number;
  /** 当前眨眼频率 */
  blinkRate: number;
  /** 平均眨眼持续时间 */
  avgBlinkDuration: number;
  /** 打哈欠次数 */
  yawnCount: number;
  /** 头部姿态 */
  headPose: HeadPose;
  /** 综合视觉疲劳评分 */
  visualFatigueScore: number;
  /** 检测置信度 */
  confidence: number;
  /** 更新时间戳 */
  timestamp: number;
}

/**
 * 校准状态
 */
interface CalibrationStatus {
  /** 校准状态 */
  state: 'idle' | 'calibrating' | 'completed' | 'failed';
  /** 校准进度 [0-1] */
  progress: number;
  /** 错误信息 */
  error: string | null;
}

/**
 * 视觉疲劳状态
 */
interface VisualFatigueState {
  // ========== 配置状态 ==========
  /** 是否启用视觉疲劳检测 */
  enabled: boolean;
  /** 检测配置 */
  config: VisualFatigueConfig;

  // ========== 检测器状态 ==========
  /** 检测器状态 */
  detectorState: VisualFatigueDetectorState;

  // ========== 摄像头状态 ==========
  /** 摄像头权限状态 */
  cameraPermission: CameraPermissionStatus;
  /** 摄像头错误信息 */
  cameraError: string | null;

  // ========== 实时指标 ==========
  /** 实时指标数据 */
  metrics: RealtimeMetrics;
  /** 最后一次完整指标 */
  lastFullMetrics: VisualFatigueMetrics | null;

  // ========== 校准状态 ==========
  /** 校准状态 */
  calibration: CalibrationStatus;
  /** 个人基线 */
  personalBaseline: PersonalBaseline | null;

  // ========== Actions ==========
  /** 设置启用状态 */
  setEnabled: (enabled: boolean) => void;
  /** 更新配置 */
  updateConfig: (config: Partial<VisualFatigueConfig>) => void;
  /** 更新检测器状态 */
  updateDetectorState: (state: Partial<VisualFatigueDetectorState>) => void;
  /** 设置摄像头权限 */
  setCameraPermission: (status: CameraPermissionStatus) => void;
  /** 设置摄像头错误 */
  setCameraError: (error: string | null) => void;
  /** 更新实时指标 */
  updateMetrics: (metrics: Partial<RealtimeMetrics>) => void;
  /** 设置完整指标 */
  setFullMetrics: (metrics: VisualFatigueMetrics) => void;
  /** 更新校准状态 */
  updateCalibration: (status: Partial<CalibrationStatus>) => void;
  /** 设置个人基线 */
  setPersonalBaseline: (baseline: PersonalBaseline | null) => void;
  /** 重置所有状态 */
  reset: () => void;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: VisualFatigueConfig = {
  enabled: false,
  detectionIntervalMs: 100, // 10 FPS (WASM优化后提升)
  reportIntervalMs: 5000,
  earThreshold: 0.25, // 与 BlinkDetector 保持一致
  perclosThreshold: 0.15,
  yawnDurationMs: 2000,
  windowSizeSeconds: 60,
  videoWidth: 640,
  videoHeight: 480,
};

/**
 * 默认实时指标
 */
const DEFAULT_METRICS: RealtimeMetrics = {
  ear: 0,
  perclos: 0,
  blinkRate: 0,
  avgBlinkDuration: 0,
  yawnCount: 0,
  headPose: { pitch: 0, yaw: 0, roll: 0 },
  visualFatigueScore: 0,
  confidence: 0,
  timestamp: 0,
};

/**
 * 默认检测器状态
 */
const DEFAULT_DETECTOR_STATE: VisualFatigueDetectorState = {
  isDetecting: false,
  isInitialized: false,
  isSupported: false,
  currentFps: 0,
  error: null,
};

/**
 * 默认校准状态
 */
const DEFAULT_CALIBRATION: CalibrationStatus = {
  state: 'idle',
  progress: 0,
  error: null,
};

/**
 * 视觉疲劳状态 Store
 */
export const useVisualFatigueStore = create<VisualFatigueState>()(
  devtools(
    persist(
      (set) => ({
        // 初始状态
        enabled: false,
        config: DEFAULT_CONFIG,
        detectorState: DEFAULT_DETECTOR_STATE,
        cameraPermission: 'not_requested',
        cameraError: null,
        metrics: DEFAULT_METRICS,
        lastFullMetrics: null,
        calibration: DEFAULT_CALIBRATION,
        personalBaseline: null,

        // Actions
        setEnabled: (enabled) =>
          set(
            (state) => ({
              enabled,
              config: { ...state.config, enabled },
            }),
            false,
            'setEnabled',
          ),

        updateConfig: (config) =>
          set(
            (state) => ({
              config: { ...state.config, ...config },
            }),
            false,
            'updateConfig',
          ),

        updateDetectorState: (detectorState) =>
          set(
            (state) => ({
              detectorState: { ...state.detectorState, ...detectorState },
            }),
            false,
            'updateDetectorState',
          ),

        setCameraPermission: (cameraPermission) =>
          set({ cameraPermission }, false, 'setCameraPermission'),

        setCameraError: (cameraError) => set({ cameraError }, false, 'setCameraError'),

        updateMetrics: (metrics) =>
          set(
            (state) => {
              // 确保 headPose 被正确更新（创建新对象引用）
              const newHeadPose = metrics.headPose
                ? { ...metrics.headPose }
                : state.metrics.headPose;

              return {
                metrics: {
                  ...state.metrics,
                  ...metrics,
                  headPose: newHeadPose,
                  timestamp: Date.now(),
                },
              };
            },
            false,
            'updateMetrics',
          ),

        setFullMetrics: (lastFullMetrics) => set({ lastFullMetrics }, false, 'setFullMetrics'),

        updateCalibration: (calibration) =>
          set(
            (state) => ({
              calibration: { ...state.calibration, ...calibration },
            }),
            false,
            'updateCalibration',
          ),

        setPersonalBaseline: (personalBaseline) =>
          set({ personalBaseline }, false, 'setPersonalBaseline'),

        reset: () =>
          set(
            {
              enabled: false,
              detectorState: DEFAULT_DETECTOR_STATE,
              cameraPermission: 'not_requested',
              cameraError: null,
              metrics: DEFAULT_METRICS,
              lastFullMetrics: null,
              calibration: DEFAULT_CALIBRATION,
            },
            false,
            'reset',
          ),
      }),
      {
        name: STORAGE_KEYS.VISUAL_FATIGUE_STORAGE,
        // 只持久化部分状态
        partialize: (state) => ({
          enabled: state.enabled,
          config: state.config,
          personalBaseline: state.personalBaseline,
        }),
      },
    ),
    {
      name: 'Visual Fatigue Store',
      enabled: import.meta.env.DEV,
    },
  ),
);

/**
 * 选择器：是否正在检测
 */
export const selectIsDetecting = (state: VisualFatigueState) => state.detectorState.isDetecting;

/**
 * 选择器：视觉疲劳评分
 */
export const selectVisualFatigueScore = (state: VisualFatigueState) =>
  state.metrics.visualFatigueScore;

/**
 * 选择器：是否需要校准
 */
export const selectNeedsCalibration = (state: VisualFatigueState) =>
  !state.personalBaseline?.isCalibrated;

/**
 * 选择器：摄像头是否可用
 */
export const selectCameraAvailable = (state: VisualFatigueState) =>
  state.cameraPermission === 'granted' && !state.cameraError;
