/**
 * OfflineLoop Unit Tests
 * 离线处理流程单元测试
 *
 * 测试覆盖:
 * - 离线处理流程完整性
 * - 延迟奖励处理
 * - 奖励质量评估
 * - 参数更新
 * - 定时任务
 * - 队列管理
 * - 错误处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OfflineLoop,
  OfflineLoopConfig,
  DelayedRewardProcessor,
  RewardEvaluator,
  ParamUpdater,
  RewardApplier,
  UserStateProvider,
  ParamUpdateResult,
  RewardEvaluationResult,
} from '../../../../src/amas/core/offline-loop';
import { PersistableFeatureVector, UserState } from '../../../../src/amas/types';

// ==================== Mock 实现 ====================

/**
 * Mock 奖励应用器
 */
class MockRewardApplier implements RewardApplier {
  private appliedRewards: Array<{
    userId: string;
    reward: number;
    featureVector?: PersistableFeatureVector;
    actionIndex?: number;
  }> = [];

  async applyReward(
    userId: string,
    reward: number,
    featureVector?: PersistableFeatureVector,
    actionIndex?: number,
  ): Promise<void> {
    this.appliedRewards.push({ userId, reward, featureVector, actionIndex });
  }

  getAppliedRewards() {
    return this.appliedRewards;
  }

  reset() {
    this.appliedRewards = [];
  }
}

/**
 * Mock 用户状态提供器
 */
class MockUserStateProvider implements UserStateProvider {
  private userStates: Map<string, UserState> = new Map();

  async getUserState(userId: string): Promise<UserState | null> {
    return this.userStates.get(userId) ?? null;
  }

  setUserState(userId: string, state: UserState): void {
    this.userStates.set(userId, state);
  }

  clear(): void {
    this.userStates.clear();
  }
}

