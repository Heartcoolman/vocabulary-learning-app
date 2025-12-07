/**
 * AMAS Modeling Layer - Trend Analyzer
 * 长期趋势分析模型
 *
 * 功能:
 * - 追踪用户能力长期变化趋势
 * - 30天滚动窗口线性回归
 * - 冷启动时使用7天EMA近似
 */

/**
 * 趋势状态
 */
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

/**
 * 样本点
 */
interface Sample {
  ts: number;
  ability: number;
}

/**
 * 斜率计算结果
 */
interface SlopeResult {
  slopePerDay: number;
  volatility: number;
  method: 'regression' | 'ema';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 环形缓冲区 - O(1) 时间复杂度的 push 和 shift 操作
 *
 * 性能优势:
 * - 避免数组 shift() 的 O(n) 元素移动
 * - 固定容量，无内存重分配
 * - 适用于滑动窗口场景
 */
class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private _size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  get size(): number {
    return this._size;
  }

  push(item: T): T | undefined {
    const evicted =
      this._size === this.capacity ? this.buffer[this.head] : undefined;
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this._size < this.capacity) {
      this._size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    return evicted;
  }

  shift(): T | undefined {
    if (this._size === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this._size--;
    return item;
  }

  /** 获取第一个元素（不移除） */
  first(): T | undefined {
    return this._size > 0 ? this.buffer[this.head] : undefined;
  }

  /** 获取最后一个元素（不移除） */
  last(): T | undefined {
    if (this._size === 0) return undefined;
    const lastIdx = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIdx];
  }

  /** 获取指定索引的元素 */
  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    return this.buffer[(this.head + index) % this.capacity];
  }

  /** 迭代器支持 */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this.buffer[(this.head + i) % this.capacity] as T;
    }
  }

  toArray(): T[] {
    return [...this];
  }

  /** 清空缓冲区 */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }
}

/**
 * 趋势分析器
 *
 * 冷启动策略:
 * - 样本不足或时间跨度不足30天: 使用7天EMA近似斜率
 * - 样本充足: 使用线性回归计算趋势
 *
 * 趋势分类:
 * - up: 进步 (slope > 0.01/天)
 * - down: 退步 (slope < -0.005/天)
 * - flat: 平稳 (近零且低波动)
 * - stuck: 停滞 (其他情况)
 */
export class TrendAnalyzer {
  private readonly windowMs: number;
  private readonly minSamples: number;
  private readonly emaAlpha: number; // 7天EMA: 2/(7+1)=0.25

  /**
   * 样本历史 (滚动窗口)
   * 使用环形缓冲区以获得 O(1) 的 push/shift 操作
   * 容量设为窗口天数的3倍以应对高频采样
   */
  private samples: RingBuffer<Sample>;

  /** 最近计算的状态 */
  private lastState: TrendState = 'flat';
  private lastSlope = 0;
  private lastConfidence = 0;

  constructor(windowDays = 30, minSamples = 10) {
    this.windowMs = windowDays * 24 * 60 * 60 * 1000;
    this.minSamples = minSamples;
    this.emaAlpha = 0.25;
    // 容量 = 窗口天数 * 3，假设每天最多3次采样
    // 如超出容量，旧数据会自动被覆盖
    this.samples = new RingBuffer<Sample>(windowDays * 3);
  }

  /**
   * 更新趋势，返回最新趋势状态
   * @param ability 能力值 (建议0-1)
   * @param timestamp 毫秒时间戳
   * @returns 趋势状态
   */
  update(ability: number, timestamp: number): TrendState {
    if (!Number.isFinite(ability) || !Number.isFinite(timestamp)) {
      return this.lastState;
    }

    const safeAbility = clamp(ability, 0, 1);
    this.samples.push({ ts: timestamp, ability: safeAbility });

    // 保持按时间排序 (允许少量乱序)
    // 注意：当发生乱序时，需要转换为数组排序再重建环形缓冲区
    const lastSample = this.samples.get(this.samples.size - 2);
    if (this.samples.size >= 2 && lastSample && lastSample.ts > timestamp) {
      const sorted = this.samples.toArray().sort((a, b) => a.ts - b.ts);
      this.samples.clear();
      for (const sample of sorted) {
        this.samples.push(sample);
      }
    }

    // 滚动窗口截断 - O(1) shift 操作
    const windowStart = timestamp - this.windowMs;
    let firstSample = this.samples.first();
    while (this.samples.size > 0 && firstSample && firstSample.ts < windowStart) {
      this.samples.shift();
      firstSample = this.samples.first();
    }

    if (this.samples.size < 2) {
      this.lastState = 'flat';
      this.lastSlope = 0;
      this.lastConfidence = 0;
      return this.lastState;
    }

    const { slopePerDay, volatility, method } = this.computeSlopeAndVolatility();
    const state = this.classifyState(slopePerDay, volatility);
    const confidence = this.computeConfidence(
      this.samples.size,
      slopePerDay,
      volatility,
      method
    );

    this.lastState = state;
    this.lastSlope = slopePerDay;
    this.lastConfidence = confidence;

    return state;
  }

