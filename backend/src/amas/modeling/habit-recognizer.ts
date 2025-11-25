/**
 * AMAS Modeling Layer - Habit Recognizer
 * 习惯识别模型
 *
 * 功能:
 * - 时间偏好识别 (24小时直方图)
 * - 学习节奏偏好 (会话时长中位数)
 * - 批量偏好 (单次学习单词数中位数)
 */

/**
 * 习惯画像
 */
export interface HabitProfile {
  /** 时间偏好 (24小时归一化直方图) */
  timePref: number[];
  /** 节奏偏好 */
  rhythmPref: {
    /** 会话时长中位数(分钟) */
    sessionMedianMinutes: number;
    /** 批量大小中位数 */
    batchMedian: number;
  };
  /** 偏好时间段 (小时数组, 如 [9, 14, 20]) */
  preferredTimeSlots: number[];
  /** 样本统计 */
  samples: {
    /** 时间事件数 */
    timeEvents: number;
    /** 会话记录数 */
    sessions: number;
    /** 批量记录数 */
    batches: number;
  };
}

/**
 * 习惯识别器配置选项
 */
export interface HabitRecognizerOptions {
  /** EMA平滑系数 (时间直方图) */
  emaBeta?: number;
  /** 中位数滑动窗口大小 */
  medianWindow?: number;
  /** 时间偏好最少样本数 */
  minTimeSamplesForPref?: number;
  /** 返回Top K个时间段 */
  topKSlots?: number;
  /** 默认会话时长(分钟) */
  defaultSessionMinutes?: number;
  /** 默认批量大小 */
  defaultBatchSize?: number;
}

/**
 * 习惯识别器
 *
 * 冷启动策略:
 * - 时间偏好: 初始为均匀分布,不足10次样本时返回空偏好时段
 * - 节奏/批量: 无数据时返回默认值
 */
export class HabitRecognizer {
  private readonly emaBeta: number;
  private readonly medianWindow: number;
  private readonly minTimeSamplesForPref: number;
  private readonly topKSlots: number;
  private readonly defaultSessionMinutes: number;
  private readonly defaultBatchSize: number;

  /** 时间直方图 (24小时, 归一化) */
  private timeHist: Float32Array;
  /** 时间事件计数 */
  private timeEvents: number;

  /** 会话时长历史 (分钟) */
  private sessionDurations: number[];
  /** 批量大小历史 */
  private batchSizes: number[];

  constructor(opts: HabitRecognizerOptions = {}) {
    this.emaBeta = opts.emaBeta ?? 0.9;
    this.medianWindow = opts.medianWindow ?? 50;
    this.minTimeSamplesForPref = opts.minTimeSamplesForPref ?? 10;
    this.topKSlots = opts.topKSlots ?? 3;
    this.defaultSessionMinutes = opts.defaultSessionMinutes ?? 15;
    this.defaultBatchSize = opts.defaultBatchSize ?? 8;

    // 初始化为均匀先验
    this.timeHist = new Float32Array(24).fill(1 / 24);
    this.timeEvents = 0;

    this.sessionDurations = [];
    this.batchSizes = [];
  }

  /**
   * 更新时间偏好
   * @param hour 小时 (0-23)
   */
  updateTimePref(hour: number): void {
    const h = Math.max(0, Math.min(23, Math.floor(hour)));
    const beta = this.emaBeta;

    // EMA更新直方图
    for (let i = 0; i < 24; i++) {
      const hit = i === h ? 1 : 0;
      this.timeHist[i] = beta * this.timeHist[i] + (1 - beta) * hit;
    }

    this.normalizeTimeHist();
    this.timeEvents += 1;
  }

  /**
   * 更新会话时长
   * @param minutes 时长(分钟)
   */
  updateSessionDuration(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.pushWithWindow(this.sessionDurations, minutes, this.medianWindow);
  }

  /**
   * 更新批量大小
   * @param count 单词数
   */
  updateBatchSize(count: number): void {
    if (!Number.isFinite(count) || count <= 0) return;
    this.pushWithWindow(this.batchSizes, count, this.medianWindow);
  }

  /**
   * 获取习惯画像
   */
  getHabitProfile(): HabitProfile {
    const sessionMedian = this.medianOrDefault(
      this.sessionDurations,
      this.defaultSessionMinutes
    );
    const batchMedian = this.medianOrDefault(
      this.batchSizes,
      this.defaultBatchSize
    );

    return {
      timePref: Array.from(this.timeHist),
      rhythmPref: {
        sessionMedianMinutes: sessionMedian,
        batchMedian
      },
      preferredTimeSlots: this.getPreferredTimeSlots(),
      samples: {
        timeEvents: this.timeEvents,
        sessions: this.sessionDurations.length,
        batches: this.batchSizes.length
      }
    };
  }

  /**
   * 获取偏好时间段 (Top K个小时)
   * @returns 小时数组 (0-23), 如果样本不足返回空数组
   */
  getPreferredTimeSlots(): number[] {
    // 冷启动: 样本不足时返回空,表示无强偏好
    if (this.timeEvents < this.minTimeSamplesForPref) {
      return [];
    }

    const indexed = Array.from(this.timeHist)
      .map((v, hour) => ({ hour, v }))
      .sort((a, b) => b.v - a.v);

    return indexed.slice(0, this.topKSlots).map(x => x.hour);
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 归一化时间直方图
   */
  private normalizeTimeHist(): void {
    let sum = 0;
    for (let i = 0; i < 24; i++) sum += this.timeHist[i];

    if (sum <= 0) {
      this.timeHist.fill(1 / 24);
      return;
    }

    for (let i = 0; i < 24; i++) {
      this.timeHist[i] = this.timeHist[i] / sum;
    }
  }

  /**
   * 滑动窗口推入数据
   */
  private pushWithWindow(arr: number[], value: number, window: number): void {
    arr.push(value);
    if (arr.length > window) {
      arr.shift();
    }
  }

  /**
   * 计算中位数 (冷启动时返回默认值)
   */
  private medianOrDefault(arr: number[], fallback: number): number {
    if (arr.length === 0) return fallback;

    const copy = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(copy.length / 2);

    if (copy.length % 2 === 0) {
      return (copy[mid - 1] + copy[mid]) / 2;
    }

    return copy[mid];
  }
}
