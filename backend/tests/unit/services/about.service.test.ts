/**
 * About Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AboutService', () => {
  let aboutService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/about.service');
    aboutService = module.aboutService;
  });

  describe('simulate', () => {
    it('should return simulation response with valid input', () => {
      const input = {
        attention: 0.7,
        fatigue: 0.3,
        motivation: 0.5,
        cognitive: {
          memory: 0.6,
          speed: 0.7,
          stability: 0.5
        }
      };

      const result = aboutService.simulate(input);

      expect(result).toBeDefined();
      expect(result.inputState).toBeDefined();
      expect(result.decisionProcess).toBeDefined();
      expect(result.outputStrategy).toBeDefined();
      expect(result.explanation).toBeDefined();
    });

    it('should handle scenario presets', () => {
      const input = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0,
        cognitive: { memory: 0.5, speed: 0.5, stability: 0.5 },
        scenario: 'tired' as const
      };

      const result = aboutService.simulate(input);

      expect(result.inputState.F).toBeGreaterThanOrEqual(0.7);
    });

    it('should clamp values to valid ranges', () => {
      const input = {
        attention: 1.5,
        fatigue: -0.5,
        motivation: 2,
        cognitive: { memory: 1.5, speed: -0.2, stability: 0.5 }
      };

      const result = aboutService.simulate(input);

      expect(result.inputState.A).toBeLessThanOrEqual(1);
      expect(result.inputState.F).toBeGreaterThanOrEqual(0);
      expect(result.inputState.M).toBeLessThanOrEqual(1);
    });
  });

  describe('getOverviewStats', () => {
    it('should return overview statistics', () => {
      const stats = aboutService.getOverviewStats();

      expect(stats).toHaveProperty('todayDecisions');
      expect(stats).toHaveProperty('activeUsers');
      expect(stats).toHaveProperty('avgEfficiencyGain');
      expect(stats).toHaveProperty('timestamp');
    });

    it('should return cached result on subsequent calls', () => {
      const stats1 = aboutService.getOverviewStats();
      const stats2 = aboutService.getOverviewStats();

      expect(stats1.timestamp).toBe(stats2.timestamp);
    });
  });

  describe('getAlgorithmDistribution', () => {
    it('should return algorithm distribution', () => {
      const dist = aboutService.getAlgorithmDistribution();

      expect(dist).toHaveProperty('thompson');
      expect(dist).toHaveProperty('linucb');
      expect(dist).toHaveProperty('actr');
      expect(dist).toHaveProperty('heuristic');
      expect(dist).toHaveProperty('coldstart');
    });

    it('should have normalized values or all zeros when no data', () => {
      const dist = aboutService.getAlgorithmDistribution();
      const sum = dist.thompson + dist.linucb + dist.actr + dist.heuristic + dist.coldstart;

      // Either all zeros (no data) or sum to 1 (normalized)
      expect(sum === 0 || Math.abs(sum - 1) < 0.1).toBe(true);
    });
  });

  describe('getStateDistribution', () => {
    it('should return state distribution', () => {
      const dist = aboutService.getStateDistribution();

      expect(dist).toHaveProperty('attention');
      expect(dist).toHaveProperty('fatigue');
      expect(dist).toHaveProperty('motivation');
    });

    it('should have normalized attention values', () => {
      const dist = aboutService.getStateDistribution();
      const sum = dist.attention.low + dist.attention.medium + dist.attention.high;

      expect(sum).toBeCloseTo(1, 1);
    });
  });

  describe('getRecentDecisions', () => {
    it('should return recent decisions array', () => {
      const decisions = aboutService.getRecentDecisions();

      expect(Array.isArray(decisions)).toBe(true);
    });

    it('should have anonymized user IDs', () => {
      const decisions = aboutService.getRecentDecisions();

      if (decisions.length > 0) {
        expect(decisions[0].pseudoId).toBeDefined();
        expect(decisions[0].pseudoId.length).toBeLessThanOrEqual(16);
      }
    });
  });

  describe('getDecisionDetail', () => {
    it('should return null for non-existent decision', () => {
      const detail = aboutService.getDecisionDetail('non-existent-id');

      expect(detail).toBeNull();
    });

    it('should return detail for existing decision', () => {
      const decisions = aboutService.getRecentDecisions();
      if (decisions.length > 0) {
        const detail = aboutService.getDecisionDetail(decisions[0].decisionId);

        expect(detail).not.toBeNull();
        expect(detail?.decisionId).toBe(decisions[0].decisionId);
      }
    });
  });

  describe('getPipelineSnapshot', () => {
    it('should return pipeline snapshot', () => {
      const snapshot = aboutService.getPipelineSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('currentPackets');
      expect(snapshot).toHaveProperty('nodeStates');
      expect(snapshot).toHaveProperty('metrics');
    });

    it('should have valid metrics', () => {
      const snapshot = aboutService.getPipelineSnapshot();

      expect(snapshot.metrics).toHaveProperty('throughput');
      expect(snapshot.metrics).toHaveProperty('avgLatency');
      expect(snapshot.metrics).toHaveProperty('activePackets');
      expect(snapshot.metrics).toHaveProperty('totalProcessed');
    });
  });

  describe('getPacketTrace', () => {
    it('should return packet trace', () => {
      const trace = aboutService.getPacketTrace('test-packet');

      expect(trace).toHaveProperty('packetId');
      expect(trace).toHaveProperty('status');
      expect(trace).toHaveProperty('stages');
      expect(trace).toHaveProperty('totalDuration');
    });
  });

  describe('injectFault', () => {
    it('should inject high fatigue fault', () => {
      const response = aboutService.injectFault({
        faultType: 'high_fatigue',
        intensity: 0.8
      });

      expect(response).toHaveProperty('packetId');
      expect(response.faultType).toBe('high_fatigue');
      expect(response.guardRailTriggers).toContain('FatigueProtection');
    });

    it('should inject low attention fault', () => {
      const response = aboutService.injectFault({
        faultType: 'low_attention'
      });

      expect(response.faultType).toBe('low_attention');
      expect(response.guardRailTriggers).toContain('AttentionProtection');
    });

    it('should inject anomaly fault', () => {
      const response = aboutService.injectFault({
        faultType: 'anomaly'
      });

      expect(response.faultType).toBe('anomaly');
      expect(response.guardRailTriggers).toContain('AnomalyDetector');
    });
  });
});
