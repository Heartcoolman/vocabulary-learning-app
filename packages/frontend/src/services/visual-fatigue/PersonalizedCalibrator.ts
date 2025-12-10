/**
 * 个性化校准器
 *
 * 实现快速校准流程：
 * - 3秒快速校准
 * - 冷启动基线选择（default/glasses/senior）
 * - 在线基线更新（EMA）
 */

import {
  POPULATION_BASELINES,
  type PersonalBaseline,
  type ColdStartBaselineType,
} from '@danci/shared';

/**
 * 校准状态
 */
export type CalibrationState = 'idle' | 'calibrating' | 'completed' | 'failed';

/**
 * 校准配置
 */
export interface CalibrationConfig {
  /** 校准持续时间（毫秒），默认 3000 */
  duration: number;
  /** 最小样本数，默认 10 */
  minSamples: number;
  /** EMA 更新因子，默认 0.1 */
  emaFactor: number;
  /** 有效 EAR 范围 */
  earRange: { min: number; max: number };
  /** 有效 MAR 范围 */
  marRange: { min: number; max: number };
  /** 存储键名 */
  storageKey: string;
}

/**
 * 默认校准配置
 */
export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  duration: 3000,
  minSamples: 10,
  emaFactor: 0.1,
  earRange: { min: 0.15, max: 0.45 },
  marRange: { min: 0.02, max: 0.15 },
  storageKey: 'visual_fatigue_baseline',
};

/**
 * 校准样本
 */
interface CalibrationSample {
  ear: number;
  mar: number;
  blinkRate: number;
  timestamp: number;
}

/**
 * 校准结果
 */
export interface CalibrationResult {
  /** 是否成功 */
  success: boolean;
  /** 基线数据 */
  baseline: PersonalBaseline | null;
  /** 收集的样本数 */
  sampleCount: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 校准进度回调
 */
export type CalibrationProgressCallback = (progress: number, state: CalibrationState) => void;

/**
 * 个性化校准器类
 */
export class PersonalizedCalibrator {
  private config: CalibrationConfig;
  private state: CalibrationState = 'idle';
  private samples: CalibrationSample[] = [];
  private baseline: PersonalBaseline | null = null;
  private startTime: number = 0;
  private progressCallback: CalibrationProgressCallback | null = null;
  private calibrationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<CalibrationConfig> = {}) {
    this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
    // 尝试从本地存储加载
    this.loadBaseline();
  }

  /**
   * 获取当前状态
   */
  getState(): CalibrationState {
    return this.state;
  }

  /**
   * 获取当前基线
   */
  getBaseline(): PersonalBaseline | null {
    return this.baseline;
  }

  /**
   * 是否已校准
   */
  isCalibrated(): boolean {
    return this.baseline !== null && this.baseline.isCalibrated;
  }

  /**
   * 开始校准
   * @param progressCallback 进度回调
   */
  startCalibration(progressCallback?: CalibrationProgressCallback): void {
    if (this.state === 'calibrating') {
      return;
    }

    this.state = 'calibrating';
    this.samples = [];
    this.startTime = Date.now();
    this.progressCallback = progressCallback ?? null;

    // 通知开始
    this.progressCallback?.(0, 'calibrating');

    // 设置超时
    this.calibrationTimer = setTimeout(() => {
      this.finishCalibration();
    }, this.config.duration);
  }

  /**
   * 添加校准样本
   * @param ear 当前 EAR 值
   * @param mar 当前 MAR 值
   * @param blinkRate 当前眨眼率
   */
  addSample(ear: number, mar: number, blinkRate: number = 15): void {
    if (this.state !== 'calibrating') {
      return;
    }

    // 验证样本有效性
    if (!this.isValidEAR(ear) || !this.isValidMAR(mar)) {
      return;
    }

    this.samples.push({
      ear,
      mar,
      blinkRate,
      timestamp: Date.now(),
    });

    // 更新进度
    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(1, elapsed / this.config.duration);
    this.progressCallback?.(progress, 'calibrating');
  }

  /**
   * 取消校准
   */
  cancelCalibration(): void {
    if (this.calibrationTimer) {
      clearTimeout(this.calibrationTimer);
      this.calibrationTimer = null;
    }

    this.state = 'idle';
    this.samples = [];
    this.progressCallback?.(0, 'idle');
  }

  /**
   * 完成校准
   */
  private finishCalibration(): CalibrationResult {
    if (this.calibrationTimer) {
      clearTimeout(this.calibrationTimer);
      this.calibrationTimer = null;
    }

    // 检查样本数量
    if (this.samples.length < this.config.minSamples) {
      this.state = 'failed';
      this.progressCallback?.(1, 'failed');
      return {
        success: false,
        baseline: null,
        sampleCount: this.samples.length,
        error: `样本数不足：需要 ${this.config.minSamples} 个，只收集到 ${this.samples.length} 个`,
      };
    }

    // 计算基线统计量
    const earValues = this.samples.map((s) => s.ear);
    const marValues = this.samples.map((s) => s.mar);
    const blinkRateValues = this.samples.map((s) => s.blinkRate);

    const earMean = this.calculateMean(earValues);
    const earStd = this.calculateStd(earValues, earMean);
    const marMean = this.calculateMean(marValues);
    const marStd = this.calculateStd(marValues, marMean);
    const blinkMean = this.calculateMean(blinkRateValues);
    const blinkStd = this.calculateStd(blinkRateValues, blinkMean);

    // 创建个人基线（符合共享类型）
    this.baseline = {
      ear: {
        mean: earMean,
        std: earStd,
        samples: this.samples.length,
      },
      mar: {
        mean: marMean,
        std: marStd,
        samples: this.samples.length,
      },
      blinkRate: {
        mean: blinkMean,
        std: blinkStd,
        samples: this.samples.length,
      },
      lastUpdated: Date.now(),
      version: 1,
      calibrationSessions: 1,
      isCalibrated: true,
    };

    // 保存到本地存储
    this.saveBaseline();

    this.state = 'completed';
    this.progressCallback?.(1, 'completed');

    return {
      success: true,
      baseline: this.baseline,
      sampleCount: this.samples.length,
    };
  }