  /**
   * 获取当前趋势状态
   */
  getTrendState(): TrendState {
    return this.lastState;
  }

  /**
   * 获取趋势斜率 (每天变化率)
   */
  getTrendSlope(): number {
    return this.lastSlope;
  }

  /**
   * 获取趋势置信度 [0,1]
   */
  getConfidence(): number {
    return this.lastConfidence;
  }

  // ==================== 私有方法 ====================

  /**
   * 计算斜率和波动性
   */
  private computeSlopeAndVolatility(): SlopeResult {
    const n = this.samples.size;
    const firstSample = this.samples.first()!;
    const t0 = firstSample.ts;
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);

    // 转换为天数和能力值 - 使用 get() 访问环形缓冲区
    for (let i = 0; i < n; i++) {
      const sample = this.samples.get(i)!;
      xs[i] = (sample.ts - t0) / (24 * 60 * 60 * 1000); // 转为天数
      ys[i] = sample.ability;
    }

    const spanDays = xs[n - 1] - xs[0];
    const halfWindow = this.windowMs / (2 * 24 * 60 * 60 * 1000);
    const enoughData = n >= this.minSamples && spanDays >= halfWindow;

    if (enoughData) {
      // 数据充足: 使用线性回归
      const slope = this.linearRegressionSlope(xs, ys);
      const volatility = this.stdDev(ys);
      return { slopePerDay: slope, volatility, method: 'regression' };
    }

    // 冷启动: 7天EMA近似趋势
    const { slope, volatility } = this.emaSlope(xs, ys);
    return { slopePerDay: slope, volatility, method: 'ema' };
  }

  /**
   * 线性回归计算斜率
   */
  private linearRegressionSlope(xs: number[], ys: number[]): number {
    const n = xs.length;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let den = 0;

    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      num += dx * (ys[i] - meanY);
      den += dx * dx;
    }

    if (den <= 1e-9) return 0;
    return num / den;
  }

  /**
   * EMA近似斜率 (冷启动用)
   */
  private emaSlope(xs: number[], ys: number[]): {
    slope: number;
    volatility: number;
  } {
    let ema = ys[0];
    const n = ys.length;

    for (let i = 1; i < n; i++) {
      ema = this.emaAlpha * ys[i] + (1 - this.emaAlpha) * ema;
    }

    // 以首尾EMA差近似斜率
    const spanDays = Math.max(xs[n - 1] - xs[0], 1e-6);
    const slope = (ema - ys[0]) / spanDays;
    const volatility = this.stdDev(ys);

    return { slope, volatility };
  }

  /**
   * 计算标准差
   */
  private stdDev(arr: number[]): number {
    const n = arr.length;
    if (n <= 1) return 0;

    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const varSum = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0);

    return Math.sqrt(varSum / n);
  }

  /**
   * 分类趋势状态
   */
  private classifyState(slopePerDay: number, volatility: number): TrendState {
    if (slopePerDay > 0.01) return 'up';
    if (slopePerDay < -0.005) return 'down';

    // 近零且低波动判定为平稳
    if (Math.abs(slopePerDay) <= 0.005 && volatility < 0.05) return 'flat';

    return 'stuck';
  }

  /**
   * 计算置信度
   */
  private computeConfidence(
    n: number,
    slope: number,
    volatility: number,
    method: 'regression' | 'ema'
  ): number {
    // 样本越多、时间跨度越大、波动越低，置信度越高
    const firstSample = this.samples.first()!;
    const lastSample = this.samples.last()!;
    const spanDays = Math.max(
      (lastSample.ts - firstSample.ts) / (24 * 60 * 60 * 1000),
      1e-6
    );

    const windowDays = this.windowMs / (24 * 60 * 60 * 1000);

    const sizeFactor = clamp(n / (this.minSamples * 1.5), 0, 1);
    const spanFactor = clamp(spanDays / windowDays, 0, 1);
    const volatilityFactor = 1 / (1 + volatility * 10);
    const methodPenalty = method === 'ema' ? 0.15 : 0;

    let confidence =
      0.5 * sizeFactor + 0.3 * spanFactor + 0.2 * volatilityFactor;
    confidence = clamp(confidence - methodPenalty, 0, 1);

    // 极弱趋势降低置信度
    if (Math.abs(slope) < 0.002) {
      confidence *= 0.8;
    }

    return clamp(confidence, 0, 1);
  }
}
