/**
 * Engine Persistence Tests
 *
 * 测试 AMAS Engine 持久化管理模块：
 * 1. 状态加载和保存
 * 2. 模型加载和保存
 * 3. LinUCB 模型持久化
 * 4. Ensemble 模型持久化
 * 5. 冷启动状态持久化
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultPersistenceManager,
  PersistenceManager,
  MemoryStateRepository,
  MemoryModelRepository,
  StateRepository,
  ModelRepository,
  Logger,
  ColdStartStateData,
} from '../../../../src/amas/core/engine';
import { LinUCB, LinUCBContext } from '../../../../src/amas/learning/linucb';
import { EnsembleLearningFramework } from '../../../../src/amas/decision/ensemble';
import { UserState, BanditModel, Action } from '../../../../src/amas/types';
import { mockLogger } from '../../../setup';

// Helper to create LinUCB context for testing
const createTestContext = (): LinUCBContext => ({
  recentErrorRate: 0.2,
  recentResponseTime: 2000,
  timeBucket: 14,
});

// Helper to create test state
const createTestState = (): UserState => ({
  A: 0.8,
  F: 0.2,
  M: 0.6,
  C: { mem: 0.7, speed: 0.7, stability: 0.7 },
  conf: 0.8,
  ts: Date.now(),
});

// Helper to create test action
const createTestAction = (): Action => ({
  interval_scale: 1.0,
  new_ratio: 0.2,
  difficulty: 'mid',
  batch_size: 8,
  hint_level: 1,
});

// Mock dependencies
vi.mock('../../../../src/amas/common/telemetry', () => ({
  telemetry: {
    record: vi.fn(),
    increment: vi.fn(),
    histogram: vi.fn(),
    gauge: vi.fn(),
  },
}));

vi.mock('../../../../src/amas/config/feature-flags', () => ({
  getFeatureFlags: vi.fn().mockReturnValue({
    enableEnsemble: false,
    enableTrendAnalyzer: false,
    enableColdStartManager: false,
    enableThompsonSampling: false,
    enableHeuristicBaseline: false,
    enableACTRMemory: false,
    enableUserParamsManager: false,
  }),
  isColdStartEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  startupLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('EnginePersistence', () => {
  let stateRepo: MemoryStateRepository;
  let modelRepo: MemoryModelRepository;
  let persistence: DefaultPersistenceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    stateRepo = new MemoryStateRepository();
    modelRepo = new MemoryModelRepository();
    persistence = new DefaultPersistenceManager(
      stateRepo,
      modelRepo,
      mockLogger as unknown as Logger,
    );
  });

  // ==================== 接口实现测试 ====================

  describe('interface implementation', () => {
    it('should implement PersistenceManager interface', () => {
      expect(persistence).toBeDefined();
      expect(typeof persistence.loadState).toBe('function');
      expect(typeof persistence.saveState).toBe('function');
      expect(typeof persistence.loadModelIfExists).toBe('function');
      expect(typeof persistence.saveModel).toBe('function');
    });

    it('should work without logger', () => {
      const persistenceWithoutLogger = new DefaultPersistenceManager(stateRepo, modelRepo);
      expect(persistenceWithoutLogger).toBeDefined();
    });
  });

  // ==================== 状态加载测试 ====================

  describe('loadState', () => {
    it('should return null for non-existent user', async () => {
      const state = await persistence.loadState('non-existent-user');
      expect(state).toBeNull();
    });

    it('should load existing user state', async () => {
      const userId = 'test-user-state';
      const existingState: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.6,
        C: { mem: 0.75, speed: 0.7, stability: 0.8 },
        conf: 0.9,
        ts: Date.now(),
      };

      await stateRepo.saveState(userId, existingState);

      const loadedState = await persistence.loadState(userId);

      expect(loadedState).not.toBeNull();
      expect(loadedState?.A).toBe(0.8);
      expect(loadedState?.F).toBe(0.2);
      expect(loadedState?.M).toBe(0.6);
      expect(loadedState?.C.mem).toBe(0.75);
    });

    it('should load state with all properties', async () => {
      const userId = 'complete-state-user';
      const completeState: UserState = {
        A: 0.9,
        F: 0.1,
        M: 0.8,
        C: { mem: 0.85, speed: 0.9, stability: 0.95 },
        conf: 0.95,
        ts: Date.now() - 1000,
      };

      await stateRepo.saveState(userId, completeState);

      const loadedState = await persistence.loadState(userId);

      expect(loadedState).toEqual(completeState);
    });

    it('should handle multiple users independently', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      const state1: UserState = {
        A: 0.9,
        F: 0.1,
        M: 0.7,
        C: { mem: 0.8, speed: 0.7, stability: 0.8 },
        conf: 0.8,
        ts: Date.now(),
      };

      const state2: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.3,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now(),
      };

      await stateRepo.saveState(user1, state1);
      await stateRepo.saveState(user2, state2);

      const loaded1 = await persistence.loadState(user1);
      const loaded2 = await persistence.loadState(user2);

      expect(loaded1?.A).toBe(0.9);
      expect(loaded2?.A).toBe(0.5);
    });
  });

  // ==================== 状态保存测试 ====================

  describe('saveState', () => {
    it('should save user state', async () => {
      const userId = 'save-state-user';
      const state: UserState = {
        A: 0.7,
        F: 0.3,
        M: 0.5,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        conf: 0.7,
        ts: Date.now(),
      };

      await persistence.saveState(userId, state);

      const savedState = await stateRepo.loadState(userId);
      expect(savedState).not.toBeNull();
      expect(savedState?.A).toBe(0.7);
    });

    it('should save state with cold start data', async () => {
      const userId = 'cold-start-state-user';
      const state: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.6,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        conf: 0.8,
        ts: Date.now(),
      };

      const coldStartState: ColdStartStateData = {
        phase: 'explore',
        userType: 'stable',
        probeIndex: 5,
        updateCount: 10,
        settledStrategy: null,
      };

      await persistence.saveState(userId, state, coldStartState);

      const savedState = await stateRepo.loadState(userId);
      expect(savedState).not.toBeNull();
      expect((savedState as any).coldStartState).toEqual(coldStartState);
    });

    it('should overwrite existing state', async () => {
      const userId = 'overwrite-state-user';

      const initialState: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now() - 1000,
      };

      const updatedState: UserState = {
        A: 0.9,
        F: 0.1,
        M: 0.8,
        C: { mem: 0.9, speed: 0.9, stability: 0.9 },
        conf: 0.9,
        ts: Date.now(),
      };

      await persistence.saveState(userId, initialState);
      await persistence.saveState(userId, updatedState);

      const savedState = await stateRepo.loadState(userId);
      expect(savedState?.A).toBe(0.9);
      expect(savedState?.F).toBe(0.1);
    });

    it('should save state without cold start data', async () => {
      const userId = 'no-cold-start-user';
      const state: UserState = {
        A: 0.75,
        F: 0.25,
        M: 0.55,
        C: { mem: 0.65, speed: 0.65, stability: 0.65 },
        conf: 0.75,
        ts: Date.now(),
      };

      await persistence.saveState(userId, state);

      const savedState = await stateRepo.loadState(userId);
      expect(savedState).not.toBeNull();
      expect(savedState?.A).toBe(0.75);
      // coldStartState should be undefined
      expect((savedState as any).coldStartState).toBeUndefined();
    });
  });

  // ==================== LinUCB 模型加载测试 ====================

  describe('loadModelIfExists - LinUCB', () => {
    it('should not modify bandit if no model exists', async () => {
      const userId = 'no-model-user';
      const bandit = new LinUCB({ dimension: 22 });
      const initialModel = bandit.getModel();

      await persistence.loadModelIfExists(userId, bandit);

      const afterModel = bandit.getModel();
      expect(afterModel.updateCount).toBe(initialModel.updateCount);
    });

    it('should load model into LinUCB bandit', async () => {
      const userId = 'linucb-model-user';

      // Create and save a trained model
      const trainedBandit = new LinUCB({ dimension: 22 });
      // Simulate training by updating the model with proper context
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      trainedBandit.update(state, action, 0.8, context);
      trainedBandit.update(state, action, 0.9, context);
      const trainedModel = trainedBandit.getModel();

      await modelRepo.saveModel(userId, trainedModel);

      // Load model into fresh bandit
      const freshBandit = new LinUCB({ dimension: 22 });
      await persistence.loadModelIfExists(userId, freshBandit);

      const loadedModel = freshBandit.getModel();
      expect(loadedModel.updateCount).toBe(trainedModel.updateCount);
      expect(loadedModel.d).toBe(22);
    });

    it('should preserve model state after loading', async () => {
      const userId = 'preserve-model-user';
      const dimension = 22;

      // Create trained model
      const trainedBandit = new LinUCB({ dimension });
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      for (let i = 0; i < 10; i++) {
        trainedBandit.update(state, action, Math.random(), context);
      }

      const originalModel = trainedBandit.getModel();
      await modelRepo.saveModel(userId, originalModel);

      // Load into new bandit
      const newBandit = new LinUCB({ dimension });
      await persistence.loadModelIfExists(userId, newBandit);

      const loadedModel = newBandit.getModel();

      // Check key properties
      expect(loadedModel.updateCount).toBe(originalModel.updateCount);
      expect(loadedModel.d).toBe(originalModel.d);
    });
  });

  // ==================== Ensemble 模型加载测试 ====================

  describe('loadModelIfExists - Ensemble', () => {
    it('should load model into EnsembleLearningFramework', async () => {
      const userId = 'ensemble-model-user';

      // Create and save a model
      const linucb = new LinUCB({ dimension: 22 });
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      linucb.update(state, action, 0.7, context);
      const model = linucb.getModel();

      await modelRepo.saveModel(userId, model);

      // Create ensemble and load model
      const ensemble = new EnsembleLearningFramework();
      await persistence.loadModelIfExists(userId, ensemble);

      // Verify state was set
      const ensembleState = ensemble.getState();
      expect(ensembleState.linucb).toBeDefined();
      expect(ensembleState.linucb.updateCount).toBe(model.updateCount);
    });

    it('should merge with existing ensemble state', async () => {
      const userId = 'merge-ensemble-user';

      // Save a LinUCB model
      const linucb = new LinUCB({ dimension: 22 });
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      linucb.update(state, action, 0.8, context);
      await modelRepo.saveModel(userId, linucb.getModel());

      // Create ensemble with initial state
      const ensemble = new EnsembleLearningFramework();
      const initialState = ensemble.getState();

      await persistence.loadModelIfExists(userId, ensemble);

      const loadedState = ensemble.getState();
      // LinUCB should be updated
      expect(loadedState.linucb.updateCount).toBe(1);
    });
  });

  // ==================== LinUCB 模型保存测试 ====================

  describe('saveModel - LinUCB', () => {
    it('should save LinUCB model', async () => {
      const userId = 'save-linucb-user';
      const bandit = new LinUCB({ dimension: 22 });

      // Train the model
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      bandit.update(state, action, 0.85, context);
      bandit.update(state, action, 0.9, context);

      await persistence.saveModel(userId, bandit);

      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel).not.toBeNull();
      expect(savedModel?.updateCount).toBe(2);
      expect(savedModel?.d).toBe(22);
    });

    it('should overwrite existing model', async () => {
      const userId = 'overwrite-model-user';
      const bandit = new LinUCB({ dimension: 22 });

      // First save
      const state = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      bandit.update(state, action, 0.5, context);
      await persistence.saveModel(userId, bandit);

      // Second save with more updates
      bandit.update(state, action, 0.9, context);
      bandit.update(state, action, 0.8, context);
      await persistence.saveModel(userId, bandit);

      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel?.updateCount).toBe(3);
    });
  });

  // ==================== Ensemble 模型保存测试 ====================

  describe('saveModel - Ensemble', () => {
    it('should save ensemble LinUCB model', async () => {
      const userId = 'save-ensemble-user';
      const ensemble = new EnsembleLearningFramework();

      // Get and modify state
      const ensembleState = ensemble.getState();
      // Simulate some training
      const linucb = new LinUCB({ dimension: 22 });
      const userState = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      linucb.update(userState, action, 0.7, context);
      linucb.update(userState, action, 0.8, context);

      ensemble.setState({
        ...ensembleState,
        linucb: linucb.getModel(),
      });

      await persistence.saveModel(userId, ensemble);

      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel).not.toBeNull();
      expect(savedModel?.updateCount).toBe(2);
    });

    it('should extract LinUCB model from ensemble', async () => {
      const userId = 'extract-linucb-user';
      const ensemble = new EnsembleLearningFramework();

      // Create model with specific update count
      const linucb = new LinUCB({ dimension: 22 });
      const userState = createTestState();
      const action = createTestAction();
      const context = createTestContext();
      for (let i = 0; i < 5; i++) {
        linucb.update(userState, action, 0.6 + i * 0.05, context);
      }

      ensemble.setState({
        ...ensemble.getState(),
        linucb: linucb.getModel(),
      });

      await persistence.saveModel(userId, ensemble);

      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel?.updateCount).toBe(5);
    });
  });

  // ==================== 不支持的模型类型测试 ====================

  describe('saveModel - unsupported types', () => {
    it('should silently skip unsupported model types', async () => {
      const userId = 'unsupported-model-user';

      // Create a mock object that is neither LinUCB nor Ensemble
      const unsupportedModel = {
        select: vi.fn(),
        update: vi.fn(),
      } as any;

      // Should not throw
      await persistence.saveModel(userId, unsupportedModel);

      // Should not save anything
      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel).toBeNull();
    });
  });

  // ==================== 边界条件测试 ====================

  describe('edge cases', () => {
    it('should handle empty userId', async () => {
      const state: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now(),
      };

      await persistence.saveState('', state);
      const loadedState = await persistence.loadState('');

      expect(loadedState).toEqual(state);
    });

    it('should handle state with minimum values', async () => {
      const userId = 'min-values-user';
      const state: UserState = {
        A: 0,
        F: 0,
        M: -1,
        C: { mem: 0, speed: 0, stability: 0 },
        conf: 0,
        ts: 0,
      };

      await persistence.saveState(userId, state);
      const loadedState = await persistence.loadState(userId);

      expect(loadedState?.A).toBe(0);
      expect(loadedState?.M).toBe(-1);
    });

    it('should handle state with maximum values', async () => {
      const userId = 'max-values-user';
      const state: UserState = {
        A: 1,
        F: 1,
        M: 1,
        C: { mem: 1, speed: 1, stability: 1 },
        conf: 1,
        ts: Number.MAX_SAFE_INTEGER,
      };

      await persistence.saveState(userId, state);
      const loadedState = await persistence.loadState(userId);

      expect(loadedState?.A).toBe(1);
      expect(loadedState?.F).toBe(1);
    });

    it('should handle cold start state with settled strategy', async () => {
      const userId = 'settled-strategy-user';
      const state: UserState = {
        A: 0.8,
        F: 0.2,
        M: 0.6,
        C: { mem: 0.7, speed: 0.7, stability: 0.7 },
        conf: 0.8,
        ts: Date.now(),
      };

      const coldStartState: ColdStartStateData = {
        phase: 'normal',
        userType: 'fast',
        probeIndex: 5,
        updateCount: 50,
        settledStrategy: {
          interval_scale: 1.2,
          new_ratio: 0.3,
          difficulty: 'hard',
          batch_size: 12,
          hint_level: 0,
        },
      };

      await persistence.saveState(userId, state, coldStartState);

      const savedState = await stateRepo.loadState(userId);
      const savedColdStart = (savedState as any).coldStartState;

      expect(savedColdStart.phase).toBe('normal');
      expect(savedColdStart.userType).toBe('fast');
      expect(savedColdStart.settledStrategy?.difficulty).toBe('hard');
    });

    it('should handle concurrent save operations', async () => {
      const userId = 'concurrent-save-user';

      const states: UserState[] = Array.from({ length: 10 }, (_, i) => ({
        A: 0.1 * i,
        F: 0.1 * (10 - i),
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now() + i,
      }));

      // Save concurrently
      await Promise.all(states.map((state) => persistence.saveState(userId, state)));

      // One of the states should be saved
      const savedState = await persistence.loadState(userId);
      expect(savedState).not.toBeNull();
    });

    it('should handle model with high dimension', async () => {
      const userId = 'high-dim-user';
      const dimension = 100;
      const bandit = new LinUCB({ dimension });

      // Use updateWithFeatureVector for custom dimensions
      const features = new Array(dimension).fill(0.5);
      bandit.updateWithFeatureVector(features, 0.8);

      await persistence.saveModel(userId, bandit);

      const savedModel = await modelRepo.loadModel(userId);
      expect(savedModel?.d).toBe(dimension);
    });
  });

  // ==================== 状态和模型一致性测试 ====================

  describe('state and model consistency', () => {
    it('should save state and model for same user independently', async () => {
      const userId = 'consistency-user';

      // Save state
      const userState: UserState = {
        A: 0.7,
        F: 0.3,
        M: 0.5,
        C: { mem: 0.6, speed: 0.6, stability: 0.6 },
        conf: 0.7,
        ts: Date.now(),
      };
      await persistence.saveState(userId, userState);

      // Save model
      const bandit = new LinUCB({ dimension: 22 });
      const action = createTestAction();
      const context = createTestContext();
      bandit.update(userState, action, 0.8, context);
      await persistence.saveModel(userId, bandit);

      // Both should be retrievable
      const loadedState = await persistence.loadState(userId);
      const loadedModel = await modelRepo.loadModel(userId);

      expect(loadedState?.A).toBe(0.7);
      expect(loadedModel?.updateCount).toBe(1);
    });

    it('should allow updating state without affecting model', async () => {
      const userId = 'update-state-user';

      // Save initial state and model
      const initialState: UserState = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: { mem: 0.5, speed: 0.5, stability: 0.5 },
        conf: 0.5,
        ts: Date.now(),
      };
      await persistence.saveState(userId, initialState);

      const bandit = new LinUCB({ dimension: 22 });
      const action = createTestAction();
      const context = createTestContext();
      bandit.update(initialState, action, 0.8, context);
      await persistence.saveModel(userId, bandit);

      // Update only state
      const updatedState: UserState = {
        A: 0.9,
        F: 0.1,
        M: 0.8,
        C: { mem: 0.9, speed: 0.9, stability: 0.9 },
        conf: 0.9,
        ts: Date.now(),
      };
      await persistence.saveState(userId, updatedState);

      // State should be updated, model should remain
      const loadedState = await persistence.loadState(userId);
      const loadedModel = await modelRepo.loadModel(userId);

      expect(loadedState?.A).toBe(0.9);
      expect(loadedModel?.updateCount).toBe(1);
    });
  });

  // ==================== 自定义仓库测试 ====================

  describe('custom repositories', () => {
    it('should work with custom state repository', async () => {
      const customStateRepo: StateRepository = {
        loadState: vi.fn().mockResolvedValue({
          A: 0.99,
          F: 0.01,
          M: 0.99,
          C: { mem: 0.99, speed: 0.99, stability: 0.99 },
          conf: 0.99,
          ts: Date.now(),
        }),
        saveState: vi.fn().mockResolvedValue(undefined),
      };

      const customPersistence = new DefaultPersistenceManager(
        customStateRepo,
        modelRepo,
        mockLogger as unknown as Logger,
      );

      const state = await customPersistence.loadState('any-user');

      expect(state?.A).toBe(0.99);
      expect(customStateRepo.loadState).toHaveBeenCalledWith('any-user');
    });

    it('should work with custom model repository', async () => {
      const mockModel: BanditModel = {
        A: [
          [1, 0],
          [0, 1],
        ],
        b: [0, 0],
        L: [
          [1, 0],
          [0, 1],
        ],
        theta: [0, 0],
        d: 2,
        lambda: 1,
        alpha: 0.1,
        updateCount: 5,
        lastUpdated: new Date().toISOString(),
      };

      const customModelRepo: ModelRepository = {
        loadModel: vi.fn().mockResolvedValue(mockModel),
        saveModel: vi.fn().mockResolvedValue(undefined),
      };

      const customPersistence = new DefaultPersistenceManager(
        stateRepo,
        customModelRepo,
        mockLogger as unknown as Logger,
      );

      const bandit = new LinUCB({ dimension: 2 });
      await customPersistence.loadModelIfExists('any-user', bandit);

      expect(customModelRepo.loadModel).toHaveBeenCalledWith('any-user');
    });
  });
});
