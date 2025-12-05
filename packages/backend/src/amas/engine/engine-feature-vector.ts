/**
 * AMAS Engine - 特征向量构建与序列化模块
 *
 * 负责特征向量的：
 * - 构建：将上下文向量转换为可持久化格式
 * - 序列化：将特征向量转换为字符串存储
 * - 反序列化：从字符串恢复特征向量
 * - 版本兼容：处理特征维度升级时的兼容性
 */

import { PersistableFeatureVector } from '../types';
import { DEFAULT_DIMENSION, FEATURE_VERSION } from '../config/action-space';
import { Logger } from './engine-types';

/**
 * 特征向量接口
 */
export interface FeatureVector {
  dimensions: number[];
  labels: string[];
}

/**
 * 特征上下文接口
 */
export interface FeatureContext {
  userId: string;
  wordId: string;
  wordDifficulty: number;
  userMasteryLevel: number;
  timeOfDay: number;
  dayOfWeek: number;
  sessionLength: number;
  recentAccuracy: number;
  stateA?: number;        // 注意力
  stateF?: number;        // 疲劳度
  stateM?: number;        // 动机
  cognitiveMem?: number;  // 认知-记忆
  cognitiveSpeed?: number; // 认知-速度
}

/**
 * 特征向量构建器接口
 */
export interface FeatureVectorBuilder {
  /**
   * 构建特征向量
   */
  buildFeatureVector(context: FeatureContext): FeatureVector;

  /**
   * 构建可持久化的特征向量
   */
  buildPersistableFeatureVector(
    contextVec: Float32Array | undefined,
    ts: number
  ): PersistableFeatureVector | undefined;

  /**
   * 序列化特征向量
   */
  serializeFeatureVector(vector: FeatureVector): string;

  /**
   * 反序列化特征向量
   */
  deserializeFeatureVector(serialized: string): FeatureVector;

  /**
   * 对齐特征向量维度（版本兼容处理）
   */
  alignFeatureVectorDimension(
    featureVector: number[],
    targetDimension: number
  ): number[];
}

/**
 * 特征标签定义
 *
 * 注意：修改此数组时需要同步更新 FEATURE_VERSION
 */
export const FEATURE_LABELS = [
  'state.A',           // 注意力状态
  'state.F',           // 疲劳度状态
  'state.C.mem',       // 认知-记忆维度
  'state.C.speed',     // 认知-速度维度
  'state.M',           // 动机状态
  'recentErrorRate',   // 近期错误率
  'interval_scale',    // 间隔缩放因子
  'new_ratio',         // 新词比例
  'difficulty',        // 难度等级
  'hint_level',        // 提示等级
  'batch_norm',        // 批次归一化
  'rt_norm',           // 响应时间归一化
  'time_norm',         // 时间归一化
  'time_sin',          // 时间正弦编码
  'time_cos',          // 时间余弦编码
  'attn_fatigue',      // 注意力-疲劳交互项
  'motivation_fatigue', // 动机-疲劳交互项
  'pace_match',        // 节奏匹配度
  'memory_new_ratio',  // 记忆-新词比例交互项
  'fatigue_latency',   // 疲劳-响应时间交互项
  'new_ratio_motivation', // 新词比例-动机交互项
  'bias'               // 偏置项
] as const;

/**
 * 特征标签类型
 */
export type FeatureLabel = typeof FEATURE_LABELS[number];

/**
 * 默认特征向量构建器实现
 */
