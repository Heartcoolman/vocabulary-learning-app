/**
 * 智能疲劳感知系统类型定义
 * Intelligent Fatigue Perception System Types
 *
 * @description 基于设计文档 docs/intelligent-fatigue-system-design.md
 * 实现个性化适应、多模态融合、趋势预测和自适应决策
 */

import type { VisualFatigueMetrics, BaseFusedFatigueResult } from './visual-fatigue';

// ==================== 个性化基线类型 ====================

/**
 * 用户人口学特征（用于冷启动基线选择）
 */
export interface UserDemographics {
  /** 年龄 */
  age?: number;
  /** 是否戴眼镜 */
  wearsGlasses?: boolean;
  /** 性别 */
  gender?: 'male' | 'female' | 'other';
}

/**
 * 统计分布参数
 */
export interface StatisticsParams {
  /** 均值 */
  mean: number;
  /** 标准差 */
  std: number;
  /** 样本数 */
  samples: number;
}

/**
 * 个人基线数据
 */
export interface PersonalBaseline {
  /** EAR（眼睛纵横比）基线 */
  ear: StatisticsParams;
  /** MAR（嘴巴纵横比）基线 */
  mar: StatisticsParams;
  /** 眨眼频率基线 (次/分钟) */
  blinkRate: StatisticsParams;
  /** 最后更新时间戳 */
  lastUpdated: number;
  /** 基线版本（用于兼容性迁移） */
  version: number;
  /** 校准会话数 */
  calibrationSessions: number;
  /** 是否完成初始校准 */
  isCalibrated: boolean;
}

/**
 * 冷启动人群统计基线
 */
export type ColdStartBaselineType = 'default' | 'glasses' | 'senior';

/**
 * 冷启动基线配置
 */
export interface ColdStartBaseline {
  /** 基线类型 */
  type: ColdStartBaselineType;
  /** EAR 基线 */
  ear: {
    mean: number;
    std: number;
  };
  /** MAR 基线 */
  mar: {
    mean: number;
    std: number;
  };
}

/**
 * 预定义的冷启动基线
 */
export const POPULATION_BASELINES: Record<ColdStartBaselineType, ColdStartBaseline> = {
  default: {
    type: 'default',
    ear: { mean: 0.28, std: 0.03 },
    mar: { mean: 0.15, std: 0.05 },
  },
  glasses: {
    type: 'glasses',
    ear: { mean: 0.26, std: 0.04 }, // 戴眼镜用户EAR略低
    mar: { mean: 0.15, std: 0.05 },
  },
  senior: {
    type: 'senior',
    ear: { mean: 0.24, std: 0.04 }, // 老年用户EAR更低
    mar: { mean: 0.12, std: 0.04 },
  },
};

// ==================== 校准器类型 ====================

/**
 * 个性化校准器配置
 */
export interface PersonalizedCalibratorConfig {
  /** 校准时长 (ms)，默认 3000 */
  calibrationDuration: number;
  /** 最少校准样本数，默认 30 */
  minCalibrationSamples: number;
  /** 在线更新速率 (EMA alpha)，默认 0.01 */
  onlineUpdateRate: number;
  /** 异常值阈值 (标准差倍数)，默认 3 */
  outlierThreshold: number;
  /** 闭眼阈值系数 k，默认 2.0 */
  eyeClosedK: number;
  /** 打哈欠阈值系数 k，默认 3.0 */
  yawnK: number;
  /** 光线变化检测阈值，默认 0.3 */
  lightingChangeThreshold: number;
}

/**
 * 默认校准器配置
 */
export const DEFAULT_CALIBRATOR_CONFIG: PersonalizedCalibratorConfig = {
  calibrationDuration: 3000,
  minCalibrationSamples: 30,
  onlineUpdateRate: 0.01,
  outlierThreshold: 3,
  eyeClosedK: 2.0,
  yawnK: 3.0,
  lightingChangeThreshold: 0.3,
};

/**
 * 校准器状态
 */
export type CalibratorState = 'idle' | 'calibrating' | 'calibrated';

/**
 * 校准进度信息
 */
