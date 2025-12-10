/**
 * Blendshape 分析器
 *
 * 分析 MediaPipe Face Mesh 返回的 52 个 Blendshapes
 * 提取与疲劳相关的表情特征
 *
 * 疲劳相关 Blendshapes：
 * - eyeBlinkLeft/Right: 眨眼
 * - eyeSquintLeft/Right: 眯眼
 * - eyeLookDownLeft/Right: 眼睛下垂
 * - browDownLeft/Right: 眉毛下压
 * - browInnerUp: 眉毛内侧上扬（困惑/疲劳）
 * - jawOpen: 张嘴（打哈欠）
 * - mouthStretchLeft/Right: 嘴巴拉伸
 */

import type { BlendshapeAnalysis } from '@danci/shared';

/**
 * Blendshape 数据（MediaPipe 返回格式）
 */
export interface BlendshapeData {
  categoryName: string;
  score: number;
}

/**
 * Blendshape 分析配置
 */
export interface BlendshapeAnalyzerConfig {
  /** 平滑因子，默认 0.3 */
  smoothingFactor: number;
  /** 眨眼阈值，默认 0.5 */
  blinkThreshold: number;
  /** 眯眼阈值，默认 0.3 */
  squintThreshold: number;
  /** 张嘴阈值，默认 0.5 */
  jawOpenThreshold: number;
  /** 历史窗口大小，默认 30 */
  historySize: number;
}

/**
 * 默认 Blendshape 分析配置
 */
export const DEFAULT_BLENDSHAPE_CONFIG: BlendshapeAnalyzerConfig = {
  smoothingFactor: 0.3,
  blinkThreshold: 0.5,
  squintThreshold: 0.3,
  jawOpenThreshold: 0.5,
  historySize: 30,
};

/**
 * 表情特征结果
 */
export interface ExpressionFeatures {
  /** 眨眼强度 [0-1] */
  blinkIntensity: number;
  /** 眯眼强度 [0-1] */
  squintIntensity: number;
  /** 眉毛下压强度 [0-1] */
  browDownIntensity: number;
  /** 嘴巴张开强度 [0-1] */
  jawOpenIntensity: number;
  /** 困惑/疲劳表情强度 [0-1] */
  fatigueExpressionIntensity: number;
}

/**
 * 疲劳相关 Blendshape 名称
 */
const FATIGUE_BLENDSHAPE_NAMES = {
  // 眨眼
  eyeBlinkLeft: 'eyeBlinkLeft',
  eyeBlinkRight: 'eyeBlinkRight',
  // 眯眼
  eyeSquintLeft: 'eyeSquintLeft',
  eyeSquintRight: 'eyeSquintRight',
  // 眼睛下看
  eyeLookDownLeft: 'eyeLookDownLeft',
  eyeLookDownRight: 'eyeLookDownRight',
  // 眉毛
  browDownLeft: 'browDownLeft',
  browDownRight: 'browDownRight',
  browInnerUp: 'browInnerUp',
  // 嘴巴
  jawOpen: 'jawOpen',
  mouthStretchLeft: 'mouthStretchLeft',
  mouthStretchRight: 'mouthStretchRight',
} as const;

/**
 * Blendshape 分析器类
 */
export class BlendshapeAnalyzer {
  private config: BlendshapeAnalyzerConfig;
  private lastFeatures: ExpressionFeatures = {
    blinkIntensity: 0,
    squintIntensity: 0,
    browDownIntensity: 0,
    jawOpenIntensity: 0,
    fatigueExpressionIntensity: 0,
  };
  private featureHistory: ExpressionFeatures[] = [];

