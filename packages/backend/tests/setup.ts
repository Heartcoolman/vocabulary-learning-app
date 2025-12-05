import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import seedrandom from 'seedrandom';

// ==================== Deterministic Randomness ====================

const originalRandom = Math.random;

/**
 * Execute a function with deterministic random numbers
 * @param seed - Seed string for reproducible randomness
 * @param fn - Function to execute
 */
export function withSeed<T>(seed: string, fn: () => T): T {
  const rng = seedrandom(seed);
  Math.random = rng as unknown as () => number;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

/**
 * Set global random seed for entire test file
 */
export function setGlobalSeed(seed: string): void {
  Math.random = seedrandom(seed) as unknown as () => number;
}

/**
 * Restore original Math.random
 */
export function restoreRandom(): void {
  Math.random = originalRandom;
}

// ==================== Database Setup ====================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ||
  'postgresql://test_user:test_password@localhost:5433/vocabulary_test';

export const prisma = new PrismaClient({
  datasourceUrl: TEST_DATABASE_URL,
  log: process.env.DEBUG ? ['query', 'info', 'warn', 'error'] : ['error']
});

/**
 * Clean database tables for test isolation
 */
export async function cleanDatabase(): Promise<void> {
  const tablesToClean = [
    'AnswerRecord',
    'WordLearningState',
    'WordScore',
    'WordReviewTrace',
    'RewardQueue',
    'FeatureVector',
    'PersistedAMASState',
    'UserStateHistory',
    'LearningSession',
    'AnomalyFlag'
  ];

  for (const table of tablesToClean) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist, ignore
    }
  }
}

/**
 * Reset database sequences
 */
export async function resetSequences(): Promise<void> {
  // Reset any auto-increment sequences if needed
}

// ==================== Mock Helpers ====================

/**
 * Create a mock logger that suppresses output
 */
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis()
};

/**
 * Create a mock telemetry service
 */
export const mockTelemetry = {
  record: vi.fn(),
  histogram: vi.fn(),
  increment: vi.fn(),
  gauge: vi.fn(),
  timing: vi.fn()
};

// ==================== Redis Mock ====================

const redisStore = new Map<string, { value: string; expiry?: number }>();

export const mockRedis = {
  get: vi.fn(async (key: string) => {
    const item = redisStore.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      redisStore.delete(key);
      return null;
    }
    return item.value;
  }),
  set: vi.fn(async (key: string, value: string) => {
    redisStore.set(key, { value });
    return 'OK';
  }),
  setex: vi.fn(async (key: string, seconds: number, value: string) => {
    redisStore.set(key, { value, expiry: Date.now() + seconds * 1000 });
    return 'OK';
  }),
  del: vi.fn(async (key: string) => {
    return redisStore.delete(key) ? 1 : 0;
  }),
  keys: vi.fn(async (pattern: string) => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(redisStore.keys()).filter(k => regex.test(k));
  }),
  flushall: vi.fn(async () => {
    redisStore.clear();
    return 'OK';
  }),
  quit: vi.fn()
};

export function clearRedisStore(): void {
  redisStore.clear();
}

// ==================== Test Lifecycle Hooks ====================

beforeAll(async () => {
  // Connect to test database
  try {
    await prisma.$connect();
  } catch (error) {
    console.warn('Database connection failed, some tests may be skipped:', error);
  }
});

afterAll(async () => {
  // Disconnect from database
  await prisma.$disconnect();
  // Restore random
  restoreRandom();
});

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  // Clear redis store
  clearRedisStore();
});

afterEach(() => {
  // Restore random after each test
  restoreRandom();
});

// ==================== Test Utilities ====================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('waitFor timeout');
}

/**
 * Create a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a value is within a range
 */
export function expectInRange(value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new Error(`Expected ${value} to be in range [${min}, ${max}]`);
  }
}

/**
 * Assert approximate equality for floating point
 */
export function expectApprox(actual: number, expected: number, epsilon = 1e-6): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Expected ${actual} to be approximately ${expected} (epsilon: ${epsilon})`);
  }
}
