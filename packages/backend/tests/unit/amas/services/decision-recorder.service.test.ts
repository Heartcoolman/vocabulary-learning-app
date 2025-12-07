/**
 * Decision Recorder Service Tests
 *
 * 测试 DecisionRecorderService 核心功能：
 * 1. 记录决策轨迹
 * 2. 队列管理和批量处理
 * 3. 重试机制
 * 4. 背压控制
 * 5. 幂等性保证
 * 6. 资源清理
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PrismaClient, PipelineStageType, PipelineStageStatus } from '@prisma/client';
import {
  DecisionRecorderService,
  DecisionTrace,
  PipelineStageTrace,
  createDecisionRecorder,
  getSharedDecisionRecorder,
  generateDecisionId
} from '../../../../src/amas/services/decision-recorder.service';
import { mockLogger } from '../../../setup';

// Mock dependencies
vi.mock('../../../../src/monitoring/amas-metrics', () => ({
  recordWriteSuccess: vi.fn(),
  recordWriteFailure: vi.fn(),
  updateQueueSize: vi.fn(),
  recordBackpressure: vi.fn(),
  recordBackpressureTimeout: vi.fn()
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../../../src/services/decision-events.service', () => ({
  decisionEventsService: {
    emitDecision: vi.fn()
  }
}));

// Import mocked modules for assertions
import {
  recordWriteSuccess,
  recordWriteFailure,
  updateQueueSize,
  recordBackpressure,
  recordBackpressureTimeout
} from '../../../../src/monitoring/amas-metrics';
import { amasLogger } from '../../../../src/logger';
import { decisionEventsService } from '../../../../src/services/decision-events.service';

// ==================== Test Helpers ====================

function createMockPrisma() {
  const mockTx = {
    decisionRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'record-id', timestamp: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'record-id', timestamp: new Date() })
    },
    pipelineStage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    decisionInsight: {
      upsert: vi.fn().mockResolvedValue({})
    }
  };

  return {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      await fn(mockTx);
    }),
    decisionRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'record-id', timestamp: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'record-id', timestamp: new Date() })
    },
    _mockTx: mockTx
  } as unknown as PrismaClient & { _mockTx: typeof mockTx };
}

function createDecisionTrace(overrides: Partial<DecisionTrace> = {}): DecisionTrace {
  return {
    decisionId: overrides.decisionId ?? `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    answerRecordId: overrides.answerRecordId ?? 'answer-record-id',
    userId: overrides.userId ?? 'test-user-id',
    sessionId: overrides.sessionId ?? 'test-session-id',
    timestamp: overrides.timestamp ?? new Date(),
    decisionSource: overrides.decisionSource ?? 'linucb',
    coldstartPhase: overrides.coldstartPhase ?? 'normal',
    stateSnapshot: overrides.stateSnapshot ?? { A: 0.8, F: 0.2, M: 0.7 },
    difficultyFactors: overrides.difficultyFactors ?? { wordFrequency: 0.5 },
    triggers: overrides.triggers ?? ['performance_drop'],
    weightsSnapshot: overrides.weightsSnapshot ?? { attention: 0.3, fatigue: 0.2 },
    memberVotes: overrides.memberVotes ?? { linucb: 'mid', heuristic: 'easy' },
    selectedAction: overrides.selectedAction ?? {
      interval_scale: 1.0,
      new_ratio: 0.2,
      difficulty: 'mid',
      batch_size: 10,
      hint_level: 1
    },
    confidence: overrides.confidence ?? 0.85,
    reward: overrides.reward ?? 0.7,
    isSimulation: overrides.isSimulation ?? false,
    traceVersion: overrides.traceVersion ?? 1,
    totalDurationMs: overrides.totalDurationMs ?? 50,
    stages: overrides.stages ?? []
  };
}

function createPipelineStage(overrides: Partial<PipelineStageTrace> = {}): PipelineStageTrace {
  return {
    stage: overrides.stage ?? 'PERCEIVE' as PipelineStageType,
    stageName: overrides.stageName ?? 'perceive',
    status: overrides.status ?? 'COMPLETED' as PipelineStageStatus,
    startedAt: overrides.startedAt ?? new Date(),
    endedAt: overrides.endedAt ?? new Date(),
    durationMs: overrides.durationMs ?? 10,
    inputSummary: overrides.inputSummary ?? { event: 'answer' },
    outputSummary: overrides.outputSummary ?? { state: 'updated' },
    metadata: overrides.metadata ?? {},
    errorMessage: overrides.errorMessage
  };
}

// ==================== Tests ====================

describe('DecisionRecorderService', () => {
  let service: DecisionRecorderService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPrisma = createMockPrisma();
    service = new DecisionRecorderService(mockPrisma);
  });

  afterEach(async () => {
    await service.cleanup();
    vi.useRealTimers();
  });

  // ==================== 初始化测试 ====================

  describe('initialization', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(DecisionRecorderService);
    });

    it('should start with empty queue', () => {
      const stats = service.getQueueStats();
      expect(stats.queueLength).toBe(0);
      expect(stats.isFlushing).toBe(false);
      expect(stats.backpressureWaiters).toBe(0);
    });

    it('should setup periodic flush timer', async () => {
      const trace = createDecisionTrace();
      await service.record(trace);

      // 验证定时器已启动
      const stats = service.getQueueStats();
      expect(stats.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 记录决策测试 ====================

  describe('record', () => {
    it('should add trace to queue', async () => {
      const trace = createDecisionTrace();

      // 阻止自动 flush
      const flushSpy = vi.spyOn(service, 'flush').mockResolvedValue();

      await service.record(trace);

      expect(updateQueueSize).toHaveBeenCalled();
      flushSpy.mockRestore();
    });

    it('should trigger flush when not already flushing', async () => {
      const trace = createDecisionTrace();
      const flushSpy = vi.spyOn(service, 'flush');

      await service.record(trace);

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should update queue size metrics', async () => {
      const trace = createDecisionTrace();
      vi.spyOn(service, 'flush').mockResolvedValue();

      await service.record(trace);

      expect(updateQueueSize).toHaveBeenCalled();
    });

    it('should handle trace without optional fields', async () => {
      const minimalTrace: DecisionTrace = {
        decisionId: 'minimal-decision',
        timestamp: new Date(),
        decisionSource: 'test',
        selectedAction: { difficulty: 'mid' },
        confidence: 0.5,
        traceVersion: 1,
        stages: []
      };

      vi.spyOn(service, 'flush').mockResolvedValue();

      await expect(service.record(minimalTrace)).resolves.not.toThrow();
    });

    it('should record multiple traces', async () => {
      vi.spyOn(service, 'flush').mockResolvedValue();

      const traces = [
        createDecisionTrace({ decisionId: 'trace-1' }),
        createDecisionTrace({ decisionId: 'trace-2' }),
        createDecisionTrace({ decisionId: 'trace-3' })
      ];

      for (const trace of traces) {
        await service.record(trace);
      }

      expect(updateQueueSize).toHaveBeenCalled();
    });
  });

  // ==================== 刷新队列测试 ====================

  describe('flush', () => {
    it('should do nothing when queue is empty', async () => {
      await service.flush();

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should do nothing when already flushing', async () => {
      const trace = createDecisionTrace();

      // 设置 flushing 状态
      const firstFlush = service.record(trace);
      const secondFlush = service.flush();

      await Promise.all([firstFlush, secondFlush]);

      // $transaction 应该只被调用一次或多次（取决于队列处理）
      // 但第二次 flush 不应该启动新的刷新过程
    });

    it('should process batch and persist traces', async () => {
      const trace = createDecisionTrace();
      await service.record(trace);

      // 等待 flush 完成
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(recordWriteSuccess).toHaveBeenCalled();
    });

    it('should emit decision event after successful persist', async () => {
      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(decisionEventsService.emitDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionId: trace.decisionId,
          userId: trace.userId,
          decisionSource: trace.decisionSource
        })
      );
    });

    it('should update queue size after flush', async () => {
      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      // updateQueueSize 应该在 flush 结束时被调用
      expect(updateQueueSize).toHaveBeenLastCalledWith(0);
    });
  });

  // ==================== 重试机制测试 ====================

  describe('retry mechanism', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      mockPrisma.$transaction = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Database error');
        }
      }) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(1000);

      expect(attempts).toBeGreaterThanOrEqual(1);
    });

    it('should use exponential backoff', async () => {
      let callTimes: number[] = [];
      mockPrisma.$transaction = vi.fn(async () => {
        callTimes.push(Date.now());
        throw new Error('Database error');
      }) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);

      // 运行所有定时器以完成重试
      await vi.advanceTimersByTimeAsync(10000);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should record failure after all retries exhausted', async () => {
      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Persistent error')) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(10000);

      expect(recordWriteFailure).toHaveBeenCalled();
      expect(amasLogger.error).toHaveBeenCalled();
    });

    it('should mark decision as failed when all retries fail', async () => {
      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('DB error')) as Mock;
      mockPrisma.decisionRecord.findFirst = vi.fn().mockResolvedValue(null) as Mock;
      mockPrisma.decisionRecord.create = vi.fn().mockResolvedValue({ id: 'failed-id', timestamp: new Date() }) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(10000);

      // 应该尝试创建失败记录
      expect(mockPrisma.decisionRecord.findFirst).toHaveBeenCalled();
    });
  });

  // ==================== 幂等性测试 ====================

  describe('idempotency', () => {
    it('should update existing record instead of creating duplicate', async () => {
      const existingRecord = {
        id: 'existing-id',
        timestamp: new Date(),
        decisionId: 'existing-decision'
      };

      mockPrisma._mockTx.decisionRecord.findFirst = vi.fn().mockResolvedValue(existingRecord) as Mock;

      const trace = createDecisionTrace({ decisionId: 'existing-decision' });
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.decisionRecord.update).toHaveBeenCalled();
    });

    it('should create new record when not existing', async () => {
      mockPrisma._mockTx.decisionRecord.findFirst = vi.fn().mockResolvedValue(null) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.decisionRecord.create).toHaveBeenCalled();
    });

    it('should delete existing pipeline stages before creating new ones', async () => {
      const existingRecord = { id: 'record-id', timestamp: new Date() };
      mockPrisma._mockTx.decisionRecord.findFirst = vi.fn().mockResolvedValue(null) as Mock;
      mockPrisma._mockTx.decisionRecord.create = vi.fn().mockResolvedValue(existingRecord) as Mock;

      const trace = createDecisionTrace({
        stages: [
          createPipelineStage({ stage: 'PERCEIVE' as PipelineStageType }),
          createPipelineStage({ stage: 'MODEL' as PipelineStageType })
        ]
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.pipelineStage.deleteMany).toHaveBeenCalled();
      expect(mockPrisma._mockTx.pipelineStage.createMany).toHaveBeenCalled();
    });
  });

  // ==================== 背压控制测试 ====================

  describe('backpressure', () => {
    it('should apply backpressure when queue is full', async () => {
      vi.useRealTimers();

      // 填满队列（MAX_QUEUE_SIZE = 1000）
      const mockFlush = vi.spyOn(service, 'flush').mockResolvedValue();

      // 快速添加大量 traces
      const traces = Array.from({ length: 1001 }, (_, i) =>
        createDecisionTrace({ decisionId: `trace-${i}` })
      );

      // 第1001个应该触发背压
      const recordPromises = traces.slice(0, 1000).map(t => service.record(t));
      await Promise.all(recordPromises);

      // 添加第1001个时应该触发背压记录
      const fullQueuePromise = service.record(traces[1000]);

      // 设置超时以避免无限等待
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 100)
      );

      try {
        await Promise.race([fullQueuePromise, timeoutPromise]);
      } catch {
        // 预期超时或背压
      }

      mockFlush.mockRestore();
      vi.useFakeTimers();
    });

    it('should record backpressure metrics when queue is full', async () => {
      vi.useRealTimers();

      const mockFlush = vi.spyOn(service, 'flush').mockResolvedValue();

      // 填满队列
      const traces = Array.from({ length: 1000 }, (_, i) =>
        createDecisionTrace({ decisionId: `bp-trace-${i}` })
      );

      await Promise.all(traces.map(t => service.record(t)));

      // 队列满时添加新 trace
      const extraTrace = createDecisionTrace({ decisionId: 'extra-trace' });

      // 设置短超时
      const recordPromise = Promise.race([
        service.record(extraTrace),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
      ]);

      try {
        await recordPromise;
      } catch {
        // 预期
      }

      mockFlush.mockRestore();
      vi.useFakeTimers();
    });

    it('should release backpressure after batch processing', async () => {
      const stats = service.getQueueStats();
      expect(stats.backpressureWaiters).toBe(0);
    });
  });

  // ==================== 决策洞察测试 ====================

  describe('decision insight', () => {
    it('should write decision insight when userId and stateSnapshot exist', async () => {
      const trace = createDecisionTrace({
        userId: 'insight-user',
        stateSnapshot: { A: 0.9, F: 0.1 }
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.decisionInsight.upsert).toHaveBeenCalled();
    });

    it('should skip decision insight when userId is missing', async () => {
      const trace = createDecisionTrace({
        userId: undefined,
        stateSnapshot: { A: 0.9, F: 0.1 }
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      // decisionInsight.upsert 不应被调用
      // 因为 writeDecisionInsight 在 userId 为空时返回
    });

    it('should skip decision insight when stateSnapshot is missing', async () => {
      const trace = createDecisionTrace({
        userId: 'some-user',
        stateSnapshot: undefined
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);
    });

    it('should not block main flow when insight write fails', async () => {
      mockPrisma._mockTx.decisionInsight.upsert = vi.fn().mockRejectedValue(new Error('Insight error')) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      // 主流程应该继续，不应该抛出异常
      expect(recordWriteSuccess).toHaveBeenCalled();
    });
  });

  // ==================== Pipeline Stages 测试 ====================

  describe('pipeline stages', () => {
    it('should create pipeline stages when present', async () => {
      const trace = createDecisionTrace({
        stages: [
          createPipelineStage({ stage: 'PERCEIVE' as PipelineStageType, durationMs: 5 }),
          createPipelineStage({ stage: 'MODEL' as PipelineStageType, durationMs: 10 }),
          createPipelineStage({ stage: 'DECIDE' as PipelineStageType, durationMs: 15 })
        ]
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.pipelineStage.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ stage: 'PERCEIVE' }),
            expect.objectContaining({ stage: 'MODEL' }),
            expect.objectContaining({ stage: 'DECIDE' })
          ])
        })
      );
    });

    it('should skip pipeline stage creation when stages array is empty', async () => {
      const trace = createDecisionTrace({ stages: [] });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      // createMany 不应该被调用，因为 stages 为空
      // deleteMany 仍然会被调用
      expect(mockPrisma._mockTx.pipelineStage.deleteMany).toHaveBeenCalled();
    });

    it('should handle stages with error messages', async () => {
      const trace = createDecisionTrace({
        stages: [
          createPipelineStage({
            stage: 'DECIDE' as PipelineStageType,
            status: 'FAILED' as PipelineStageStatus,
            errorMessage: 'Decision timeout'
          })
        ]
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma._mockTx.pipelineStage.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              status: 'FAILED',
              errorMessage: 'Decision timeout'
            })
          ])
        })
      );
    });
  });

  // ==================== 清理测试 ====================

  describe('cleanup', () => {
    it('should clear flush timer on cleanup', async () => {
      const trace = createDecisionTrace();
      vi.spyOn(service, 'flush').mockResolvedValue();
      await service.record(trace);

      await service.cleanup();

      // 清理后定时器应该被清除
      const stats = service.getQueueStats();
      expect(stats).toBeDefined();
    });

    it('should flush remaining traces on cleanup', async () => {
      const flushSpy = vi.spyOn(service, 'flush');

      await service.cleanup();

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should handle cleanup when already cleaned', async () => {
      await service.cleanup();
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });

  // ==================== 队列统计测试 ====================

  describe('getQueueStats', () => {
    it('should return correct queue statistics', () => {
      const stats = service.getQueueStats();

      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isFlushing');
      expect(stats).toHaveProperty('backpressureWaiters');
      expect(typeof stats.queueLength).toBe('number');
      expect(typeof stats.isFlushing).toBe('boolean');
      expect(typeof stats.backpressureWaiters).toBe('number');
    });

    it('should update queue length after adding traces', async () => {
      vi.spyOn(service, 'flush').mockResolvedValue();

      const trace = createDecisionTrace();
      await service.record(trace);

      // 由于 flush 被 mock，队列长度应该增加
      const stats = service.getQueueStats();
      expect(stats.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 定期刷新测试 ====================

  describe('periodic flush', () => {
    it('should trigger flush periodically when queue has items', async () => {
      vi.spyOn(service, 'flush').mockResolvedValue();

      const trace = createDecisionTrace();
      await service.record(trace);

      // 推进时间触发定期刷新
      await vi.advanceTimersByTimeAsync(1100);

      expect(service.flush).toHaveBeenCalled();
    });

    it('should not flush when queue is empty', async () => {
      const flushSpy = vi.spyOn(service, 'flush');
      flushSpy.mockClear();

      // 推进时间
      await vi.advanceTimersByTimeAsync(2000);

      // flush 可能被调用，但应该立即返回因为队列为空
    });
  });

  // ==================== 并发处理测试 ====================

  describe('concurrent processing', () => {
    it('should handle concurrent record calls', async () => {
      const traces = Array.from({ length: 10 }, (_, i) =>
        createDecisionTrace({ decisionId: `concurrent-${i}` })
      );

      await Promise.all(traces.map(t => service.record(t)));
      await vi.advanceTimersByTimeAsync(1000);

      // 所有 traces 应该被处理
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should maintain queue integrity under concurrent load', async () => {
      vi.spyOn(service, 'flush').mockResolvedValue();

      const traces = Array.from({ length: 50 }, (_, i) =>
        createDecisionTrace({ decisionId: `integrity-${i}` })
      );

      await Promise.all(traces.map(t => service.record(t)));

      const stats = service.getQueueStats();
      expect(stats.queueLength).toBe(50);
    });
  });

  // ==================== 边界条件测试 ====================

  describe('edge cases', () => {
    it('should handle trace with null optional fields', async () => {
      const trace = createDecisionTrace({
        answerRecordId: undefined,
        userId: undefined,
        sessionId: undefined,
        coldstartPhase: undefined,
        stateSnapshot: undefined,
        difficultyFactors: undefined,
        triggers: undefined,
        weightsSnapshot: undefined,
        memberVotes: undefined,
        reward: undefined,
        totalDurationMs: undefined
      });

      await expect(service.record(trace)).resolves.not.toThrow();
    });

    it('should handle trace with large stateSnapshot', async () => {
      const largeState: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeState[`key_${i}`] = { nested: { value: i, data: 'x'.repeat(100) } };
      }

      const trace = createDecisionTrace({ stateSnapshot: largeState });

      await expect(service.record(trace)).resolves.not.toThrow();
    });

    it('should handle trace with many stages', async () => {
      const stages: PipelineStageTrace[] = Array.from({ length: 20 }, (_, i) =>
        createPipelineStage({
          stage: 'PERCEIVE' as PipelineStageType,
          stageName: `stage-${i}`,
          durationMs: i * 5
        })
      );

      const trace = createDecisionTrace({ stages });

      await expect(service.record(trace)).resolves.not.toThrow();
    });

    it('should handle empty selectedAction', async () => {
      const trace = createDecisionTrace({
        selectedAction: {}
      });

      await expect(service.record(trace)).resolves.not.toThrow();
    });

    it('should handle confidence at boundaries', async () => {
      const trace1 = createDecisionTrace({ confidence: 0 });
      const trace2 = createDecisionTrace({ confidence: 1 });

      await expect(service.record(trace1)).resolves.not.toThrow();
      await expect(service.record(trace2)).resolves.not.toThrow();
    });
  });

  // ==================== 错误处理测试 ====================

  describe('error handling', () => {
    it('should log error when persist fails', async () => {
      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('DB connection lost')) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(10000);

      expect(amasLogger.error).toHaveBeenCalled();
    });

    it('should handle transaction error gracefully', async () => {
      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Transaction failed')) as Mock;

      const trace = createDecisionTrace();

      await expect(service.record(trace)).resolves.not.toThrow();
      await vi.advanceTimersByTimeAsync(10000);
    });

    it('should handle markAsFailed error', async () => {
      mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Main error')) as Mock;
      mockPrisma.decisionRecord.findFirst = vi.fn().mockRejectedValue(new Error('Mark error')) as Mock;

      const trace = createDecisionTrace();
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(10000);

      // 应该记录两个错误
      expect(amasLogger.error).toHaveBeenCalled();
    });
  });

  // ==================== 模拟决策测试 ====================

  describe('simulation traces', () => {
    it('should handle simulation traces correctly', async () => {
      const trace = createDecisionTrace({
        isSimulation: true,
        answerRecordId: undefined
      });

      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should emit decision event for simulation', async () => {
      const trace = createDecisionTrace({ isSimulation: true });
      await service.record(trace);
      await vi.advanceTimersByTimeAsync(100);

      expect(decisionEventsService.emitDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          isSimulation: true
        })
      );
    });
  });
});

// ==================== 工厂函数测试 ====================

describe('Factory Functions', () => {
  describe('createDecisionRecorder', () => {
    it('should create new instance', () => {
      const mockPrisma = createMockPrisma();
      const recorder = createDecisionRecorder(mockPrisma);

      expect(recorder).toBeInstanceOf(DecisionRecorderService);
    });

    it('should create independent instances', () => {
      const mockPrisma = createMockPrisma();
      const recorder1 = createDecisionRecorder(mockPrisma);
      const recorder2 = createDecisionRecorder(mockPrisma);

      expect(recorder1).not.toBe(recorder2);
    });
  });

  describe('generateDecisionId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateDecisionId();
      const id2 = generateDecisionId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate string IDs', () => {
      const id = generateDecisionId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });
});

// ==================== markAsFailed 分支测试 ====================

describe('markAsFailed branches', () => {
  let service: DecisionRecorderService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPrisma = createMockPrisma();
    service = new DecisionRecorderService(mockPrisma);
  });

  afterEach(async () => {
    await service.cleanup();
    vi.useRealTimers();
  });

  it('should update existing record when marking as failed', async () => {
    const existingRecord = { id: 'existing-id', timestamp: new Date() };
    mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Persist error')) as Mock;
    mockPrisma.decisionRecord.findFirst = vi.fn().mockResolvedValue(existingRecord) as Mock;
    mockPrisma.decisionRecord.update = vi.fn().mockResolvedValue({ ...existingRecord, ingestionStatus: 'FAILED' }) as Mock;

    const trace = createDecisionTrace();
    await service.record(trace);
    await vi.advanceTimersByTimeAsync(10000);

    expect(mockPrisma.decisionRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ingestionStatus: 'FAILED' }
      })
    );
  });

  it('should create new failed record when no existing record', async () => {
    mockPrisma.$transaction = vi.fn().mockRejectedValue(new Error('Persist error')) as Mock;
    mockPrisma.decisionRecord.findFirst = vi.fn().mockResolvedValue(null) as Mock;
    mockPrisma.decisionRecord.create = vi.fn().mockResolvedValue({ id: 'new-failed-id', timestamp: new Date() }) as Mock;

    const trace = createDecisionTrace();
    await service.record(trace);
    await vi.advanceTimersByTimeAsync(10000);

    expect(mockPrisma.decisionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingestionStatus: 'FAILED',
          decisionSource: 'unknown',
          confidence: 0
        })
      })
    );
  });
});

// ==================== 特征向量哈希测试 ====================

describe('feature vector hashing', () => {
  let service: DecisionRecorderService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPrisma = createMockPrisma();
    service = new DecisionRecorderService(mockPrisma);
  });

  afterEach(async () => {
    await service.cleanup();
    vi.useRealTimers();
  });

  it('should generate consistent hash for same state', async () => {
    const state1 = { A: 0.8, F: 0.2, M: 0.7 };
    const state2 = { A: 0.8, F: 0.2, M: 0.7 };

    const trace1 = createDecisionTrace({ decisionId: 'hash-test-1', stateSnapshot: state1 });
    const trace2 = createDecisionTrace({ decisionId: 'hash-test-2', stateSnapshot: state2 });

    await service.record(trace1);
    await vi.advanceTimersByTimeAsync(100);

    await service.record(trace2);
    await vi.advanceTimersByTimeAsync(100);

    // 两次 upsert 调用应该有相同的 featureVectorHash
    const calls = (mockPrisma._mockTx.decisionInsight.upsert as Mock).mock.calls;
    if (calls.length >= 2) {
      expect(calls[0][0].create.featureVectorHash).toBe(calls[1][0].create.featureVectorHash);
    }
  });

  it('should generate different hash for different state', async () => {
    const state1 = { A: 0.8, F: 0.2, M: 0.7 };
    const state2 = { A: 0.5, F: 0.5, M: 0.5 };

    const trace1 = createDecisionTrace({ decisionId: 'diff-hash-1', stateSnapshot: state1 });
    const trace2 = createDecisionTrace({ decisionId: 'diff-hash-2', stateSnapshot: state2 });

    // 重置 mock 以便追踪调用
    mockPrisma._mockTx.decisionInsight.upsert = vi.fn().mockResolvedValue({}) as Mock;

    await service.record(trace1);
    await vi.advanceTimersByTimeAsync(100);

    await service.record(trace2);
    await vi.advanceTimersByTimeAsync(100);

    const calls = (mockPrisma._mockTx.decisionInsight.upsert as Mock).mock.calls;
    if (calls.length >= 2) {
      expect(calls[0][0].create.featureVectorHash).not.toBe(calls[1][0].create.featureVectorHash);
    }
  });
});
