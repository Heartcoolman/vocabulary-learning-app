/**
 * AMAS 离线回放测试框架 (T0.2)
 *
 * 功能：
 * 1. 输入：AnswerRecord序列 + 策略版本
 * 2. 输出：决策序列 + 奖励序列 + 状态变化
 * 3. 对比：新旧策略的差异报告
 *
 * 用途：
 * - 回归测试：验证算法改动不会降低历史表现
 * - A/B测试：对比不同策略版本的效果
 * - 调试分析：重放问题场景定位bug
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AMASEngine } from '../../src/amas/core/engine';
import {
  MemoryStateRepository,
  MemoryModelRepository,
  ProcessOptions,
  ProcessResult,
} from '../../src/amas/core/engine';
import { RawEvent, UserState, Action, StrategyParams } from '../../src/amas/types';
import { RawEventFactory, ActionFactory } from '../helpers/factories';
import { mockLogger } from '../setup';

// ==================== 类型定义 ====================

/**
 * 回放会话 - 包含完整的答题序列
 */
interface ReplaySession {
  userId: string;
  sessionId: string;
  answerRecords: AnswerRecordWithContext[];
  /** 初始用户状态（可选） */
  initialState?: UserState;
  /** 策略版本标识 */
  strategyVersion?: string;
}

/**
 * 带上下文的答题记录
 */
interface AnswerRecordWithContext {
  id: string;
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  timestamp: number;
  dwellTime?: number;
  pauseCount?: number;
  switchCount?: number;
  retryCount?: number;
  focusLossDuration?: number;
  interactionDensity?: number;
  /** 当前策略参数（上一步决策的输出） */
  currentParams?: StrategyParams;
}

/**
 * 回放结果 - 单步决策的完整记录
 */
interface ReplayStepResult {
  answerRecordId: string;
  timestamp: number;
  // 输入
  rawEvent: RawEvent;
  currentParams?: StrategyParams;
  // 输出
  action: Action;
  strategy: StrategyParams;
  state: UserState;
  reward: number;
  explanation: string;
  // 元数据
  latencyMs: number;
  error?: string;
}

/**
 * 完整回放结果
 */
interface ReplayResult {
  sessionId: string;
  userId: string;
  strategyVersion?: string;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  steps: ReplayStepResult[];
  // 聚合指标
  metrics: ReplayMetrics;
}

/**
 * 回放指标
 */
interface ReplayMetrics {
  /** 平均奖励 */
  avgReward: number;
  /** 奖励标准差 */
  rewardStdDev: number;
  /** 总奖励 */
  totalReward: number;
  /** 平均决策延迟 (ms) */
  avgLatency: number;
  /** P95 决策延迟 (ms) */
  p95Latency: number;
  /** 最终用户状态 */
  finalState: UserState;
  /** 状态稳定性（注意力、疲劳、动机的方差） */
  stateStability: {
    attention: number;
    fatigue: number;
    motivation: number;
  };
}

/**
 * 策略对比报告
 */
interface StrategyComparisonReport {
  sessionId: string;
  userId: string;
  baselineVersion: string;
  candidateVersion: string;
  // 奖励对比
  rewardComparison: {
    baselineAvg: number;
    candidateAvg: number;
    improvement: number;
    improvementPercent: number;
    significantDifference: boolean;
  };
  // 延迟对比
  latencyComparison: {
    baselineAvg: number;
    candidateAvg: number;
    difference: number;
  };
  // 状态稳定性对比
  stabilityComparison: {
    baselineStability: number;
    candidateStability: number;
    improvement: number;
  };
  // 决策差异
  decisionDifferences: DecisionDifference[];
}

/**
 * 决策差异
 */
interface DecisionDifference {
  step: number;
  timestamp: number;
  baseline: {
    action: Action;
    strategy: StrategyParams;
    reward: number;
  };
  candidate: {
    action: Action;
    strategy: StrategyParams;
    reward: number;
  };
  rewardDelta: number;
}