  constructor(config: Partial<BlendshapeAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_BLENDSHAPE_CONFIG, ...config };
  }

  /**
   * 分析 Blendshapes 数据
   * @param blendshapes MediaPipe 返回的 Blendshape 数组
   */
  analyze(blendshapes: BlendshapeData[]): BlendshapeAnalysis {
    try {
      // 将数组转换为 Map 便于查找
      const blendshapeMap = new Map<string, number>();
      for (const bs of blendshapes) {
        blendshapeMap.set(bs.categoryName, bs.score);
      }

      // 提取各类特征
      const features = this.extractFeatures(blendshapeMap);

      // 应用平滑
      const smoothedFeatures = this.smoothFeatures(features);

      // 更新历史
      this.addToHistory(smoothedFeatures);

      // 计算综合疲劳表情分数
      const fatigueScore = this.calculateFatigueScore(smoothedFeatures);

      // 提取关键 Blendshapes 值
      const keyBlendshapes = this.extractKeyBlendshapes(blendshapeMap);

      return {
        eyeBlink: smoothedFeatures.blinkIntensity * 2 - 1, // 转换到 [-1, 1]
        eyeSquint: smoothedFeatures.squintIntensity,
        browDown: smoothedFeatures.browDownIntensity,
        jawOpen: smoothedFeatures.jawOpenIntensity,
        fatigueScore,
        confidence: this.calculateConfidence(blendshapes),
        rawBlendshapes: keyBlendshapes,
      };
    } catch {
      return this.createInvalidResult();
    }
  }

  /**
   * 提取表情特征
   */
  private extractFeatures(blendshapeMap: Map<string, number>): ExpressionFeatures {
    // 眨眼强度（左右眼平均）
    const blinkLeft = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.eyeBlinkLeft) ?? 0;
    const blinkRight = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.eyeBlinkRight) ?? 0;
    const blinkIntensity = (blinkLeft + blinkRight) / 2;

    // 眯眼强度
    const squintLeft = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.eyeSquintLeft) ?? 0;
    const squintRight = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.eyeSquintRight) ?? 0;
    const squintIntensity = (squintLeft + squintRight) / 2;

    // 眉毛下压强度
    const browDownLeft = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.browDownLeft) ?? 0;
    const browDownRight = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.browDownRight) ?? 0;
    const browInnerUp = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.browInnerUp) ?? 0;
    const browDownIntensity = (browDownLeft + browDownRight) / 2 + browInnerUp * 0.5;

    // 嘴巴张开强度
    const jawOpen = blendshapeMap.get(FATIGUE_BLENDSHAPE_NAMES.jawOpen) ?? 0;
    const jawOpenIntensity = jawOpen;

    // 综合疲劳表情强度
    const fatigueExpressionIntensity = this.calculateFatigueExpressionIntensity(
      blinkIntensity,
      squintIntensity,
      browDownIntensity,
      jawOpenIntensity,
    );

    return {
      blinkIntensity,
      squintIntensity,
      browDownIntensity,
      jawOpenIntensity,
      fatigueExpressionIntensity,
    };
  }

  /**
   * 计算疲劳表情强度
   */
  private calculateFatigueExpressionIntensity(
    blink: number,
    squint: number,
    browDown: number,
    jawOpen: number,
  ): number {
    // 加权组合
    // - 眯眼是疲劳的重要指标（权重高）
    // - 眉毛下压表示困倦
    // - 持续睁眼困难（眨眼频繁）
    // - 打哈欠（张嘴）
    const weights = {
      squint: 0.35,
      browDown: 0.25,
      blink: 0.2,
      jawOpen: 0.2,
    };

    return (
      squint * weights.squint +
      browDown * weights.browDown +
      blink * weights.blink +
      jawOpen * weights.jawOpen
    );
  }

  /**
   * 计算综合疲劳分数
   */
  private calculateFatigueScore(features: ExpressionFeatures): number {
    // 基于历史数据计算趋势
    if (this.featureHistory.length < 5) {
      return features.fatigueExpressionIntensity;
    }

    // 计算近期平均
    const recentFeatures = this.featureHistory.slice(-10);
    const avgSquint =
      recentFeatures.reduce((sum, f) => sum + f.squintIntensity, 0) / recentFeatures.length;
    const avgBrowDown =
      recentFeatures.reduce((sum, f) => sum + f.browDownIntensity, 0) / recentFeatures.length;

    // 眯眼和眉毛下压的持续性是疲劳的重要指标
    const persistentSquint =
      avgSquint > this.config.squintThreshold ? 1 : avgSquint / this.config.squintThreshold;
    const persistentBrowDown = avgBrowDown > 0.3 ? 1 : avgBrowDown / 0.3;

    // 综合当前和历史
    return (
      features.fatigueExpressionIntensity * 0.6 +
      persistentSquint * 0.25 +
      persistentBrowDown * 0.15
    );
  }

  /**
   * 应用指数平滑
   */
  private smoothFeatures(features: ExpressionFeatures): ExpressionFeatures {
    const alpha = this.config.smoothingFactor;
    return {
      blinkIntensity:
        alpha * features.blinkIntensity + (1 - alpha) * this.lastFeatures.blinkIntensity,
      squintIntensity:
        alpha * features.squintIntensity + (1 - alpha) * this.lastFeatures.squintIntensity,
      browDownIntensity:
        alpha * features.browDownIntensity + (1 - alpha) * this.lastFeatures.browDownIntensity,
      jawOpenIntensity:
        alpha * features.jawOpenIntensity + (1 - alpha) * this.lastFeatures.jawOpenIntensity,
      fatigueExpressionIntensity:
        alpha * features.fatigueExpressionIntensity +
        (1 - alpha) * this.lastFeatures.fatigueExpressionIntensity,
    };
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(features: ExpressionFeatures): void {
    this.lastFeatures = features;
    this.featureHistory.push(features);
    if (this.featureHistory.length > this.config.historySize) {
      this.featureHistory.shift();
    }
  }

  /**
   * 提取关键 Blendshapes 值
   */
  private extractKeyBlendshapes(blendshapeMap: Map<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const name of Object.values(FATIGUE_BLENDSHAPE_NAMES)) {
      result[name] = blendshapeMap.get(name) ?? 0;
    }
    return result;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(blendshapes: BlendshapeData[]): number {
    if (!blendshapes || blendshapes.length === 0) {
      return 0;
    }

    // 检查是否有足够的疲劳相关 Blendshapes
    const fatigueNames = Object.values(FATIGUE_BLENDSHAPE_NAMES);
    const availableCount = fatigueNames.filter((name) =>
      blendshapes.some((bs) => bs.categoryName === name),
    ).length;

    return availableCount / fatigueNames.length;
  }

  /**
   * 获取当前表情特征
   */
  getCurrentFeatures(): ExpressionFeatures {
    return { ...this.lastFeatures };
  }

  /**
   * 检测是否眯眼
   */
  isSquinting(): boolean {
    return this.lastFeatures.squintIntensity > this.config.squintThreshold;
  }

  /**
   * 检测是否张嘴（可能打哈欠）
   */
  isJawOpen(): boolean {
    return this.lastFeatures.jawOpenIntensity > this.config.jawOpenThreshold;
  }

  /**
   * 重置分析器
   */
  reset(): void {
    this.lastFeatures = {
      blinkIntensity: 0,
      squintIntensity: 0,
      browDownIntensity: 0,
      jawOpenIntensity: 0,
      fatigueExpressionIntensity: 0,
    };
    this.featureHistory = [];
  }

  /**
   * 创建无效结果
   */
  private createInvalidResult(): BlendshapeAnalysis {
    return {
      eyeBlink: 0,
      eyeSquint: 0,
      browDown: 0,
      jawOpen: 0,
      fatigueScore: 0,
      confidence: 0,
      rawBlendshapes: {},
    };
  }
}

/**
 * 创建 Blendshape 分析器实例
 */
export function createBlendshapeAnalyzer(
  config?: Partial<BlendshapeAnalyzerConfig>,
): BlendshapeAnalyzer {
  return new BlendshapeAnalyzer(config);
}
