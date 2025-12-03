import { faker } from '@faker-js/faker';
import { prisma } from '../setup';

// ==================== User Factory ====================

export interface CreateUserOptions {
  email?: string;
  username?: string;
  passwordHash?: string;
  role?: 'USER' | 'ADMIN';
  rewardProfile?: string;
}

export const UserFactory = {
  async create(options: CreateUserOptions = {}) {
    return prisma.user.create({
      data: {
        email: options.email ?? faker.internet.email(),
        username: options.username ?? faker.internet.userName(),
        passwordHash: options.passwordHash ?? '$2b$10$test_hash',
        role: options.role ?? 'USER',
        rewardProfile: options.rewardProfile ?? 'standard'
      }
    });
  },

  build(options: CreateUserOptions = {}) {
    return {
      id: faker.string.uuid(),
      email: options.email ?? faker.internet.email(),
      username: options.username ?? faker.internet.userName(),
      passwordHash: options.passwordHash ?? '$2b$10$test_hash',
      role: options.role ?? 'USER',
      rewardProfile: options.rewardProfile ?? 'standard',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
};

// ==================== WordBook Factory ====================

export interface CreateWordBookOptions {
  name?: string;
  description?: string;
  type?: 'SYSTEM' | 'USER';
  userId?: string;
}

export const WordBookFactory = {
  async create(options: CreateWordBookOptions = {}) {
    let userId = options.userId;
    if (!userId && options.type !== 'SYSTEM') {
      const user = await UserFactory.create();
      userId = user.id;
    }

    return prisma.wordBook.create({
      data: {
        name: options.name ?? faker.lorem.words(2),
        description: options.description ?? faker.lorem.sentence(),
        type: options.type ?? 'SYSTEM',
        ...(userId ? { userId } : {})
      }
    });
  }
};

// ==================== Word Factory ====================

export interface CreateWordOptions {
  wordBookId: string;
  spelling?: string;
  phonetic?: string;
  meanings?: string[];
  examples?: string[];
  audioUrl?: string;
}

export const WordFactory = {
  async create(options: CreateWordOptions) {
    return prisma.word.create({
      data: {
        wordBookId: options.wordBookId,
        spelling: options.spelling ?? faker.word.noun(),
        phonetic: options.phonetic ?? `/${faker.lorem.word()}/`,
        meanings: options.meanings ?? [faker.lorem.sentence()],
        examples: options.examples ?? [faker.lorem.sentence()],
        audioUrl: options.audioUrl
      }
    });
  },

  build(wordBookId: string, options: Partial<CreateWordOptions> = {}) {
    return {
      id: faker.string.uuid(),
      wordBookId,
      spelling: options.spelling ?? faker.word.noun(),
      phonetic: options.phonetic ?? `/${faker.lorem.word()}/`,
      meanings: options.meanings ?? [faker.lorem.sentence()],
      examples: options.examples ?? [faker.lorem.sentence()],
      audioUrl: options.audioUrl ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  },

  async createMany(wordBookId: string, count: number) {
    const words = [];
    for (let i = 0; i < count; i++) {
      words.push(await this.create({ wordBookId }));
    }
    return words;
  }
};

// ==================== AnswerRecord Factory ====================

export interface CreateAnswerRecordOptions {
  userId: string;
  wordId: string;
  isCorrect?: boolean;
  responseTime?: number;
  sessionId?: string;
  difficulty?: string;
}

export const AnswerRecordFactory = {
  async create(options: CreateAnswerRecordOptions) {
    return prisma.answerRecord.create({
      data: {
        userId: options.userId,
        wordId: options.wordId,
        isCorrect: options.isCorrect ?? faker.datatype.boolean(),
        responseTime: options.responseTime ?? faker.number.int({ min: 500, max: 10000 }),
        sessionId: options.sessionId,
        difficulty: options.difficulty ?? 'mid'
      }
    });
  },

  build(options: CreateAnswerRecordOptions) {
    return {
      id: faker.string.uuid(),
      userId: options.userId,
      wordId: options.wordId,
      isCorrect: options.isCorrect ?? faker.datatype.boolean(),
      responseTime: options.responseTime ?? faker.number.int({ min: 500, max: 10000 }),
      sessionId: options.sessionId ?? null,
      difficulty: options.difficulty ?? 'mid',
      createdAt: new Date()
    };
  }
};

// ==================== Learning State Factory ====================

export interface CreateLearningStateOptions {
  userId: string;
  wordId: string;
  state?: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';
  masteryLevel?: number;
  consecutiveCorrect?: number;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
}

export const LearningStateFactory = {
  async create(options: CreateLearningStateOptions) {
    return prisma.wordLearningState.create({
      data: {
        userId: options.userId,
        wordId: options.wordId,
        state: options.state ?? 'NEW',
        masteryLevel: options.masteryLevel ?? 0,
        consecutiveCorrect: options.consecutiveCorrect ?? 0,
        lastReviewedAt: options.lastReviewedAt,
        nextReviewAt: options.nextReviewAt
      }
    });
  }
};

// ==================== AMAS State Factory ====================

export interface UserStateData {
  A: number;  // Attention
  F: number;  // Fatigue
  M: number;  // Motivation
  C: { mem: number; speed: number };  // Cognitive
  T?: { slope: number; intercept: number };  // Trend
}

export const AMASStateFactory = {
  buildUserState(overrides: Partial<UserStateData> = {}): UserStateData {
    return {
      A: overrides.A ?? 0.8,
      F: overrides.F ?? 0.2,
      M: overrides.M ?? 0.5,
      C: overrides.C ?? { mem: 0.7, speed: 0.6 },
      T: overrides.T ?? { slope: 0, intercept: 0.7 }
    };
  },

  buildFeatureVector(overrides: Partial<Record<string, number>> = {}): number[] {
    const defaults = {
      errorRate: 0.2,
      avgResponseTime: 2500,
      attention: 0.8,
      fatigue: 0.2,
      motivation: 0.5,
      cogMem: 0.7,
      cogSpeed: 0.6,
      hourOfDay: 14,
      dayOfWeek: 3,
      sessionLength: 10,
      streakDays: 5,
      totalInteractions: 100,
      recentAccuracy: 0.75,
      difficulty: 0.5,
      wordFrequency: 0.6,
      lastInterval: 1,
      reviewCount: 3,
      timeSinceLastReview: 86400,
      masteryLevel: 0.5,
      trendSlope: 0,
      trendIntercept: 0.7,
      bias: 1
    };

    const merged = { ...defaults, ...overrides };
    return Object.values(merged);
  }
};

// ==================== Action Factory ====================

export interface Action {
  interval_scale: number;
  new_ratio: number;
  difficulty: 'easy' | 'mid' | 'hard';
  batch_size: number;
  hint_level: number;
}

export const ActionFactory = {
  build(overrides: Partial<Action> = {}): Action {
    return {
      interval_scale: overrides.interval_scale ?? 1.0,
      new_ratio: overrides.new_ratio ?? 0.2,
      difficulty: overrides.difficulty ?? 'mid',
      batch_size: overrides.batch_size ?? 8,
      hint_level: overrides.hint_level ?? 1
    };
  },

  buildMany(count: number): Action[] {
    const difficulties: Array<'easy' | 'mid' | 'hard'> = ['easy', 'mid', 'hard'];
    return Array.from({ length: count }, (_, i) => ({
      interval_scale: 0.5 + (i * 0.25),
      new_ratio: 0.1 + (i * 0.1),
      difficulty: difficulties[i % 3],
      batch_size: 5 + (i * 2),
      hint_level: i % 3
    }));
  }
};

// ==================== Raw Event Factory ====================

export interface RawEvent {
  isCorrect: boolean;
  responseTime: number;
  timestamp: number;
  difficulty?: string;
  wordId?: string;
  sessionId?: string;
}

export const RawEventFactory = {
  build(overrides: Partial<RawEvent> = {}): RawEvent {
    return {
      isCorrect: overrides.isCorrect ?? true,
      responseTime: overrides.responseTime ?? faker.number.int({ min: 500, max: 8000 }),
      timestamp: overrides.timestamp ?? Date.now(),
      difficulty: overrides.difficulty ?? 'mid',
      wordId: overrides.wordId ?? faker.string.uuid(),
      sessionId: overrides.sessionId ?? faker.string.uuid()
    };
  },

  buildSequence(count: number, baseOptions: Partial<RawEvent> = {}): RawEvent[] {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      ...this.build(baseOptions),
      timestamp: now - (count - i - 1) * 5000  // 5 seconds apart
    }));
  },

  buildCorrectStreak(count: number): RawEvent[] {
    return this.buildSequence(count, { isCorrect: true, responseTime: 2000 });
  },

  buildIncorrectStreak(count: number): RawEvent[] {
    return this.buildSequence(count, { isCorrect: false, responseTime: 8000 });
  },

  buildMixedSequence(correctCount: number, incorrectCount: number): RawEvent[] {
    const correct = this.buildSequence(correctCount, { isCorrect: true });
    const incorrect = this.buildSequence(incorrectCount, { isCorrect: false });
    return [...correct, ...incorrect].sort((a, b) => a.timestamp - b.timestamp);
  }
};

