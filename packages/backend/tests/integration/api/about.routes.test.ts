/**
 * About Routes Integration Tests
 *
 * Tests for AMAS public showcase API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockAboutService, mockRealAboutService } = vi.hoisted(() => ({
  mockAboutService: {
    simulate: vi.fn(),
    getOverviewStats: vi.fn(),
    getAlgorithmDistribution: vi.fn(),
    getStateDistribution: vi.fn(),
    getRecentDecisions: vi.fn(),
    getDecisionDetail: vi.fn(),
    getPipelineSnapshot: vi.fn(),
    getPacketTrace: vi.fn(),
    injectFault: vi.fn()
  },
  mockRealAboutService: {
    getOverviewStats: vi.fn(),
    getAlgorithmDistribution: vi.fn(),
    getStateDistribution: vi.fn(),
    getRecentDecisions: vi.fn(),
    getDecisionDetail: vi.fn(),
    getPipelineSnapshot: vi.fn(),
    getPacketTrace: vi.fn()
  }
}));

const mockFeatureFlags = vi.hoisted(() => ({
  useRealDataSource: vi.fn(() => false),
  useVirtualDataSource: vi.fn(() => true),
  getFeatureFlagsStatus: vi.fn(() => ({
    writeEnabled: false,
    readEnabled: true
  })),
  isDecisionWriteEnabled: vi.fn(() => false)
}));

const mockDecisionRecorder = vi.hoisted(() => ({
  getSharedDecisionRecorder: vi.fn(() => ({
    recordDecision: vi.fn(),
    flush: vi.fn(),
    shutdown: vi.fn()
  })),
  DecisionRecorderService: vi.fn()
}));

vi.mock('../../../src/services/about.service', () => ({
  aboutService: mockAboutService,
  SimulateRequest: {},
  FaultInjectionRequest: {}
}));

vi.mock('../../../src/services/real-about.service', () => ({
  RealAboutService: vi.fn(),
  createRealAboutService: vi.fn(() => mockRealAboutService)
}));

vi.mock('../../../src/config/amas-feature-flags', () => mockFeatureFlags);

vi.mock('../../../src/monitoring/amas-metrics', () => ({
  getAllMetrics: vi.fn(() => ({ totalDecisions: 100, avgLatency: 50 })),
  getPrometheusMetrics: vi.fn(() => 'amas_decisions_total 100')
}));

vi.mock('../../../src/amas/services/decision-recorder.service', () => mockDecisionRecorder);

// Mock amas.service to prevent AMASService instantiation
vi.mock('../../../src/services/amas.service', () => ({
  default: {
    processLearningEvent: vi.fn(),
    getUserState: vi.fn(),
    resetUser: vi.fn(),
    getColdStartPhase: vi.fn(),
    batchProcessEvents: vi.fn(),
    getCurrentStrategy: vi.fn()
  },
  amasService: {
    processLearningEvent: vi.fn(),
    getUserState: vi.fn(),
    resetUser: vi.fn(),
    getColdStartPhase: vi.fn(),
    batchProcessEvents: vi.fn(),
    getCurrentStrategy: vi.fn()
  }
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser', role: 'USER' };
      next();
    } else if (authHeader === 'Bearer admin-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}));

vi.mock('../../../src/middleware/admin.middleware', () => ({
  adminMiddleware: (req: any, res: any, next: any) => {
    if (req.user?.role === 'ADMIN') {
      next();
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
}));

vi.mock('../../../src/config/database', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }])
  }
}));

vi.mock('../../../src/amas/services/decision-recorder.service', () => ({
  DecisionRecorderService: vi.fn().mockImplementation(() => ({
    record: vi.fn().mockResolvedValue(undefined)
  }))
}));

import app from '../../../src/app';

describe('About API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.useRealDataSource.mockReturnValue(false);
  });

  // ==================== POST /api/about/simulate ====================

  describe('POST /api/about/simulate', () => {
    const validInput = {
      attention: 0.8,
      fatigue: 0.2,
      motivation: 0.5,
      cognitive: { memory: 0.7, speed: 0.6, stability: 0.5 }
    };

    it('should simulate decision with valid input', async () => {
      mockAboutService.simulate.mockReturnValue({
        inputState: { A: 0.8, F: 0.2, M: 0.5, conf: 0.75 },
        outputStrategy: { interval_scale: 1.0, difficulty: 'mid' },
        decisionProcess: {
          weights: { thompson: 0.4, linucb: 0.4, heuristic: 0.2 },
          votes: {},
          decisionSource: 'ensemble',
          phase: 'normal'
        }
      });

      const res = await request(app)
        .post('/api/about/simulate')
        .send(validInput);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inputState).toBeDefined();
      expect(res.body.data.outputStrategy).toBeDefined();
    });

    it('should use default values for missing parameters', async () => {
      mockAboutService.simulate.mockReturnValue({
        inputState: { A: 0.6, F: 0.3, M: 0 },
        outputStrategy: { difficulty: 'mid' },
        decisionProcess: { weights: {}, votes: {}, phase: 'normal' }
      });

      const res = await request(app)
        .post('/api/about/simulate')
        .send({});

      expect(res.status).toBe(200);
      expect(mockAboutService.simulate).toHaveBeenCalled();
    });

    it('should return 400 for invalid attention value', async () => {
      const res = await request(app)
        .post('/api/about/simulate')
        .send({ attention: 1.5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('attention');
    });

    it('should return 400 for invalid fatigue value', async () => {
      const res = await request(app)
        .post('/api/about/simulate')
        .send({ fatigue: -0.5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('fatigue');
    });

    it('should return 400 for invalid motivation value', async () => {
      const res = await request(app)
        .post('/api/about/simulate')
        .send({ motivation: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('motivation');
    });
  });

  // ==================== GET /api/about/stats/overview ====================

  describe('GET /api/about/stats/overview', () => {
    it('should return virtual stats when real data source disabled', async () => {
      mockAboutService.getOverviewStats.mockReturnValue({
        todayDecisions: 150,
        activeUsers: 25,
        avgLatency: 45
      });

      const res = await request(app).get('/api/about/stats/overview');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.source).toBe('virtual');
      expect(res.body.data.todayDecisions).toBe(150);
    });

    it('should return real stats when real data source enabled', async () => {
      mockFeatureFlags.useRealDataSource.mockReturnValue(true);
      mockRealAboutService.getOverviewStats.mockResolvedValue({
        todayDecisions: 200,
        activeUsers: 30
      });

      const res = await request(app).get('/api/about/stats/overview');

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('real');
    });
  });

  // ==================== GET /api/about/stats/algorithm-distribution ====================

  describe('GET /api/about/stats/algorithm-distribution', () => {
    it('should return algorithm distribution', async () => {
      mockAboutService.getAlgorithmDistribution.mockReturnValue({
        thompson: 0.35,
        linucb: 0.40,
        heuristic: 0.25
      });

      const res = await request(app).get('/api/about/stats/algorithm-distribution');

      expect(res.status).toBe(200);
      expect(res.body.data.thompson).toBeDefined();
      expect(res.body.data.linucb).toBeDefined();
    });
  });

  // ==================== GET /api/about/stats/state-distribution ====================

  describe('GET /api/about/stats/state-distribution', () => {
    it('should return state distribution', async () => {
      mockAboutService.getStateDistribution.mockReturnValue({
        highAttention: 40,
        mediumAttention: 35,
        lowAttention: 25
      });

      const res = await request(app).get('/api/about/stats/state-distribution');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== GET /api/about/stats/recent-decisions ====================

  describe('GET /api/about/stats/recent-decisions', () => {
    it('should return recent decisions', async () => {
      mockAboutService.getRecentDecisions.mockReturnValue([
        { id: 'd1', timestamp: new Date().toISOString() },
        { id: 'd2', timestamp: new Date().toISOString() }
      ]);

      const res = await request(app).get('/api/about/stats/recent-decisions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return mixed data when requested', async () => {
      mockFeatureFlags.useRealDataSource.mockReturnValue(true);
      mockRealAboutService.getRecentDecisions.mockResolvedValue([{ id: 'real1' }]);
      mockAboutService.getRecentDecisions.mockReturnValue([{ id: 'virtual1' }]);

      const res = await request(app).get('/api/about/stats/recent-decisions?mixed=true');

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('mixed');
      expect(res.body.data.real).toBeDefined();
      expect(res.body.data.virtual).toBeDefined();
    });
  });

  // ==================== GET /api/about/decision/:decisionId ====================

  describe('GET /api/about/decision/:decisionId', () => {
    it('should return virtual decision detail', async () => {
      mockAboutService.getDecisionDetail.mockReturnValue({
        id: 'decision-123',
        inputState: { A: 0.8 },
        outputStrategy: { difficulty: 'mid' }
      });

      const res = await request(app).get('/api/about/decision/decision-123?source=virtual');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('decision-123');
      expect(res.body.source).toBe('virtual');
    });

    it('should return 404 for non-existent virtual decision', async () => {
      mockAboutService.getDecisionDetail.mockReturnValue(null);

      const res = await request(app).get('/api/about/decision/non-existent?source=virtual');

      expect(res.status).toBe(404);
    });

    it('should return 400 when requesting real data without real source enabled', async () => {
      mockFeatureFlags.useRealDataSource.mockReturnValue(false);

      const res = await request(app).get('/api/about/decision/decision-123');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/about/pipeline/snapshot ====================

  describe('GET /api/about/pipeline/snapshot', () => {
    it('should return pipeline snapshot', async () => {
      mockAboutService.getPipelineSnapshot.mockReturnValue({
        stages: ['perception', 'modeling', 'decision'],
        activePackets: 5
      });

      const res = await request(app).get('/api/about/pipeline/snapshot');

      expect(res.status).toBe(200);
      expect(res.body.data.stages).toBeDefined();
    });
  });

  // ==================== GET /api/about/pipeline/trace/:packetId ====================

  describe('GET /api/about/pipeline/trace/:packetId', () => {
    it('should return packet trace', async () => {
      mockAboutService.getPacketTrace.mockReturnValue({
        packetId: 'packet-1',
        stages: [{ name: 'perception', duration: 10 }]
      });

      const res = await request(app).get('/api/about/pipeline/trace/packet-1');

      expect(res.status).toBe(200);
      expect(res.body.data.packetId).toBe('packet-1');
    });
  });

  // ==================== POST /api/about/pipeline/inject-fault ====================

  describe('POST /api/about/pipeline/inject-fault', () => {
    it('should require admin authentication', async () => {
      const res = await request(app)
        .post('/api/about/pipeline/inject-fault')
        .set('Authorization', 'Bearer valid-token')
        .send({ faultType: 'high_fatigue' });

      expect(res.status).toBe(403);
    });

    it('should inject fault with admin token', async () => {
      mockAboutService.injectFault.mockReturnValue({
        success: true,
        faultId: 'fault-123'
      });

      const res = await request(app)
        .post('/api/about/pipeline/inject-fault')
        .set('Authorization', 'Bearer admin-token')
        .send({ faultType: 'high_fatigue', intensity: 0.8 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid fault type', async () => {
      const res = await request(app)
        .post('/api/about/pipeline/inject-fault')
        .set('Authorization', 'Bearer admin-token')
        .send({ faultType: 'invalid_type' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/about/metrics ====================

  describe('GET /api/about/metrics', () => {
    it('should return metrics in JSON format', async () => {
      const res = await request(app).get('/api/about/metrics');

      expect(res.status).toBe(200);
      expect(res.body.data.totalDecisions).toBe(100);
    });
  });

  // ==================== GET /api/about/metrics/prometheus ====================

  describe('GET /api/about/metrics/prometheus', () => {
    it('should return metrics in Prometheus format', async () => {
      const res = await request(app).get('/api/about/metrics/prometheus');

      expect(res.status).toBe(200);
      expect(res.type).toBe('text/plain');
      expect(res.text).toContain('amas_decisions_total');
    });
  });

  // ==================== GET /api/about/feature-flags ====================

  describe('GET /api/about/feature-flags', () => {
    it('should return feature flags status', async () => {
      const res = await request(app).get('/api/about/feature-flags');

      expect(res.status).toBe(200);
      expect(res.body.data.writeEnabled).toBeDefined();
      expect(res.body.data.readEnabled).toBeDefined();
    });
  });

  // ==================== GET /api/about/health ====================

  describe('GET /api/about/health', () => {
    it('should return basic health for normal user', async () => {
      const res = await request(app)
        .get('/api/about/health')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBeDefined();
      expect(res.body.data.database).toBeUndefined();
    });

    it('should return detailed health for admin', async () => {
      const res = await request(app)
        .get('/api/about/health')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.database).toBeDefined();
      expect(res.body.data.dataSource).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/about/health');

      expect(res.status).toBe(401);
    });
  });
});
