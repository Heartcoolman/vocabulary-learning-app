/**
 * AMAS Test Fixtures
 *
 * Pre-defined test data for AMAS algorithm testing
 */

import { Action } from '../helpers/factories';

// ==================== Default User States ====================

export const DEFAULT_USER_STATE = {
  A: 0.8,   // Attention: high
  F: 0.2,   // Fatigue: low
  M: 0.5,   // Motivation: medium
  C: { mem: 0.7, speed: 0.6 }
};

export const FATIGUED_USER_STATE = {
  A: 0.4,   // Attention: low
  F: 0.8,   // Fatigue: high
  M: 0.3,   // Motivation: low
  C: { mem: 0.5, speed: 0.4 }
};

export const HIGH_PERFORMING_USER_STATE = {
  A: 0.95,  // Attention: very high
  F: 0.1,   // Fatigue: very low
  M: 0.9,   // Motivation: high
  C: { mem: 0.9, speed: 0.85 }
};

export const STRUGGLING_USER_STATE = {
  A: 0.5,
  F: 0.6,
  M: 0.4,
  C: { mem: 0.4, speed: 0.35 }
};

// ==================== Action Space ====================

export const STANDARD_ACTIONS: Action[] = [
  { interval_scale: 0.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
  { interval_scale: 0.75, new_ratio: 0.15, difficulty: 'easy', batch_size: 6, hint_level: 1 },
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  { interval_scale: 1.25, new_ratio: 0.25, difficulty: 'mid', batch_size: 10, hint_level: 0 },
  { interval_scale: 1.5, new_ratio: 0.3, difficulty: 'hard', batch_size: 12, hint_level: 0 }
];

export const PROBE_ACTIONS: Action[] = [
  { interval_scale: 0.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  { interval_scale: 1.2, new_ratio: 0.4, difficulty: 'hard', batch_size: 12, hint_level: 0 },
  { interval_scale: 1.5, new_ratio: 0.3, difficulty: 'mid', batch_size: 16, hint_level: 0 },
  { interval_scale: 0.5, new_ratio: 0.3, difficulty: 'mid', batch_size: 8, hint_level: 1 }
];

export const EASY_ACTION: Action = STANDARD_ACTIONS[0];
export const MEDIUM_ACTION: Action = STANDARD_ACTIONS[2];
export const HARD_ACTION: Action = STANDARD_ACTIONS[4];

// ==================== Feature Vectors ====================

/** Full expert dimension (22) - used when enableProgressive=false */
export const DIMENSION = 22;

/** Initial dimension with progressive features enabled (10) */
export const INITIAL_DIMENSION = 10;

export const DEFAULT_FEATURE_LABELS = [
  'errorRate',
  'avgResponseTime',
  'attention',
  'fatigue',
  'motivation',
  'cogMem',
  'cogSpeed',
  'hourOfDay',
  'dayOfWeek',
  'sessionLength',
  'streakDays',
  'totalInteractions',
  'recentAccuracy',
  'difficulty',
  'wordFrequency',
  'lastInterval',
  'reviewCount',
  'timeSinceLastReview',
  'masteryLevel',
  'trendSlope',
  'trendIntercept',
  'bias'
];

export const STANDARD_FEATURE_VECTOR: number[] = [
  0.2,    // errorRate
  0.5,    // avgResponseTime (normalized)
  0.8,    // attention
  0.2,    // fatigue
  0.5,    // motivation
  0.7,    // cogMem
  0.6,    // cogSpeed
  0.58,   // hourOfDay (14/24)
  0.43,   // dayOfWeek (3/7)
  0.33,   // sessionLength (normalized)
  0.17,   // streakDays (normalized)
  0.5,    // totalInteractions (normalized)
  0.75,   // recentAccuracy
  0.5,    // difficulty
  0.6,    // wordFrequency
  0.25,   // lastInterval (normalized)
  0.3,    // reviewCount (normalized)
  0.5,    // timeSinceLastReview (normalized)
  0.5,    // masteryLevel
  0.0,    // trendSlope
  0.7,    // trendIntercept
  1.0     // bias
];

export const HIGH_ERROR_FEATURE_VECTOR: number[] = [
  0.7,    // errorRate - high
  0.8,    // avgResponseTime - slow
  0.5,    // attention
  0.6,    // fatigue - elevated
  0.3,    // motivation - low
  0.4,    // cogMem - struggling
  0.4,    // cogSpeed - slow
  0.58,   // hourOfDay
  0.43,   // dayOfWeek
  0.5,    // sessionLength
  0.05,   // streakDays - low
  0.2,    // totalInteractions - new user
  0.4,    // recentAccuracy - poor
  0.7,    // difficulty - high
  0.3,    // wordFrequency - rare words
  0.1,    // lastInterval
  0.1,    // reviewCount
  0.8,    // timeSinceLastReview - long gap
  0.2,    // masteryLevel - low
  -0.1,   // trendSlope - declining
  0.5,    // trendIntercept
  1.0     // bias
];

export const EXPERT_FEATURE_VECTOR: number[] = [
  0.05,   // errorRate - very low
  0.3,    // avgResponseTime - fast
  0.95,   // attention - high
  0.1,    // fatigue - low
  0.9,    // motivation - high
  0.9,    // cogMem - strong
  0.85,   // cogSpeed - fast
  0.58,   // hourOfDay
  0.43,   // dayOfWeek
  0.8,    // sessionLength - long sessions
  0.9,    // streakDays - high streak
  0.9,    // totalInteractions - experienced
  0.95,   // recentAccuracy - excellent
  0.3,    // difficulty - handling easy/mid
  0.8,    // wordFrequency
  0.5,    // lastInterval
  0.7,    // reviewCount - many reviews
  0.3,    // timeSinceLastReview - regular
  0.85,   // masteryLevel - high
  0.05,   // trendSlope - improving
  0.85,   // trendIntercept - high baseline
  1.0     // bias
];

// ==================== Raw Events ====================

export const CORRECT_FAST_EVENT = {
  isCorrect: true,
  responseTime: 1500,
  timestamp: Date.now(),
  difficulty: 'mid'
};

export const CORRECT_SLOW_EVENT = {
  isCorrect: true,
  responseTime: 6000,
  timestamp: Date.now(),
  difficulty: 'mid'
};

export const INCORRECT_EVENT = {
  isCorrect: false,
  responseTime: 8000,
  timestamp: Date.now(),
  difficulty: 'mid'
};

// ==================== Cold Start Thresholds ====================

export const COLD_START_THRESHOLDS = {
  CLASSIFY_COUNT: 7,        // 7 probe actions in implementation
  EXPLORE_THRESHOLD: 20,    // Matches EXPLORE_PHASE_THRESHOLD
  NORMAL_THRESHOLD: 20,
  FAST_USER: { minAccuracy: 0.8, maxResponseTime: 1500, maxErrorRate: 0.2 },
  STABLE_USER: { minAccuracy: 0.6, maxResponseTime: 3000, maxErrorRate: 0.35 },
  CAUTIOUS_USER: { minAccuracy: 0, maxResponseTime: Infinity }
};

// ==================== ACT-R Parameters ====================

export const ACTR_PARAMS = {
  DECAY: 0.5,           // d parameter
  THRESHOLD: -0.8,      // tau parameter
  NOISE_SCALE: 0.25,    // s parameter
  ERROR_PENALTY: 0.3,   // penalty for incorrect reviews
  TARGET_PROBABILITY: 0.9
};

// ==================== LinUCB Parameters ====================

export const LINUCB_PARAMS = {
  LAMBDA: 1.0,
  ALPHA_DEFAULT: 0.3,
  ALPHA_COLD_START: 0.5,
  MAX_FEATURE_ABS: 10.0,
  MAX_COVARIANCE: 1e6,
  DIMENSION: 22
};

// ==================== Thompson Sampling Parameters ====================

export const THOMPSON_PARAMS = {
  PRIOR_ALPHA: 1.0,
  PRIOR_BETA: 1.0,
  MIN_CONTEXT_WEIGHT: 0.1,
  MAX_CONTEXT_WEIGHT: 0.9,
  CONTEXT_SAMPLE_THRESHOLD: 10
};

// ==================== Ensemble Parameters ====================

export const ENSEMBLE_PARAMS = {
  INITIAL_WEIGHTS: {
    linucb: 0.35,
    thompson: 0.25,
    actr: 0.20,
    heuristic: 0.20
  },
  LEARNING_RATE: 0.1,
  MIN_WEIGHT: 0.05,
  ABSENCE_DECAY: 0.95
};

// ==================== Test Scenarios ====================

export const SCENARIOS = {
  NEW_USER: {
    interactionCount: 0,
    phase: 'classify' as const,
    userState: DEFAULT_USER_STATE
  },
  COLD_START_MID: {
    interactionCount: 8,
    phase: 'explore' as const,
    userState: DEFAULT_USER_STATE
  },
  ESTABLISHED_USER: {
    interactionCount: 100,
    phase: 'normal' as const,
    userState: HIGH_PERFORMING_USER_STATE
  },
  STRUGGLING_NEW: {
    interactionCount: 20,
    phase: 'normal' as const,
    userState: STRUGGLING_USER_STATE
  },
  FATIGUED_SESSION: {
    interactionCount: 50,
    phase: 'normal' as const,
    userState: FATIGUED_USER_STATE
  }
};

// ==================== Reward Profiles ====================

export const REWARD_PROFILES = {
  STANDARD: {
    correctReward: 1.0,
    incorrectPenalty: -0.5,
    speedBonus: 0.2,
    streakMultiplier: 1.1
  },
  ENCOURAGING: {
    correctReward: 1.2,
    incorrectPenalty: -0.3,
    speedBonus: 0.1,
    streakMultiplier: 1.2
  },
  CHALLENGING: {
    correctReward: 0.8,
    incorrectPenalty: -0.8,
    speedBonus: 0.3,
    streakMultiplier: 1.05
  }
};