// ==================== LinUCB Model Factory ====================

export interface LinUCBModelState {
  A: number[][];
  b: number[];
  L: number[][];
  theta: number[];
  updateCount: number;
  lastUpdated: string;
}

export const LinUCBModelFactory = {
  buildInitial(dimension: number = 22, lambda: number = 1.0): LinUCBModelState {
    // Create identity matrix * lambda
    const A = Array.from({ length: dimension }, (_, i) =>
      Array.from({ length: dimension }, (_, j) => i === j ? lambda : 0)
    );

    // Zero vector for b
    const b = Array(dimension).fill(0);

    // Cholesky of identity * lambda = sqrt(lambda) * I
    const sqrtLambda = Math.sqrt(lambda);
    const L = Array.from({ length: dimension }, (_, i) =>
      Array.from({ length: dimension }, (_, j) => i === j ? sqrtLambda : 0)
    );

    // Zero theta
    const theta = Array(dimension).fill(0);

    return {
      A,
      b,
      L,
      theta,
      updateCount: 0,
      lastUpdated: new Date().toISOString()
    };
  },

  buildTrained(dimension: number = 22, updates: number = 100): LinUCBModelState {
    const state = this.buildInitial(dimension);
    state.updateCount = updates;

    // Add some learned values to theta
    state.theta = Array.from({ length: dimension }, () =>
      (Math.random() - 0.5) * 0.1
    );

    return state;
  }
};