  /**
   * 使用人群基线初始化（冷启动）
   */
  usePopulationBaseline(type: ColdStartBaselineType = 'default'): PersonalBaseline {
    const popBaseline = POPULATION_BASELINES[type];

    this.baseline = {
      ear: {
        mean: popBaseline.ear.mean,
        std: popBaseline.ear.std,
        samples: 0,
      },
      mar: {
        mean: popBaseline.mar.mean,
        std: popBaseline.mar.std,
        samples: 0,
      },
      blinkRate: {
        mean: 15, // 默认眨眼率
        std: 5,
        samples: 0,
      },
      lastUpdated: Date.now(),
      version: 1,
      calibrationSessions: 0,
      isCalibrated: false, // 使用人群基线，标记为未校准
    };

    this.saveBaseline();
    return this.baseline;
  }

  /**
   * 在线更新基线（EMA）
   * @param ear 当前 EAR 值
   * @param mar 当前 MAR 值
   */
  updateBaselineOnline(ear: number, mar: number): void {
    if (!this.baseline) {
      return;
    }

    // 只在正常状态下更新（不是闭眼或打哈欠时）
    if (!this.isValidEAR(ear) || !this.isValidMAR(mar)) {
      return;
    }

    // 使用 EMA 更新
    const alpha = this.config.emaFactor;
    const earThreshold = this.baseline.ear.mean - this.baseline.ear.std * 1.5;

    // 更新睁眼 EAR 基线
    if (ear > earThreshold) {
      this.baseline.ear.mean = alpha * ear + (1 - alpha) * this.baseline.ear.mean;
      this.baseline.ear.samples++;
    }

    // 更新正常 MAR 基线
    const marThreshold = this.baseline.mar.mean + this.baseline.mar.std * 2;
    if (mar < marThreshold * 0.5) {
      this.baseline.mar.mean = alpha * mar + (1 - alpha) * this.baseline.mar.mean;
      this.baseline.mar.samples++;
    }

    this.baseline.lastUpdated = Date.now();
  }

  /**
   * 获取当前 EAR 阈值（闭眼判定）
   */
  getEARThreshold(): number {
    if (!this.baseline) {
      return POPULATION_BASELINES.default.ear.mean - POPULATION_BASELINES.default.ear.std * 1.5;
    }
    return this.baseline.ear.mean - this.baseline.ear.std * 1.5;
  }

  /**
   * 获取当前 MAR 阈值（打哈欠判定）
   */
  getMARThreshold(): number {
    if (!this.baseline) {
      return POPULATION_BASELINES.default.mar.mean + POPULATION_BASELINES.default.mar.std * 3;
    }
    return this.baseline.mar.mean + this.baseline.mar.std * 3;
  }

  /**
   * 重置基线
   */
  reset(): void {
    this.baseline = null;
    this.state = 'idle';
    this.samples = [];

    // 清除本地存储
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 验证 EAR 值有效性
   */
  private isValidEAR(ear: number): boolean {
    return ear >= this.config.earRange.min && ear <= this.config.earRange.max;
  }

  /**
   * 验证 MAR 值有效性
   */
  private isValidMAR(mar: number): boolean {
    return mar >= this.config.marRange.min && mar <= this.config.marRange.max;
  }

  /**
   * 计算平均值
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 计算标准差
   */
  private calculateStd(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * 保存基线到本地存储
   */
  private saveBaseline(): void {
    if (!this.baseline) return;

    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.baseline));
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 从本地存储加载基线
   */
  private loadBaseline(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PersonalBaseline;

        // 验证加载的数据结构
        if (parsed.ear && parsed.mar && typeof parsed.ear.mean === 'number') {
          this.baseline = parsed;
        }
      }
    } catch {
      this.baseline = null;
    }
  }

  /**
   * 导出基线数据
   */
  exportBaseline(): string | null {
    if (!this.baseline) return null;
    return JSON.stringify(this.baseline);
  }

  /**
   * 导入基线数据
   */
  importBaseline(data: string): boolean {
    try {
      const parsed = JSON.parse(data) as PersonalBaseline;
      if (parsed.ear && parsed.mar && typeof parsed.ear.mean === 'number') {
        this.baseline = parsed;
        this.saveBaseline();
        return true;
      }
    } catch {
      // 解析失败
    }
    return false;
  }
}

/**
 * 创建个性化校准器实例
 */
export function createPersonalizedCalibrator(
  config?: Partial<CalibrationConfig>,
): PersonalizedCalibrator {
  return new PersonalizedCalibrator(config);
}