export interface CalibrationProgress {
  /** 当前状态 */
  state: CalibratorState;
  /** 已收集样本数 */
  samplesCollected: number;
  /** 目标样本数 */
  targetSamples: number;
  /** 进度百分比 [0-100] */
  progress: number;
  /** 剩余时间 (ms) */
  remainingTime: number;
}

// ==================== 融合引擎类型 ====================

/**
 * 疲劳信号来源
 */
export type FatigueSignalSource = 'visual' | 'behavior' | 'temporal' | 'context' | 'vlm';

/**
 * 疲劳信号
 */
export interface FatigueSignal {
  /** 信号来源 */
  source: FatigueSignalSource;
  /** 疲劳评分 [0, 1] */
  score: number;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 融合配置
 */
export interface FusionConfig {
  /** 信号权重 */
  weights: {
    visual: number;
    behavior: number;
    temporal: number;
  };
  /** 最低置信度阈值，默认 0.2 */
  minConfidence: number;
  /** 冲突检测阈值，默认 0.4 */
  conflictThreshold: number;
  /** 平滑因子，默认 0.3 */
  smoothingFactor: number;
  /** 是否使用卡尔曼滤波，默认 true */
  useKalmanFilter: boolean;
  /** 数据年龄衰减系数 (每秒)，默认 0.01 */
  ageDecayRate: number;
  /** 最大数据年龄 (ms)，默认 30000 */
  maxDataAge: number;
}

/**
 * 默认融合配置
 */
export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  weights: {
    visual: 0.4,
    behavior: 0.4,
    temporal: 0.2,
  },
  minConfidence: 0.2,
  conflictThreshold: 0.4,
  smoothingFactor: 0.3,
  useKalmanFilter: true,
  ageDecayRate: 0.01,
  maxDataAge: 30000,
};

/**
 * 信号冲突类型
 */
export type ConflictType = 'visual_higher' | 'behavior_higher';

/**
 * 信号冲突信息
 */
export interface ConflictInfo {
  /** 冲突类型 */
  type: ConflictType;
  /** 冲突程度 (差值) */
  magnitude: number;
  /** 可能原因 */
  possibleCauses: string[];
  /** 建议采信的信号 */
  trustedSignal: FatigueSignalSource;
  /** 冲突解决策略 */
  resolution: 'trust_behavior' | 'trust_visual' | 'average' | 'vlm_arbitration';
}

/**
 * 卡尔曼滤波估计结果
 */
export interface KalmanEstimate {
  /** 疲劳度估计值 */
  fatigue: number;
  /** 疲劳变化率 */
  velocity: number;
}

/**
 * 扩展的融合疲劳结果
 */
export interface FusedFatigueResult extends BaseFusedFatigueResult {
  /** 时间疲劳评分 [0-1] */
  temporalFatigue: number;
  /** 时间权重 */
  temporalWeight: number;
  /** 主导信号源 */
  dominantSource: FatigueSignalSource;
  /** 融合置信度 */
  fusedConfidence: number;
  /** 信号冲突信息 */
  conflict?: ConflictInfo;
  /** 卡尔曼滤波估计 */
  kalmanEstimate?: KalmanEstimate;
  /** 各信号明细 */
  breakdown: {
    visual: number;
    behavior: number;
    temporal: number;
  };
}

// ==================== 预测器类型 ====================

/**
 * 疲劳快照（用于LSTM输入）
 */
export interface FatigueSnapshot {
  /** 时间戳 */
  timestamp: number;
  /** 视觉疲劳 */
  visualFatigue: number;
  /** 行为疲劳 */
  behaviorFatigue: number;
  /** 融合疲劳 */
  fusedFatigue: number;
  /** 眨眼频率 */
  blinkRate: number;
  /** PERCLOS */
  perclos: number;
  /** 小时 (0-23) */
  hourOfDay: number;
  /** 会话时长 (分钟) */
  sessionDuration: number;
}

/**
 * 疲劳趋势
 */
export type FatigueTrend = 'rising' | 'stable' | 'falling';

/**
 * 疲劳预测结果
 */
