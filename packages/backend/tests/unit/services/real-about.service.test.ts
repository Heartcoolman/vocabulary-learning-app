/**
 * Real About Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockPrisma = {
  decisionRecord: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn()
  },
  answerRecord: {
    groupBy: vi.fn()
  },
  amasUserState: {
    findMany: vi.fn()
  },
  pipelineStage: {
    findMany: vi.fn()
  }
};

describe('RealAboutService', () => {
  let RealAboutService: any;
  let createRealAboutService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../../src/services/real-about.service');
    RealAboutService = module.RealAboutService;
    createRealAboutService = module.createRealAboutService;

    service = new RealAboutService(mockPrisma as any);
  });

  afterEach(() => {
    service.cleanup();
    vi.resetModules();
  });

  describe('getOverviewStats', () => {
    it('should return overview statistics', async () => {
      mockPrisma.decisionRecord.count.mockResolvedValue(100);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      mockPrisma.decisionRecord.aggregate.mockResolvedValue({ _avg: { reward: 0.15 } });

      const stats = await service.getOverviewStats();

      expect(stats).toHaveProperty('todayDecisions');
      expect(stats).toHaveProperty('activeUsers');
      expect(stats).toHaveProperty('avgEfficiencyGain');
      expect(stats).toHaveProperty('timestamp');
    });

    it('should return cached stats on second call', async () => {
      mockPrisma.decisionRecord.count.mockResolvedValue(100);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.decisionRecord.aggregate.mockResolvedValue({ _avg: { reward: null } });

      const stats1 = await service.getOverviewStats();
      const stats2 = await service.getOverviewStats();

      expect(stats1.timestamp).toBe(stats2.timestamp);
      expect(mockPrisma.decisionRecord.count).toHaveBeenCalledTimes(1);
    });

    it('should return default stats on error', async () => {
      mockPrisma.decisionRecord.count.mockRejectedValue(new Error('DB error'));

      const stats = await service.getOverviewStats();

      expect(stats.todayDecisions).toBe(0);
      expect(stats.activeUsers).toBe(0);
    });
  });

  describe('getAlgorithmDistribution', () => {
    it('should return algorithm distribution', async () => {
      mockPrisma.decisionRecord.findMany.mockResolvedValue([
        { decisionSource: 'ensemble', weightsSnapshot: { thompson: 0.4, linucb: 0.3, actr: 0.2, heuristic: 0.1 } },
        { decisionSource: 'coldstart', weightsSnapshot: null }
      ]);

      const dist = await service.getAlgorithmDistribution();

      expect(dist).toHaveProperty('thompson');
      expect(dist).toHaveProperty('linucb');
      expect(dist).toHaveProperty('actr');
      expect(dist).toHaveProperty('heuristic');
      expect(dist).toHaveProperty('coldstart');
    });

    it('should return default distribution when insufficient data', async () => {
      mockPrisma.decisionRecord.findMany.mockResolvedValue([]);

      const dist = await service.getAlgorithmDistribution();

      expect(dist.thompson).toBe(0.25);
      expect(dist.linucb).toBe(0.25);
    });
  });

  describe('getStateDistribution', () => {
    it('should return state distribution', async () => {
      mockPrisma.amasUserState.findMany.mockResolvedValue([
        { attention: 0.8, fatigue: 0.2, motivation: 0.5 },
        { attention: 0.3, fatigue: 0.7, motivation: -0.4 },
        { attention: 0.5, fatigue: 0.5, motivation: 0 },
        { attention: 0.9, fatigue: 0.1, motivation: 0.8 },
        { attention: 0.4, fatigue: 0.4, motivation: 0.2 }
      ]);

      const dist = await service.getStateDistribution();

      expect(dist.attention).toHaveProperty('low');
      expect(dist.attention).toHaveProperty('medium');
      expect(dist.attention).toHaveProperty('high');
      expect(dist.fatigue).toHaveProperty('fresh');
      expect(dist.motivation).toHaveProperty('frustrated');
    });

    it('should return default distribution when insufficient data', async () => {
      mockPrisma.amasUserState.findMany.mockResolvedValue([]);

      const dist = await service.getStateDistribution();

      expect(dist.attention.low).toBe(0.2);
      expect(dist.attention.medium).toBe(0.5);
    });
  });

  describe('getRecentDecisions', () => {
    it('should return anonymized recent decisions', async () => {
      mockPrisma.decisionRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          decisionId: 'dec-1',
          timestamp: new Date(),
          decisionSource: 'ensemble',
          selectedAction: { difficulty: 'mid', batch_size: 10 },
          weightsSnapshot: { thompson: 0.4 },
          answerRecordId: 'answer-1'
        }
      ]);

      const decisions = await service.getRecentDecisions(10);

      expect(Array.isArray(decisions)).toBe(true);
      if (decisions.length > 0) {
        expect(decisions[0]).toHaveProperty('pseudoId');
        expect(decisions[0]).toHaveProperty('decisionSource');
        expect(decisions[0]).toHaveProperty('strategy');
      }
    });

    it('should return cached decisions', async () => {
      mockPrisma.decisionRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          decisionId: 'dec-1',
          timestamp: new Date(),
          decisionSource: 'ensemble',
          selectedAction: {},
          weightsSnapshot: null,
          answerRecordId: null
        }
      ]);

      await service.getRecentDecisions(10);
      await service.getRecentDecisions(5);

      expect(mockPrisma.decisionRecord.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPipelineSnapshot', () => {
    it('should return pipeline snapshot', async () => {
      mockPrisma.decisionRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          decisionId: 'dec-1',
          timestamp: new Date(),
          decisionSource: 'ensemble',
          totalDurationMs: 45
        }
      ]);
      mockPrisma.decisionRecord.count.mockResolvedValue(100);
      mockPrisma.decisionRecord.aggregate.mockResolvedValue({ _avg: { totalDurationMs: 40 } });

      const snapshot = await service.getPipelineSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('currentPackets');
      expect(snapshot).toHaveProperty('nodeStates');
      expect(snapshot).toHaveProperty('metrics');
    });
  });

  describe('getPacketTrace', () => {
    it('should return packet trace for existing decision', async () => {
      mockPrisma.decisionRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        decisionId: 'dec-1',
        totalDurationMs: 45
      });
      mockPrisma.pipelineStage.findMany.mockResolvedValue([
        {
          stage: 'PERCEPTION',
          stageName: '感知层',
          durationMs: 10,
          startedAt: new Date(),
          endedAt: new Date()
        }
      ]);

      const trace = await service.getPacketTrace('dec-1');

      expect(trace.packetId).toBe('dec-1');
      expect(trace.status).toBe('completed');
      expect(trace.stages.length).toBeGreaterThan(0);
    });

    it('should return default trace for non-existent decision', async () => {
      mockPrisma.decisionRecord.findFirst.mockResolvedValue(null);

      const trace = await service.getPacketTrace('non-existent');

      expect(trace.packetId).toBe('non-existent');
      expect(trace.stages).toEqual([]);
    });
  });

  describe('getDecisionDetail', () => {
    it('should return null for empty decisionId', async () => {
      const result = await service.getDecisionDetail('');

      expect(result).toBeNull();
    });

    it('should return null for non-existent decision', async () => {
      mockPrisma.decisionRecord.findFirst.mockResolvedValue(null);

      const result = await service.getDecisionDetail('non-existent');

      expect(result).toBeNull();
    });

    it('should return decision detail with pipeline stages', async () => {
      mockPrisma.decisionRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        decisionId: 'dec-1',
        timestamp: new Date(),
        answerRecordId: 'answer-1',
        decisionSource: 'ensemble',
        coldstartPhase: null,
        confidence: 0.8,
        reward: 0.5,
        totalDurationMs: 45,
        selectedAction: { difficulty: 'mid', batch_size: 10 },
        weightsSnapshot: { thompson: 0.4 },
        memberVotes: { thompson: { action: 'a1', contribution: 0.4, confidence: 0.8 } }
      });
      mockPrisma.pipelineStage.findMany.mockResolvedValue([]);

      const result = await service.getDecisionDetail('dec-1');

      expect(result).not.toBeNull();
      expect(result?.decisionId).toBe('dec-1');
      expect(result?.confidence).toBe(0.8);
    });
  });

  describe('cleanup', () => {
    it('should clear cleanup timer', () => {
      const newService = createRealAboutService(mockPrisma as any);
      newService.cleanup();
      // Should not throw
    });
  });
});
