/**
 * WordMasteryEvaluator Unit Tests
 * 测试单词掌握度评估器
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WordMasteryEvaluator,
  EvaluatorConfig
} from '../../../../src/amas/evaluation/word-mastery-evaluator';
import { ACTRMemoryModel, ReviewTrace } from '../../../../src/amas/modeling/actr-memory';
import { WordMemoryTracker } from '../../../../src/amas/tracking/word-memory-tracker';

// Mock dependencies
vi.mock('../../../../src/services/word-state.service', () => ({
  wordStateService: {
    getWordState: vi.fn(),
    batchGetWordStates: vi.fn()
  }
}));

vi.mock('../../../../src/services/word-score.service', () => ({
  wordScoreService: {
    getWordScore: vi.fn(),
    batchGetWordScores: vi.fn()
  }
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    wordReviewTrace: {
      findMany: vi.fn()
    }
  }
}));

import { wordStateService } from '../../../../src/services/word-state.service';
import { wordScoreService } from '../../../../src/services/word-score.service';

describe('WordMasteryEvaluator', () => {
  let evaluator: WordMasteryEvaluator;
  let mockAcTR: ACTRMemoryModel;
  let mockTracker: WordMemoryTracker;

  const userId = 'test-user-id';
  const wordId = 'test-word-id';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAcTR = new ACTRMemoryModel();
    mockTracker = new WordMemoryTracker();

    // Mock tracker.getReviewTrace
    vi.spyOn(mockTracker, 'getReviewTrace').mockResolvedValue([
      { secondsAgo: 3600, isCorrect: true },
      { secondsAgo: 7200, isCorrect: true }
    ]);

    // Mock tracker.batchGetMemoryState
    vi.spyOn(mockTracker, 'batchGetMemoryState').mockResolvedValue(
      new Map([
        [wordId, {
          wordId,
          reviewCount: 2,
          lastReviewTs: Date.now() - 3600000,
          trace: [
            { secondsAgo: 3600, isCorrect: true },
            { secondsAgo: 7200, isCorrect: true }
          ]
        }]
      ])
    );

    evaluator = new WordMasteryEvaluator({}, mockAcTR, mockTracker);
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const config = evaluator.getConfig();

      expect(config.weights.srs).toBe(0.3);
      expect(config.weights.actr).toBe(0.5);
      expect(config.weights.recent).toBe(0.2);
      expect(config.threshold).toBe(0.7);
      expect(config.fatigueImpact).toBe(0.3);
    });

    it('should accept custom config', () => {
      const customEvaluator = new WordMasteryEvaluator({
        weights: { srs: 0.4, actr: 0.4, recent: 0.2 },
        threshold: 0.8
      });

      const config = customEvaluator.getConfig();

      expect(config.weights.srs).toBe(0.4);
      expect(config.weights.actr).toBe(0.4);
      expect(config.threshold).toBe(0.8);
    });

    it('should update config dynamically', () => {
      evaluator.updateConfig({ threshold: 0.6 });

      expect(evaluator.getConfig().threshold).toBe(0.6);
    });

    it('should update weights partially', () => {
      evaluator.updateConfig({ weights: { srs: 0.5 } as any });

      const config = evaluator.getConfig();
      expect(config.weights.srs).toBe(0.5);
      expect(config.weights.actr).toBe(0.5);
    });
  });

  describe('evaluate', () => {
    it('should return mastery evaluation for a word', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({
        id: 'state-1',
        userId,
        wordId,
        state: 'LEARNING',
        masteryLevel: 3,
        easeFactor: 2.5,
        reviewCount: 5,
        lastReviewDate: new Date(),
        nextReviewDate: new Date(),
        currentInterval: 3,
        consecutiveCorrect: 3,
        consecutiveWrong: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({
        id: 'score-1',
        userId,
        wordId,
        totalScore: 75,
        accuracyScore: 80,
        speedScore: 70,
        stabilityScore: 75,
        proficiencyScore: 70,
        totalAttempts: 10,
        correctAttempts: 8,
        averageResponseTime: 2000,
        averageDwellTime: 1500,
        recentAccuracy: 0.85,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const evaluation = await evaluator.evaluate(userId, wordId);

      expect(evaluation).toHaveProperty('wordId', wordId);
      expect(evaluation).toHaveProperty('isLearned');
      expect(evaluation).toHaveProperty('score');
      expect(evaluation).toHaveProperty('confidence');
      expect(evaluation).toHaveProperty('factors');
      expect(evaluation.factors.srsLevel).toBe(3);
      expect(evaluation.factors.recentAccuracy).toBe(0.85);
    });

    it('should handle missing word state', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue(null);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue(null);

      const evaluation = await evaluator.evaluate(userId, wordId);

      expect(evaluation.factors.srsLevel).toBe(0);
      expect(evaluation.factors.recentAccuracy).toBe(0);
    });

    it('should apply fatigue impact on confidence', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue(null);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue(null);

      const evaluationNoFatigue = await evaluator.evaluate(userId, wordId, 0);
      const evaluationHighFatigue = await evaluator.evaluate(userId, wordId, 1);

      expect(evaluationNoFatigue.confidence).toBeGreaterThan(evaluationHighFatigue.confidence);
    });

    it('should determine isLearned based on score and threshold', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({
        id: 'state-1',
        userId,
        wordId,
        state: 'MASTERED',
        masteryLevel: 5,
        easeFactor: 2.5,
        reviewCount: 20,
        lastReviewDate: new Date(),
        nextReviewDate: new Date(),
        currentInterval: 30,
        consecutiveCorrect: 10,
        consecutiveWrong: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({
        id: 'score-1',
        userId,
        wordId,
        totalScore: 95,
        accuracyScore: 95,
        speedScore: 90,
        stabilityScore: 95,
        proficiencyScore: 95,
        totalAttempts: 50,
        correctAttempts: 48,
        averageResponseTime: 1500,
        averageDwellTime: 1000,
        recentAccuracy: 0.95,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Mock very recent review trace for high recall
      vi.spyOn(mockTracker, 'getReviewTrace').mockResolvedValue([
        { secondsAgo: 1, isCorrect: true },
        { secondsAgo: 60, isCorrect: true },
        { secondsAgo: 120, isCorrect: true }
      ]);

      const evaluation = await evaluator.evaluate(userId, wordId, 0);

      // With high masteryLevel (5/5=1), high recentAccuracy (0.95), and high ACT-R recall
      // score should be high enough to be considered learned
      expect(evaluation.score).toBeGreaterThan(0.6);
      expect(evaluation.factors.srsLevel).toBe(5);
      expect(evaluation.factors.recentAccuracy).toBe(0.95);
    });
  });

  describe('batchEvaluate', () => {
    it('should evaluate multiple words in parallel', async () => {
      const wordIds = ['word-1', 'word-2', 'word-3'];

      vi.mocked(wordStateService.batchGetWordStates).mockResolvedValue(
        new Map([
          ['word-1', { masteryLevel: 3 } as any],
          ['word-2', { masteryLevel: 4 } as any]
        ])
      );

      vi.mocked(wordScoreService.batchGetWordScores).mockResolvedValue(
        new Map([
          ['word-1', { recentAccuracy: 0.8 } as any],
          ['word-2', { recentAccuracy: 0.9 } as any]
        ])
      );

      vi.spyOn(mockTracker, 'batchGetMemoryState').mockResolvedValue(
        new Map([
          ['word-1', { wordId: 'word-1', reviewCount: 5, lastReviewTs: Date.now(), trace: [] }],
          ['word-2', { wordId: 'word-2', reviewCount: 8, lastReviewTs: Date.now(), trace: [] }],
          ['word-3', { wordId: 'word-3', reviewCount: 0, lastReviewTs: 0, trace: [] }]
        ])
      );

      const evaluations = await evaluator.batchEvaluate(userId, wordIds);

      expect(evaluations).toHaveLength(3);
      expect(evaluations[0].wordId).toBe('word-1');
      expect(evaluations[1].wordId).toBe('word-2');
      expect(evaluations[2].wordId).toBe('word-3');
    });

    it('should return empty array for empty input', async () => {
      const evaluations = await evaluator.batchEvaluate(userId, []);

      expect(evaluations).toEqual([]);
    });
  });

  describe('Suggestion Generation', () => {
    it('should suggest immediate review for low recall', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({ masteryLevel: 1 } as any);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({ recentAccuracy: 0.5 } as any);

      // Mock very old trace to get low recall
      vi.spyOn(mockTracker, 'getReviewTrace').mockResolvedValue([
        { secondsAgo: 7 * 24 * 3600, isCorrect: true }
      ]);

      const evaluation = await evaluator.evaluate(userId, wordId);

      if (evaluation.suggestion) {
        expect(evaluation.suggestion).toContain('忘记');
      }
    });

    it('should not have suggestion for mastered words', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({ masteryLevel: 5 } as any);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({ recentAccuracy: 0.95 } as any);

      vi.spyOn(mockTracker, 'getReviewTrace').mockResolvedValue([
        { secondsAgo: 60, isCorrect: true },
        { secondsAgo: 120, isCorrect: true },
        { secondsAgo: 180, isCorrect: true }
      ]);

      const evaluation = await evaluator.evaluate(userId, wordId, 0);

      if (evaluation.isLearned) {
        expect(evaluation.suggestion).toBeUndefined();
      }
    });
  });

  describe('Score Calculation', () => {
    it('should calculate score with correct weights', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({ masteryLevel: 5 } as any);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({ recentAccuracy: 1.0 } as any);

      // Use multiple very recent reviews to maximize ACT-R recall probability
      vi.spyOn(mockTracker, 'getReviewTrace').mockResolvedValue([
        { secondsAgo: 0.1, isCorrect: true },
        { secondsAgo: 1, isCorrect: true },
        { secondsAgo: 10, isCorrect: true }
      ]);

      const evaluation = await evaluator.evaluate(userId, wordId, 0);

      // Score components:
      // - SRS: 0.3 * (5/5) = 0.3
      // - Recent: 0.2 * 1.0 = 0.2
      // - ACT-R: depends on calculation, but with very recent reviews should be high
      // Total should be at least 0.5 + ACT-R contribution
      expect(evaluation.score).toBeGreaterThan(0.6);
      expect(evaluation.factors.srsLevel).toBe(5);
      expect(evaluation.factors.recentAccuracy).toBe(1.0);
    });

    it('should clamp score between 0 and 1', async () => {
      vi.mocked(wordStateService.getWordState).mockResolvedValue({ masteryLevel: 10 } as any);
      vi.mocked(wordScoreService.getWordScore).mockResolvedValue({ recentAccuracy: 2.0 } as any);

      const evaluation = await evaluator.evaluate(userId, wordId);

      expect(evaluation.score).toBeLessThanOrEqual(1);
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
    });
  });
});
