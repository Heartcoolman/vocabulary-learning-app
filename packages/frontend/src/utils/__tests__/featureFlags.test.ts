/**
 * FeatureFlags 单元测试
 *
 * 测试特性开关系统的核心功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FeatureFlagManager,
  getFeatureFlagManager,
  isFeatureEnabled,
  evaluateFeature,
  setFeatureFlagUserContext,
  type UserContext,
} from '../featureFlags';

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

describe('FeatureFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FeatureFlagManager', () => {
    let manager: FeatureFlagManager;

    beforeEach(() => {
      manager = new FeatureFlagManager({
        storageKey: 'test-flags',
      });
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should create instance with default config', () => {
      const defaultManager = new FeatureFlagManager();
      expect(defaultManager).toBeDefined();
      defaultManager.destroy();
    });

    it('should register a feature flag', () => {
      manager.register({
        key: 'new-feature',
        name: 'New Feature',
        type: 'boolean',
        status: 'active',
        defaultValue: false,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const all = manager.getAllFlags();
      expect(all).toHaveLength(1);
      expect(all[0].key).toBe('new-feature');
    });

    it('should evaluate a feature flag', () => {
      manager.register({
        key: 'test-feature',
        name: 'Test Feature',
        type: 'boolean',
        status: 'active',
        defaultValue: true,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = manager.isEnabled('test-feature');
      expect(result).toBe(true);
    });

    it('should return default value for non-existent flag', () => {
      const result = manager.isEnabled('non-existent', false);
      expect(result).toBe(false);
    });

    it('should set user context', () => {
      const userContext: UserContext = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      manager.setUserContext(userContext);
      expect(manager).toBeDefined();
    });

    it('should override flag for testing', () => {
      manager.register({
        key: 'test-override',
        name: 'Test Override',
        type: 'boolean',
        status: 'active',
        defaultValue: false,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(manager.isEnabled('test-override')).toBe(false);

      manager.override('test-override', true);
      expect(manager.isEnabled('test-override')).toBe(true);

      manager.clearOverride('test-override');
      expect(manager.isEnabled('test-override')).toBe(false);
    });

    it('should subscribe to flag changes', () => {
      const callback = vi.fn();

      manager.register({
        key: 'subscribable',
        name: 'Subscribable',
        type: 'boolean',
        status: 'active',
        defaultValue: false,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const unsubscribe = manager.subscribe('subscribable', callback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should handle percentage-based rollout', () => {
      manager.register({
        key: 'percentage-feature',
        name: 'Percentage Feature',
        type: 'percentage',
        status: 'active',
        defaultValue: false,
        percentage: 100, // 100% enabled
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      manager.setUserContext({ userId: 'test-user' });

      // 100% should always be enabled
      const result = manager.isEnabled('percentage-feature');
      expect(result).toBe(true);
    });

    it('should evaluate flag with rules', () => {
      manager.register({
        key: 'rule-feature',
        name: 'Rule Feature',
        type: 'rules',
        status: 'active',
        defaultValue: false,
        rules: [
          {
            id: 'rule-1',
            priority: 1,
            conditions: [
              {
                type: 'user',
                operator: 'equals',
                field: 'userId',
                value: 'vip-user',
              },
            ],
            result: true,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Non-VIP user
      manager.setUserContext({ userId: 'regular-user' });
      expect(manager.isEnabled('rule-feature')).toBe(false);

      // VIP user
      manager.setUserContext({ userId: 'vip-user' });
      expect(manager.isEnabled('rule-feature')).toBe(true);
    });

    it('should handle disabled flag', () => {
      manager.register({
        key: 'disabled-feature',
        name: 'Disabled Feature',
        type: 'boolean',
        status: 'disabled',
        defaultValue: true,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(manager.isEnabled('disabled-feature')).toBe(false);
    });

    it('should get evaluation details', () => {
      manager.register({
        key: 'detail-feature',
        name: 'Detail Feature',
        type: 'boolean',
        status: 'active',
        defaultValue: true,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const evaluation = manager.evaluate('detail-feature');

      expect(evaluation.key).toBe('detail-feature');
      expect(evaluation.enabled).toBe(true);
      expect(evaluation.reason).toBeDefined();
      expect(evaluation.timestamp).toBeInstanceOf(Date);
    });

    it('should get flag by key', () => {
      manager.register({
        key: 'get-flag-test',
        name: 'Get Flag Test',
        type: 'boolean',
        status: 'active',
        defaultValue: true,
        rules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const flag = manager.getFlag('get-flag-test');
      expect(flag).toBeDefined();
      expect(flag?.key).toBe('get-flag-test');
    });

    it('should return undefined for non-existent flag', () => {
      const flag = manager.getFlag('non-existent');
      expect(flag).toBeUndefined();
    });
  });

  describe('Global helper functions', () => {
    it('should get feature flag manager singleton', () => {
      const manager = getFeatureFlagManager();
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(FeatureFlagManager);
    });

    it('should check if feature is enabled', () => {
      const result = isFeatureEnabled('non-existent-feature');
      expect(typeof result).toBe('boolean');
    });

    it('should evaluate feature', () => {
      const evaluation = evaluateFeature('non-existent-feature');
      expect(evaluation).toBeDefined();
      expect(evaluation.key).toBe('non-existent-feature');
      expect(typeof evaluation.enabled).toBe('boolean');
    });

    it('should set feature flag user context', () => {
      expect(() => setFeatureFlagUserContext({ userId: 'user-123' })).not.toThrow();
    });
  });

  describe('FEATURE_FLAGS constant', () => {
    it('should export FEATURE_FLAGS constant', async () => {
      const { FEATURE_FLAGS } = await import('../featureFlags');
      expect(FEATURE_FLAGS).toBeDefined();
      expect(typeof FEATURE_FLAGS).toBe('object');
    });
  });
});
