/**
 * 学习体验指标监控系统
 *
 * 提供核心学习体验指标的收集和导出，包括：
 * - 用户留存率（次日/7日/30日）
 * - 复习命中率（实际复习/应复习）
 * - 答题时延P99
 * - 会话中断率
 * - 遗忘预测准确率
 * - 心流会话占比
 *
 * 复用 metrics.service.ts 的基础设施
 * 使用 Prometheus 格式导出
 */

import prisma from '../config/database';

// ==================== 基础类型定义 ====================

interface CounterMetric {
  name: string;
  help: string;
  values: Map<string, number>;
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  values: number[];
  sum: number;
  count: number;
}

// ==================== 指标存储 ====================

const counters = new Map<string, CounterMetric>();
const gauges = new Map<string, GaugeMetric>();
const histograms = new Map<string, HistogramMetric>();

// ==================== 工具函数 ====================

/**
 * 创建或获取Counter指标
 */
function getOrCreateCounter(name: string, help: string): CounterMetric {
  let counter = counters.get(name);
  if (!counter) {
    counter = { name, help, values: new Map() };
    counters.set(name, counter);
  }
  return counter;
}

/**
 * Counter递增
 */
function incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
  const counter = counters.get(name);
  if (!counter) return;

  const labelKey = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');

  const current = counter.values.get(labelKey) ?? 0;
  counter.values.set(labelKey, current + value);
}

/**
 * 创建或获取Gauge指标
 */
function getOrCreateGauge(name: string, help: string): GaugeMetric {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = { name, help, value: 0 };
    gauges.set(name, gauge);
  }
  return gauge;
}

/**
 * 设置Gauge值
 */
function setGauge(name: string, value: number): void {
  const gauge = gauges.get(name);
  if (gauge) {
    gauge.value = value;
  }
}

/**
 * 创建或获取Histogram指标
 */
function getOrCreateHistogram(name: string, help: string, buckets: number[]): HistogramMetric {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = {
      name,
      help,
      buckets: [...buckets].sort((a, b) => a - b),
      values: new Array(buckets.length).fill(0),
      sum: 0,
      count: 0,
    };
    histograms.set(name, histogram);
  }
  return histogram;
}

/**
 * 记录Histogram观测值
 */
function observeHistogram(name: string, value: number): void {
  const histogram = histograms.get(name);
  if (!histogram) return;

  histogram.sum += value;
  histogram.count += 1;

  // 更新桶计数
  for (let i = 0; i < histogram.buckets.length; i++) {
    if (value <= histogram.buckets[i]) {
      histogram.values[i] += 1;
    }
  }
}

// ==================== 学习体验指标定义 ====================

// 用户留存率 (次日/7日/30日)
getOrCreateGauge('learning_retention_rate_1d', '次日留存率（百分比）');
getOrCreateGauge('learning_retention_rate_7d', '7日留存率（百分比）');
getOrCreateGauge('learning_retention_rate_30d', '30日留存率（百分比）');

// 复习命中率 (实际复习/应复习)
getOrCreateGauge('learning_review_hit_rate', '复习命中率（实际复习数/应复习数）');
getOrCreateCounter('learning_review_expected_total', '应复习单词总数');
getOrCreateCounter('learning_review_actual_total', '实际复习单词总数');

// 答题时延P99（毫秒）
getOrCreateHistogram(
  'learning_answer_latency_ms',
  '答题时延（毫秒）',
  [100, 200, 500, 1000, 2000, 3000, 5000, 10000, 20000],
);

// 会话中断率
getOrCreateGauge('learning_session_dropout_rate', '会话中断率（中断会话/总会话）');
getOrCreateCounter('learning_session_started_total', '开始的学习会话总数');
getOrCreateCounter('learning_session_completed_total', '完成的学习会话总数');
getOrCreateCounter('learning_session_dropped_total', '中断的学习会话总数');

// 遗忘预测准确率
getOrCreateGauge('learning_forgetting_prediction_accuracy', '遗忘预测准确率（百分比）');
getOrCreateCounter('learning_forgetting_prediction_total', '遗忘预测总次数');
getOrCreateCounter('learning_forgetting_prediction_correct_total', '遗忘预测正确次数');

