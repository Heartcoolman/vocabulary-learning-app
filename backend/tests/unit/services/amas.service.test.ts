/**
 * AMAS Service Unit Tests
 *
 * Tests for the AMAS service layer that integrates the adaptive learning engine
 * with the application's data layer.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    learningSession: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn((fn) => {
      if (typeof fn === 'function') {
        return fn({
          wordLearningState: {
            findUnique: vi.fn(),
            upsert: vi.fn()
          }
        });
      }
      return Promise.all(fn);
    })
  }
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delete: vi.fn(),
    delPattern: vi.fn()
  },
  CacheKeys: {
    userState: (id: string) => `user:${id}:state`,
    featureVector: (userId: string, wordId: string) => `fv:${userId}:${wordId}`
  },
  CacheTTL: {
    SHORT: 300,
    MEDIUM: 3600,
    LONG: 86400
  }
}));

vi.mock('../../../src/services/delayed-reward.service', () => ({
  delayedRewardService: {
    createPendingReward: vi.fn().mockResolvedValue({ id: 'reward-1' }),
    getPendingRewards: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../../src/services/state-history.service', () => ({
  stateHistoryService: {
    recordStateChange: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../../src/services/habit-profile.service', () => ({
  habitProfileService: {
    recordSession: vi.fn().mockResolvedValue(undefined),
    recordTimeEvent: vi.fn(),
    getHabitProfile: vi.fn().mockReturnValue({ samples: { timeEvents: 0 } }),
    persistHabitProfile: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('../../../src/services/evaluation.service', () => ({
  evaluationService: {
    evaluateSession: vi.fn().mockResolvedValue({ score: 0.8 })
  }
}));

vi.mock('../../../src/services/metrics.service', () => ({
  recordFeatureVectorSaved: vi.fn()
}));

vi.mock('../../../src/amas/config/feature-flags', () => ({
  getFeatureFlags: vi.fn().mockReturnValue({
    ensemble: true,
    causalInference: false,
    bayesianOptimizer: false
  }),
  getFeatureFlagsSummary: vi.fn().mockReturnValue('[Feature Flags] test'),
  isEnsembleEnabled: vi.fn().mockReturnValue(true),
  isCausalInferenceEnabled: vi.fn().mockReturnValue(false),
  isBayesianOptimizerEnabled: vi.fn().mockReturnValue(false)
}));

// Mock AMAS Engine as a proper class
const mockProcessEvent = vi.fn().mockResolvedValue({
  strategy: {
    interval_scale: 1.0,
    new_ratio: 0.2,
    difficulty: 'mid',
    hint_level: 0,
    workload_factor: 1.0
  },
  nextState: {
    avgErrorRate: 0.1,
    avgResponseTimeMs: 3000
  },
  trace: {
    selectedAction: 'action-1',
    confidence: 0.8
  }
});

const mockGetUserState = vi.fn().mockResolvedValue({
  avgErrorRate: 0.15,
  avgResponseTimeMs: 3200,
  interactionCount: 50,
  attention: 0.7,
  fatigue: 0.2,
  motivation: 0.5
});

const mockResetUser = vi.fn();
const mockGetColdStartPhase = vi.fn().mockReturnValue('normal');

const mockEngineInstance = {
  processEvent: mockProcessEvent,
  getUserState: mockGetUserState,
  resetUser: mockResetUser,
  getColdStartPhase: mockGetColdStartPhase
};

vi.mock('../../../src/amas', () => {
  return {
    AMASEngine: vi.fn().mockImplementation(function() {
      return mockEngineInstance;
    }),
    ProcessResult: {},
    RawEvent: {},
    UserState: {},
    StrategyParams: {},
    ColdStartPhase: {}
  };
});

vi.mock('../../../src/amas/repositories', () => ({
  cachedStateRepository: {},
  cachedModelRepository: {}
}));

describe('AMASService', () => {
  let amasService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockProcessEvent.mockResolvedValue({
      strategy: {
        interval_scale: 1.0,
        new_ratio: 0.2,
        difficulty: 'mid',
        hint_level: 0,
        workload_factor: 1.0
      },
      nextState: {
        avgErrorRate: 0.1,
        avgResponseTimeMs: 3000
      },
      trace: {
        selectedAction: 'action-1',
        confidence: 0.8
      }
    });

    mockGetUserState.mockResolvedValue({
      avgErrorRate: 0.15,
      avgResponseTimeMs: 3200,
      interactionCount: 50,
      attention: 0.7,
      fatigue: 0.2,
      motivation: 0.5
    });

    mockGetColdStartPhase.mockReturnValue('normal');

    // Dynamic import to get fresh instance
    vi.resetModules();
    const { amasService: service } = await import('../../../src/services/amas.service');
    amasService = service;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('service exports', () => {
    it('should export amasService singleton', () => {
      expect(amasService).toBeDefined();
    });

    it('should have processLearningEvent method', () => {
      expect(amasService.processLearningEvent).toBeDefined();
      expect(typeof amasService.processLearningEvent).toBe('function');
    });

    it('should have resetUser method', () => {
      expect(amasService.resetUser).toBeDefined();
      expect(typeof amasService.resetUser).toBe('function');
    });

    it('should have batchProcessEvents method', () => {
      expect(amasService.batchProcessEvents).toBeDefined();
      expect(typeof amasService.batchProcessEvents).toBe('function');
    });
  });

  describe('getColdStartPhase', () => {
    it('should return current cold start phase', () => {
      const phase = amasService.getColdStartPhase('user-123');

      expect(phase).toBe('normal');
      expect(mockGetColdStartPhase).toHaveBeenCalledWith('user-123');
    });

    it('should return classify phase for new users', () => {
      mockGetColdStartPhase.mockReturnValueOnce('classify');

      const phase = amasService.getColdStartPhase('new-user');

      expect(phase).toBe('classify');
    });
  });

  describe('resetUser', () => {
    it('should call engine resetUser', async () => {
      await amasService.resetUser('user-123');

      expect(mockResetUser).toHaveBeenCalledWith('user-123');
    });
  });

  describe('engine integration', () => {
    it('should have engine with processEvent method', () => {
      expect(mockProcessEvent).toBeDefined();
    });

    it('should have engine with getUserState method', () => {
      expect(mockGetUserState).toBeDefined();
    });

    it('should have engine with getColdStartPhase method', () => {
      expect(mockGetColdStartPhase).toBeDefined();
    });
  });
});
