/**
 * Model Versioning Types
 * 模型版本管理类型定义
 */

/**
 * 模型版本元数据
 */
export interface ModelVersion {
  /** 版本ID */
  id: string;
  /** 版本号 (语义化版本) */
  version: string;
  /** 模型类型 */
  modelType: 'linucb' | 'xgboost' | 'neural';
  /** 创建时间 */
  createdAt: Date;
  /** 模型参数快照 */
  parameters: Record<string, any>;
  /** 性能指标 */
  metrics: ModelMetrics;
  /** 版本标签 */
  tags: string[];
  /** 版本描述 */
  description?: string;
  /** 父版本ID */
  parentId?: string;
  /** 版本状态 */
  status: 'draft' | 'active' | 'deprecated' | 'archived';
}

/**
 * 模型性能指标
 */
export interface ModelMetrics {
  /** 样本数量 */
  sampleCount: number;
  /** 平均奖励 */
  averageReward: number;
  /** 准确率 */
  accuracy?: number;
  /** 累积遗憾 */
  cumulativeRegret?: number;
  /** CTR (点击率) */
  ctr?: number;
  /** 其他自定义指标 */
  custom?: Record<string, number>;
}

/**
 * 版本比较结果
 */
export interface VersionComparison {
  /** 基准版本 */
  baseline: ModelVersion;
  /** 对比版本 */
  candidate: ModelVersion;
  /** 指标差异 */
  metricsDiff: {
    averageReward: number;
    accuracy?: number;
    ctr?: number;
    [key: string]: number | undefined;
  };
  /** 改进百分比 */
  improvement: {
    averageReward: number;
    accuracy?: number;
    ctr?: number;
    [key: string]: number | undefined;
  };
  /** 是否显著改进 */
  isSignificant: boolean;
  /** 推荐操作 */
  recommendation: 'rollout' | 'rollback' | 'continue_testing';
}

/**
 * 版本回滚选项
 */
export interface RollbackOptions {
  /** 目标版本ID */
  targetVersionId: string;
  /** 回滚原因 */
  reason: string;
  /** 是否立即生效 */
  immediate?: boolean;
  /** 通知渠道 */
  notifyChannels?: string[];
}

/**
 * 灰度发布配置
 */
export interface CanaryConfig {
  /** 新版本ID */
  versionId: string;
  /** 流量比例 (0-1) */
  trafficPercentage: number;
  /** 持续时间(秒) */
  durationSeconds: number;
  /** 成功条件 */
  successCriteria: {
    /** 最小样本数 */
    minSamples: number;
    /** 最小改进率 */
    minImprovement: number;
    /** 最大错误率 */
    maxErrorRate: number;
  };
  /** 自动回滚 */
  autoRollback: boolean;
}

/**
 * 灰度发布状态
 */
export interface CanaryStatus {
  /** 配置 */
  config: CanaryConfig;
  /** 开始时间 */
  startedAt: Date;
  /** 当前状态 */
  status: 'running' | 'success' | 'failed' | 'rolled_back';
  /** 当前流量比例 */
  currentTraffic: number;
  /** 已收集样本 */
  samplesCollected: number;
  /** 新版本指标 */
  canaryMetrics: ModelMetrics;
  /** 基准版本指标 */
  baselineMetrics: ModelMetrics;
  /** 失败原因 */
  failureReason?: string;
}
