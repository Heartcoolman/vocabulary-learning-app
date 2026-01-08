/**
 * 视觉疲劳检测类型定义
 * Visual Fatigue Detection Types
 */

// ==================== 核心指标类型 ====================

/**
 * 视觉疲劳指标
 */
export interface VisualFatigueMetrics {
  /** 眼睛纵横比 (Eye Aspect Ratio) [0-0.5] */
  eyeAspectRatio: number;
  /** 每分钟眨眼次数 (正常 15-20 次/分钟) */
  blinkRate: number;
  /** 平均眨眼持续时间 (ms) */
  avgBlinkDuration: number;
  /** 眼睛闭合时间比例 PERCLOS [0-1] (>0.15 表示疲劳) */
  perclos: number;
  /** 打哈欠次数 */
  yawnCount: number;
  /** 头部姿态 */
  headPose?: HeadPose;
  /** @deprecated 使用 headPose.pitch */
  headPitch?: number;
  /** @deprecated 使用 headPose.yaw */
  headYaw?: number;
  /** 视线离开屏幕时间比例 [0-1] */
  gazeOffScreenRatio: number;
  /** 综合视觉疲劳评分 [0-1] */
  visualFatigueScore: number;
  /** 检测时间戳 */
  timestamp: number;
  /** 检测置信度 [0-1] */
  confidence: number;
  /** 原始EAR值（用于个性化校准） */
  earValue?: number;
  /** 原始MAR值（用于个性化校准） */
  marValue?: number;
  /** 表情疲劳分数 [0-1] - 来自 Blendshape 分析 */
  expressionFatigueScore?: number;
  /** 眯眼强度 [0-1] - 来自 Blendshape 分析 */
  squintIntensity?: number;
  /** Blendshape 分析结果 */
  blendshapeAnalysis?: BlendshapeAnalysis;
  /** 皱眉强度 [0-1] - 来自 Blendshape 分析 */
  browDownIntensity?: number;
  /** 嘴巴张开程度 [0-1] - 用于打哈欠检测 */
  mouthOpenRatio?: number;
  /** 头部稳定性 [0-1], 1=非常稳定 */
  headStability?: number;
}

// ==================== 配置类型 ====================

/**
 * 摄像头权限状态
 */
export type CameraPermissionStatus = 'not_requested' | 'granted' | 'denied' | 'unavailable';

/**
 * 视觉疲劳检测器配置
 */
export interface VisualFatigueConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 检测间隔 (ms)，默认 200ms (5 FPS) */
  detectionIntervalMs: number;
  /** 上报间隔 (ms)，默认 5000ms */
  reportIntervalMs: number;
  /** EAR 闭眼阈值，默认 0.2 */
  earThreshold: number;
  /** PERCLOS 疲劳阈值，默认 0.15 */
  perclosThreshold: number;
  /** 打哈欠判定时长 (ms)，默认 2000ms */
  yawnDurationMs: number;
  /** 滑动窗口大小 (秒)，默认 60 */
  windowSizeSeconds: number;
  /** 视频分辨率宽度，默认 640 */
  videoWidth: number;
  /** 视频分辨率高度，默认 480 */
  videoHeight: number;
}

/**
 * 默认视觉疲劳配置
 */
export const DEFAULT_VISUAL_FATIGUE_CONFIG: VisualFatigueConfig = {
  enabled: false,
  detectionIntervalMs: 100, // 10 FPS (WASM优化后提升)
  reportIntervalMs: 5000, // 5秒上报一次
  earThreshold: 0.25, // 与 BlinkDetector 保持一致
  perclosThreshold: 0.15,
  yawnDurationMs: 2000,
  windowSizeSeconds: 60,
  videoWidth: 640,
  videoHeight: 480,
};

// ==================== MediaPipe 关键点索引 ====================

/**
 * MediaPipe Face Mesh 眼睛关键点索引
 * 用于计算 EAR (Eye Aspect Ratio)
 */
export const EYE_LANDMARKS = {
  /** 左眼 6 个关键点 */
  LEFT: {
    /** 左眼角 (外侧) */
    P1: 33,
    /** 上眼睑左 */
    P2: 160,
    /** 上眼睑右 */
    P3: 158,
    /** 右眼角 (内侧) */
    P4: 133,
    /** 下眼睑右 */
    P5: 153,
    /** 下眼睑左 */
    P6: 144,
  },
  /** 右眼 6 个关键点 */
  RIGHT: {
    /** 左眼角 (内侧) */
    P1: 362,
    /** 上眼睑左 */
    P2: 385,
    /** 上眼睑右 */
    P3: 387,
    /** 右眼角 (外侧) */
    P4: 263,
    /** 下眼睑右 */
    P5: 373,
    /** 下眼睑左 */
    P6: 380,
  },
} as const;

/**
 * 嘴巴关键点索引 (用于打哈欠检测)
 */
