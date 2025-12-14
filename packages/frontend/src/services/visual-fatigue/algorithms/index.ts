/**
 * 视觉疲劳检测算法模块
 *
 * 导出所有疲劳检测相关的计算器和分析器
 */

// EAR (Eye Aspect Ratio) 计算
export { EARCalculator, createEARCalculator, type EARResult } from './EARCalculator';

// PERCLOS 计算
export {
  PERCLOSCalculator,
  createPERCLOSCalculator,
  DEFAULT_PERCLOS_CONFIG,
  type PERCLOSConfig,
  type PERCLOSResult,
} from './PERCLOSCalculator';

// 眨眼检测
export {
  BlinkDetector,
  createBlinkDetector,
  DEFAULT_BLINK_CONFIG,
  type BlinkDetectorConfig,
  type BlinkStats,
} from './BlinkDetector';

// 打哈欠检测
export {
  YawnDetector,
  createYawnDetector,
  DEFAULT_YAWN_CONFIG,
  type YawnDetectorConfig,
  type MARResult,
  type YawnStats,
} from './YawnDetector';

// 头部姿态估计
export {
  HeadPoseEstimator,
  createHeadPoseEstimator,
  DEFAULT_HEAD_POSE_CONFIG,
  type HeadPoseConfig,
  type HeadPoseResult,
} from './HeadPoseEstimator';

// Blendshape 分析
export {
  BlendshapeAnalyzer,
  createBlendshapeAnalyzer,
  DEFAULT_BLENDSHAPE_CONFIG,
  type BlendshapeAnalyzerConfig,
  type BlendshapeData,
  type ExpressionFeatures,
} from './BlendshapeAnalyzer';

// 综合疲劳评分
export {
  FatigueScoreCalculator,
  createFatigueScoreCalculator,
  DEFAULT_FATIGUE_SCORE_CONFIG,
  type FatigueScoreConfig,
  type FatigueScoreWeights,
  type FatigueScoreBreakdown,
  type FatigueInputMetrics,
} from './FatigueScoreCalculator';