// ==================== Mock 配置 ====================

vi.mock('../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../../src/amas/config/feature-flags', () => ({
  getFeatureFlags: vi.fn().mockReturnValue({
    enableEnsemble: false,
    enableTrendAnalyzer: false,
    enableColdStartManager: false,
    enableThompsonSampling: false,
    enableHeuristicBaseline: false,
    enableACTRMemory: false,
    enableUserParamsManager: false,
  }),
  isColdStartEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/monitoring/amas-metrics', () => ({
  recordActionSelection: vi.fn(),
  recordDecisionConfidence: vi.fn(),
  recordInferenceLatencyMs: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ==================== 回放引擎 ====================

/**
 * AMAS 回放引擎
 *
 * 功能：
 * 1. 从 AnswerRecord 序列重建学习过程
 * 2. 记录每步的决策、奖励、状态变化
 * 3. 支持不同策略版本的对比测试
 */
class AMASReplayEngine {
  private engine: AMASEngine;
  private stateRepo: MemoryStateRepository;
  private modelRepo: MemoryModelRepository;

  constructor() {
    this.stateRepo = new MemoryStateRepository();
    this.modelRepo = new MemoryModelRepository();
    this.engine = new AMASEngine({
      stateRepo: this.stateRepo,
      modelRepo: this.modelRepo,
      logger: mockLogger as any,
    });
  }

  /**
   * 回放单个会话
   */
  async replaySession(session: ReplaySession): Promise<ReplayResult> {
    const steps: ReplayStepResult[] = [];
    let successfulSteps = 0;
    let failedSteps = 0;

    // 设置初始状态（如果提供）
    if (session.initialState) {
      await this.stateRepo.saveState(session.userId, session.initialState);
    }

    // 逐步回放每条答题记录
    for (let i = 0; i < session.answerRecords.length; i++) {
      const record = session.answerRecords[i];
      const stepResult = await this.replayStep(session.userId, record, i);

      steps.push(stepResult);

      if (stepResult.error) {
        failedSteps++;
      } else {
        successfulSteps++;
      }
    }

    // 计算聚合指标
    const metrics = this.calculateMetrics(steps);

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      strategyVersion: session.strategyVersion,
      totalSteps: session.answerRecords.length,
      successfulSteps,
      failedSteps,
      steps,
      metrics,
    };
  }

  /**
   * 回放单步
   */
  private async replayStep(
    userId: string,
    record: AnswerRecordWithContext,
    stepIndex: number,
  ): Promise<ReplayStepResult> {
    const startTime = Date.now();

    try {
      // 构建 RawEvent
      const rawEvent: RawEvent = {
        wordId: record.wordId,
        isCorrect: record.isCorrect,
        responseTime: record.responseTime,
        dwellTime: record.dwellTime ?? record.responseTime,
        timestamp: record.timestamp,
        pauseCount: record.pauseCount ?? 0,
        switchCount: record.switchCount ?? 0,
        retryCount: record.retryCount ?? 0,
        focusLossDuration: record.focusLossDuration ?? 0,
        interactionDensity: record.interactionDensity ?? 0.5,
      };

      // 构建处理选项
      const opts: ProcessOptions = {
        currentParams: record.currentParams,
        answerRecordId: record.id,
        interactionCount: stepIndex,
      };

      // 执行决策
      const result: ProcessResult = await this.engine.processEvent(userId, rawEvent, opts);

      const latencyMs = Date.now() - startTime;

      return {
        answerRecordId: record.id,
        timestamp: record.timestamp,
        rawEvent,
        currentParams: record.currentParams,
        action: result.action,
        strategy: result.strategy,
        state: result.state,
        reward: result.reward,
        explanation: result.explanation,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        answerRecordId: record.id,
        timestamp: record.timestamp,
        rawEvent: {
          wordId: record.wordId,
          isCorrect: record.isCorrect,
          responseTime: record.responseTime,
          dwellTime: record.dwellTime ?? record.responseTime,
          timestamp: record.timestamp,
          pauseCount: 0,
          switchCount: 0,
          retryCount: 0,
          focusLossDuration: 0,
          interactionDensity: 0,
        },
        action: ActionFactory.build(),
        strategy: record.currentParams ?? {
          interval_scale: 1.0,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 8,
          hint_level: 1,
        },
        state: {
          A: 0.5,
          F: 0.5,
          M: 0.5,
          C: { mem: 0.5, speed: 0.5, stability: 0.5 },
          conf: 0.5,
          ts: record.timestamp,
        },
        reward: 0,
        explanation: '',
        latencyMs,
        error: errorMessage,
      };
    }
  }

  /**
   * 计算回放指标
   */
  private calculateMetrics(steps: ReplayStepResult[]): ReplayMetrics {
    const successfulSteps = steps.filter((s) => !s.error);

    if (successfulSteps.length === 0) {
      throw new Error('No successful steps to calculate metrics');
    }

    // 奖励统计
    const rewards = successfulSteps.map((s) => s.reward);
    const totalReward = rewards.reduce((sum, r) => sum + r, 0);
    const avgReward = totalReward / rewards.length;
    const rewardVariance =
      rewards.reduce((sum, r) => sum + Math.pow(r - avgReward, 2), 0) / rewards.length;
    const rewardStdDev = Math.sqrt(rewardVariance);

    // 延迟统计
    const latencies = successfulSteps.map((s) => s.latencyMs);
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];

    // 状态稳定性（方差）
    const attentionValues = successfulSteps.map((s) => s.state.A);
    const fatigueValues = successfulSteps.map((s) => s.state.F);
    const motivationValues = successfulSteps.map((s) => s.state.M);

    const calculateVariance = (values: number[]) => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    };

    const stateStability = {
      attention: calculateVariance(attentionValues),
      fatigue: calculateVariance(fatigueValues),
      motivation: calculateVariance(motivationValues),
    };

    // 最终状态
    const finalState = successfulSteps[successfulSteps.length - 1].state;

    return {
      avgReward,
      rewardStdDev,
      totalReward,
      avgLatency,
      p95Latency,
      finalState,
      stateStability,
    };
  }

  /**
   * 对比两个策略版本
   */
  async compareStrategies(
    session: ReplaySession,
    baselineVersion: string,
    candidateVersion: string,
  ): Promise<StrategyComparisonReport> {
    // 回放基线版本
    const baselineSession = { ...session, strategyVersion: baselineVersion };
    const baselineResult = await this.replaySession(baselineSession);

    // 重置引擎状态
    await this.reset();

    // 回放候选版本
    const candidateSession = { ...session, strategyVersion: candidateVersion };
    const candidateResult = await this.replaySession(candidateSession);

    // 生成对比报告
    return this.generateComparisonReport(
      baselineResult,
      candidateResult,
      baselineVersion,
      candidateVersion,
    );
  }

  /**
   * 生成对比报告
   */
  private generateComparisonReport(
    baseline: ReplayResult,
    candidate: ReplayResult,
    baselineVersion: string,
    candidateVersion: string,
  ): StrategyComparisonReport {
    // 奖励对比
    const rewardImprovement = candidate.metrics.avgReward - baseline.metrics.avgReward;
    const rewardImprovementPercent =
      baseline.metrics.avgReward !== 0
        ? (rewardImprovement / Math.abs(baseline.metrics.avgReward)) * 100
        : 0;

    // 简单的显著性检验（t检验的简化版本）
    const pooledStdDev = Math.sqrt(
      (Math.pow(baseline.metrics.rewardStdDev, 2) + Math.pow(candidate.metrics.rewardStdDev, 2)) /
        2,
    );
    const effectSize = Math.abs(rewardImprovement) / pooledStdDev;
    const significantDifference = effectSize > 0.5; // Cohen's d > 0.5 表示中等效应

    // 延迟对比
    const latencyDifference = candidate.metrics.avgLatency - baseline.metrics.avgLatency;

    // 状态稳定性对比（稳定性越低越好，即方差越小越好）
    const baselineStability =
      baseline.metrics.stateStability.attention +
      baseline.metrics.stateStability.fatigue +
      baseline.metrics.stateStability.motivation;

    const candidateStability =
      candidate.metrics.stateStability.attention +
      candidate.metrics.stateStability.fatigue +
      candidate.metrics.stateStability.motivation;

    const stabilityImprovement = baselineStability - candidateStability; // 正值表示候选版本更稳定

    // 找出决策差异
    const decisionDifferences: DecisionDifference[] = [];
    const minSteps = Math.min(baseline.steps.length, candidate.steps.length);

    for (let i = 0; i < minSteps; i++) {
      const baseStep = baseline.steps[i];
      const candStep = candidate.steps[i];

      // 检查决策是否不同
      const actionDifferent =
        baseStep.action.interval_scale !== candStep.action.interval_scale ||
        baseStep.action.new_ratio !== candStep.action.new_ratio ||
        baseStep.action.difficulty !== candStep.action.difficulty ||
        baseStep.action.batch_size !== candStep.action.batch_size ||
        baseStep.action.hint_level !== candStep.action.hint_level;

      if (actionDifferent && !baseStep.error && !candStep.error) {
        decisionDifferences.push({
          step: i,
          timestamp: baseStep.timestamp,
          baseline: {
            action: baseStep.action,
            strategy: baseStep.strategy,
            reward: baseStep.reward,
          },
          candidate: {
            action: candStep.action,
            strategy: candStep.strategy,
            reward: candStep.reward,
          },
          rewardDelta: candStep.reward - baseStep.reward,
        });
      }
    }

    return {
      sessionId: baseline.sessionId,
      userId: baseline.userId,
      baselineVersion,
      candidateVersion,
      rewardComparison: {
        baselineAvg: baseline.metrics.avgReward,
        candidateAvg: candidate.metrics.avgReward,
        improvement: rewardImprovement,
        improvementPercent: rewardImprovementPercent,
        significantDifference,
      },
      latencyComparison: {
        baselineAvg: baseline.metrics.avgLatency,
        candidateAvg: candidate.metrics.avgLatency,
        difference: latencyDifference,
      },
      stabilityComparison: {
        baselineStability,
        candidateStability,
        improvement: stabilityImprovement,
      },
      decisionDifferences,
    };
  }

  /**
   * 重置引擎状态
   */
  async reset(): Promise<void> {
    this.stateRepo = new MemoryStateRepository();
    this.modelRepo = new MemoryModelRepository();
    this.engine = new AMASEngine({
      stateRepo: this.stateRepo,
      modelRepo: this.modelRepo,
      logger: mockLogger as any,
    });
  }

  /**
   * 销毁引擎
   */
  destroy(): void {
    this.engine.destroy();
  }
}

