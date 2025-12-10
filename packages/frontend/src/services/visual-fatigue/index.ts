/**
 * 视觉疲劳检测模块
 *
 * 提供基于摄像头的视觉疲劳检测功能：
 * - EAR/PERCLOS 眼睛状态检测
 * - 眨眼频率和持续时间分析
 * - 打哈欠检测
 * - 头部姿态估计
 * - Blendshape 表情分析
 * - 综合疲劳评分
 * - 个性化校准
 */

// 核心检测器
export {
  VisualFatigueDetector,
  createVisualFatigueDetector,
  DEFAULT_DETECTOR_CONFIG,
  type DetectorConfig,
  type DetectionResult,
  type DetectionCallback,
} from './VisualFatigueDetector';

// 摄像头管理
export {
  CameraManager,
  createCameraManager,
  DEFAULT_CAMERA_CONFIG,
  type CameraConfig,
  type CameraState,
  type CameraEventType,
  type CameraEventCallback,
} from './CameraManager';

// 个性化校准
export {
  PersonalizedCalibrator,
  createPersonalizedCalibrator,
  DEFAULT_CALIBRATION_CONFIG,
  type CalibrationConfig,
  type CalibrationState,
  type CalibrationResult,
  type CalibrationProgressCallback,
} from './PersonalizedCalibrator';

// 设备能力检测
export {
  DeviceCapabilityDetector,
  createDeviceCapabilityDetector,
  getDeviceCapabilityDetector,
  type DeviceCapabilityResult,
  type RecommendedConfig,
} from './DeviceCapabilityDetector';

// 算法模块
export * from './algorithms';