export interface FatiguePrediction {
  /** 5分钟后疲劳度 */
  fatigue5min: number;
  /** 10分钟后疲劳度 */
  fatigue10min: number;
  /** 15分钟后疲劳度 */
  fatigue15min: number;
  /** 疲劳趋势 */
  trend: FatigueTrend;
  /** 趋势置信度 */
  trendConfidence: number;
  /** 建议休息倒计时 (分钟)，-1 表示暂不需要 */
  recommendedBreakIn: number;
  /** 最佳休息时长 (分钟) */
  optimalBreakDuration: number;
  /** 预测置信度 */
  confidence: number;
  /** 模型版本 */
  modelVersion: string;
  /** 预测时间戳 */
  predictionTime: number;
}

/**
 * 预测器配置
 */
export interface PredictorConfig {
  /** 输入序列长度，默认 30 */
  sequenceLength: number;
  /** 预测时间点 (分钟)，默认 [5, 10, 15] */
  predictionHorizons: number[];
  /** 模型文件路径 */
  modelPath: string;
  /** 预测更新间隔 (ms)，默认 10000 */
  updateInterval: number;
  /** 疲劳警戒阈值，默认 0.7 */
  fatigueThreshold: number;
  /** 是否启用 (按需加载)，默认 false */
  enabled: boolean;
}

/**
 * 默认预测器配置
 */
export const DEFAULT_PREDICTOR_CONFIG: PredictorConfig = {
  sequenceLength: 30,
  predictionHorizons: [5, 10, 15],
  modelPath: '/models/fatigue-predictor.json',
  updateInterval: 10000,
  fatigueThreshold: 0.7,
  enabled: false,
};

// ==================== 决策建议类型 ====================

/**
 * 建议动作
 */
export type RecommendedAction = 'continue' | 'ease_up' | 'suggest_break' | 'force_break';

/**
 * 策略调整参数
 */
export interface StrategyAdjustment {
  /** 复习间隔系数 */
  intervalScale?: number;
  /** 新词比例 */
  newRatio?: number;
  /** 难度等级 */
  difficulty?: 'easy' | 'normal' | 'hard';
  /** 批量大小 */
  batchSize?: number;
  /** 提示等级 */
  hintLevel?: number;
  /** 播放语速 */
  playbackSpeed?: number;
  /** UI主题 */
  uiTheme?: 'normal' | 'soothing';
  /** 模式 */
  mode?: 'normal' | 'immersive_light';
}

/**
 * 疲劳响应建议
 */
export interface FatigueRecommendation {
  /** 建议动作 */
  action: RecommendedAction;
  /** 策略调整 */
  strategyAdjustment: StrategyAdjustment;
  /** 解释说明 */
  explanation: string;
  /** 建议置信度 */
  confidence: number;
  /** 紧急程度 */
  urgency: 'low' | 'medium' | 'high';
  /** 休息建议 */
  breakSuggestion?: {
    reason: string;
    duration: number;
    countdown: number;
  };
}

// ==================== 系统状态类型 ====================

/**
 * 智能疲劳系统整体状态
 */
export interface IntelligentFatigueState {
  /** 原始信号 */
  raw: {
    visual: VisualFatigueMetrics | null;
    behavior: {
      score: number;
      confidence: number;
    } | null;
    temporal: {
      score: number;
      confidence: number;
    } | null;
  };
  /** 个性化处理后的阈值 */
  personalized: {
    eyeClosedThreshold: number;
    yawnThreshold: number;
    blinkRateNormalRange: {
      min: number;
      max: number;
    };
    isCalibrated: boolean;
    calibrationProgress: CalibrationProgress;
  };
  /** 融合结果 */
  fused: FusedFatigueResult | null;
  /** 预测结果 */
  prediction: FatiguePrediction | null;
  /** 决策建议 */
  recommendation: FatigueRecommendation;
  /** 元数据 */
  lastUpdate: number;
  sessionStartTime: number;
  totalUpdates: number;
}

/**
 * 用户疲劳档案
 */
