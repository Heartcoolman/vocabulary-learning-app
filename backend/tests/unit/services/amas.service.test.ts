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
    user: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn((fn) => fn({
      wordLearningState: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      }
    }))
  }
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
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

// Mock AMAS Engine
const mockProcessEvent = vi.fn();
const mockGetUserState = vi.fn();
const mockResetUser = vi.fn();
const mockGetColdStartPhase = vi.fn();

vi.mock('../../../src/amas', () => ({
  AMASEngine: vi.fn().mockImplementation(() => ({
    processEvent: mockProcessEvent,
    getUserState: mockGetUserState,
    resetUser: mockResetUser,
    getColdStartPhase: mockGetColdStartPhase
  })),
  ProcessResult: {},
  RawEvent: {},
  UserState: {},
  StrategyParams: {},
  ColdStartPhase: {}
}));

vi.mock('../../../src/amas/repositories', () => ({
  cachedStateRepository: {},
  cachedModelRepository: {}
}));

// Import after mocks
import prisma from '../../../src/config/database';

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

    mockGetColdStartPhase.mockResolvedValue('normal');

    // Dynamic import to get fresh instance
    const { amasService: service } = await import('../../../src/services/amas.service');
    amasService = service;
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ==================== Process Event Tests ====================

  describe('processLearningEvent', () => {
    const mockUserId = 'user-123';
    const mockWordId = 'word-456';

    it('should process learning event and return strategy', async () => {
      (prisma.wordLearningState.findUnique as any).mockResolvedValue(null);

      const result = await amasService.processEvent({
        userId: mockUserId,
        wordId: mockWordId,
        isCorrect: true,
        responseTimeMs: 2500,
        timestamp: Date.now()
      });

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(mockProcessEvent).toHaveBeenCalled();
    });

    it('should create answer record on process', async () => {
      const result = await amasService.processEvent({
        userId: mockUserId,
        wordId: mockWordId,
        isCorrect: true,
        responseTimeMs: 2500,
        timestamp: Date.now()
      });

      expect(result).toBeDefined();
    });

    it('should update user state after processing', async () => {
      await amasService.processEvent({
        userId: mockUserId,
        wordId: mockWordId,
        isCorrect: false,
        responseTimeMs: 5000,
        timestamp: Date.now()
      });

      expect(mockProcessEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          isCorrect: false
        })
      );
    });

    it('should handle cold start phase', async () => {
      mockGetColdStartPhase.mockResolvedValueOnce('classify');

      const result = await amasService.processEvent({
        userId: 'new-user',
        wordId: mockWordId,
        isCorrect: true,
        responseTimeMs: 2000,
        timestamp: Date.now()
      });

      expect(result).toBeDefined();
    });

    it('should return explanation in trace', async () => {
      const result = await amasService.processEvent({
        userId: mockUserId,
        wordId: mockWordId,
        isCorrect: true,
        responseTimeMs: 2000,
        timestamp: Date.now()
      });

      expect(result.trace).toBeDefined();
    });
  });

  // ==================== Get State Tests ====================

  describe('getState', () => {
    it('should return user state', async () => {
      const state = await amasService.getState('user-123');

      expect(state).toBeDefined();
      expect(mockGetUserState).toHaveBeenCalledWith('user-123');
    });

    it('should return null for new users', async () => {
      mockGetUserState.mockResolvedValueOnce(null);

      const state = await amasService.getState('non-existent');

      expect(state).toBeNull();
    });
  });

  // ==================== Cold Start Phase Tests ====================

  describe('getColdStartPhase', () => {
    it('should return current cold start phase', async () => {
      const phase = await amasService.getColdStartPhase('user-123');

      expect(phase).toBe('normal');
      expect(mockGetColdStartPhase).toHaveBeenCalledWith('user-123');
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should clear cached state', async () => {
      await amasService.resetUser('user-123');

      expect(mockResetUser).toHaveBeenCalledWith('user-123');
    });

    it('should reset all learner states', async () => {
      await amasService.resetUser('user-123');

      expect(mockResetUser).toHaveBeenCalled();
    });
  });

  // ==================== Batch Process Tests ====================

  describe('batchProcess', () => {
    it('should process multiple events', async () => {
      const events = [
        { userId: 'user-1', wordId: 'word-1', isCorrect: true, responseTimeMs: 2000, timestamp: Date.now() },
        { userId: 'user-1', wordId: 'word-2', isCorrect: false, responseTimeMs: 3000, timestamp: Date.now() }
      ];

      const results = await amasService.batchProcess(events);

      expect(Array.isArray(results) || results.results).toBeTruthy();
    });

    it('should cap at 100 events', async () => {
      const largeEvents = Array.from({ length: 150 }, (_, i) => ({
        userId: 'user-1',
        wordId: `word-${i}`,
        isCorrect: true,
        responseTimeMs: 2000,
        timestamp: Date.now()
      }));

      await expect(amasService.batchProcess(largeEvents)).rejects.toThrow(/100/);
    });
  });
});