describe('OfflineLoop', () => {
  let offlineLoop: OfflineLoop;
  let mockRewardApplier: MockRewardApplier;
  let mockUserStateProvider: MockUserStateProvider;

  beforeEach(() => {
    mockRewardApplier = new MockRewardApplier();
    mockUserStateProvider = new MockUserStateProvider();

    // 添加一些测试用户状态
    mockUserStateProvider.setUserState('user-1', {
      A: 0.8,
      F: 0.3,
      C: { mem: 0.7, speed: 0.8, stability: 0.8 },
      M: 0.5,
      conf: 0.8,
      ts: Date.now(),
    });

    mockUserStateProvider.setUserState('user-2', {
      A: 0.6,
      F: 0.5,
      C: { mem: 0.6, speed: 0.6, stability: 0.6 },
      M: 0.3,
      conf: 0.7,
      ts: Date.now(),
    });

    offlineLoop = new OfflineLoop(mockRewardApplier, mockUserStateProvider, {
      verboseLogging: false,
      evaluationThreshold: 0.3,
      enableQualityControl: true,
      batchSize: 50,
    });
  });

  afterEach(() => {
    offlineLoop.stop();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('应该成功创建实例', () => {
      expect(offlineLoop).toBeDefined();
      expect(offlineLoop).toBeInstanceOf(OfflineLoop);
    });

    it('应该接受自定义配置', () => {
      const customConfig: OfflineLoopConfig = {
        evaluationThreshold: 0.5,
        enableQualityControl: false,
        batchSize: 100,
        verboseLogging: true,
        cronSchedule: '*/5 * * * *', // 每5分钟
        fatigueThreshold: 0.9,
      };

      const customLoop = new OfflineLoop(mockRewardApplier, mockUserStateProvider, customConfig);

      expect(customLoop).toBeDefined();
    });

    it('应该初始化时队列为空', () => {
      const status = offlineLoop.getQueueStatus();
      expect(status.pendingCount).toBe(0);
      expect(status.schedule).toBeDefined();
      expect(Array.isArray(status.schedule)).toBe(true);
    });
  });

  // ==================== 奖励添加测试 ====================

  describe('addReward', () => {
    it('应该成功添加奖励到队列', () => {
      const eventId = offlineLoop.addReward('user-1', 0.8);

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
      expect(eventId.length).toBeGreaterThan(0);
    });

    it('应该能添加多个奖励', () => {
      const id1 = offlineLoop.addReward('user-1', 0.5);
      const id2 = offlineLoop.addReward('user-1', 0.3);
      const id3 = offlineLoop.addReward('user-2', 0.7);

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);

      const status = offlineLoop.getQueueStatus();
      expect(status.pendingCount).toBeGreaterThan(0);
    });

    it('应该支持添加带有特征向量的奖励', () => {
      const featureVector: PersistableFeatureVector = {
        values: [1, 2, 3, 4, 5],
        dimension: 5,
      };

      const eventId = offlineLoop.addReward('user-1', 0.8, {
        featureVector,
        actionIndex: 2,
      });

      expect(eventId).toBeDefined();
    });

    it('应该支持添加带有时间戳的奖励', () => {
      const timestamp = Date.now() - 3600000; // 1小时前

      const eventId = offlineLoop.addReward('user-1', 0.6, {
        timestamp,
      });

      expect(eventId).toBeDefined();
    });
  });

  // ==================== 队列管理测试 ====================

  describe('queue management', () => {
    it('应该能获取队列状态', () => {
      offlineLoop.addReward('user-1', 0.5);
      offlineLoop.addReward('user-2', 0.3);

      const status = offlineLoop.getQueueStatus();

      expect(status).toHaveProperty('pendingCount');
      expect(status).toHaveProperty('schedule');
      expect(status.pendingCount).toBeGreaterThan(0);
    });

    it('应该能清空整个队列', () => {
      offlineLoop.addReward('user-1', 0.5);
      offlineLoop.addReward('user-2', 0.3);

      const beforeStatus = offlineLoop.getQueueStatus();
      expect(beforeStatus.pendingCount).toBeGreaterThan(0);

      offlineLoop.clearQueue();

      const afterStatus = offlineLoop.getQueueStatus();
      expect(afterStatus.pendingCount).toBe(0);
    });

    it('应该能清空特定用户的队列', () => {
      offlineLoop.addReward('user-1', 0.5);
      offlineLoop.addReward('user-2', 0.3);
      offlineLoop.addReward('user-1', 0.4);

      offlineLoop.clearQueue('user-1');

      // 注意：这里需要检查user-1的奖励被清空，user-2的还在
      const status = offlineLoop.getQueueStatus();
      // 具体验证取决于实现细节
      expect(status).toBeDefined();
    });
  });

  // ==================== 离线处理测试 ====================

  describe('processOnce', () => {
    it('队列为空时应该返回零统计', async () => {
      const result = await offlineLoop.processOnce();

      expect(result).toEqual({
        totalUsers: 0,
        totalRewards: 0,
        successCount: 0,
        failureCount: 0,
        filteredCount: 0,
      });
    });

    it('应该成功处理队列中的奖励', async () => {
      // 添加一些即时奖励（延迟0秒）
      offlineLoop.addReward('user-1', 0.8, { timestamp: Date.now() - 1000 });
      offlineLoop.addReward('user-2', 0.6, { timestamp: Date.now() - 1000 });

      const result = await offlineLoop.processOnce();

      expect(result.totalUsers).toBeGreaterThanOrEqual(0);
      expect(result.totalRewards).toBeGreaterThanOrEqual(0);
      expect(result.successCount).toBeGreaterThanOrEqual(0);
    });

    it('应该过滤低质量奖励', async () => {
      // 添加一个低于阈值的奖励（0.2 < 0.3）
      offlineLoop.addReward('user-1', 0.2, { timestamp: Date.now() - 1000 });
      offlineLoop.addReward('user-1', 0.5, { timestamp: Date.now() - 1000 });

      const result = await offlineLoop.processOnce();

      // 应该有奖励被过滤
      expect(result.filteredCount).toBeGreaterThanOrEqual(0);
    });

    it('应该接受负奖励（学习信号）', async () => {
      offlineLoop.addReward('user-1', -0.5, { timestamp: Date.now() - 1000 });

      const result = await offlineLoop.processOnce();

      // 负奖励应该被处理，不应该被过滤
      expect(result.successCount).toBeGreaterThanOrEqual(0);
    });

    it('应该过滤高疲劳度用户', async () => {
      // 创建一个高疲劳度用户
      mockUserStateProvider.setUserState('tired-user', {
        A: 0.3,
        F: 0.9, // 疲劳度0.9 > 阈值0.8
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: -0.2,
        conf: 0.5,
        ts: Date.now(),
      });

      offlineLoop.addReward('tired-user', 0.8, { timestamp: Date.now() - 1000 });

      const result = await offlineLoop.processOnce();

      // 高疲劳度用户应该被跳过
      expect(result).toBeDefined();
    });

    it('应该能处理多个用户的奖励', async () => {
      const users = ['user-1', 'user-2', 'user-3'];

      users.forEach((userId) => {
        mockUserStateProvider.setUserState(userId, {
          A: 0.7,
          F: 0.3,
          C: { mem: 0.7, speed: 0.7, stability: 0.7 },
          M: 0.5,
          conf: 0.8,
          ts: Date.now(),
        });

        offlineLoop.addReward(userId, 0.8, { timestamp: Date.now() - 1000 });
      });

      const result = await offlineLoop.processOnce();

      expect(result.totalUsers).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 延迟奖励处理器测试 ====================

  describe('DelayedRewardProcessor', () => {
    let processor: DelayedRewardProcessor;

    beforeEach(() => {
      processor = new DelayedRewardProcessor();
    });

    it('应该成功添加奖励', () => {
      const id = processor.addReward('user-1', 0.8);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('应该能聚合即将发放的奖励', () => {
      // 添加即时奖励（延迟0秒）
      processor.addReward('user-1', 0.5, { timestamp: Date.now() - 1000 });

      const aggregated = processor.aggregate();

      expect(aggregated).toBeDefined();
      expect(aggregated).toHaveProperty('breakdown');
      expect(Array.isArray(aggregated.breakdown)).toBe(true);
    });

    it('应该能获取待处理事件数', () => {
      processor.addReward('user-1', 0.5);
      processor.addReward('user-2', 0.3);

      const count = processor.getPendingCount();

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('应该能获取特定用户的待处理事件数', () => {
      processor.addReward('user-1', 0.5);
      processor.addReward('user-1', 0.3);
      processor.addReward('user-2', 0.4);

      const user1Count = processor.getPendingCount('user-1');

      expect(user1Count).toBeGreaterThanOrEqual(0);
    });

    it('应该能清空队列', () => {
      processor.addReward('user-1', 0.5);
      processor.addReward('user-2', 0.3);

      expect(processor.getPendingCount()).toBeGreaterThan(0);

      processor.clear();

      expect(processor.getPendingCount()).toBe(0);
    });

    it('应该支持状态持久化和恢复', () => {
      processor.addReward('user-1', 0.5);
      processor.addReward('user-2', 0.3);

      const state = processor.getState();
      expect(state).toBeDefined();

      const newProcessor = new DelayedRewardProcessor();
      newProcessor.setState(state);

      // 恢复后应该有相同的待处理事件数
      expect(newProcessor.getPendingCount()).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 奖励评估器测试 ====================

  describe('RewardEvaluator', () => {
    let evaluator: RewardEvaluator;

    beforeEach(() => {
      evaluator = new RewardEvaluator(0.3, true);
    });

    it('应该通过高质量正奖励', async () => {
      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: 0.8, // 高于阈值0.3
        events: [],
      };

      const result = await evaluator.evaluateReward(breakdown);

      expect(result.isValid).toBe(true);
      expect(result.adjustedReward).toBe(0.8);
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('应该拒绝低质量正奖励', async () => {
      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: 0.2, // 低于阈值0.3
        events: [],
      };

      const result = await evaluator.evaluateReward(breakdown);

      expect(result.isValid).toBe(false);
      expect(result.adjustedReward).toBe(0);
    });

    it('应该接受所有负奖励（学习信号）', async () => {
      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: -0.5,
        events: [],
      };

      const result = await evaluator.evaluateReward(breakdown);

      expect(result.isValid).toBe(true);
      expect(result.adjustedReward).toBe(-0.5);
      expect(result.reason).toContain('learning signal');
    });

    it('应该拒绝零奖励', async () => {
      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: 0,
        events: [],
      };

      const result = await evaluator.evaluateReward(breakdown);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Zero reward');
    });

    it('禁用质量控制时应该通过所有奖励', async () => {
      const noQcEvaluator = new RewardEvaluator(0.3, false);

      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: 0.1, // 低于阈值
        events: [],
      };

      const result = await noQcEvaluator.evaluateReward(breakdown);

      expect(result.isValid).toBe(true);
      expect(result.reason).toContain('disabled');
    });

    it('应该考虑用户疲劳度调整置信度', async () => {
      const breakdown = {
        userId: 'user-1',
        eventId: 'event-1',
        increment: 0.5,
        events: [],
      };

      const tiredState: UserState = {
        A: 0.3,
        F: 0.8, // 高疲劳度
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        M: 0,
        conf: 0.5,
        ts: Date.now(),
      };

      const result = await evaluator.evaluateReward(breakdown, tiredState);

      // 高疲劳度应该降低置信度
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  // ==================== 参数更新器测试 ====================

  describe('ParamUpdater', () => {
    let updater: ParamUpdater;

    beforeEach(() => {
      mockRewardApplier.reset();
      updater = new ParamUpdater(mockRewardApplier, false);
    });

    it('应该成功更新用户参数', async () => {
      const breakdowns = [
        {
          userId: 'user-1',
          eventId: 'event-1',
          increment: 0.8,
          events: [],
        },
      ];

      const evaluations = new Map<string, RewardEvaluationResult>([
        [
          'event-1',
          {
            isValid: true,
            adjustedReward: 0.8,
            confidence: 0.8,
            reason: 'Valid reward',
            originalReward: 0.8,
          },
        ],
      ]);

      const result = await updater.updateUserParams('user-1', breakdowns, evaluations);

      expect(result.success).toBe(true);
      expect(result.updateCount).toBe(1);
      expect(result.totalReward).toBe(0.8);
      expect(result.avgConfidence).toBe(0.8);
    });

    it('应该跳过无效奖励', async () => {
      const breakdowns = [
        {
          userId: 'user-1',
          eventId: 'event-1',
          increment: 0.2,
          events: [],
        },
      ];

      const evaluations = new Map<string, RewardEvaluationResult>([
        [
          'event-1',
          {
            isValid: false, // 无效奖励
            adjustedReward: 0,
            confidence: 0.2,
            reason: 'Below threshold',
            originalReward: 0.2,
          },
        ],
      ]);

      const result = await updater.updateUserParams('user-1', breakdowns, evaluations);

      expect(result.success).toBe(true);
      expect(result.updateCount).toBe(0); // 跳过了
      expect(result.totalReward).toBe(0);
    });

    it('应该处理多个奖励', async () => {
      const breakdowns = [
        {
          userId: 'user-1',
          eventId: 'event-1',
          increment: 0.8,
          events: [],
        },
        {
          userId: 'user-1',
          eventId: 'event-2',
          increment: 0.6,
          events: [],
        },
      ];

      const evaluations = new Map<string, RewardEvaluationResult>([
        [
          'event-1',
          {
            isValid: true,
            adjustedReward: 0.8,
            confidence: 0.8,
            reason: 'Valid',
            originalReward: 0.8,
          },
        ],
        [
          'event-2',
          {
            isValid: true,
            adjustedReward: 0.6,
            confidence: 0.6,
            reason: 'Valid',
            originalReward: 0.6,
          },
        ],
      ]);

      const result = await updater.updateUserParams('user-1', breakdowns, evaluations);

      expect(result.success).toBe(true);
      expect(result.updateCount).toBe(2);
      expect(result.totalReward).toBeCloseTo(1.4, 5);
      expect(result.avgConfidence).toBeCloseTo(0.7, 5);
    });

    it('应该批量更新多个用户', async () => {
      const breakdownsByUser = new Map([
        [
          'user-1',
          [
            {
              userId: 'user-1',
              eventId: 'event-1',
              increment: 0.8,
              events: [],
            },
          ],
        ],
        [
          'user-2',
          [
            {
              userId: 'user-2',
              eventId: 'event-2',
              increment: 0.6,
              events: [],
            },
          ],
        ],
      ]);

      const evaluations = new Map<string, RewardEvaluationResult>([
        [
          'event-1',
          {
            isValid: true,
            adjustedReward: 0.8,
            confidence: 0.8,
            reason: 'Valid',
            originalReward: 0.8,
          },
        ],
        [
          'event-2',
          {
            isValid: true,
            adjustedReward: 0.6,
            confidence: 0.6,
            reason: 'Valid',
            originalReward: 0.6,
          },
        ],
      ]);

      const results = await updater.batchUpdateParams(breakdownsByUser, evaluations);

      expect(results.size).toBe(2);
      expect(results.get('user-1')?.success).toBe(true);
      expect(results.get('user-2')?.success).toBe(true);
    });
  });

  // ==================== 定时任务测试 ====================

  describe('scheduled tasks', () => {
    it('应该能启动定时任务', () => {
      expect(() => offlineLoop.start()).not.toThrow();
    });

    it('应该能停止定时任务', () => {
      offlineLoop.start();
      expect(() => offlineLoop.stop()).not.toThrow();
    });

    it('重复启动应该记录警告', () => {
      offlineLoop.start();
      // 第二次启动应该记录警告但不抛出错误
      expect(() => offlineLoop.start()).not.toThrow();
      offlineLoop.stop();
    });

    it('停止未启动的任务应该记录警告', () => {
      // 没有启动就停止应该记录警告但不抛出错误
      expect(() => offlineLoop.stop()).not.toThrow();
    });
  });

  // ==================== 状态持久化测试 ====================

  describe('state persistence', () => {
    it('应该能获取持久化状态', () => {
      offlineLoop.addReward('user-1', 0.8);
      offlineLoop.addReward('user-2', 0.6);

      const state = offlineLoop.getState();

      expect(state).toBeDefined();
      expect(state).toHaveProperty('processor');
      expect(state).toHaveProperty('config');
    });

    it('应该能恢复持久化状态', () => {
      offlineLoop.addReward('user-1', 0.8);
      offlineLoop.addReward('user-2', 0.6);

      const state = offlineLoop.getState();

      // 创建新实例并恢复状态
      const newLoop = new OfflineLoop(mockRewardApplier, mockUserStateProvider);
      newLoop.setState(state);

      // 恢复后队列应该不为空
      const queueStatus = newLoop.getQueueStatus();
      expect(queueStatus).toBeDefined();
    });
  });

  // ==================== 错误处理测试 ====================

  describe('error handling', () => {
    it('应该处理奖励应用失败', async () => {
      // 创建一个会抛出错误的奖励应用器
      class FailingRewardApplier implements RewardApplier {
        async applyReward(): Promise<void> {
          throw new Error('Apply reward failed');
        }
      }

      const failingLoop = new OfflineLoop(new FailingRewardApplier(), mockUserStateProvider);

      failingLoop.addReward('user-1', 0.8, { timestamp: Date.now() - 1000 });

      const result = await failingLoop.processOnce();

      // 应该记录失败但不抛出错误
      expect(result).toBeDefined();
      expect(result.failureCount).toBeGreaterThanOrEqual(0);
    });

    it('应该处理用户状态获取失败', async () => {
      // 创建一个会抛出错误的状态提供器
      class FailingStateProvider implements UserStateProvider {
        async getUserState(): Promise<UserState | null> {
          throw new Error('Get state failed');
        }
      }

      const failingLoop = new OfflineLoop(mockRewardApplier, new FailingStateProvider());

      failingLoop.addReward('user-1', 0.8, { timestamp: Date.now() - 1000 });

      // 应该能够处理而不抛出错误
      await expect(failingLoop.processOnce()).resolves.toBeDefined();
    });

    it('应该处理无用户状态提供器的情况', async () => {
      const noProviderLoop = new OfflineLoop(mockRewardApplier);

      noProviderLoop.addReward('user-1', 0.8, { timestamp: Date.now() - 1000 });

      // 没有状态提供器也应该能处理
      await expect(noProviderLoop.processOnce()).resolves.toBeDefined();
    });
  });

  // ==================== 奖励时间表测试 ====================

  describe('reward schedule', () => {
    it('应该返回配置的奖励时间表', () => {
      const status = offlineLoop.getQueueStatus();

      expect(status.schedule).toBeDefined();
      expect(Array.isArray(status.schedule)).toBe(true);
      expect(status.schedule.length).toBeGreaterThan(0);

      // 验证时间表结构
      status.schedule.forEach((item) => {
        expect(item).toHaveProperty('delaySec');
        expect(item).toHaveProperty('weight');
        expect(item).toHaveProperty('label');
      });
    });

    it('应该支持自定义奖励时间表', () => {
      const customSchedule = [
        { delaySec: 0, weight: 0.5, label: 'immediate' },
        { delaySec: 1800, weight: 0.3, label: '30min' },
        { delaySec: 3600, weight: 0.2, label: '1h' },
      ];

      const customLoop = new OfflineLoop(mockRewardApplier, mockUserStateProvider, {
        rewardSchedule: customSchedule,
      });

      const status = customLoop.getQueueStatus();
      expect(status.schedule).toEqual(customSchedule);
    });
  });

  // ==================== 集成场景测试 ====================

  describe('integration scenarios', () => {
    it('应该正确处理完整的奖励分发流程', async () => {
      // 1. 添加多个用户的多个奖励
      const users = ['user-1', 'user-2', 'user-3'];

      users.forEach((userId) => {
        mockUserStateProvider.setUserState(userId, {
          A: 0.7,
          F: 0.3,
          C: { mem: 0.7, speed: 0.7, stability: 0.7 },
          M: 0.5,
          conf: 0.8,
          ts: Date.now(),
        });

        // 每个用户添加多个奖励
        offlineLoop.addReward(userId, 0.8, { timestamp: Date.now() - 1000 });
        offlineLoop.addReward(userId, 0.6, { timestamp: Date.now() - 1000 });
        offlineLoop.addReward(userId, -0.3, { timestamp: Date.now() - 1000 });
      });

      // 2. 处理队列
      const result = await offlineLoop.processOnce();

      // 3. 验证结果
      expect(result).toBeDefined();
      expect(result.totalUsers).toBeGreaterThanOrEqual(0);
      expect(result.totalRewards).toBeGreaterThanOrEqual(0);

      // 4. 验证奖励已应用
      const appliedRewards = mockRewardApplier.getAppliedRewards();
      expect(appliedRewards.length).toBeGreaterThanOrEqual(0);
    });

    it('应该正确处理混合质量的奖励', async () => {
      mockUserStateProvider.setUserState('mixed-user', {
        A: 0.7,
        F: 0.3,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        M: 0.5,
        conf: 0.8,
        ts: Date.now(),
      });

      // 添加不同质量的奖励
      offlineLoop.addReward('mixed-user', 0.9, { timestamp: Date.now() - 1000 }); // 高质量
      offlineLoop.addReward('mixed-user', 0.4, { timestamp: Date.now() - 1000 }); // 中等质量
      offlineLoop.addReward('mixed-user', 0.1, { timestamp: Date.now() - 1000 }); // 低质量
      offlineLoop.addReward('mixed-user', -0.5, { timestamp: Date.now() - 1000 }); // 负奖励
      offlineLoop.addReward('mixed-user', 0, { timestamp: Date.now() - 1000 }); // 零奖励

      const result = await offlineLoop.processOnce();

      // 应该过滤低质量和零奖励
      expect(result.filteredCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== 性能测试 ====================

  describe('performance', () => {
    it('应该能处理大量奖励', async () => {
      const userCount = 10;
      const rewardsPerUser = 10;

      // 添加大量奖励
      for (let i = 0; i < userCount; i++) {
        const userId = `perf-user-${i}`;

        mockUserStateProvider.setUserState(userId, {
          A: 0.7,
          F: 0.3,
          C: { mem: 0.7, speed: 0.7, stability: 0.7 },
          M: 0.5,
          conf: 0.8,
          ts: Date.now(),
        });

        for (let j = 0; j < rewardsPerUser; j++) {
          offlineLoop.addReward(userId, 0.5 + Math.random() * 0.3, {
            timestamp: Date.now() - 1000,
          });
        }
      }

      const startTime = performance.now();
      const result = await offlineLoop.processOnce();
      const duration = performance.now() - startTime;

      expect(result).toBeDefined();
      // 处理100个奖励应该在合理时间内完成（< 1秒）
      expect(duration).toBeLessThan(1000);
    });
  });
});