export const MOUTH_LANDMARKS = {
  /** 上唇中点 */
  TOP: 13,
  /** 下唇中点 */
  BOTTOM: 14,
  /** 左嘴角 */
  LEFT: 61,
  /** 右嘴角 */
  RIGHT: 291,
} as const;

// ==================== 检测器状态类型 ====================

/**
 * 视觉疲劳检测器状态
 */
export interface VisualFatigueDetectorState {
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 是否已初始化 */
  isInitialized: boolean;
  /** 是否支持（浏览器+摄像头） */
  isSupported: boolean;
  /** 当前帧率 */
  currentFps: number;
  /** 错误信息 */
  error: string | null;
}

// ==================== 事件类型 ====================

/**
 * 眨眼事件
 */
export interface BlinkEvent {
  /** 眨眼时间戳 */
  timestamp: number;
  /** 闭眼持续时间 (ms) */
  duration: number;
}

/**
 * 打哈欠事件
 */
export interface YawnEvent {
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime: number;
  /** 持续时间 (ms) */
  duration: number;
}

// ==================== 数据传输类型 ====================

/**
 * 视觉疲劳融合输入 (发送给后端)
 */
export interface VisualFatigueInput {
  /** 视觉疲劳评分 [0-1] */
  score: number;
  /** PERCLOS 值 */
  perclos: number;
  /** 眨眼频率 (次/分钟) */
  blinkRate: number;
  /** 打哈欠次数 */
  yawnCount: number;
  /** 头部俯仰角 [-1, 1] */
  headPitch?: number;
  /** 头部偏航角 [-1, 1] */
  headYaw?: number;
  /** 检测置信度 [0-1] */
  confidence: number;
  /** 时间戳 */
  timestamp: number;
  /** 会话ID */
  sessionId?: string;
  // ==================== 扩展字段 ====================
  /** 眼睛纵横比 EAR [0-0.5] */
  eyeAspectRatio?: number;
  /** 平均眨眼持续时间 (ms) */
  avgBlinkDuration?: number;
  /** 头部翻滚角 [-1, 1] */
  headRoll?: number;
  /** 头部稳定性 [0-1], 1=非常稳定 */
  headStability?: number;
  /** 眯眼强度 [0-1] */
  squintIntensity?: number;
  /** 表情疲劳分数 [0-1] */
  expressionFatigueScore?: number;
  /** 视线离屏比例 [0-1] */
  gazeOffScreenRatio?: number;
  /** 皱眉强度 [0-1] - 来自 Blendshape */
  browDownIntensity?: number;
  /** 嘴巴张开程度 [0-1] - 用于打哈欠检测 */
  mouthOpenRatio?: number;
}

/**
 * 基础融合疲劳结果
 */
export interface BaseFusedFatigueResult {
  /** 行为疲劳评分 [0-1] */
  behaviorFatigue: number;
  /** 视觉疲劳评分 [0-1] */
  visualFatigue: number;
  /** 融合后疲劳评分 [0-1] */
  fusedFatigue: number;
  /** 行为权重 */
  behaviorWeight: number;
  /** 视觉权重 */
  visualWeight: number;
  /** 视觉数据置信度 */
  visualConfidence: number;
}

// ==================== 管理后台统计类型 ====================

/**
 * 视觉疲劳统计数据 (管理后台)
 */
export interface VisualFatigueStats {
  /** 数据量统计 */
  dataVolume: {
    /** 总记录数 */
    totalRecords: number;
    /** 今日记录数 */
    recordsToday: number;
    /** 本周记录数 */
    recordsThisWeek: number;
    /** 平均每用户记录数 */
    avgRecordsPerUser: number;
  };

  /** 使用情况 */
  usage: {
    /** 总用户数 */
    totalUsers: number;
    /** 启用视觉检测的用户数 */
    enabledUsers: number;
    /** 启用率 (%) */
    enableRate: number;
    /** 今日活跃用户数 */
    activeToday: number;
  };

  /** 疲劳情况 */
  fatigue: {
    /** 平均视觉疲劳度 */
    avgVisualFatigue: number;
    /** 平均融合疲劳度 */
    avgFusedFatigue: number;
    /** 高疲劳用户数 (>0.6) */
    highFatigueUsers: number;
    /** 疲劳度分布 */
    fatigueDistribution: {
      /** 低疲劳 (0-0.3) */
      low: number;
      /** 中疲劳 (0.3-0.6) */
      medium: number;
      /** 高疲劳 (0.6-1.0) */
      high: number;
    };
  };

  /** 时间范围 */
  period: {
    start: string;
    end: string;
  };
}

// ==================== 头部姿态类型 ====================

/**
 * 头部姿态
 */
export interface HeadPose {
  /** 俯仰角 (点头) [-1, 1] */
  pitch: number;
  /** 偏航角 (摇头) [-1, 1] */
  yaw: number;
  /** 翻滚角 (歪头) [-1, 1] */
  roll: number;
}