// 心流会话占比
getOrCreateGauge('learning_flow_session_ratio', '心流会话占比（心流会话/总会话）');
getOrCreateCounter('learning_flow_session_total', '心流会话总数');

// ==================== 便捷函数 ====================

/**
 * 更新留存率指标
 * @param period - 留存周期：'1d' | '7d' | '30d'
 * @param rate - 留存率（0-1之间的小数）
 */
export function updateRetentionRate(period: '1d' | '7d' | '30d', rate: number): void {
  const metricName = `learning_retention_rate_${period}`;
  setGauge(metricName, Math.min(100, Math.max(0, rate * 100)));
}

/**
 * 记录复习行为
 * @param expected - 应复习的单词数
 * @param actual - 实际复习的单词数
 */
export function recordReview(expected: number, actual: number): void {
  incCounter('learning_review_expected_total', {}, expected);
  incCounter('learning_review_actual_total', {}, actual);

  // 计算并更新复习命中率
  const expectedCounter = counters.get('learning_review_expected_total');
  const actualCounter = counters.get('learning_review_actual_total');

  if (expectedCounter && actualCounter) {
    const totalExpected = Array.from(expectedCounter.values.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    const totalActual = Array.from(actualCounter.values.values()).reduce(
      (sum, val) => sum + val,
      0,
    );

    if (totalExpected > 0) {
      const hitRate = totalActual / totalExpected;
      setGauge('learning_review_hit_rate', Math.min(1, Math.max(0, hitRate)));
    }
  }
}

/**
 * 记录答题时延
 * @param latencyMs - 答题时延（毫秒）
 */
export function recordAnswerLatency(latencyMs: number): void {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  observeHistogram('learning_answer_latency_ms', latencyMs);
}

/**
 * 记录学习会话开始
 */
export function recordSessionStart(): void {
  incCounter('learning_session_started_total');
  updateSessionDropoutRate();
}

/**
 * 记录学习会话完成
 */
export function recordSessionComplete(): void {
  incCounter('learning_session_completed_total');
  updateSessionDropoutRate();
}

/**
 * 记录学习会话中断
 */
export function recordSessionDropout(): void {
  incCounter('learning_session_dropped_total');
  updateSessionDropoutRate();
}

/**
 * 更新会话中断率
 */
function updateSessionDropoutRate(): void {
  const startedCounter = counters.get('learning_session_started_total');
  const completedCounter = counters.get('learning_session_completed_total');
  const droppedCounter = counters.get('learning_session_dropped_total');

  if (startedCounter && completedCounter && droppedCounter) {
    const totalStarted = Array.from(startedCounter.values.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    const totalDropped = Array.from(droppedCounter.values.values()).reduce(
      (sum, val) => sum + val,
      0,
    );

    if (totalStarted > 0) {
      const dropoutRate = totalDropped / totalStarted;
      setGauge('learning_session_dropout_rate', Math.min(1, Math.max(0, dropoutRate)));
    }
  }
}

/**
 * 记录遗忘预测结果
 * @param isCorrect - 预测是否正确
 */
export function recordForgettingPrediction(isCorrect: boolean): void {
  incCounter('learning_forgetting_prediction_total');
  if (isCorrect) {
    incCounter('learning_forgetting_prediction_correct_total');
  }

  // 计算并更新预测准确率
  const totalCounter = counters.get('learning_forgetting_prediction_total');
  const correctCounter = counters.get('learning_forgetting_prediction_correct_total');

  if (totalCounter && correctCounter) {
    const total = Array.from(totalCounter.values.values()).reduce((sum, val) => sum + val, 0);
    const correct = Array.from(correctCounter.values.values()).reduce((sum, val) => sum + val, 0);

    if (total > 0) {
      const accuracy = (correct / total) * 100;
      setGauge('learning_forgetting_prediction_accuracy', accuracy);
    }
  }
}

/**
 * 记录心流会话
 */
export function recordFlowSession(): void {
  incCounter('learning_flow_session_total');
  updateFlowSessionRatio();
}

/**
 * 更新心流会话占比
 */
function updateFlowSessionRatio(): void {
  const flowCounter = counters.get('learning_flow_session_total');
  const startedCounter = counters.get('learning_session_started_total');

  if (flowCounter && startedCounter) {
    const totalFlow = Array.from(flowCounter.values.values()).reduce((sum, val) => sum + val, 0);
    const totalStarted = Array.from(startedCounter.values.values()).reduce(
      (sum, val) => sum + val,
      0,
    );

    if (totalStarted > 0) {
      const ratio = totalFlow / totalStarted;
      setGauge('learning_flow_session_ratio', Math.min(1, Math.max(0, ratio)));
    }
  }
}

// ==================== 数据库查询辅助函数 ====================

/**
 * 计算用户留存率
 * @param periodDays - 留存周期（天数）
 * @returns 留存率（0-1）
 */
export async function calculateRetentionRate(periodDays: number): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const referenceStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

  // 获取参考期活跃用户
  const referenceUsers = await prisma.learningSession.groupBy({
    by: ['userId'],
    where: {
      startedAt: {
        gte: referenceStart,
        lt: periodStart,
      },
    },
  });

  if (referenceUsers.length === 0) {
    return 0;
  }

  const referenceUserIds = referenceUsers.map((u) => u.userId);

  // 获取留存用户（在当前周期内也活跃的用户）
  const retainedUsers = await prisma.learningSession.groupBy({
    by: ['userId'],
    where: {
      userId: {
        in: referenceUserIds,
      },
      startedAt: {
        gte: periodStart,
        lte: now,
      },
    },
  });

  return retainedUsers.length / referenceUsers.length;
}

/**
 * 计算复习命中率
 * @returns { expected: number, actual: number, hitRate: number }
 */
export async function calculateReviewHitRate(): Promise<{
  expected: number;
  actual: number;
  hitRate: number;
}> {
  const now = new Date();

  // 获取应复习的单词数（nextReviewDate <= now）
  const expectedReviews = await prisma.wordLearningState.count({
    where: {
      nextReviewDate: {
        lte: now,
      },
      state: {
        in: ['LEARNING', 'REVIEWING'],
      },
    },
  });

  // 获取实际复习的单词数（最近24小时内有答题记录的应复习单词）
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const actualReviews = await prisma.answerRecord.groupBy({
    by: ['wordId'],
    where: {
      timestamp: {
        gte: oneDayAgo,
        lte: now,
      },
    },
    having: {
      wordId: {
        _count: {
          gte: 1,
        },
      },
    },
  });

  const hitRate = expectedReviews > 0 ? actualReviews.length / expectedReviews : 0;

  return {
    expected: expectedReviews,
    actual: actualReviews.length,
    hitRate,
  };
}

/**
 * 计算答题时延统计
 * @param periodHours - 统计周期（小时）
 * @returns { p50: number, p95: number, p99: number, avg: number }
 */
export async function calculateAnswerLatencyStats(periodHours = 24): Promise<{
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
}> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

  const records = await prisma.answerRecord.findMany({
    where: {
      timestamp: {
        gte: periodStart,
        lte: now,
      },
      responseTime: {
        not: null,
      },
    },
    select: {
      responseTime: true,
    },
  });

  if (records.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
  }

  const latencies = records
    .map((r) => r.responseTime!)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const count = latencies.length;
  const sum = latencies.reduce((s, v) => s + v, 0);
  const avg = sum / count;

  const p50Index = Math.floor(count * 0.5);
  const p95Index = Math.floor(count * 0.95);
  const p99Index = Math.floor(count * 0.99);

  return {
    p50: latencies[p50Index] || 0,
    p95: latencies[p95Index] || 0,
    p99: latencies[p99Index] || 0,
    avg,
    count,
  };
}

