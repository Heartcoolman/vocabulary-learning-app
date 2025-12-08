/**
 * A/B Testing 单元测试
 *
 * 测试A/B测试系统的核心功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock featureFlags
vi.mock('../featureFlags', () => ({
  getFeatureFlagManager: vi.fn(() => ({
    setUserContext: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
  })),
  UserContext: {},
}));

describe('ABTesting', () => {
  let ABTestingManager: typeof import('../abTesting').ABTestingManager;
  let getABTestingManager: typeof import('../abTesting').getABTestingManager;
  let getExperimentVariant: typeof import('../abTesting').getExperimentVariant;
  let isInExperiment: typeof import('../abTesting').isInExperiment;
  let trackExperimentEvent: typeof import('../abTesting').trackExperimentEvent;
  let trackExperimentConversion: typeof import('../abTesting').trackExperimentConversion;
  let setABTestingUserContext: typeof import('../abTesting').setABTestingUserContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorageMock.clear();

    const abTestingModule = await import('../abTesting');
    ABTestingManager = abTestingModule.ABTestingManager;
    getABTestingManager = abTestingModule.getABTestingManager;
    getExperimentVariant = abTestingModule.getExperimentVariant;
    isInExperiment = abTestingModule.isInExperiment;
    trackExperimentEvent = abTestingModule.trackExperimentEvent;
    trackExperimentConversion = abTestingModule.trackExperimentConversion;
    setABTestingUserContext = abTestingModule.setABTestingUserContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ABTestingManager', () => {
    let manager: InstanceType<typeof ABTestingManager>;

    beforeEach(() => {
      manager = new ABTestingManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should create instance', () => {
      expect(manager).toBeDefined();
    });

    it('should register experiment', () => {
      const experiment = {
        id: 'exp-1',
        key: 'test_experiment',
        name: 'Test Experiment',
        status: 'running' as const,
        variants: [
          { id: 'control', name: 'Control', weight: 50, config: {}, isControl: true },
          {
            id: 'treatment',
            name: 'Treatment',
            weight: 50,
            config: { newFeature: true },
            isControl: false,
          },
        ],
        metrics: [
          {
            id: 'm1',
            name: 'Conversion',
            type: 'conversion' as const,
            eventName: 'purchase',
            isPrimary: true,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      const registered = manager.getExperiment('test_experiment');
      expect(registered).toBeDefined();
      expect(registered?.key).toBe('test_experiment');
    });

    it('should set user context', () => {
      expect(() =>
        manager.setUserContext({
          userId: 'user-123',
          email: 'test@example.com',
        }),
      ).not.toThrow();
    });

    it('should assign user to variant', () => {
      const experiment = {
        id: 'exp-1',
        key: 'assignment_test',
        name: 'Assignment Test',
        status: 'running' as const,
        variants: [
          { id: 'control', name: 'Control', weight: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', weight: 50, config: {}, isControl: false },
        ],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      manager.setUserContext({ userId: 'user-123' });

      const variant = manager.getVariant('assignment_test');
      expect(variant).toBeDefined();
      expect(['control', 'treatment']).toContain(variant?.id);
    });

    it('should return consistent variant for same user', () => {
      const experiment = {
        id: 'exp-1',
        key: 'consistency_test',
        name: 'Consistency Test',
        status: 'running' as const,
        variants: [
          { id: 'control', name: 'Control', weight: 50, config: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', weight: 50, config: {}, isControl: false },
        ],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      manager.setUserContext({ userId: 'user-123' });

      const variant1 = manager.getVariant('consistency_test');
      const variant2 = manager.getVariant('consistency_test');

      expect(variant1?.id).toBe(variant2?.id);
    });

    it('should track events', () => {
      const experiment = {
        id: 'exp-1',
        key: 'event_test',
        name: 'Event Test',
        status: 'running' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [
          { id: 'm1', name: 'Click', type: 'count' as const, eventName: 'click', isPrimary: true },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      manager.setUserContext({ userId: 'user-123' });
      manager.getVariant('event_test'); // Ensure assignment

      expect(() => manager.trackEvent('event_test', 'click', 1)).not.toThrow();
    });

    it('should get all experiments', () => {
      const experiment1 = {
        id: 'exp-1',
        key: 'exp_one',
        name: 'Experiment One',
        status: 'running' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const experiment2 = {
        id: 'exp-2',
        key: 'exp_two',
        name: 'Experiment Two',
        status: 'running' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment1);
      manager.registerExperiment(experiment2);

      const all = manager.getAllExperiments();
      expect(all).toHaveLength(2);
    });

    it('should clear experiment data', () => {
      const experiment = {
        id: 'exp-1',
        key: 'clear_test',
        name: 'Clear Test',
        status: 'running' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      manager.clearExperiment('clear_test');

      const exp = manager.getExperiment('clear_test');
      expect(exp).toBeUndefined();
    });

    it('should return null for non-existent experiment', () => {
      const variant = manager.getVariant('non_existent');
      expect(variant).toBeNull();
    });

    it('should handle paused experiments', () => {
      const experiment = {
        id: 'exp-1',
        key: 'paused_test',
        name: 'Paused Test',
        status: 'paused' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      manager.setUserContext({ userId: 'user-123' });

      const variant = manager.getVariant('paused_test');
      // Paused experiments should return control or null
      expect(variant === null || variant.isControl).toBe(true);
    });

    it('should handle draft experiments', () => {
      const experiment = {
        id: 'exp-1',
        key: 'draft_test',
        name: 'Draft Test',
        status: 'draft' as const,
        variants: [{ id: 'control', name: 'Control', weight: 100, config: {}, isControl: true }],
        metrics: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      manager.registerExperiment(experiment);
      expect(manager.getExperiment('draft_test')).toBeDefined();
    });
  });

  describe('Global helper functions', () => {
    it('should get ABTesting manager singleton', () => {
      const manager = getABTestingManager();
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(ABTestingManager);
    });

    it('should return null for non-existent experiment variant', () => {
      const variant = getExperimentVariant('non_existent_experiment');
      expect(variant).toBeNull();
    });

    it('should check if user is in experiment', () => {
      const result = isInExperiment('non_existent_experiment');
      expect(result).toBe(false);
    });

    it('should track experiment event without throwing', () => {
      expect(() => trackExperimentEvent('some_experiment', 'click', 1)).not.toThrow();
    });

    it('should track experiment conversion without throwing', () => {
      expect(() => trackExperimentConversion('some_experiment')).not.toThrow();
    });

    it('should set ABTesting user context', () => {
      expect(() => setABTestingUserContext({ userId: 'user-123' })).not.toThrow();
    });
  });

  describe('EXPERIMENTS constant', () => {
    it('should export EXPERIMENTS constant', async () => {
      const { EXPERIMENTS } = await import('../abTesting');
      expect(EXPERIMENTS).toBeDefined();
      expect(typeof EXPERIMENTS).toBe('object');
    });
  });
});