export interface UserFatigueProfile {
  /** 用户ID */
  userId: string;
  /** 个人基线 */
  baseline: PersonalBaseline;
  /** 人口学特征 */
  demographics?: UserDemographics;
  /** 历史统计 */
  history: {
    /** 平均疲劳度 */
    avgFatigue: number;
    /** 疲劳高峰时段 (小时) */
    peakHours: number[];
    /** 平均恢复速率 */
    avgRecoveryRate: number;
    /** 总学习会话数 */
    totalSessions: number;
    /** 因疲劳中断的会话数 */
    fatigueInterruptedSessions: number;
  };
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

// ==================== VLM 相关类型 ====================

/**
 * VLM分析请求
 */
export interface VLMAnalysisRequest {
  /** Base64编码的图片 */
  image: string;
  /** 上下文信息 */
  context: {
    visualFatigue: number;
    behaviorFatigue: number;
    sessionDuration: number;
    timeOfDay: string;
    isConflictArbitration: boolean;
  };
}

/**
 * VLM分析响应
 */
export interface VLMAnalysisResponse {
  /** 疲劳评分 [0, 1] */
  fatigueScore: number;
  /** 置信度 [0, 1] */
  confidence: number;
  /** 观察到的疲劳信号 */
  observations: string[];
  /** 自然语言解释 */
  explanation: string;
  /** 建议 */
  suggestion: string;
  /** 仲裁结果（仅冲突模式） */
  arbitration?: {
    trustedSignal: 'visual' | 'behavior' | 'both';
    reasoning: string;
  };
  /** 提供商 */
  provider: string;
  /** 模型 */
  model: string;
  /** 延迟 (ms) */
  latencyMs: number;
}

/**
 * VLM提供商类型
 */
export type VLMProvider = 'gpt4v' | 'claude' | 'gemini';

/**
 * VLM疲劳顾问配置
 */
export interface VLMFatigueAdvisorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 模式 */
  mode: 'periodic' | 'conflict_only';
  /** 定期检测间隔 (ms)，默认 180000 (3分钟) */
  periodicInterval: number;
  /** 冲突触发阈值，默认 0.4 */
  conflictThreshold: number;
  /** 最低置信度要求，默认 0.6 */
  minConfidence: number;
  /** VLM提供商 */
  provider: VLMProvider;
  /** 最大重试次数，默认 2 */
  maxRetries: number;
  /** 超时时间 (ms)，默认 15000 */
  timeout: number;
}

/**
 * 默认VLM配置
 */
export const DEFAULT_VLM_CONFIG: VLMFatigueAdvisorConfig = {
  enabled: false,
  mode: 'conflict_only',
  periodicInterval: 180000,
  conflictThreshold: 0.4,
  minConfidence: 0.6,
  provider: 'claude',
  maxRetries: 2,
  timeout: 15000,
};

// ==================== 设备能力类型 ====================

/**
 * 设备性能等级
 */
export type DeviceTier = 'high' | 'medium' | 'low' | 'unsupported';

/**
 * 设备能力评估结果
 */
export interface DeviceCapabilities {
  /** 设备等级 */
  tier: DeviceTier;
  /** 支持的功能 */
  features: {
    /** 视觉检测 */
    visualDetection: boolean;
    /** LSTM预测 */
    lstmPrediction: boolean;
    /** 卡尔曼滤波 */
    kalmanFilter: boolean;
    /** 实时融合 */
    realtimeFusion: boolean;
  };
  /** 建议的检测帧率 */
  recommendedFps: number;
  /** 建议说明 */
  recommendations: string[];
}

// ==================== 训练数据类型 ====================

/**
 * 训练数据标签
 */
export interface TrainingLabel {
  /** 预测的疲劳度 */
  predictedFatigue: number;
  /** 实际的疲劳度（后验证） */
  actualFatigue: number;
  /** 标签置信度 */
  confidence: number;
  /** 时间戳 */
  timestamp: number;
  /** 标签来源 */
  source: 'behavior_validation' | 'user_feedback' | 'implicit_signal' | 'expert_label';
}

/**
 * 训练样本
 */
export interface TrainingSample {
  /** 输入序列 */
  sequence: FatigueSnapshot[];
  /** 标签 */
  label: TrainingLabel;
  /** 预测值 */
  prediction: number;
  /** 会话时长 (秒) */
  sessionDuration: number;
  /** 行为样本数 */
  behaviorSamples: number;
  /** 时间戳 */
  timestamp: number;
  /** 样本权重 */
  weight: number;
}