/**
 * 计算会话中断率
 * @param periodHours - 统计周期（小时）
 * @returns { dropoutRate: number, started: number, completed: number, dropped: number }
 */
export async function calculateSessionDropoutRate(periodHours = 24): Promise<{
  dropoutRate: number;
  started: number;
  completed: number;
  dropped: number;
}> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

  // 统计开始的会话
  const started = await prisma.learningSession.count({
    where: {
      startedAt: {
        gte: periodStart,
        lte: now,
      },
    },
  });

  // 统计完成的会话（有endedAt且达到目标）
  const completed = await prisma.learningSession.count({
    where: {
      startedAt: {
        gte: periodStart,
        lte: now,
      },
      endedAt: {
        not: null,
      },
      AND: [
        {
          actualMasteryCount: {
            not: null,
          },
        },
        {
          targetMasteryCount: {
            not: null,
          },
        },
        // 注意: Prisma不支持字段间比较，需要后处理
      ],
    },
  });

  // 获取所有已结束的会话，然后在内存中过滤
  const completedSessions = await prisma.learningSession.findMany({
    where: {
      startedAt: {
        gte: periodStart,
        lte: now,
      },
      endedAt: {
        not: null,
      },
      actualMasteryCount: {
        not: null,
      },
      targetMasteryCount: {
        not: null,
      },
    },
    select: {
      actualMasteryCount: true,
      targetMasteryCount: true,
    },
  });

  const actualCompleted = completedSessions.filter(
    (s) => s.actualMasteryCount! >= s.targetMasteryCount!,
  ).length;

  // 统计中断的会话（有endedAt但未达到目标，或超过2小时未完成）
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const droppedSessions = await prisma.learningSession.findMany({
    where: {
      startedAt: {
        gte: periodStart,
        lte: now,
      },
      endedAt: {
        not: null,
      },
      OR: [
        {
          targetMasteryCount: null,
        },
        {
          actualMasteryCount: null,
        },
      ],
    },
    select: {
      actualMasteryCount: true,
      targetMasteryCount: true,
    },
  });

  const droppedWithEnd =
    droppedSessions.length +
    completedSessions.filter((s) => s.actualMasteryCount! < s.targetMasteryCount!).length;

  const droppedWithoutEnd = await prisma.learningSession.count({
    where: {
      startedAt: {
        gte: periodStart,
        lt: twoHoursAgo,
      },
      endedAt: null,
    },
  });

  const dropped = droppedWithEnd + droppedWithoutEnd;
  const dropoutRate = started > 0 ? dropped / started : 0;

  return {
    dropoutRate,
    started,
    completed: actualCompleted,
    dropped,
  };
}