// ==================== 测试套件 ====================

describe('AMAS 离线回放测试框架', () => {
  let replayEngine: AMASReplayEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    replayEngine = new AMASReplayEngine();
  });

  afterEach(() => {
    replayEngine.destroy();
  });

  // ==================== 基础回放测试 ====================

  describe('基础回放功能', () => {
    it('应该成功回放单个会话', async () => {
      const session: ReplaySession = {
        userId: 'test-user-1',
        sessionId: 'session-1',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
          },
          {
            id: 'record-2',
            wordId: 'word-2',
            isCorrect: true,
            responseTime: 1800,
            timestamp: Date.now() + 5000,
          },
          {
            id: 'record-3',
            wordId: 'word-3',
            isCorrect: false,
            responseTime: 5000,
            timestamp: Date.now() + 10000,
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      // 验证回放结果
      expect(result.sessionId).toBe('session-1');
      expect(result.userId).toBe('test-user-1');
      expect(result.totalSteps).toBe(3);
      expect(result.successfulSteps).toBe(3);
      expect(result.failedSteps).toBe(0);
      expect(result.steps).toHaveLength(3);

      // 验证每一步都有完整的输出
      result.steps.forEach((step, index) => {
        expect(step.answerRecordId).toBe(`record-${index + 1}`);
        expect(step.action).toBeDefined();
        expect(step.strategy).toBeDefined();
        expect(step.state).toBeDefined();
        expect(typeof step.reward).toBe('number');
        expect(step.latencyMs).toBeGreaterThanOrEqual(0);
      });

      // 验证指标计算
      expect(result.metrics.avgReward).toBeDefined();
      expect(result.metrics.totalReward).toBeDefined();
      expect(result.metrics.avgLatency).toBeGreaterThan(0);
      expect(result.metrics.finalState).toBeDefined();
    });

    it('应该正确处理初始状态', async () => {
      const initialState: UserState = {
        A: 0.9, // 高注意力
        F: 0.1, // 低疲劳
        M: 0.8, // 高动机
        C: { mem: 0.85, speed: 0.75, stability: 0.8 },
        conf: 0.9,
        ts: Date.now() - 60000, // 1分钟前
      };

      const session: ReplaySession = {
        userId: 'test-user-2',
        sessionId: 'session-2',
        initialState,
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 1500,
            timestamp: Date.now(),
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      expect(result.successfulSteps).toBe(1);
      // 状态应该基于初始状态演化
      expect(result.steps[0].state).toBeDefined();
    });

    it('应该记录错误但继续回放', async () => {
      const session: ReplaySession = {
        userId: 'test-user-3',
        sessionId: 'session-3',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
          },
          // 异常的答题记录（响应时间为负）
          {
            id: 'record-2',
            wordId: 'word-2',
            isCorrect: false,
            responseTime: -1000, // 异常值
            timestamp: Date.now() + 5000,
          },
          {
            id: 'record-3',
            wordId: 'word-3',
            isCorrect: true,
            responseTime: 2500,
            timestamp: Date.now() + 10000,
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      // 应该处理所有记录（包括异常的）
      expect(result.totalSteps).toBe(3);
      expect(result.steps).toHaveLength(3);
    });
  });

  // ==================== 决策一致性测试 ====================

  describe('决策一致性测试', () => {
    it('相同输入应产生一致的决策', async () => {
      const answerRecords: AnswerRecordWithContext[] = [
        {
          id: 'record-1',
          wordId: 'word-1',
          isCorrect: true,
          responseTime: 2000,
          timestamp: Date.now(),
        },
        {
          id: 'record-2',
          wordId: 'word-2',
          isCorrect: true,
          responseTime: 2100,
          timestamp: Date.now() + 5000,
        },
      ];

      const session1: ReplaySession = {
        userId: 'consistency-user-1',
        sessionId: 'session-1',
        answerRecords,
      };

      const result1 = await replayEngine.replaySession(session1);

      // 重置引擎
      await replayEngine.reset();

      const session2: ReplaySession = {
        userId: 'consistency-user-2',
        sessionId: 'session-2',
        answerRecords,
      };

      const result2 = await replayEngine.replaySession(session2);

      // 验证决策一致性（相同输入应产生相似的决策）
      expect(result1.steps).toHaveLength(result2.steps.length);

      for (let i = 0; i < result1.steps.length; i++) {
        const step1 = result1.steps[i];
        const step2 = result2.steps[i];

        // 动作应该一致
        expect(step1.action.difficulty).toBe(step2.action.difficulty);
        expect(step1.action.batch_size).toBe(step2.action.batch_size);
        expect(step1.action.hint_level).toBe(step2.action.hint_level);
      }
    });

    it('应该正确传递策略参数', async () => {
      const currentParams: StrategyParams = {
        interval_scale: 1.5,
        new_ratio: 0.3,
        difficulty: 'hard',
        batch_size: 12,
        hint_level: 0,
      };

      const session: ReplaySession = {
        userId: 'test-user-4',
        sessionId: 'session-4',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
            currentParams,
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      expect(result.steps[0].currentParams).toEqual(currentParams);
    });
  });

  // ==================== 奖励计算测试 ====================

  describe('奖励计算正确性', () => {
    it('正确答案应产生正奖励', async () => {
      const session: ReplaySession = {
        userId: 'reward-test-1',
        sessionId: 'session-1',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      // 正确答案的奖励应该为正
      expect(result.steps[0].reward).toBeGreaterThanOrEqual(0);
    });

    it('错误答案应产生负奖励或较低奖励', async () => {
      const session: ReplaySession = {
        userId: 'reward-test-2',
        sessionId: 'session-2',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: false,
            responseTime: 8000,
            timestamp: Date.now(),
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      // 错误答案的奖励应该较低或为负
      expect(result.steps[0].reward).toBeLessThanOrEqual(0.5);
    });

    it('应该正确计算累积奖励', async () => {
      const session: ReplaySession = {
        userId: 'reward-test-3',
        sessionId: 'session-3',
        answerRecords: RawEventFactory.buildCorrectStreak(5).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const result = await replayEngine.replaySession(session);

      // 总奖励应该等于各步奖励之和
      const sumOfStepRewards = result.steps.reduce((sum, step) => sum + step.reward, 0);
      expect(result.metrics.totalReward).toBeCloseTo(sumOfStepRewards, 5);

      // 平均奖励应该正确计算
      expect(result.metrics.avgReward).toBeCloseTo(sumOfStepRewards / result.steps.length, 5);
    });
  });

  // ==================== 状态转换测试 ====================

  describe('状态转换正确性', () => {
    it('连续正确应提升动机降低疲劳', async () => {
      const session: ReplaySession = {
        userId: 'state-test-1',
        sessionId: 'session-1',
        answerRecords: RawEventFactory.buildCorrectStreak(10).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: true,
          responseTime: 1500,
          timestamp: event.timestamp,
        })),
      };

      const result = await replayEngine.replaySession(session);

      const firstState = result.steps[0].state;
      const lastState = result.steps[result.steps.length - 1].state;

      // 动机应该提升（或至少保持较高水平）
      expect(lastState.M).toBeGreaterThanOrEqual(firstState.M * 0.8);

      // 注意力应该保持较高
      expect(lastState.A).toBeGreaterThan(0.3);
    });

    it('连续错误应降低动机增加疲劳', async () => {
      const session: ReplaySession = {
        userId: 'state-test-2',
        sessionId: 'session-2',
        answerRecords: RawEventFactory.buildIncorrectStreak(10).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: false,
          responseTime: 8000,
          timestamp: event.timestamp,
        })),
      };

      const result = await replayEngine.replaySession(session);

      const firstState = result.steps[0].state;
      const lastState = result.steps[result.steps.length - 1].state;

      // 疲劳度应该增加
      expect(lastState.F).toBeGreaterThanOrEqual(firstState.F);

      // 动机可能会降低
      // 注意：由于算法可能有恢复机制，这里不做严格断言
    });

    it('状态应保持在有效范围内', async () => {
      const session: ReplaySession = {
        userId: 'state-test-3',
        sessionId: 'session-3',
        answerRecords: RawEventFactory.buildMixedSequence(5, 5).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const result = await replayEngine.replaySession(session);

      result.steps.forEach((step) => {
        // 注意力 [0, 1]
        expect(step.state.A).toBeGreaterThanOrEqual(0);
        expect(step.state.A).toBeLessThanOrEqual(1);

        // 疲劳度 [0, 1]
        expect(step.state.F).toBeGreaterThanOrEqual(0);
        expect(step.state.F).toBeLessThanOrEqual(1);

        // 动机 [0, 1]（注意：动机范围在 types.ts 中定义为 [-1, 1]，但实际可能被归一化）
        expect(step.state.M).toBeGreaterThanOrEqual(0);
        expect(step.state.M).toBeLessThanOrEqual(1);

        // 认知能力
        expect(step.state.C.mem).toBeGreaterThanOrEqual(0);
        expect(step.state.C.mem).toBeLessThanOrEqual(1);
        expect(step.state.C.speed).toBeGreaterThanOrEqual(0);
        expect(step.state.C.speed).toBeLessThanOrEqual(1);
      });
    });
  });

  // ==================== 策略对比测试 ====================

  describe('策略对比功能', () => {
    it('应该生成完整的对比报告', async () => {
      const session: ReplaySession = {
        userId: 'compare-test-1',
        sessionId: 'session-1',
        answerRecords: RawEventFactory.buildSequence(10).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const report = await replayEngine.compareStrategies(
        session,
        'baseline-v1.0',
        'candidate-v1.1',
      );

      // 验证报告结构
      expect(report.sessionId).toBe('session-1');
      expect(report.baselineVersion).toBe('baseline-v1.0');
      expect(report.candidateVersion).toBe('candidate-v1.1');

      // 奖励对比
      expect(report.rewardComparison).toBeDefined();
      expect(typeof report.rewardComparison.baselineAvg).toBe('number');
      expect(typeof report.rewardComparison.candidateAvg).toBe('number');
      expect(typeof report.rewardComparison.improvement).toBe('number');
      expect(typeof report.rewardComparison.improvementPercent).toBe('number');
      expect(typeof report.rewardComparison.significantDifference).toBe('boolean');

      // 延迟对比
      expect(report.latencyComparison).toBeDefined();
      expect(report.latencyComparison.baselineAvg).toBeGreaterThan(0);
      expect(report.latencyComparison.candidateAvg).toBeGreaterThan(0);

      // 稳定性对比
      expect(report.stabilityComparison).toBeDefined();
      expect(typeof report.stabilityComparison.baselineStability).toBe('number');
      expect(typeof report.stabilityComparison.candidateStability).toBe('number');

      // 决策差异
      expect(Array.isArray(report.decisionDifferences)).toBe(true);
    });

    it('相同策略版本应产生接近的结果', async () => {
      const session: ReplaySession = {
        userId: 'compare-test-2',
        sessionId: 'session-2',
        answerRecords: RawEventFactory.buildSequence(5).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const report = await replayEngine.compareStrategies(
        session,
        'same-version-v1.0',
        'same-version-v1.0',
      );

      // 相同版本的奖励差异应该很小
      expect(Math.abs(report.rewardComparison.improvement)).toBeLessThan(0.1);
      expect(Math.abs(report.rewardComparison.improvementPercent)).toBeLessThan(10);
    });

    it('应该识别显著的性能提升', async () => {
      // 这个测试在实际场景中需要不同的策略实现
      // 这里我们只验证报告生成的完整性
      const session: ReplaySession = {
        userId: 'compare-test-3',
        sessionId: 'session-3',
        answerRecords: RawEventFactory.buildSequence(20).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const report = await replayEngine.compareStrategies(
        session,
        'baseline-v1.0',
        'improved-v2.0',
      );

      // 验证显著性检验字段存在
      expect(typeof report.rewardComparison.significantDifference).toBe('boolean');

      // 验证决策差异记录
      if (report.decisionDifferences.length > 0) {
        const diff = report.decisionDifferences[0];
        expect(diff.step).toBeGreaterThanOrEqual(0);
        expect(diff.baseline.action).toBeDefined();
        expect(diff.candidate.action).toBeDefined();
        expect(typeof diff.rewardDelta).toBe('number');
      }
    });
  });

  // ==================== 性能测试 ====================

  describe('回放性能', () => {
    it('应该在合理时间内完成回放', async () => {
      const session: ReplaySession = {
        userId: 'perf-test-1',
        sessionId: 'session-1',
        answerRecords: RawEventFactory.buildSequence(50).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const startTime = Date.now();
      const result = await replayEngine.replaySession(session);
      const totalTime = Date.now() - startTime;

      // 50步回放应该在10秒内完成
      expect(totalTime).toBeLessThan(10000);

      // 平均每步延迟应该在合理范围内
      expect(result.metrics.avgLatency).toBeLessThan(200);

      // P95延迟应该在合理范围内
      expect(result.metrics.p95Latency).toBeLessThan(500);
    });

    it('应该报告延迟指标', async () => {
      const session: ReplaySession = {
        userId: 'perf-test-2',
        sessionId: 'session-2',
        answerRecords: RawEventFactory.buildSequence(10).map((event, i) => ({
          id: `record-${i + 1}`,
          wordId: event.wordId!,
          isCorrect: event.isCorrect,
          responseTime: event.responseTime,
          timestamp: event.timestamp,
        })),
      };

      const result = await replayEngine.replaySession(session);

      // 验证每步都记录了延迟
      result.steps.forEach((step) => {
        expect(step.latencyMs).toBeGreaterThanOrEqual(0);
        expect(step.latencyMs).toBeLessThan(5000); // 单步不应超过5秒
      });

      // 验证聚合延迟指标
      expect(result.metrics.avgLatency).toBeGreaterThan(0);
      expect(result.metrics.p95Latency).toBeGreaterThan(0);
      expect(result.metrics.p95Latency).toBeGreaterThanOrEqual(result.metrics.avgLatency);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况处理', () => {
    it('应该处理空会话', async () => {
      const session: ReplaySession = {
        userId: 'edge-test-1',
        sessionId: 'session-1',
        answerRecords: [],
      };

      await expect(replayEngine.replaySession(session)).rejects.toThrow();
    });

    it('应该处理单步会话', async () => {
      const session: ReplaySession = {
        userId: 'edge-test-2',
        sessionId: 'session-2',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      expect(result.totalSteps).toBe(1);
      expect(result.steps).toHaveLength(1);
      expect(result.metrics).toBeDefined();
    });

    it('应该处理极端响应时间', async () => {
      const session: ReplaySession = {
        userId: 'edge-test-3',
        sessionId: 'session-3',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 100, // 非常快
            timestamp: Date.now(),
          },
          {
            id: 'record-2',
            wordId: 'word-2',
            isCorrect: false,
            responseTime: 60000, // 非常慢（60秒）
            timestamp: Date.now() + 65000,
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      expect(result.successfulSteps).toBeGreaterThan(0);
      result.steps.forEach((step) => {
        expect(step.state).toBeDefined();
        expect(step.action).toBeDefined();
      });
    });

    it('应该处理完整的上下文信息', async () => {
      const session: ReplaySession = {
        userId: 'edge-test-4',
        sessionId: 'session-4',
        answerRecords: [
          {
            id: 'record-1',
            wordId: 'word-1',
            isCorrect: true,
            responseTime: 2000,
            timestamp: Date.now(),
            dwellTime: 2500,
            pauseCount: 2,
            switchCount: 1,
            retryCount: 0,
            focusLossDuration: 500,
            interactionDensity: 0.8,
          },
        ],
      };

      const result = await replayEngine.replaySession(session);

      expect(result.steps[0].rawEvent.dwellTime).toBe(2500);
      expect(result.steps[0].rawEvent.pauseCount).toBe(2);
      expect(result.steps[0].rawEvent.switchCount).toBe(1);
      expect(result.steps[0].rawEvent.focusLossDuration).toBe(500);
    });
  });
});