// ==================== Blendshapes 类型 ====================

/**
 * 疲劳相关的 Blendshapes
 */
export interface FatigueBlendshapes {
  /** 左眼眨眼 [0-1] */
  eyeBlinkLeft: number;
  /** 右眼眨眼 [0-1] */
  eyeBlinkRight: number;
  /** 左眼眯眼 [0-1] */
  eyeSquintLeft: number;
  /** 右眼眯眼 [0-1] */
  eyeSquintRight: number;
  /** 张嘴程度 [0-1] */
  jawOpen: number;
  /** 左眉下压 [0-1] */
  browDownLeft: number;
  /** 右眉下压 [0-1] */
  browDownRight: number;
  /** 眉毛内侧上扬 [0-1] */
  browInnerUp: number;
}

/**
 * 疲劳相关 Blendshape 名称常量
 */
export const FATIGUE_BLENDSHAPES = [
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'jawOpen',
  'mouthStretchLeft',
  'mouthStretchRight',
] as const;

/**
 * Blendshape 分类
 */
export type BlendshapeCategory = (typeof FATIGUE_BLENDSHAPES)[number];

/**
 * Blendshape 分析结果
 */
export interface BlendshapeAnalysis {
  /** 眨眼强度 [-1, 1] */
  eyeBlink: number;
  /** 眯眼强度 [0-1] */
  eyeSquint: number;
  /** 眉毛下压强度 [0-1] */
  browDown: number;
  /** 张嘴强度 [0-1] */
  jawOpen: number;
  /** 疲劳表情分数 [0-1] */
  fatigueScore: number;
  /** 置信度 [0-1] */
  confidence: number;
  /** 原始 Blendshapes 值 */
  rawBlendshapes: Record<string, number>;
}

// ==================== AMAS 集成类型 ====================

/**
 * 动态权重配置
 * 用于视觉/行为/时间疲劳的动态权重分配
 */
export interface DynamicWeights {
  /** 视觉疲劳权重 [0-1] */
  visual: number;
  /** 行为疲劳权重 [0-1] */
  behavior: number;
  /** 时间疲劳权重 [0-1] */
  temporal: number;
  /** 权重计算时间戳 */
  calculatedAt: number;
}

/**
 * 视觉认知信号
 * 用于融合到 AMAS 的 A/F/M/C 状态
 */
export interface VisualCognitiveSignals {
  /** 注意力相关信号 */
  attentionSignals: {
    /** 头部姿态稳定性 [0-1], 1=非常稳定 */
    headPoseStability: number;
    /** 眯眼强度 [0-1] */
    eyeSquint: number;
    /** 视线离屏比例 [0-1] */
    gazeOffScreen: number;
  };
  /** 疲劳相关信号 */
  fatigueSignals: {
    /** PERCLOS 值 [0-1] */
    perclos: number;
    /** 眨眼疲劳评分 [0-1] */
    blinkFatigue: number;
    /** 打哈欠评分 [0-1] */
    yawnScore: number;
  };
  /** 动机相关信号 */
  motivationSignals: {
    /** 皱眉强度 [0-1] */
    browDown: number;
    /** 嘴角下垂程度 [0-1] */
    mouthCornerDown: number;
  };
  /** 信号置信度 [0-1] */
  confidence: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 个性化阈值配置
 * 用于贝叶斯阈值学习
 */
export interface PersonalizedThresholds {
  /** PERCLOS 阈值 (默认 0.15) */
  perclos: { mean: number; std: number };
  /** 眨眼频率阈值 (次/分钟, 默认 25) */
  blinkRate: { mean: number; std: number };
  /** 疲劳评分阈值 (默认 0.6) */
  fatigueScore: { mean: number; std: number };
  /** 更新时间戳 */
  updatedAt: number;
  /** 学习样本数 */
  sampleCount: number;
}

/**
 * 默认个性化阈值
 */
export const DEFAULT_PERSONALIZED_THRESHOLDS: PersonalizedThresholds = {
  perclos: { mean: 0.15, std: 0.05 },
  blinkRate: { mean: 25, std: 5 },
  fatigueScore: { mean: 0.6, std: 0.1 },
  updatedAt: 0,
  sampleCount: 0,
};

/**
 * 视觉疲劳处理后的数据
 * 用于在 AMAS 主流程中传递
 */
export interface ProcessedVisualFatigueData {
  /** 视觉疲劳评分 [0-1] */
  score: number;
  /** 置信度 [0-1] */
  confidence: number;
  /** 数据新鲜度 [0-1], 随时间衰减 */
  freshness: number;
  /** 是否有效 */
  isValid: boolean;
  /** 认知信号 (用于状态融合) */
  cognitiveSignals?: VisualCognitiveSignals;
  /** 疲劳趋势 [-1, 1], 正值表示上升 */
  trend: number;
  /** 原始指标 */
  metrics?: VisualFatigueMetrics;
  /** 时间戳 */
  timestamp: number;
}