/**
 * 计算遗忘预测准确率
 * 基于实际答题结果与预期难度的匹配度
 * @param periodHours - 统计周期（小时）
 */
export async function calculateForgettingPredictionAccuracy(periodHours = 24): Promise<{
  accuracy: number;
  total: number;
  correct: number;
}> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

  // 获取期间内有复习记录的单词学习状态
  const records = await prisma.answerRecord.findMany({
    where: {
      timestamp: {
        gte: periodStart,
        lte: now,
      },
    },
    include: {
      word: {
        include: {
          learningStates: true,
        },
      },
    },
  });

  let total = 0;
  let correct = 0;

  for (const record of records) {
    // 找到该用户对应的学习状态
    const learningState = record.word.learningStates.find(
      (state) => state.userId === record.userId,
    );

    if (!learningState || !learningState.lastReviewDate || !learningState.halfLife) {
      continue;
    }

    // 计算预期遗忘程度（基于半衰期）
    const daysSinceLastReview =
      (record.timestamp.getTime() - learningState.lastReviewDate.getTime()) / (24 * 60 * 60 * 1000);
    const expectedRetention = Math.pow(0.5, daysSinceLastReview / learningState.halfLife);

    // 预测：如果期望留存率 < 0.5，预测会答错；否则预测会答对
    const predictedCorrect = expectedRetention >= 0.5;
    const actualCorrect = record.isCorrect;

    total++;
    if (predictedCorrect === actualCorrect) {
      correct++;
    }
  }

  const accuracy = total > 0 ? correct / total : 0;

  return {
    accuracy,
    total,
    correct,
  };
}

/**
 * 判断会话是否为心流会话
 * 心流条件：
 * 1. 会话完成（有endedAt）
 * 2. 正确率在60%-85%之间（适度挑战）
 * 3. 平均答题时间稳定（标准差/均值 < 0.5）
 * 4. 完成至少10道题
 */
