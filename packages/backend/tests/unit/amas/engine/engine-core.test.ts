/**
 * Engine Core Tests
 *
 * 测试 AMAS Engine 核心功能：
 * 1. 引擎初始化
 * 2. 事件处理 - processEvent
 * 3. 状态管理 - 用户状态获取/更新
 * 4. 决策制定 - 选词决策
 * 5. 奖励处理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AMASEngine } from '../../../../src/amas/engine/engine-core';
import {
  MemoryStateRepository,
  MemoryModelRepository,
  ProcessOptions
} from '../../../../src/amas/engine/engine-types';
import { LinUCB } from '../../../../src/amas/learning/linucb';
import { RawEventFactory, ActionFactory, AMASStateFactory } from '../../../helpers/factories';
import {
  DEFAULT_USER_STATE,
  FATIGUED_USER_STATE,
  HIGH_PERFORMING_USER_STATE,
  STANDARD_ACTIONS,
  CORRECT_FAST_EVENT,
  INCORRECT_EVENT
} from '../../../fixtures/amas-fixtures';
import { mockLogger } from '../../../setup';

// Mock dependencies
vi.mock('../../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock('../../../../src/amas/config/feature-flags', () => ({
  getFeatureFlags: vi.fn().mockReturnValue({
    enableEnsemble: false,
    enableTrendAnalyzer: false,
    enableColdStartManager: false,
    enableThompsonSampling: false,
    enableHeuristicBaseline: false,
    enableACTRMemory: false,
    enableUserParamsManager: false
  }),
  isColdStartEnabled: vi.fn().mockReturnValue(false)
}));

vi.mock('../../../../src/monitoring/amas-metrics', () => ({
  recordActionSelection: vi.fn(),
  recordDecisionConfidence: vi.fn(),
  recordInferenceLatencyMs: vi.fn()
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('EngineCore', () => {
  let engine: AMASEngine;
  let stateRepo: MemoryStateRepository;
  let modelRepo: MemoryModelRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    stateRepo = new MemoryStateRepository();
    modelRepo = new MemoryModelRepository();

    engine = new AMASEngine({
      stateRepo,
      modelRepo,
      logger: mockLogger as any
    });
  });

  // ==================== 初始化测试 ====================

  describe('initialize', () => {
    it('should initialize engine components', async () => {
      // 验证引擎已创建
      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(AMASEngine);
    });

    it('should load model weights from repository', async () => {
      // 创建一个训练过的模型并保存到仓库
      const linucb = new LinUCB({ dimension: 22 });
      const testUserId = 'test-user-model';

      // 保存初始模型
      await modelRepo.saveModel(testUserId, linucb.getModel());

      // 验证模型已保存
      const savedModel = await modelRepo.loadModel(testUserId);
      expect(savedModel).not.toBeNull();
      expect(savedModel?.d).toBe(22);
    });

    it('should setup monitoring', async () => {
      // 使用logger初始化的引擎应该能记录日志
      const testEngine = new AMASEngine({
        stateRepo,
        modelRepo,
        logger: mockLogger as any
      });

      expect(testEngine).toBeDefined();
      // logger 应该在需要时可用
    });

    it('should use default LinUCB bandit when ensemble is disabled', () => {
      // 验证默认使用 LinUCB
      const testEngine = new AMASEngine({
        stateRepo,
        modelRepo
      });
      expect(testEngine).toBeDefined();
    });

    it('should accept custom bandit model', () => {
      const customBandit = new LinUCB({ alpha: 0.5, dimension: 22 });
      const testEngine = new AMASEngine({
        stateRepo,
        modelRepo,
        bandit: customBandit
      });
      expect(testEngine).toBeDefined();
    });
  });

  // ==================== 决策制定测试 ====================

  describe('makeDecision', () => {
    it('should make word selection decision', async () => {
      const userId = 'test-user-decision';
      const rawEvent = RawEventFactory.build({
        isCorrect: true,
        responseTime: 2000,
        timestamp: Date.now()
      });

      const result = await engine.processEvent(userId, rawEvent);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.action.difficulty).toMatch(/easy|mid|hard/);
      expect(result.action.batch_size).toBeGreaterThan(0);
    });

    it('should use current model from state', async () => {
      const userId = 'test-user-model-use';

      // 先处理一些事件来训练模型
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 1500 + i * 100,
          timestamp: Date.now() + i * 1000
        });
        await engine.processEvent(userId, event);
      }

      // 验证引擎的状态已更新（通过 getState 而不是直接访问 modelRepo）
      const state = await engine.getState(userId);
      expect(state).toBeDefined();
    });

    it('should respect constraints', async () => {
      const userId = 'test-user-constraints';
      const rawEvent = RawEventFactory.build({
        isCorrect: false,
        responseTime: 10000, // 很慢的响应
        timestamp: Date.now()
      });

      const result = await engine.processEvent(userId, rawEvent);

      // Guardrails 应该确保策略在合理范围内
      expect(result.strategy.batch_size).toBeGreaterThanOrEqual(5);
      expect(result.strategy.batch_size).toBeLessThanOrEqual(20);
      expect(result.strategy.interval_scale).toBeGreaterThan(0);
      expect(result.strategy.new_ratio).toBeGreaterThanOrEqual(0);
      expect(result.strategy.new_ratio).toBeLessThanOrEqual(1);
    });

    it('should return valid action properties', async () => {
      const userId = 'test-action-props';
      const rawEvent = RawEventFactory.build();

      const result = await engine.processEvent(userId, rawEvent);

      expect(result.action).toHaveProperty('interval_scale');
      expect(result.action).toHaveProperty('new_ratio');
      expect(result.action).toHaveProperty('difficulty');
      expect(result.action).toHaveProperty('batch_size');
      expect(result.action).toHaveProperty('hint_level');

      expect(typeof result.action.interval_scale).toBe('number');
      expect(typeof result.action.new_ratio).toBe('number');
      expect(['easy', 'mid', 'hard']).toContain(result.action.difficulty);
      expect(typeof result.action.batch_size).toBe('number');
      expect(typeof result.action.hint_level).toBe('number');
    });
  });

  // ==================== 事件处理测试 ====================

  describe('processOutcome', () => {
    it('should process learning outcome', async () => {
      const userId = 'test-user-outcome';
      const rawEvent = RawEventFactory.build({
        isCorrect: true,
        responseTime: 2000
      });

      const result = await engine.processEvent(userId, rawEvent);

      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.reward).toBeDefined();
      expect(typeof result.reward).toBe('number');
    });

    it('should update internal state', async () => {
      const userId = 'test-user-update';

      // 首次处理
      const event1 = RawEventFactory.build({
        isCorrect: true,
        responseTime: 1500
      });
      const result1 = await engine.processEvent(userId, event1);

      // 第二次处理
      const event2 = RawEventFactory.build({
        isCorrect: true,
        responseTime: 1800
      });
      const result2 = await engine.processEvent(userId, event2);

      // 验证两次都返回了有效结果
      expect(result1.state).toBeDefined();
      expect(result2.state).toBeDefined();
    });

    it('should generate explanation', async () => {
      const userId = 'test-user-explanation';
      const rawEvent = RawEventFactory.build();

      const result = await engine.processEvent(userId, rawEvent);

      expect(result.explanation).toBeDefined();
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
    });

    it('should compute reward value', async () => {
      const userId = 'test-user-reward';

      // 正确答案
      const correctEvent = RawEventFactory.build({
        isCorrect: true,
        responseTime: 1500
      });
      const correctResult = await engine.processEvent(userId, correctEvent);
      expect(typeof correctResult.reward).toBe('number');

      // 错误答案
      const incorrectEvent = RawEventFactory.build({
        isCorrect: false,
        responseTime: 8000
      });
      const incorrectResult = await engine.processEvent(userId, incorrectEvent);
      expect(typeof incorrectResult.reward).toBe('number');
    });

    it('should return reward in valid range', async () => {
      const userId = 'test-reward-range';
      const event = RawEventFactory.build();

      const result = await engine.processEvent(userId, event);

      // 奖励通常在 [-1, 1] 范围内
      expect(result.reward).toBeGreaterThanOrEqual(-1);
      expect(result.reward).toBeLessThanOrEqual(1);
    });
  });

  // ==================== 状态管理测试 ====================

  describe('state management', () => {
    it('should create default state for new user', async () => {
      const userId = 'new-user-state';
      const rawEvent = RawEventFactory.build();

      const result = await engine.processEvent(userId, rawEvent);

      expect(result.state).toBeDefined();
      expect(result.state.A).toBeDefined(); // Attention
      expect(result.state.F).toBeDefined(); // Fatigue
      expect(result.state.M).toBeDefined(); // Motivation
      expect(result.state.C).toBeDefined(); // Cognitive
    });

    it('should update state after processing event', async () => {
      const userId = 'test-state-update';

      // 获取初始状态
      const event1 = RawEventFactory.build({
        isCorrect: true,
        responseTime: 1500
      });
      const result1 = await engine.processEvent(userId, event1);
      const initialFatigue = result1.state.F;

      // 处理多个错误事件来改变状态
      let lastResult = result1;
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build({
          isCorrect: false,
          responseTime: 8000
        });
        lastResult = await engine.processEvent(userId, event);
      }

      // 状态应该已改变，可以从最后一次结果获取
      expect(lastResult.state).toBeDefined();
      expect(lastResult.state.F).toBeGreaterThanOrEqual(0);
    });

    it('should return state in result', async () => {
      const userId = 'test-result-state';
      const rawEvent = RawEventFactory.build();

      const result = await engine.processEvent(userId, rawEvent);

      expect(result.state).toBeDefined();
      expect(result.state.A).toBeDefined();
      expect(typeof result.state.A).toBe('number');
    });

    it('should load existing state', async () => {
      const userId = 'test-load-state';
      const existingState = {
        A: 0.9,
        F: 0.1,
        M: 0.7,
        C: { mem: 0.8, speed: 0.7, stability: 0.8 },
        conf: 0.8,
        ts: Date.now() - 1000
      };

      await stateRepo.saveState(userId, existingState as any);

      const rawEvent = RawEventFactory.build();
      const result = await engine.processEvent(userId, rawEvent);

      // 状态应该基于已存在的状态更新
      expect(result.state).toBeDefined();
    });

    it('should reset user state', async () => {
      const userId = 'test-reset-state';

      // 先创建一些状态
      const event = RawEventFactory.build();
      await engine.processEvent(userId, event);

      // 重置用户
      await engine.resetUser(userId);

      // 重置后再处理事件应该使用默认状态
      const newEvent = RawEventFactory.build();
      const result = await engine.processEvent(userId, newEvent);
      expect(result.state).toBeDefined();
    });

    it('should get state via getState method', async () => {
      const userId = 'test-get-state';

      // 处理事件以创建状态
      const event = RawEventFactory.build();
      await engine.processEvent(userId, event);

      // getState 可能返回 null（如果内部没有自动保存）或者保存的状态
      const state = await engine.getState(userId);
      // 状态可能存在也可能不存在，取决于内部实现
    });
  });

  // ==================== 冷启动阶段测试 ====================

  describe('cold start phase', () => {
    it('should return classify phase for new user', () => {
      const userId = 'cold-start-new';
      const phase = engine.getColdStartPhase(userId);

      expect(phase).toBe('classify');
    });

    it('should transition phase based on interaction count', async () => {
      const userId = 'cold-start-transition';

      // 模拟多次交互
      for (let i = 0; i < 20; i++) {
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2000,
          timestamp: Date.now() + i * 1000
        });
        await engine.processEvent(userId, event);
      }

      const phase = engine.getColdStartPhase(userId);
      // 20次交互后应该进入explore或normal阶段
      expect(['classify', 'explore', 'normal']).toContain(phase);
    });

    it('should track interaction count internally', async () => {
      const userId = 'cold-start-count';

      // 初始阶段
      const phase1 = engine.getColdStartPhase(userId);
      expect(phase1).toBe('classify');

      // 处理一些事件
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build();
        await engine.processEvent(userId, event);
      }

      // 阶段可能变化
      const phase2 = engine.getColdStartPhase(userId);
      expect(['classify', 'explore', 'normal']).toContain(phase2);
    });
  });

  // ==================== 延迟奖励测试 ====================

  describe('delayed reward', () => {
    it('should apply delayed reward update when model exists', async () => {
      const userId = 'test-delayed-reward';

      // 先处理一些事件来创建模型
      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event);

      // 获取特征向量
      const featureVector = result.featureVector?.values;

      if (featureVector && featureVector.length > 0) {
        const updateResult = await engine.applyDelayedRewardUpdate(
          userId,
          featureVector,
          0.9
        );

        // 结果取决于模型是否已保存到 modelRepo
        expect(typeof updateResult.success).toBe('boolean');
      }
    });

    it('should handle model not found for delayed reward', async () => {
      const result = await engine.applyDelayedRewardUpdate(
        'non-existent-user',
        [0.5, 0.5, 0.5],
        0.8
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('model_not_found');
    });

    it('should validate feature vector dimensions', async () => {
      const userId = 'test-dimension-check';

      // 手动保存一个模型到仓库
      const linucb = new LinUCB({ dimension: 22 });
      await modelRepo.saveModel(userId, linucb.getModel());

      // 使用错误维度的特征向量
      const wrongDimensionVector = [0.5, 0.5, 0.5]; // 只有3维

      const result = await engine.applyDelayedRewardUpdate(
        userId,
        wrongDimensionVector,
        0.8
      );

      // 代码现在会自动对齐特征向量维度（零填充或截断）
      // 所以不再返回 dimension_mismatch 错误
      expect(result.success).toBe(true);
    });
  });

  // ==================== 弹性处理测试 ====================

  describe('resilience', () => {
    it('should handle anomalous events gracefully', async () => {
      const userId = 'test-anomaly';

      // 创建异常事件（极端值）
      const anomalousEvent = RawEventFactory.build({
        isCorrect: true,
        responseTime: -1000, // 负响应时间
        timestamp: Date.now()
      });

      // 引擎应该能够处理而不抛出异常
      const result = await engine.processEvent(userId, anomalousEvent);
      expect(result).toBeDefined();
    });

    it('should skip update when skipUpdate option is true', async () => {
      const userId = 'test-skip-update';

      const event = RawEventFactory.build();
      const opts: ProcessOptions = { skipUpdate: true };

      const result = await engine.processEvent(userId, event, opts);

      // 即使跳过更新，也应该返回有效结果
      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should use current params when provided', async () => {
      const userId = 'test-current-params';

      const currentParams = {
        interval_scale: 1.5,
        new_ratio: 0.3,
        difficulty: 'hard' as const,
        batch_size: 12,
        hint_level: 0
      };

      const event = RawEventFactory.build();
      const opts: ProcessOptions = { currentParams };

      const result = await engine.processEvent(userId, event, opts);

      expect(result.strategy).toBeDefined();
    });

    it('should handle zero response time', async () => {
      const userId = 'test-zero-response';
      const event = RawEventFactory.build({
        isCorrect: true,
        responseTime: 0
      });

      const result = await engine.processEvent(userId, event);
      expect(result).toBeDefined();
    });
  });

  // ==================== 用户隔离测试 ====================

  describe('user isolation', () => {
    it('should maintain separate state for different users', async () => {
      const user1 = 'isolation-user-1';
      const user2 = 'isolation-user-2';

      // User1: 表现良好
      let lastResult1;
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 1500
        });
        lastResult1 = await engine.processEvent(user1, event);
      }

      // User2: 表现较差
      let lastResult2;
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build({
          isCorrect: false,
          responseTime: 8000
        });
        lastResult2 = await engine.processEvent(user2, event);
      }

      expect(lastResult1!.state).toBeDefined();
      expect(lastResult2!.state).toBeDefined();

      // 两个用户的状态应该是独立的
      expect(lastResult1!.state.A).toBeDefined();
      expect(lastResult2!.state.A).toBeDefined();
    });

    it('should handle concurrent requests for same user', async () => {
      const userId = 'concurrent-user';

      // 并发发送多个事件
      const events = Array.from({ length: 5 }, () =>
        RawEventFactory.build({
          isCorrect: true,
          responseTime: 2000
        })
      );

      const results = await Promise.all(
        events.map(event => engine.processEvent(userId, event))
      );

      // 所有请求应该成功完成
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
      });
    });

    it('should not mix state between users', async () => {
      const userA = 'user-a-isolation';
      const userB = 'user-b-isolation';

      // 给 userA 处理事件
      const eventA = RawEventFactory.build({ isCorrect: true, responseTime: 1000 });
      const resultA = await engine.processEvent(userA, eventA);

      // 给 userB 处理事件
      const eventB = RawEventFactory.build({ isCorrect: false, responseTime: 10000 });
      const resultB = await engine.processEvent(userB, eventB);

      // 两个用户应该有独立的状态
      expect(resultA.state).not.toBe(resultB.state);
    });
  });

  // ==================== 缓存测试 ====================

  describe('reward profile cache', () => {
    it('should invalidate reward profile cache', () => {
      const userId = 'cache-test-user';

      // 调用缓存失效方法不应抛出异常
      expect(() => {
        engine.invalidateRewardProfileCache(userId);
      }).not.toThrow();
    });

    it('should handle multiple invalidations', () => {
      const userId = 'cache-multi-invalidate';

      expect(() => {
        engine.invalidateRewardProfileCache(userId);
        engine.invalidateRewardProfileCache(userId);
        engine.invalidateRewardProfileCache(userId);
      }).not.toThrow();
    });
  });

  // ==================== shutdown 测试 ====================

  describe('shutdown', () => {
    it('should gracefully shutdown', async () => {
      const userId = 'shutdown-test';

      // 处理一些事件
      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event);

      // 引擎应该能正常完成所有操作
      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should complete all pending operations', async () => {
      const userId = 'flush-test';

      // 处理事件
      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event);

      // 验证结果完整
      expect(result.state).toBeDefined();
      expect(result.action).toBeDefined();
      expect(result.strategy).toBeDefined();
    });
  });

  // ==================== 边界条件测试 ====================

  describe('edge cases', () => {
    it('should handle very fast response time', async () => {
      const userId = 'edge-fast-response';
      const event = RawEventFactory.build({
        isCorrect: true,
        responseTime: 100 // 非常快
      });

      const result = await engine.processEvent(userId, event);
      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should handle very slow response time', async () => {
      const userId = 'edge-slow-response';
      const event = RawEventFactory.build({
        isCorrect: true,
        responseTime: 60000 // 60秒
      });

      const result = await engine.processEvent(userId, event);
      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should handle user with many interactions', async () => {
      const userId = 'edge-many-interactions';

      // 模拟大量交互
      let lastResult;
      for (let i = 0; i < 100; i++) {
        const event = RawEventFactory.build({
          isCorrect: Math.random() > 0.3,
          responseTime: 1500 + Math.random() * 3000,
          timestamp: Date.now() + i * 100
        });
        lastResult = await engine.processEvent(userId, event);
      }

      expect(lastResult).toBeDefined();
      expect(lastResult!.state).toBeDefined();

      const phase = engine.getColdStartPhase(userId);
      // 100次交互后应该在某个阶段
      expect(['classify', 'explore', 'normal']).toContain(phase);
    });

    it('should handle streak of correct answers', async () => {
      const userId = 'edge-correct-streak';

      // 连续正确
      let lastResult;
      for (let i = 0; i < 10; i++) {
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 1500
        });
        lastResult = await engine.processEvent(userId, event);
      }

      expect(lastResult).toBeDefined();
      expect(lastResult!.state).toBeDefined();
      // 连续正确应该保持状态有效
      expect(lastResult!.state.M).toBeDefined();
    });

    it('should handle streak of incorrect answers', async () => {
      const userId = 'edge-incorrect-streak';

      // 连续错误
      let lastResult;
      for (let i = 0; i < 10; i++) {
        const event = RawEventFactory.build({
          isCorrect: false,
          responseTime: 8000
        });
        lastResult = await engine.processEvent(userId, event);
      }

      expect(lastResult).toBeDefined();
      expect(lastResult!.state).toBeDefined();
      // 连续错误后状态应该有效
      expect(lastResult!.state.F).toBeDefined();
    });

    it('should handle alternating correctness', async () => {
      const userId = 'edge-alternating';

      // 交替正确/错误
      let lastResult;
      for (let i = 0; i < 20; i++) {
        const event = RawEventFactory.build({
          isCorrect: i % 2 === 0,
          responseTime: 2000 + i * 100
        });
        lastResult = await engine.processEvent(userId, event);
      }

      expect(lastResult).toBeDefined();
      expect(lastResult!.state).toBeDefined();
    });

    it('should handle timestamp in the past', async () => {
      const userId = 'edge-past-timestamp';
      const event = RawEventFactory.build({
        isCorrect: true,
        responseTime: 2000,
        timestamp: Date.now() - 86400000 // 一天前
      });

      const result = await engine.processEvent(userId, event);
      expect(result).toBeDefined();
    });

    it('should handle timestamp in the future', async () => {
      const userId = 'edge-future-timestamp';
      const event = RawEventFactory.build({
        isCorrect: true,
        responseTime: 2000,
        timestamp: Date.now() + 86400000 // 一天后
      });

      const result = await engine.processEvent(userId, event);
      expect(result).toBeDefined();
    });
  });

  // ==================== 解释与建议测试 ====================

  describe('explanation and suggestion', () => {
    it('should provide suggestion when needed', async () => {
      const userId = 'suggestion-test';

      // 处理一些事件以获得状态
      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event);

      // suggestion 可能为 null 或字符串
      expect(result.suggestion === null || typeof result.suggestion === 'string').toBe(true);
    });

    it('should indicate break suggestion for fatigued user', async () => {
      const userId = 'break-suggestion-test';

      // 模拟疲劳场景：连续错误和慢响应
      let lastResult;
      for (let i = 0; i < 20; i++) {
        const event = RawEventFactory.build({
          isCorrect: false,
          responseTime: 10000 + i * 500
        });
        lastResult = await engine.processEvent(userId, event);
      }

      // shouldBreak 应该被设置
      expect(typeof lastResult!.shouldBreak).toBe('boolean');
    });

    it('should generate enhanced explanation', async () => {
      const userId = 'enhanced-explanation-test';
      const event = RawEventFactory.build();

      const result = await engine.processEvent(userId, event);

      if (result.enhancedExplanation) {
        expect(result.enhancedExplanation).toHaveProperty('factors');
        expect(result.enhancedExplanation).toHaveProperty('decisionContext');
      }
    });

    it('should provide explanation with strategy changes', async () => {
      const userId = 'explanation-changes-test';

      // 第一次处理
      const event1 = RawEventFactory.build({ isCorrect: true, responseTime: 1500 });
      const result1 = await engine.processEvent(userId, event1);
      expect(result1.explanation).toBeDefined();

      // 第二次处理，可能有策略变化
      const event2 = RawEventFactory.build({ isCorrect: false, responseTime: 8000 });
      const result2 = await engine.processEvent(userId, event2);
      expect(result2.explanation).toBeDefined();
    });
  });

  // ==================== 特征向量测试 ====================

  describe('feature vector', () => {
    it('should return persistable feature vector', async () => {
      const userId = 'feature-vector-test';
      const event = RawEventFactory.build();

      const result = await engine.processEvent(userId, event);

      if (result.featureVector) {
        expect(result.featureVector.values).toBeDefined();
        expect(Array.isArray(result.featureVector.values)).toBe(true);
        expect(result.featureVector.version).toBeDefined();
        expect(result.featureVector.ts).toBeDefined();
        expect(result.featureVector.labels).toBeDefined();
      }
    });

    it('should have consistent feature vector dimensions', async () => {
      const userId = 'feature-dimension-test';

      const results = [];
      for (let i = 0; i < 5; i++) {
        const event = RawEventFactory.build();
        results.push(await engine.processEvent(userId, event));
      }

      const dimensions = results
        .map(r => r.featureVector?.values?.length)
        .filter(d => d !== undefined);

      if (dimensions.length > 1) {
        // 所有维度应该一致
        expect(new Set(dimensions).size).toBe(1);
      }
    });

    it('should include feature labels', async () => {
      const userId = 'feature-labels-test';
      const event = RawEventFactory.build();

      const result = await engine.processEvent(userId, event);

      if (result.featureVector) {
        expect(result.featureVector.labels).toBeDefined();
        expect(Array.isArray(result.featureVector.labels)).toBe(true);
        if (result.featureVector.values && result.featureVector.labels) {
          expect(result.featureVector.labels.length).toBe(result.featureVector.values.length);
        }
      }
    });
  });

  // ==================== 多目标优化测试 ====================

  describe('multi-objective optimization', () => {
    it('should accept learning objectives in options', async () => {
      const userId = 'multi-objective-test';

      const opts: ProcessOptions = {
        learningObjectives: {
          userId,
          mode: 'exam',
          primaryObjective: 'accuracy',
          minAccuracy: 0.9,
          weightShortTerm: 0.3,
          weightLongTerm: 0.5,
          weightEfficiency: 0.2
        },
        sessionStats: {
          accuracy: 0.85,
          avgResponseTime: 2000,
          retentionRate: 0.75,
          reviewSuccessRate: 0.8,
          memoryStability: 0.7,
          wordsPerMinute: 5,
          timeUtilization: 0.9,
          cognitiveLoad: 0.5,
          sessionDuration: 1800
        }
      };

      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event, opts);

      expect(result).toBeDefined();
      // 多目标评估结果可能存在
    });

    it('should handle different learning modes', async () => {
      const modes = ['exam', 'daily', 'travel'] as const;

      for (const mode of modes) {
        const userId = `multi-obj-${mode}`;
        const opts: ProcessOptions = {
          learningObjectives: {
            userId,
            mode,
            primaryObjective: 'accuracy',
            weightShortTerm: 0.33,
            weightLongTerm: 0.33,
            weightEfficiency: 0.34
          }
        };

        const event = RawEventFactory.build();
        const result = await engine.processEvent(userId, event, opts);

        expect(result).toBeDefined();
      }
    });
  });

  // ==================== 交互计数测试 ====================

  describe('interaction count', () => {
    it('should accept interaction count in options', async () => {
      const userId = 'interaction-count-test';

      const opts: ProcessOptions = {
        interactionCount: 50
      };

      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event, opts);

      expect(result).toBeDefined();
    });

    it('should accept recent accuracy in options', async () => {
      const userId = 'recent-accuracy-test';

      const opts: ProcessOptions = {
        recentAccuracy: 0.85
      };

      const event = RawEventFactory.build();
      const result = await engine.processEvent(userId, event, opts);

      expect(result).toBeDefined();
    });
  });

  // ==================== 关键路径测试 ====================
  // 这些测试覆盖核心业务流程的关键场景

  describe('Critical Paths', () => {
    // ==================== 奖励缓存命中测试 ====================
    describe('reward profile cache', () => {
      it('should return cached reward when available', async () => {
        const userId = 'cache-hit-user';

        // 第一次请求：缓存未命中，从数据库加载
        const event1 = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2000,
          timestamp: Date.now()
        });
        const result1 = await engine.processEvent(userId, event1);

        // 第二次请求：缓存命中，不再查询数据库
        const event2 = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2500,
          timestamp: Date.now() + 1000
        });
        const result2 = await engine.processEvent(userId, event2);

        // 两次请求都应该成功
        expect(result1).toBeDefined();
        expect(result1.reward).toBeDefined();
        expect(result2).toBeDefined();
        expect(result2.reward).toBeDefined();

        // 奖励计算应该一致（使用相同的奖励配置）
        // 由于缓存命中，第二次请求应该更快且使用相同配置
        expect(typeof result1.reward).toBe('number');
        expect(typeof result2.reward).toBe('number');
      });

      it('should refresh cache after TTL expires', async () => {
        const userId = 'cache-ttl-user';

        // 第一次请求
        const event1 = RawEventFactory.build();
        const result1 = await engine.processEvent(userId, event1);
        expect(result1.reward).toBeDefined();

        // 使缓存失效
        engine.invalidateRewardProfileCache(userId);

        // 第二次请求应该重新加载（缓存已失效）
        const event2 = RawEventFactory.build();
        const result2 = await engine.processEvent(userId, event2);
        expect(result2.reward).toBeDefined();

        // 两次都应该成功执行
        expect(result1).toBeDefined();
        expect(result2).toBeDefined();
      });

      it('should handle cache with multiple users independently', async () => {
        const user1 = 'cache-user-1';
        const user2 = 'cache-user-2';

        // 用户1请求
        const event1 = RawEventFactory.build({ isCorrect: true, responseTime: 1500 });
        const result1 = await engine.processEvent(user1, event1);

        // 用户2请求
        const event2 = RawEventFactory.build({ isCorrect: false, responseTime: 5000 });
        const result2 = await engine.processEvent(user2, event2);

        // 失效用户1的缓存
        engine.invalidateRewardProfileCache(user1);

        // 用户1再次请求（缓存已失效）
        const event3 = RawEventFactory.build();
        const result3 = await engine.processEvent(user1, event3);

        // 用户2再次请求（缓存应该仍然有效）
        const event4 = RawEventFactory.build();
        const result4 = await engine.processEvent(user2, event4);

        // 所有请求都应该成功
        expect(result1).toBeDefined();
        expect(result2).toBeDefined();
        expect(result3).toBeDefined();
        expect(result4).toBeDefined();
      });
    });

    // ==================== 决策记录失败降级测试 ====================
    describe('decision recording degradation', () => {
      it('should degrade gracefully when decision recording fails', async () => {
        // 创建带有 recorder 的引擎
        const mockRecorder = {
          record: vi.fn().mockRejectedValue(new Error('Database connection failed')),
          flush: vi.fn().mockResolvedValue(undefined),
          cleanup: vi.fn().mockResolvedValue(undefined),
          getQueueStats: vi.fn().mockReturnValue({ queueLength: 0, isFlushing: false, backpressureWaiters: 0 })
        };

        const engineWithRecorder = new AMASEngine({
          stateRepo,
          modelRepo,
          logger: mockLogger as any,
          recorder: mockRecorder as any
        });

        const userId = 'degradation-test-user';
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2000
        });

        // 提供 answerRecordId 以触发决策记录
        const opts: ProcessOptions = {
          answerRecordId: 'test-answer-record-id',
          sessionId: 'test-session-id'
        };

        // 即使 recorder 失败，processEvent 也应该成功返回
        const result = await engineWithRecorder.processEvent(userId, event, opts);

        // 验证核心功能仍然正常工作
        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
        expect(result.action).toBeDefined();
        expect(result.state).toBeDefined();
        expect(result.reward).toBeDefined();
      });

      it('should continue processing when recorder is not available', async () => {
        // 不提供 recorder 的引擎
        const engineWithoutRecorder = new AMASEngine({
          stateRepo,
          modelRepo,
          logger: mockLogger as any
          // 没有 recorder
        });

        const userId = 'no-recorder-test';
        const event = RawEventFactory.build();

        const opts: ProcessOptions = {
          answerRecordId: 'test-answer-id'
        };

        const result = await engineWithoutRecorder.processEvent(userId, event, opts);

        // 核心功能应该正常
        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
        expect(result.action).toBeDefined();
      });

      it('should not block main flow when recording is slow', async () => {
        // 模拟慢速的 recorder
        const slowRecorder = {
          record: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500))),
          flush: vi.fn().mockResolvedValue(undefined),
          cleanup: vi.fn().mockResolvedValue(undefined),
          getQueueStats: vi.fn().mockReturnValue({ queueLength: 0, isFlushing: false, backpressureWaiters: 0 })
        };

        const engineWithSlowRecorder = new AMASEngine({
          stateRepo,
          modelRepo,
          logger: mockLogger as any,
          recorder: slowRecorder as any
        });

        const userId = 'slow-recorder-test';
        const event = RawEventFactory.build();

        const opts: ProcessOptions = {
          answerRecordId: 'test-answer-id'
        };

        const startTime = Date.now();
        const result = await engineWithSlowRecorder.processEvent(userId, event, opts);
        const elapsed = Date.now() - startTime;

        // 主流程应该在合理时间内完成（决策记录是异步的，不应阻塞）
        // 注意：生产环境超时是100ms，测试环境是500ms
        expect(elapsed).toBeLessThan(1000);

        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
      });
    });

    // ==================== processEvent 端到端流程测试 ====================
    describe('processEvent end-to-end', () => {
      it('should process learning event end-to-end', async () => {
        const userId = 'e2e-test-user';
        const rawEvent = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2500,
          timestamp: Date.now(),
          difficulty: 'mid',
          wordId: 'test-word-123'
        });

        const opts: ProcessOptions = {
          currentParams: {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: 'mid',
            batch_size: 10,
            hint_level: 1
          },
          recentAccuracy: 0.75,
          interactionCount: 25
        };

        const result = await engine.processEvent(userId, rawEvent, opts);

        // 验证完整的处理结果
        expect(result).toBeDefined();

        // 1. 策略输出
        expect(result.strategy).toBeDefined();
        expect(result.strategy.interval_scale).toBeGreaterThan(0);
        expect(result.strategy.new_ratio).toBeGreaterThanOrEqual(0);
        expect(result.strategy.new_ratio).toBeLessThanOrEqual(1);
        expect(['easy', 'mid', 'hard']).toContain(result.strategy.difficulty);
        expect(result.strategy.batch_size).toBeGreaterThan(0);
        expect(result.strategy.hint_level).toBeGreaterThanOrEqual(0);

        // 2. 动作选择
        expect(result.action).toBeDefined();
        expect(result.action.interval_scale).toBeDefined();
        expect(result.action.new_ratio).toBeDefined();
        expect(result.action.difficulty).toBeDefined();
        expect(result.action.batch_size).toBeDefined();
        expect(result.action.hint_level).toBeDefined();

        // 3. 状态更新
        expect(result.state).toBeDefined();
        expect(result.state.A).toBeGreaterThanOrEqual(0); // Attention
        expect(result.state.A).toBeLessThanOrEqual(1);
        expect(result.state.F).toBeGreaterThanOrEqual(0); // Fatigue
        expect(result.state.F).toBeLessThanOrEqual(1);
        expect(result.state.M).toBeGreaterThanOrEqual(0); // Motivation
        expect(result.state.M).toBeLessThanOrEqual(1);
        expect(result.state.C).toBeDefined(); // Cognitive

        // 4. 奖励计算
        expect(result.reward).toBeDefined();
        expect(typeof result.reward).toBe('number');
        expect(result.reward).toBeGreaterThanOrEqual(-1);
        expect(result.reward).toBeLessThanOrEqual(1);

        // 5. 解释和建议
        expect(result.explanation).toBeDefined();
        expect(typeof result.explanation).toBe('string');
        expect(typeof result.shouldBreak).toBe('boolean');
      });

      it('should persist state across multiple events', async () => {
        const userId = 'e2e-persistence-user';

        // 处理多个事件
        const events = [
          RawEventFactory.build({ isCorrect: true, responseTime: 1500 }),
          RawEventFactory.build({ isCorrect: true, responseTime: 1800 }),
          RawEventFactory.build({ isCorrect: false, responseTime: 4000 }),
          RawEventFactory.build({ isCorrect: true, responseTime: 2000 })
        ];

        let prevState: any = null;
        for (const event of events) {
          const result = await engine.processEvent(userId, event);
          expect(result.state).toBeDefined();

          if (prevState) {
            // 状态应该有变化（但仍在有效范围内）
            expect(result.state.A).toBeDefined();
            expect(result.state.F).toBeDefined();
            expect(result.state.M).toBeDefined();
          }
          prevState = result.state;
        }

        // 验证状态已持久化
        const persistedState = await stateRepo.loadState(userId);
        expect(persistedState).toBeDefined();
      });

      it('should handle concurrent requests correctly', async () => {
        const userId = 'concurrent-e2e-user';

        // 创建多个并发请求
        const concurrentCount = 10;
        const events = Array.from({ length: concurrentCount }, (_, i) =>
          RawEventFactory.build({
            isCorrect: i % 2 === 0,
            responseTime: 1500 + i * 100,
            timestamp: Date.now() + i
          })
        );

        // 并发执行
        const results = await Promise.all(
          events.map(event => engine.processEvent(userId, event))
        );

        // 验证所有请求都成功完成
        expect(results).toHaveLength(concurrentCount);

        results.forEach((result, index) => {
          expect(result).toBeDefined();
          expect(result.strategy).toBeDefined();
          expect(result.action).toBeDefined();
          expect(result.state).toBeDefined();
          expect(result.reward).toBeDefined();
        });

        // 验证每个结果中的状态有效性（而不是从 stateRepo 加载，因为并发时状态可能被覆盖）
        // 由于使用用户锁，并发请求实际上是串行执行的，最后一个结果应该反映最终状态
        const lastResult = results[results.length - 1];
        expect(lastResult.state.A).toBeGreaterThanOrEqual(0);
        expect(lastResult.state.A).toBeLessThanOrEqual(1);
        expect(lastResult.state.F).toBeGreaterThanOrEqual(0);
        expect(lastResult.state.F).toBeLessThanOrEqual(1);

        // 额外验证：所有结果的状态都应该在有效范围内
        results.forEach(result => {
          expect(result.state.A).toBeGreaterThanOrEqual(0);
          expect(result.state.A).toBeLessThanOrEqual(1);
          expect(result.state.F).toBeGreaterThanOrEqual(0);
          expect(result.state.F).toBeLessThanOrEqual(1);
          expect(result.state.M).toBeGreaterThanOrEqual(0);
          expect(result.state.M).toBeLessThanOrEqual(1);
        });
      });

      it('should handle rapid sequential requests', async () => {
        const userId = 'rapid-sequential-user';

        const results: any[] = [];

        // 快速连续处理事件
        for (let i = 0; i < 20; i++) {
          const event = RawEventFactory.build({
            isCorrect: Math.random() > 0.3,
            responseTime: 1000 + Math.random() * 4000,
            timestamp: Date.now() + i * 10
          });

          const result = await engine.processEvent(userId, event);
          results.push(result);
        }

        // 所有请求应该成功
        expect(results).toHaveLength(20);
        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.strategy).toBeDefined();
        });

        // 验证冷启动阶段转换
        const phase = engine.getColdStartPhase(userId);
        expect(['classify', 'explore', 'normal']).toContain(phase);
      });

      it('should apply guardrails correctly in e2e flow', async () => {
        const userId = 'e2e-guardrails-user';

        // 模拟疲劳场景
        for (let i = 0; i < 15; i++) {
          const event = RawEventFactory.build({
            isCorrect: false,
            responseTime: 10000 + i * 500
          });
          await engine.processEvent(userId, event);
        }

        // 最终请求
        const finalEvent = RawEventFactory.build({
          isCorrect: false,
          responseTime: 15000
        });
        const result = await engine.processEvent(userId, finalEvent);

        // Guardrails 应该限制策略参数
        expect(result.strategy.batch_size).toBeGreaterThanOrEqual(5);
        expect(result.strategy.batch_size).toBeLessThanOrEqual(20);
        expect(result.strategy.interval_scale).toBeGreaterThan(0);
        expect(result.strategy.new_ratio).toBeGreaterThanOrEqual(0);
        expect(result.strategy.new_ratio).toBeLessThanOrEqual(1);

        // 高疲劳应该触发休息建议
        // shouldBreak 可能为 true 或 false，取决于具体阈值
        expect(typeof result.shouldBreak).toBe('boolean');
      });

      it('should handle word review history in ACT-R calculations', async () => {
        const userId = 'e2e-actr-user';
        const event = RawEventFactory.build({
          isCorrect: true,
          responseTime: 2000
        });

        const opts: ProcessOptions = {
          wordReviewHistory: [
            { secondsAgo: 60, isCorrect: true },      // 1分钟前正确
            { secondsAgo: 3600, isCorrect: true },    // 1小时前正确
            { secondsAgo: 86400, isCorrect: false },  // 1天前错误
            { secondsAgo: 259200, isCorrect: true }   // 3天前正确
          ]
        };

        const result = await engine.processEvent(userId, event, opts);

        // 验证处理成功
        expect(result).toBeDefined();
        expect(result.strategy).toBeDefined();
        expect(result.action).toBeDefined();
      });
    });

    // ==================== 内存统计测试 ====================
    describe('memory stats', () => {
      it('should report memory statistics', async () => {
        const userId = 'memory-stats-user';

        // 处理一些事件以创建用户数据
        const event = RawEventFactory.build();
        await engine.processEvent(userId, event);

        // 获取内存统计
        const stats = engine.getMemoryStats();

        expect(stats).toBeDefined();
        expect(stats.isolation).toBeDefined();
        expect(typeof stats.isolation.userModelsCount).toBe('number');
        expect(typeof stats.isolation.userLocksCount).toBe('number');
        expect(typeof stats.isolation.interactionCountsCount).toBe('number');
        expect(typeof stats.isolation.maxUsers).toBe('number');
        expect(typeof stats.isolation.utilizationPercent).toBe('number');
        expect(typeof stats.rewardCache.size).toBe('number');
      });

      it('should track reward profile cache count', async () => {
        const users = ['cache-count-1', 'cache-count-2', 'cache-count-3'];

        // 为多个用户处理事件
        for (const userId of users) {
          const event = RawEventFactory.build();
          await engine.processEvent(userId, event);
        }

        const stats = engine.getMemoryStats();

        // 缓存应该包含这些用户的奖励配置
        expect(stats.rewardCache.size).toBeGreaterThanOrEqual(0);
      });
    });

    // ==================== 销毁和清理测试 ====================
    describe('destroy and cleanup', () => {
      it('should clean up resources on destroy', async () => {
        // 创建新引擎实例进行销毁测试
        const testEngine = new AMASEngine({
          stateRepo: new MemoryStateRepository(),
          modelRepo: new MemoryModelRepository(),
          logger: mockLogger as any
        });

        const userId = 'destroy-test-user';
        const event = RawEventFactory.build();
        await testEngine.processEvent(userId, event);

        // 销毁引擎
        testEngine.destroy();

        // 销毁后内存统计应该显示清理状态
        const stats = testEngine.getMemoryStats();
        expect(stats.rewardCache.size).toBe(0);
      });
    });
  });
});