// ==================== Thompson Sampling State Factory ====================

export interface ThompsonSamplingState {
  globalPriors: Record<string, { alpha: number; beta: number }>;
  contextualPriors: Record<string, Record<string, { alpha: number; beta: number }>>;
  observations: number;
}

export const ThompsonSamplingFactory = {
  buildInitial(): ThompsonSamplingState {
    return {
      globalPriors: {},
      contextualPriors: {},
      observations: 0
    };
  },

  buildWithObservations(actionCount: number = 5): ThompsonSamplingState {
    const globalPriors: Record<string, { alpha: number; beta: number }> = {};

    for (let i = 0; i < actionCount; i++) {
      const key = `action_${i}`;
      globalPriors[key] = {
        alpha: 1 + Math.floor(Math.random() * 10),
        beta: 1 + Math.floor(Math.random() * 10)
      };
    }

    return {
      globalPriors,
      contextualPriors: {},
      observations: Object.values(globalPriors).reduce(
        (sum, p) => sum + p.alpha + p.beta - 2, 0
      )
    };
  }
};

// ==================== ColdStart State Factory ====================

export interface ColdStartState {
  phase: 'classify' | 'explore' | 'normal';
  probeIndex: number;
  probeResults: Array<{ isCorrect: boolean; responseTime: number }>;
  userType?: 'fast' | 'stable' | 'cautious';
  settledStrategy?: Action;
}

export const ColdStartStateFactory = {
  buildInitial(): ColdStartState {
    return {
      phase: 'classify',
      probeIndex: 0,
      probeResults: []
    };
  },

  buildMidClassify(probeCount: number = 3): ColdStartState {
    return {
      phase: 'classify',
      probeIndex: probeCount,
      probeResults: Array.from({ length: probeCount }, () => ({
        isCorrect: Math.random() > 0.3,
        responseTime: 1500 + Math.random() * 3000
      }))
    };
  },

  buildExploring(userType: 'fast' | 'stable' | 'cautious' = 'stable'): ColdStartState {
    return {
      phase: 'explore',
      probeIndex: 5,
      probeResults: Array.from({ length: 5 }, () => ({
        isCorrect: true,
        responseTime: 2000
      })),
      userType
    };
  },

  buildNormal(userType: 'fast' | 'stable' | 'cautious' = 'stable'): ColdStartState {
    return {
      phase: 'normal',
      probeIndex: 5,
      probeResults: Array.from({ length: 5 }, () => ({
        isCorrect: true,
        responseTime: 2000
      })),
      userType,
      settledStrategy: ActionFactory.build()
    };
  }
};