async function isFlowSession(sessionId: string): Promise<boolean> {
  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    include: {
      answerRecords: true,
    },
  });

  if (!session || !session.endedAt || !session.answerRecords.length) {
    return false;
  }

  const records = session.answerRecords;

  // 条件4：至少10道题
  if (records.length < 10) {
    return false;
  }

  // 条件2：正确率在60%-85%之间
  const correctCount = records.filter((r) => r.isCorrect).length;
  const accuracy = correctCount / records.length;
  if (accuracy < 0.6 || accuracy > 0.85) {
    return false;
  }

  // 条件3：答题时间稳定
  const responseTimes = records
    .map((r) => r.responseTime)
    .filter((t): t is number => t !== null && t > 0);

  if (responseTimes.length < 10) {
    return false;
  }

  const mean = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
  const variance =
    responseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / responseTimes.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // 变异系数

  return cv < 0.5;
}

/**
 * 计算心流会话占比
 * @param periodHours - 统计周期（小时）
 */
export async function calculateFlowSessionRatio(periodHours = 24): Promise<{
  ratio: number;
  flowSessions: number;
  totalSessions: number;
}> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

  const sessions = await prisma.learningSession.findMany({
    where: {
      startedAt: {
        gte: periodStart,
        lte: now,
      },
      endedAt: {
        not: null,
      },
    },
    select: {
      id: true,
    },
  });

  let flowCount = 0;
  for (const session of sessions) {
    if (await isFlowSession(session.id)) {
      flowCount++;
    }
  }

  const ratio = sessions.length > 0 ? flowCount / sessions.length : 0;

  return {
    ratio,
    flowSessions: flowCount,
    totalSessions: sessions.length,
  };
}

// ==================== 定时更新任务 ====================

/**
 * 更新所有学习体验指标
 * 建议定时调用（如每小时或每天）
 */
export async function updateAllLearningMetrics(): Promise<void> {
  try {
    // 更新留存率
    const retention1d = await calculateRetentionRate(1);
    updateRetentionRate('1d', retention1d);

    const retention7d = await calculateRetentionRate(7);
    updateRetentionRate('7d', retention7d);

    const retention30d = await calculateRetentionRate(30);
    updateRetentionRate('30d', retention30d);

    // 更新复习命中率
    const reviewStats = await calculateReviewHitRate();
    recordReview(reviewStats.expected, reviewStats.actual);

    // 更新答题时延（基于最近24小时数据）
    const latencyStats = await calculateAnswerLatencyStats(24);
    // 注意：实际的答题记录通过 recordAnswerLatency 实时记录

    // 更新会话中断率
    const dropoutStats = await calculateSessionDropoutRate(24);
    // 通过调整计数器来同步状态
    const startedCounter = counters.get('learning_session_started_total');
    const completedCounter = counters.get('learning_session_completed_total');
    const droppedCounter = counters.get('learning_session_dropped_total');

    if (startedCounter) {
      startedCounter.values.clear();
      startedCounter.values.set('', dropoutStats.started);
    }
    if (completedCounter) {
      completedCounter.values.clear();
      completedCounter.values.set('', dropoutStats.completed);
    }
    if (droppedCounter) {
      droppedCounter.values.clear();
      droppedCounter.values.set('', dropoutStats.dropped);
    }
    updateSessionDropoutRate();

    // 更新遗忘预测准确率
    const predictionStats = await calculateForgettingPredictionAccuracy(24);
    const predictionTotal = counters.get('learning_forgetting_prediction_total');
    const predictionCorrect = counters.get('learning_forgetting_prediction_correct_total');

    if (predictionTotal) {
      predictionTotal.values.clear();
      predictionTotal.values.set('', predictionStats.total);
    }
    if (predictionCorrect) {
      predictionCorrect.values.clear();
      predictionCorrect.values.set('', predictionStats.correct);
    }
    setGauge('learning_forgetting_prediction_accuracy', predictionStats.accuracy * 100);

    // 更新心流会话占比
    const flowStats = await calculateFlowSessionRatio(24);
    const flowCounter = counters.get('learning_flow_session_total');

    if (flowCounter) {
      flowCounter.values.clear();
      flowCounter.values.set('', flowStats.flowSessions);
    }
    updateFlowSessionRatio();

    console.log('[LearningMetrics] All metrics updated successfully');
  } catch (error) {
    console.error('[LearningMetrics] Error updating metrics:', error);
    throw error;
  }
}