export class DefaultFeatureVectorBuilder implements FeatureVectorBuilder {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * 构建特征向量
   */
  buildFeatureVector(context: FeatureContext): FeatureVector {
    // 基础特征
    const dimensions: number[] = [
      context.stateA ?? 0.5,           // state.A
      context.stateF ?? 0,             // state.F
      context.cognitiveMem ?? 0.5,     // state.C.mem
      context.cognitiveSpeed ?? 0.5,   // state.C.speed
      context.stateM ?? 0.5,           // state.M
      1 - context.recentAccuracy,      // recentErrorRate
      1.0,                             // interval_scale (默认)
      0.3,                             // new_ratio (默认)
      context.wordDifficulty,          // difficulty
      0,                               // hint_level
      0.5,                             // batch_norm
      0.5,                             // rt_norm
      context.timeOfDay / 24,          // time_norm
      Math.sin(2 * Math.PI * context.timeOfDay / 24), // time_sin
      Math.cos(2 * Math.PI * context.timeOfDay / 24), // time_cos
      (context.stateA ?? 0.5) * (context.stateF ?? 0), // attn_fatigue
      (context.stateM ?? 0.5) * (context.stateF ?? 0), // motivation_fatigue
      0.5,                             // pace_match
      (context.cognitiveMem ?? 0.5) * 0.3, // memory_new_ratio
      (context.stateF ?? 0) * 0.5,     // fatigue_latency
      0.3 * (context.stateM ?? 0.5),   // new_ratio_motivation
      1.0                              // bias
    ];

    return {
      dimensions,
      labels: [...FEATURE_LABELS]
    };
  }

  /**
   * 构建可持久化的特征向量
   */
  buildPersistableFeatureVector(
    contextVec: Float32Array | undefined,
    ts: number
  ): PersistableFeatureVector | undefined {
    if (!contextVec || contextVec.length === 0) {
      return undefined;
    }

    const dimensionMismatch = contextVec.length !== DEFAULT_DIMENSION;
    const labelsMismatch = FEATURE_LABELS.length !== DEFAULT_DIMENSION;

    if (dimensionMismatch || labelsMismatch) {
      this.logger?.error('Feature vector dimension mismatch', {
        expected: DEFAULT_DIMENSION,
        actual: contextVec.length
      });
      return undefined;
    }

    return {
      values: Array.from(contextVec),
      version: FEATURE_VERSION,
      normMethod: 'ucb-context',
      ts,
      labels: [...FEATURE_LABELS]
    };
  }

  /**
   * 序列化特征向量
   */
  serializeFeatureVector(vector: FeatureVector): string {
    return JSON.stringify({
      d: vector.dimensions,
      l: vector.labels,
      v: FEATURE_VERSION
    });
  }

  /**
   * 反序列化特征向量
   */
  deserializeFeatureVector(serialized: string): FeatureVector {
    try {
      const parsed = JSON.parse(serialized);

      // 支持两种格式：紧凑格式和完整格式
      if (Array.isArray(parsed)) {
        // 紧凑格式：只有dimensions数组
        return {
          dimensions: parsed,
          labels: [...FEATURE_LABELS]
        };
      }

      // 完整格式
      return {
        dimensions: parsed.d || parsed.dimensions || [],
        labels: parsed.l || parsed.labels || [...FEATURE_LABELS]
      };
    } catch (error) {
      this.logger?.error('Failed to deserialize feature vector', { error, serialized });
      return {
        dimensions: [],
        labels: [...FEATURE_LABELS]
      };
    }
  }

  /**
   * 对齐特征向量维度
   *
   * 处理特征版本升级时的兼容性：
   * - 当特征向量维度小于目标维度时，进行零填充扩展
   * - 当特征向量维度大于目标维度时，截断到目标维度
   */
  alignFeatureVectorDimension(
    featureVector: number[],
    targetDimension: number
  ): number[] {
    if (featureVector.length === targetDimension) {
      return featureVector;
    }

    if (featureVector.length < targetDimension) {
      // 特征向量较短（旧版本），零填充扩展到目标维度
      const aligned = [...featureVector];
      while (aligned.length < targetDimension) {
        aligned.push(0);
      }
      return aligned;
    }

    // 特征向量较长（模型较旧），截断到目标维度
    return featureVector.slice(0, targetDimension);
  }
}

/**
 * 创建默认特征向量构建器
 */
export function createFeatureVectorBuilder(logger?: Logger): FeatureVectorBuilder {
  return new DefaultFeatureVectorBuilder(logger);
}
