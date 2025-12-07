/**
 * aboutApi Tests
 *
 * 测试 AMAS 公开展示 API 服务的功能，包括：
 * 1. 模拟决策 API
 * 2. 统计数据 API
 * 3. Pipeline 可视化 API
 * 4. 系统状态 API
 * 5. 错误处理和超时机制
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Import after mocking
import {
  simulate,
  getOverviewStats,
  getAlgorithmDistribution,
  getPerformanceMetrics,
  getOptimizationEvents,
  getMasteryRadar,
  getStateDistribution,
  getRecentDecisions,
  getMixedDecisions,
  getDecisionDetail,
  getPipelineSnapshot,
  getPacketTrace,
  injectFault,
  getPipelineLayerStatus,
  getAlgorithmStatus,
  getUserStateStatus,
  getMemoryStatus,
  getFeatureFlags,
  subscribeToDecisions,
  type SimulateRequest,
  type SimulateResponse,
  type OverviewStats,
  type AlgorithmDistribution,
  type PerformanceMetrics,
  type OptimizationEvent,
  type MasteryRadarData,
  type StateDistribution,
  type RecentDecision,
  type MixedDecisions,
  type DecisionDetail,
  type PipelineSnapshot,
  type PacketTrace,
  type FaultInjectionRequest,
  type FaultInjectionResponse,
} from '../aboutApi';

describe('aboutApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.store = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock response
  const createMockResponse = <T>(data: T, ok = true, status = 200) => ({
    ok,
    status,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    },
    json: () => Promise.resolve({ success: true, data }),
    text: () => Promise.resolve(JSON.stringify({ success: true, data })),
  });

  // ==================== simulate 测试 ====================

  describe('simulate', () => {
    const mockRequest: SimulateRequest = {
      attention: 0.8,
      fatigue: 0.3,
      motivation: 0.7,
      cognitive: {
        memory: 0.6,
        speed: 0.7,
        stability: 0.8,
      },
      scenario: 'motivated',
      learningMode: 'standard',
    };

    const mockResponse: SimulateResponse = {
      inputState: {
        A: 0.8,
        F: 0.3,
        M: 0.7,
        C: { mem: 0.6, speed: 0.7, stability: 0.8 },
        conf: 0.85,
      },
      decisionProcess: {
        phase: 'normal',
        votes: {
          thompson: { action: 'continue', contribution: 0.3, confidence: 0.85 },
        },
        weights: { thompson: 0.3, linucb: 0.25, actr: 0.25, heuristic: 0.2 },
        decisionSource: 'ensemble',
      },
      outputStrategy: {
        interval_scale: 1.2,
        new_ratio: 0.3,
        difficulty: 'medium',
        batch_size: 10,
        hint_level: 1,
      },
      explanation: {
        factors: [{ name: 'attention', value: 0.8, impact: 'positive', percentage: 30 }],
        summary: 'Good attention level suggests continuing with current difficulty',
      },
    };

    it('should send simulation request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await simulate(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/simulate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockRequest),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should include auth token in headers', async () => {
      localStorageMock.store['auth_token'] = 'test-token';
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await simulate(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(simulate(mockRequest)).rejects.toThrow();
    });
  });

  // ==================== getOverviewStats 测试 ====================

  describe('getOverviewStats', () => {
    const mockStats: OverviewStats = {
      todayDecisions: 1500,
      activeUsers: 250,
      avgEfficiencyGain: 0.23,
      timestamp: '2024-01-01T12:00:00.000Z',
    };

    it('should fetch overview stats', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockStats));

      const result = await getOverviewStats();

      expect(mockFetch).toHaveBeenCalledWith('/api/about/stats/overview', expect.any(Object));
      expect(result).toEqual(mockStats);
    });
  });

  // ==================== getAlgorithmDistribution 测试 ====================

  describe('getAlgorithmDistribution', () => {
    const mockDistribution: AlgorithmDistribution = {
      thompson: 0.3,
      linucb: 0.25,
      actr: 0.25,
      heuristic: 0.15,
      coldstart: 0.05,
    };

    it('should fetch algorithm distribution', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDistribution));

      const result = await getAlgorithmDistribution();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/algorithm-distribution',
        expect.any(Object),
      );
      expect(result).toEqual(mockDistribution);
    });
  });

  // ==================== getPerformanceMetrics 测试 ====================

  describe('getPerformanceMetrics', () => {
    const mockMetrics: PerformanceMetrics = {
      globalAccuracy: 0.82,
      accuracyImprovement: 0.15,
      avgInferenceMs: 12,
      p99InferenceMs: 45,
      causalATE: 0.08,
      causalConfidence: 0.95,
    };

    it('should fetch performance metrics', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMetrics));

      const result = await getPerformanceMetrics();

      expect(mockFetch).toHaveBeenCalledWith('/api/about/stats/performance', expect.any(Object));
      expect(result).toEqual(mockMetrics);
    });
  });

  // ==================== getOptimizationEvents 测试 ====================

  describe('getOptimizationEvents', () => {
    const mockEvents: OptimizationEvent[] = [
      {
        id: 'event-1',
        type: 'bayesian',
        title: 'Parameter Update',
        description: 'Updated learning rate',
        timestamp: '2024-01-01T12:00:00.000Z',
        impact: '+5% accuracy',
      },
    ];

    it('should fetch optimization events', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockEvents));

      const result = await getOptimizationEvents();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/optimization-events',
        expect.any(Object),
      );
      expect(result).toEqual(mockEvents);
    });
  });

  // ==================== getMasteryRadar 测试 ====================

  describe('getMasteryRadar', () => {
    const mockRadar: MasteryRadarData = {
      speed: 0.7,
      stability: 0.8,
      complexity: 0.6,
      consistency: 0.75,
    };

    it('should fetch mastery radar data', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockRadar));

      const result = await getMasteryRadar();

      expect(mockFetch).toHaveBeenCalledWith('/api/about/stats/mastery-radar', expect.any(Object));
      expect(result).toEqual(mockRadar);
    });
  });

  // ==================== getStateDistribution 测试 ====================

  describe('getStateDistribution', () => {
    const mockDistribution: StateDistribution = {
      attention: { low: 10, medium: 60, high: 30 },
      fatigue: { fresh: 40, normal: 45, tired: 15 },
      motivation: { frustrated: 5, neutral: 55, motivated: 40 },
    };

    it('should fetch state distribution', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDistribution));

      const result = await getStateDistribution();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/state-distribution',
        expect.any(Object),
      );
      expect(result).toEqual(mockDistribution);
    });
  });

  // ==================== getRecentDecisions 测试 ====================

  describe('getRecentDecisions', () => {
    const mockDecisions: RecentDecision[] = [
      {
        decisionId: 'decision-1',
        pseudoId: 'user-abc',
        timestamp: '2024-01-01T12:00:00.000Z',
        decisionSource: 'ensemble',
        strategy: { difficulty: 'medium', batch_size: 10 },
        dominantFactor: 'attention',
      },
    ];

    it('should fetch recent decisions without mixed flag', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDecisions));

      const result = await getRecentDecisions();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/recent-decisions',
        expect.any(Object),
      );
      expect(result).toEqual(mockDecisions);
    });

    it('should fetch recent decisions with mixed flag', async () => {
      const mixedDecisions: MixedDecisions = {
        real: mockDecisions,
        virtual: mockDecisions,
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mixedDecisions));

      const result = await getRecentDecisions(true);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/recent-decisions?mixed=true',
        expect.any(Object),
      );
    });
  });

  // ==================== getMixedDecisions 测试 ====================

  describe('getMixedDecisions', () => {
    const mockMixed: MixedDecisions = {
      real: [],
      virtual: [],
    };

    it('should fetch mixed decisions', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMixed));

      const result = await getMixedDecisions();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/stats/recent-decisions?mixed=true',
        expect.any(Object),
      );
      expect(result).toEqual(mockMixed);
    });
  });

  // ==================== getDecisionDetail 测试 ====================

  describe('getDecisionDetail', () => {
    const mockDetail: DecisionDetail = {
      decisionId: 'decision-1',
      timestamp: '2024-01-01T12:00:00.000Z',
      pseudoId: 'user-abc',
      decisionSource: 'ensemble',
      confidence: 0.85,
      strategy: { difficulty: 'medium', batch_size: 10 },
      weights: { thompson: 0.3 },
      memberVotes: [],
      pipeline: [],
    };

    it('should fetch decision detail', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDetail));

      const result = await getDecisionDetail('decision-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/about/decision/decision-1', expect.any(Object));
      expect(result).toEqual(mockDetail);
    });

    it('should fetch virtual decision detail', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDetail));

      await getDecisionDetail('decision-1', 'virtual');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/about/decision/decision-1?source=virtual',
        expect.any(Object),
      );
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
      });

      const result = await getDecisionDetail('non-existent');

      expect(result).toBeNull();
    });
  });

  // ==================== Pipeline 可视化 API 测试 ====================

  describe('Pipeline Visualization APIs', () => {
    describe('getPipelineSnapshot', () => {
      const mockSnapshot: PipelineSnapshot = {
        timestamp: Date.now(),
        currentPackets: [],
        nodeStates: {},
        metrics: {
          throughput: 100,
          avgLatency: 15,
          activePackets: 5,
          totalProcessed: 10000,
        },
      };

      it('should fetch pipeline snapshot', async () => {
        mockFetch.mockResolvedValueOnce(createMockResponse(mockSnapshot));

        const result = await getPipelineSnapshot();

        expect(mockFetch).toHaveBeenCalledWith('/api/about/pipeline/snapshot', expect.any(Object));
        expect(result).toEqual(mockSnapshot);
      });
    });

    describe('getPacketTrace', () => {
      const mockTrace: PacketTrace = {
        packetId: 'packet-1',
        status: 'completed',
        stages: [],
        totalDuration: 50,
      };

      it('should fetch packet trace', async () => {
        mockFetch.mockResolvedValueOnce(createMockResponse(mockTrace));

        const result = await getPacketTrace('packet-1');

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/pipeline/trace/packet-1',
          expect.any(Object),
        );
        expect(result).toEqual(mockTrace);
      });
    });

    describe('injectFault', () => {
      const mockRequest: FaultInjectionRequest = {
        faultType: 'high_fatigue',
        intensity: 0.8,
      };

      const mockResponse: FaultInjectionResponse = {
        packetId: 'fault-packet-1',
        faultType: 'high_fatigue',
        expectedPath: ['classify', 'adjust'],
        guardRailTriggers: ['fatigue_threshold'],
        expectedOutcome: 'Difficulty reduction triggered',
      };

      it('should inject fault', async () => {
        mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

        const result = await injectFault(mockRequest);

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/pipeline/inject-fault',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(mockRequest),
          }),
        );
        expect(result).toEqual(mockResponse);
      });
    });
  });

  // ==================== 系统状态 API 测试 ====================

  describe('System Status APIs', () => {
    describe('getPipelineLayerStatus', () => {
      it('should fetch pipeline layer status', async () => {
        const mockStatus = {
          layers: [],
          totalThroughput: 100,
          systemHealth: 'healthy',
        };
        mockFetch.mockResolvedValueOnce(createMockResponse(mockStatus));

        const result = await getPipelineLayerStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/system/pipeline-status',
          expect.any(Object),
        );
        expect(result).toEqual(mockStatus);
      });
    });

    describe('getAlgorithmStatus', () => {
      it('should fetch algorithm status', async () => {
        const mockStatus = {
          algorithms: [],
          ensembleConsensusRate: 0.85,
          coldstartStats: {
            classifyCount: 100,
            exploreCount: 50,
            normalCount: 850,
            userTypeDistribution: { fast: 30, stable: 50, cautious: 20 },
          },
        };
        mockFetch.mockResolvedValueOnce(createMockResponse(mockStatus));

        const result = await getAlgorithmStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/system/algorithm-status',
          expect.any(Object),
        );
        expect(result).toEqual(mockStatus);
      });
    });

    describe('getUserStateStatus', () => {
      it('should fetch user state status', async () => {
        const mockStatus = {
          distributions: {
            attention: { avg: 0.7, low: 10, medium: 60, high: 30, lowAlertCount: 5 },
            fatigue: { avg: 0.3, fresh: 40, normal: 45, tired: 15, highAlertCount: 3 },
            motivation: { avg: 0.7, frustrated: 5, neutral: 55, motivated: 40, lowAlertCount: 2 },
            cognitive: { memory: 0.6, speed: 0.7, stability: 0.8 },
          },
          recentInferences: [],
          modelParams: {
            attention: { beta: 0.5, weights: {} },
            fatigue: { decayK: 0.1, longBreakThreshold: 300 },
            motivation: { rho: 0.5, kappa: 0.3, lambda: 0.2 },
          },
        };
        mockFetch.mockResolvedValueOnce(createMockResponse(mockStatus));

        const result = await getUserStateStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/system/user-state-status',
          expect.any(Object),
        );
        expect(result).toEqual(mockStatus);
      });
    });

    describe('getMemoryStatus', () => {
      it('should fetch memory status', async () => {
        const mockStatus = {
          strengthDistribution: [],
          urgentReviewCount: 50,
          soonReviewCount: 150,
          stableCount: 800,
          avgHalfLifeDays: 7.5,
          todayConsolidationRate: 0.85,
        };
        mockFetch.mockResolvedValueOnce(createMockResponse(mockStatus));

        const result = await getMemoryStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          '/api/about/system/memory-status',
          expect.any(Object),
        );
        expect(result).toEqual(mockStatus);
      });
    });

    describe('getFeatureFlags', () => {
      it('should fetch feature flags', async () => {
        const mockFlags = {
          readEnabled: true,
          writeEnabled: true,
          flags: { newFeature: true, betaMode: false },
        };
        mockFetch.mockResolvedValueOnce(createMockResponse(mockFlags));

        const result = await getFeatureFlags();

        expect(mockFetch).toHaveBeenCalledWith('/api/about/feature-flags', expect.any(Object));
        expect(result).toEqual(mockFlags);
      });
    });
  });

  // ==================== 错误处理测试 ====================

  describe('Error Handling', () => {
    it('should handle non-JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html>Error</html>'),
      });

      await expect(getOverviewStats()).rejects.toThrow('响应不是 JSON 格式');
    });

    it('should handle HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('Server Error'),
      });

      await expect(getOverviewStats()).rejects.toThrow();
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getOverviewStats()).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(getOverviewStats()).rejects.toThrow('请求超时');
    });

    it('should handle request cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(getOverviewStats({ signal: controller.signal })).rejects.toThrow();
    });
  });

  // ==================== SSE 订阅测试 ====================

  describe('subscribeToDecisions', () => {
    it('should create EventSource and return close function', () => {
      const mockEventSource = {
        addEventListener: vi.fn(),
        close: vi.fn(),
        onerror: null as ((event: Event) => void) | null,
      };

      vi.stubGlobal(
        'EventSource',
        vi.fn(() => mockEventSource),
      );

      const onDecision = vi.fn();
      const onConnected = vi.fn();
      const onError = vi.fn();

      const closeFn = subscribeToDecisions(onDecision, onConnected, onError);

      expect(closeFn).toBeDefined();
      expect(typeof closeFn).toBe('function');

      closeFn();
      expect(mockEventSource.close).toHaveBeenCalled();
    });
  });
});