// ==================== Prometheus 导出 ====================

/**
 * 获取JSON格式的所有学习指标
 */
export function getLearningMetricsJson(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 导出Counters
  counters.forEach((counter) => {
    const values: Record<string, number> = {};
    counter.values.forEach((v, k) => {
      values[k || 'total'] = v;
    });
    result[counter.name] = {
      type: 'counter',
      help: counter.help,
      values,
    };
  });

  // 导出Gauges
  gauges.forEach((gauge) => {
    result[gauge.name] = {
      type: 'gauge',
      help: gauge.help,
      value: gauge.value,
    };
  });

  // 导出Histograms
  histograms.forEach((histogram) => {
    const count = histogram.count;

    // 从bucket计算分位数（近似）
    let p50 = 0,
      p95 = 0,
      p99 = 0;
    if (count > 0) {
      let cumulative = 0;
      for (let i = 0; i < histogram.buckets.length; i++) {
        cumulative += histogram.values[i];
        if (cumulative >= count * 0.5 && p50 === 0) {
          p50 = histogram.buckets[i];
        }
        if (cumulative >= count * 0.95 && p95 === 0) {
          p95 = histogram.buckets[i];
        }
        if (cumulative >= count * 0.99 && p99 === 0) {
          p99 = histogram.buckets[i];
        }
      }
    }

    result[histogram.name] = {
      type: 'histogram',
      help: histogram.help,
      count: histogram.count,
      sum: histogram.sum,
      avg: count > 0 ? histogram.sum / count : 0,
      p50,
      p95,
      p99,
    };
  });

  return result;
}

/**
 * 获取Prometheus格式的学习指标文本
 */
export function getLearningMetricsPrometheus(): string {
  const lines: string[] = [];

  // 导出Counters
  counters.forEach((counter) => {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    counter.values.forEach((v, labels) => {
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`${counter.name}${labelStr} ${v}`);
    });
  });

  // 导出Gauges
  gauges.forEach((gauge) => {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${gauge.name} ${gauge.value}`);
  });

  // 导出Histograms
  histograms.forEach((histogram) => {
    lines.push(`# HELP ${histogram.name} ${histogram.help}`);
    lines.push(`# TYPE ${histogram.name} histogram`);

    let cumulative = 0;
    histogram.buckets.forEach((bucket, i) => {
      cumulative += histogram.values[i];
      lines.push(`${histogram.name}_bucket{le="${bucket}"} ${cumulative}`);
    });
    lines.push(`${histogram.name}_bucket{le="+Inf"} ${histogram.count}`);
    lines.push(`${histogram.name}_sum ${histogram.sum}`);
    lines.push(`${histogram.name}_count ${histogram.count}`);
  });

  return lines.join('\n');
}

/**
 * 重置所有学习指标（用于测试）
 */
export function resetAllLearningMetrics(): void {
  counters.forEach((counter) => counter.values.clear());
  gauges.forEach((gauge) => (gauge.value = 0));
  histograms.forEach((histogram) => {
    histogram.values.fill(0);
    histogram.sum = 0;
    histogram.count = 0;
  });
}

// ==================== 导出类接口（兼容现有架构） ====================

export class LearningMetricsService {
  /**
   * 更新所有指标
   */
  async updateMetrics(): Promise<void> {
    await updateAllLearningMetrics();
  }

  /**
   * 获取JSON格式指标
   */
  getMetricsJson(): Record<string, unknown> {
    return getLearningMetricsJson();
  }

  /**
   * 获取Prometheus格式指标
   */
  getMetricsPrometheus(): string {
    return getLearningMetricsPrometheus();
  }

  /**
   * 重置所有指标
   */
  resetMetrics(): void {
    resetAllLearningMetrics();
  }
}

export const learningMetricsService = new LearningMetricsService();
export default learningMetricsService;
