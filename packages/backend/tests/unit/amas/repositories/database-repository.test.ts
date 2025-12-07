/**
 * DatabaseRepository Tests
 *
 * 测试 AMAS 数据库持久化仓库：
 * 1. DatabaseStateRepository - 用户状态仓库
 * 2. DatabaseModelRepository - LinUCB模型仓库
 *
 * 测试覆盖：
 * - 加载/保存用户状态
 * - 加载/保存模型数据
 * - 序列化/反序列化逻辑
 * - 数据校验和清理
 * - 错误处理
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UserState, BanditModel, CognitiveProfile, HabitProfile, TrendState } from '../../../../src/amas/types';

// Mock Prisma - must be defined before vi.mock
vi.mock('../../../../src/config/database', () => ({
  default: {
    amasUserState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    amasUserModel: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
}));

// Import after mocks are set up
import { DatabaseStateRepository, DatabaseModelRepository } from '../../../../src/amas/repositories/database-repository';
import prisma from '../../../../src/config/database';

// Get mock references
const mockPrisma = vi.mocked(prisma);

// 测试数据工厂
const createMockUserState = (overrides?: Partial<UserState>): UserState => ({
  A: 0.8,
  F: 0.2,
  M: 0.6,
  C: { mem: 0.7, speed: 0.8, stability: 0.75 },
  conf: 0.85,
  ts: Date.now(),
  ...overrides,
});

const createMockBanditModel = (d: number = 4): BanditModel => {
  const A = new Float32Array(d * d);
  const b = new Float32Array(d);
  const L = new Float32Array(d * d);

  // Initialize A as identity-like matrix
  for (let i = 0; i < d; i++) {
    A[i * d + i] = 1.0;
    L[i * d + i] = 1.0;
  }

  return {
    A,
    b,
    L,
    d,
    lambda: 1.0,
    alpha: 1.0,
    updateCount: 10,
  };
};

const createMockDbStateRecord = (userId: string, state: UserState) => ({
  id: 'record-id',
  userId,
  attention: state.A,
  fatigue: state.F,
  motivation: state.M,
  confidence: state.conf,
  cognitiveProfile: state.C,
  habitProfile: state.H || null,
  trendState: state.T || null,
  lastUpdateTs: BigInt(state.ts),
  coldStartState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockDbModelRecord = (userId: string, model: BanditModel) => ({
  id: 'model-record-id',
  userId,
  modelData: {
    A: Array.from(model.A),
    b: Array.from(model.b),
    L: model.L ? Array.from(model.L) : undefined,
    d: model.d,
    lambda: model.lambda,
    alpha: model.alpha,
    updateCount: model.updateCount,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('DatabaseStateRepository', () => {
  let repository: DatabaseStateRepository;
  const testUserId = 'test-user-db-123';

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DatabaseStateRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadState', () => {
    it('should return null when user state not found', async () => {
      mockPrisma.amasUserState.findUnique.mockResolvedValue(null);

      const result = await repository.loadState(testUserId);

      expect(result).toBeNull();
      expect(mockPrisma.amasUserState.findUnique).toHaveBeenCalledWith({
        where: { userId: testUserId },
      });
    });

    it('should load and parse user state correctly', async () => {
      const mockState = createMockUserState();
      const dbRecord = createMockDbStateRecord(testUserId, mockState);
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result).not.toBeNull();
      expect(result?.A).toBe(mockState.A);
      expect(result?.F).toBe(mockState.F);
      expect(result?.M).toBe(mockState.M);
      expect(result?.conf).toBe(mockState.conf);
      expect(result?.C).toEqual(mockState.C);
    });

    it('should convert BigInt timestamp to number', async () => {
      const mockState = createMockUserState({ ts: 1700000000000 });
      const dbRecord = createMockDbStateRecord(testUserId, mockState);
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result?.ts).toBe(1700000000000);
      expect(typeof result?.ts).toBe('number');
    });

    it('should parse cognitive profile with defaults for invalid data', async () => {
      const dbRecord = {
        id: 'record-id',
        userId: testUserId,
        attention: 0.8,
        fatigue: 0.2,
        motivation: 0.6,
        confidence: 0.85,
        cognitiveProfile: { invalid: 'data' }, // Invalid cognitive profile
        habitProfile: null,
        trendState: null,
        lastUpdateTs: BigInt(Date.now()),
        coldStartState: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result?.C).toEqual({
        mem: 0.5,
        speed: 0.5,
        stability: 0.5,
      });
    });

    it('should parse habit profile when present', async () => {
      const habitProfile: HabitProfile = {
        timePref: Array(24).fill(0).map((_, i) => (i === 9 || i === 20 ? 0.5 : 0)),
        rhythmPref: {
          sessionMedianMinutes: 20,
          batchMedian: 15,
        },
        preferredTimeSlots: [9, 14, 20],
        samples: {
          timeEvents: 100,
          sessions: 50,
          batches: 30,
        },
      };

      const mockState = createMockUserState();
      mockState.H = habitProfile;

      const dbRecord = createMockDbStateRecord(testUserId, mockState);
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result?.H).toBeDefined();
      expect(result?.H?.preferredTimeSlots).toContain(9);
    });

    it('should parse trend state when present', async () => {
      const mockState = createMockUserState();
      mockState.T = 'up';

      const dbRecord = {
        ...createMockDbStateRecord(testUserId, mockState),
        trendState: 'up',
      };
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result?.T).toBe('up');
    });

    it('should handle invalid trend state', async () => {
      const mockState = createMockUserState();
      const dbRecord = {
        ...createMockDbStateRecord(testUserId, mockState),
        trendState: 'invalid_state',
      };
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect(result?.T).toBeUndefined();
    });

    it('should parse cold start state when present', async () => {
      const mockState = createMockUserState();
      const coldStartState = {
        phase: 'explore',
        userType: 'fast',
        probeIndex: 5,
        updateCount: 15,
        settledStrategy: null,
      };

      const dbRecord = {
        ...createMockDbStateRecord(testUserId, mockState),
        coldStartState,
      };
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadState(testUserId);

      expect((result as any)?.coldStartState).toBeDefined();
      expect((result as any)?.coldStartState?.phase).toBe('explore');
      expect((result as any)?.coldStartState?.userType).toBe('fast');
    });

    it('should throw error on database failure', async () => {
      mockPrisma.amasUserState.findUnique.mockRejectedValue(new Error('Database connection error'));

      await expect(repository.loadState(testUserId)).rejects.toThrow('Database connection error');
    });
  });

  describe('saveState', () => {
    it('should upsert user state correctly', async () => {
      const mockState = createMockUserState();
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, mockState);

      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: testUserId },
          create: expect.objectContaining({
            userId: testUserId,
            attention: mockState.A,
            fatigue: mockState.F,
            motivation: mockState.M,
            confidence: mockState.conf,
          }),
          update: expect.objectContaining({
            attention: mockState.A,
            fatigue: mockState.F,
            motivation: mockState.M,
            confidence: mockState.conf,
          }),
        })
      );
    });

    it('should sanitize state values before saving', async () => {
      const invalidState = createMockUserState({
        A: NaN,
        F: Infinity,
        M: -Infinity,
        conf: 2.0, // Out of range
      });
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, invalidState);

      // Check that sanitized values are passed
      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            attention: 0.5, // Default for NaN
            fatigue: 0, // Clamped from Infinity
            motivation: 0, // Default for -Infinity, clamped to valid range
            confidence: 1, // Clamped from 2.0
          }),
        })
      );
    });

    it('should convert timestamp to BigInt', async () => {
      const mockState = createMockUserState({ ts: 1700000000000 });
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, mockState);

      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            lastUpdateTs: BigInt(1700000000000),
          }),
        })
      );
    });

    it('should save habit profile when present', async () => {
      const mockState = createMockUserState();
      mockState.H = {
        timePref: Array(24).fill(0),
        rhythmPref: { sessionMedianMinutes: 20, batchMedian: 15 },
        preferredTimeSlots: [9, 20],
        samples: { timeEvents: 100, sessions: 50, batches: 30 },
      };
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, mockState);

      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            habitProfile: expect.any(Object),
          }),
        })
      );
    });

    it('should save cold start state when present', async () => {
      const mockState = createMockUserState();
      (mockState as any).coldStartState = {
        phase: 'explore',
        userType: 'stable',
        probeIndex: 3,
        updateCount: 10,
        settledStrategy: null,
      };
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, mockState);

      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            coldStartState: expect.any(Object),
          }),
        })
      );
    });

    it('should throw error on database failure', async () => {
      const mockState = createMockUserState();
      mockPrisma.amasUserState.upsert.mockRejectedValue(new Error('Database write error'));

      await expect(repository.saveState(testUserId, mockState)).rejects.toThrow('Database write error');
    });

    it('should handle state with undefined optional fields', async () => {
      const mockState = createMockUserState();
      mockState.H = undefined;
      mockState.T = undefined;
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await repository.saveState(testUserId, mockState);

      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            habitProfile: undefined,
            trendState: undefined,
          }),
        })
      );
    });
  });
});

describe('DatabaseModelRepository', () => {
  let repository: DatabaseModelRepository;
  const testUserId = 'test-user-model-db-123';

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new DatabaseModelRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadModel', () => {
    it('should return null when model not found', async () => {
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(null);

      const result = await repository.loadModel(testUserId);

      expect(result).toBeNull();
      expect(mockPrisma.amasUserModel.findUnique).toHaveBeenCalledWith({
        where: { userId: testUserId },
      });
    });

    it('should load and deserialize model correctly', async () => {
      const mockModel = createMockBanditModel();
      const dbRecord = createMockDbModelRecord(testUserId, mockModel);
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.d).toBe(mockModel.d);
      expect(result?.lambda).toBe(mockModel.lambda);
      expect(result?.alpha).toBe(mockModel.alpha);
      expect(result?.updateCount).toBe(mockModel.updateCount);
      expect(result?.A).toBeInstanceOf(Float32Array);
      expect(result?.b).toBeInstanceOf(Float32Array);
      expect(result?.L).toBeInstanceOf(Float32Array);
    });

    it('should return null for invalid model data format', async () => {
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: { invalid: 'data' }, // Missing required fields
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      expect(result).toBeNull();
    });

    it('should fallback to initial state when A matrix length mismatch', async () => {
      const d = 4;
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: [1, 2, 3], // Wrong length, should be d*d = 16
          b: Array(d).fill(0),
          d,
          lambda: 1.0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      // Should return null because validation fails (A.length !== d*d)
      expect(result).toBeNull();
    });

    it('should fallback to initial state when b vector length mismatch', async () => {
      const d = 4;
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: Array(d * d).fill(1),
          b: [1, 2], // Wrong length, should be d = 4
          d,
          lambda: 1.0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      // Should return null because validation fails (b.length !== d)
      expect(result).toBeNull();
    });

    it('should recompute Cholesky when L is missing', async () => {
      const d = 4;
      const A = new Float32Array(d * d);
      for (let i = 0; i < d; i++) {
        A[i * d + i] = 2.0; // Valid positive definite matrix
      }

      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: Array.from(A),
          b: Array(d).fill(0),
          // L is missing
          d,
          lambda: 1.0,
          alpha: 1.0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.L).toBeInstanceOf(Float32Array);
      expect(result?.L.length).toBe(d * d);
    });

    it('should return null when L has wrong length (validation fails)', async () => {
      const d = 4;
      const A = new Float32Array(d * d);
      for (let i = 0; i < d; i++) {
        A[i * d + i] = 1.0;
      }

      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: Array.from(A),
          b: Array(d).fill(0),
          L: [1, 2, 3], // Wrong length - validation will fail
          d,
          lambda: 1.0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      // validateBanditModelData returns false when L has wrong length
      expect(result).toBeNull();
    });

    it('should sanitize NaN values in A matrix', async () => {
      const d = 4;
      const AWithNaN = Array(d * d).fill(0);
      AWithNaN[0] = NaN;
      AWithNaN[5] = Infinity;
      for (let i = 0; i < d; i++) {
        if (i !== 0 && i * d + i !== 5) {
          AWithNaN[i * d + i] = 1.0;
        }
      }

      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: AWithNaN,
          b: Array(d).fill(0),
          d,
          lambda: 1.0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      expect(result).not.toBeNull();
      // NaN and Infinity should be replaced with 0
      expect(Number.isFinite(result?.A[0])).toBe(true);
    });

    it('should use default values for missing optional fields', async () => {
      const d = 4;
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: Array(d * d).fill(1),
          b: Array(d).fill(0),
          d,
          // lambda, alpha, updateCount missing
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await repository.loadModel(testUserId);

      expect(result?.lambda).toBe(1.0);
      expect(result?.alpha).toBe(1.0);
      expect(result?.updateCount).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPrisma.amasUserModel.findUnique.mockRejectedValue(new Error('Database connection error'));

      await expect(repository.loadModel(testUserId)).rejects.toThrow('Database connection error');
    });
  });

  describe('saveModel', () => {
    it('should upsert model correctly', async () => {
      const mockModel = createMockBanditModel();
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});

      await repository.saveModel(testUserId, mockModel);

      expect(mockPrisma.amasUserModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: testUserId },
          create: expect.objectContaining({
            userId: testUserId,
            modelData: expect.objectContaining({
              d: mockModel.d,
              lambda: mockModel.lambda,
              alpha: mockModel.alpha,
              updateCount: mockModel.updateCount,
            }),
          }),
          update: expect.objectContaining({
            modelData: expect.objectContaining({
              d: mockModel.d,
            }),
          }),
        })
      );
    });

    it('should serialize Float32Array to number[]', async () => {
      const mockModel = createMockBanditModel(3);
      mockModel.A.set([1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9]);
      mockModel.b.set([0.1, 0.2, 0.3]);
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});

      await repository.saveModel(testUserId, mockModel);

      const call = mockPrisma.amasUserModel.upsert.mock.calls[0][0];
      const savedModelData = call.create.modelData;

      expect(Array.isArray(savedModelData.A)).toBe(true);
      expect(Array.isArray(savedModelData.b)).toBe(true);
      expect(savedModelData.A.length).toBe(9);
      expect(savedModelData.b.length).toBe(3);
    });

    it('should sanitize NaN values before saving', async () => {
      const mockModel = createMockBanditModel(2);
      mockModel.A.set([NaN, 1, 1, Infinity]);
      mockModel.b.set([-Infinity, 0.5]);
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});

      await repository.saveModel(testUserId, mockModel);

      const call = mockPrisma.amasUserModel.upsert.mock.calls[0][0];
      const savedModelData = call.create.modelData;

      // NaN/Infinity should be replaced with 0
      expect(savedModelData.A[0]).toBe(0);
      expect(savedModelData.A[3]).toBe(0);
      expect(savedModelData.b[0]).toBe(0);
    });

    it('should handle model without L matrix', async () => {
      const mockModel = createMockBanditModel();
      (mockModel as any).L = undefined;
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});

      await repository.saveModel(testUserId, mockModel);

      const call = mockPrisma.amasUserModel.upsert.mock.calls[0][0];
      const savedModelData = call.create.modelData;

      expect(savedModelData.L).toBeUndefined();
    });

    it('should throw error on database failure', async () => {
      const mockModel = createMockBanditModel();
      mockPrisma.amasUserModel.upsert.mockRejectedValue(new Error('Database write error'));

      await expect(repository.saveModel(testUserId, mockModel)).rejects.toThrow('Database write error');
    });

    it('should preserve model precision during serialization', async () => {
      const mockModel = createMockBanditModel(2);
      mockModel.A.set([0.123456789, 0.987654321, 0.111111111, 0.999999999]);
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});

      await repository.saveModel(testUserId, mockModel);

      const call = mockPrisma.amasUserModel.upsert.mock.calls[0][0];
      const savedModelData = call.create.modelData;

      // Float32 has limited precision, but values should be close
      expect(Math.abs(savedModelData.A[0] - 0.123456789)).toBeLessThan(0.0001);
    });
  });
});

describe('Repository Integration Scenarios', () => {
  let stateRepo: DatabaseStateRepository;
  let modelRepo: DatabaseModelRepository;
  const testUserId = 'integration-test-user';

  beforeEach(() => {
    vi.clearAllMocks();
    stateRepo = new DatabaseStateRepository();
    modelRepo = new DatabaseModelRepository();
  });

  describe('state lifecycle', () => {
    it('should handle new user creation flow', async () => {
      // First load - no existing state
      mockPrisma.amasUserState.findUnique.mockResolvedValue(null);
      const loadResult = await stateRepo.loadState(testUserId);
      expect(loadResult).toBeNull();

      // Save initial state
      const newState = createMockUserState();
      mockPrisma.amasUserState.upsert.mockResolvedValue({});
      await stateRepo.saveState(testUserId, newState);

      // Second load - state exists
      mockPrisma.amasUserState.findUnique.mockResolvedValue(
        createMockDbStateRecord(testUserId, newState)
      );
      const secondLoadResult = await stateRepo.loadState(testUserId);
      expect(secondLoadResult).not.toBeNull();
      expect(secondLoadResult?.A).toBe(newState.A);
    });

    it('should handle state update flow', async () => {
      const initialState = createMockUserState({ A: 0.5, F: 0.1 });
      const updatedState = createMockUserState({ A: 0.8, F: 0.3 });

      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      // Save initial state
      await stateRepo.saveState(testUserId, initialState);

      // Update state
      await stateRepo.saveState(testUserId, updatedState);

      // Both calls should use upsert
      expect(mockPrisma.amasUserState.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('model lifecycle', () => {
    it('should handle new model creation flow', async () => {
      // First load - no existing model
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(null);
      const loadResult = await modelRepo.loadModel(testUserId);
      expect(loadResult).toBeNull();

      // Save initial model
      const newModel = createMockBanditModel();
      mockPrisma.amasUserModel.upsert.mockResolvedValue({});
      await modelRepo.saveModel(testUserId, newModel);

      // Second load - model exists
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(
        createMockDbModelRecord(testUserId, newModel)
      );
      const secondLoadResult = await modelRepo.loadModel(testUserId);
      expect(secondLoadResult).not.toBeNull();
      expect(secondLoadResult?.d).toBe(newModel.d);
    });

    it('should handle model update with increasing updateCount', async () => {
      const initialModel = createMockBanditModel();
      initialModel.updateCount = 10;

      mockPrisma.amasUserModel.upsert.mockResolvedValue({});
      await modelRepo.saveModel(testUserId, initialModel);

      // Update model with higher update count
      const updatedModel = createMockBanditModel();
      updatedModel.updateCount = 20;
      await modelRepo.saveModel(testUserId, updatedModel);

      expect(mockPrisma.amasUserModel.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('error recovery', () => {
    it('should handle transient database errors', async () => {
      let callCount = 0;
      mockPrisma.amasUserState.findUnique.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Connection timeout');
        }
        return createMockDbStateRecord(testUserId, createMockUserState());
      });

      // First call fails
      await expect(stateRepo.loadState(testUserId)).rejects.toThrow('Connection timeout');

      // Second call succeeds
      const result = await stateRepo.loadState(testUserId);
      expect(result).not.toBeNull();
    });
  });
});

describe('Data Validation Edge Cases', () => {
  let stateRepo: DatabaseStateRepository;
  let modelRepo: DatabaseModelRepository;
  const testUserId = 'validation-test-user';

  beforeEach(() => {
    vi.clearAllMocks();
    stateRepo = new DatabaseStateRepository();
    modelRepo = new DatabaseModelRepository();
  });

  describe('cognitive profile validation', () => {
    it('should clamp out-of-range cognitive values', async () => {
      const dbRecord = {
        id: 'record-id',
        userId: testUserId,
        attention: 0.8,
        fatigue: 0.2,
        motivation: 0.6,
        confidence: 0.85,
        cognitiveProfile: {
          mem: 1.5, // Out of range
          speed: -0.5, // Out of range
          stability: 0.75,
        },
        habitProfile: null,
        trendState: null,
        lastUpdateTs: BigInt(Date.now()),
        coldStartState: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await stateRepo.loadState(testUserId);

      // Out of range values should be replaced with defaults
      expect(result?.C.mem).toBe(0.5); // Default
      expect(result?.C.speed).toBe(0.5); // Default
      expect(result?.C.stability).toBe(0.75); // Valid
    });
  });

  describe('model dimension validation', () => {
    it('should validate model data has correct array lengths', async () => {
      const d = 4;
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: Array(d * d).fill(1), // Correct: 16 elements
          b: Array(d).fill(0), // Correct: 4 elements
          d,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await modelRepo.loadModel(testUserId);

      expect(result).not.toBeNull();
      expect(result?.A.length).toBe(d * d);
      expect(result?.b.length).toBe(d);
    });

    it('should handle zero dimension model', async () => {
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: [],
          b: [],
          d: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await modelRepo.loadModel(testUserId);

      // Invalid dimension should return null
      expect(result).toBeNull();
    });

    it('should handle negative dimension model', async () => {
      const dbRecord = {
        id: 'model-record-id',
        userId: testUserId,
        modelData: {
          A: [],
          b: [],
          d: -1,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.amasUserModel.findUnique.mockResolvedValue(dbRecord);

      const result = await modelRepo.loadModel(testUserId);

      expect(result).toBeNull();
    });
  });

  describe('timestamp handling', () => {
    it('should handle very old timestamps', async () => {
      const mockState = createMockUserState({ ts: 0 }); // Unix epoch
      const dbRecord = createMockDbStateRecord(testUserId, mockState);
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await stateRepo.loadState(testUserId);

      expect(result?.ts).toBe(0);
    });

    it('should handle future timestamps', async () => {
      const futureTs = Date.now() + 86400000 * 365; // 1 year in future
      const mockState = createMockUserState({ ts: futureTs });
      const dbRecord = createMockDbStateRecord(testUserId, mockState);
      mockPrisma.amasUserState.findUnique.mockResolvedValue(dbRecord);

      const result = await stateRepo.loadState(testUserId);

      expect(result?.ts).toBe(futureTs);
    });

    it('should handle invalid timestamp when saving', async () => {
      const mockState = createMockUserState({ ts: NaN });
      mockPrisma.amasUserState.upsert.mockResolvedValue({});

      await stateRepo.saveState(testUserId, mockState);

      const call = mockPrisma.amasUserState.upsert.mock.calls[0][0];
      // Should use current time as fallback
      expect(Number(call.create.lastUpdateTs)).toBeGreaterThan(0);
    });
  });
});
