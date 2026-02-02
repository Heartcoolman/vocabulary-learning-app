/**
 * WordQueueManager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordQueueManager, WordItem, QueueConfig, MasteryDecision } from '../WordQueueManager';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  learningLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// 测试用单词数据
function createTestWords(count: number): WordItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `word-${i + 1}`,
    spelling: `word${i + 1}`,
    phonetic: `/wɜːd${i + 1}/`,
    meanings: [`meaning ${i + 1}`],
    examples: [`example ${i + 1}`],
    isNew: true,
  }));
}

const NOT_MASTERED: MasteryDecision = { isMastered: false, confidence: 0, suggestedRepeats: 1 };
const MASTERED: MasteryDecision = { isMastered: true, confidence: 0.9, suggestedRepeats: 0 };

describe('WordQueueManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeQueue', () => {
    it('should initialize with words', () => {
      const words = createTestWords(10);
      const manager = new WordQueueManager(words);

      const progress = manager.getProgress();

      expect(progress.pendingCount).toBe(10);
      expect(progress.activeCount).toBe(0);
      expect(progress.masteredCount).toBe(0);
      expect(progress.totalQuestions).toBe(0);
    });

    it('should order by priority', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 3,
        targetMasteryCount: 5,
      };
      const manager = new WordQueueManager(words, config);

      // 获取第一个单词，应该从pending移到active
      const result1 = manager.getNextWordWithReason();
      expect(result1.word).not.toBeNull();
      expect(result1.word?.id).toBe('word-1');

      // 验证队列状态更新
      const progress = manager.getProgress();
      expect(progress.pendingCount).toBe(4);
      expect(progress.activeCount).toBe(1);
    });

    it('should apply custom config', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        targetMasteryCount: 3,
        masteryThreshold: 3,
        maxActiveWords: 2,
        maxTotalQuestions: 50,
      };
      const manager = new WordQueueManager(words, config);

      const progress = manager.getProgress();
      expect(progress.targetCount).toBe(3);
    });
  });

  describe('getNext', () => {
    it('should return next word', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const result = manager.getNextWordWithReason();

      expect(result.word).not.toBeNull();
      expect(result.isCompleted).toBe(false);
      expect(result.word?.id).toBe('word-1');
    });

    it('should handle empty queue', () => {
      const manager = new WordQueueManager([]);

      const result = manager.getNextWordWithReason();

      expect(result.word).toBeNull();
      expect(result.isCompleted).toBe(true);
      expect(result.completionReason).toBe('words_exhausted');
    });

    it('should complete when mastery achieved', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        targetMasteryCount: 2,
        masteryThreshold: 1,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      // 获取并掌握2个单词
      const word1 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word1.id, true, 1000, MASTERED);

      const word2 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word2.id, true, 1000, MASTERED);

      // 下一次应该返回完成
      const result = manager.getNextWordWithReason();
      expect(result.isCompleted).toBe(true);
      expect(result.completionReason).toBe('mastery_achieved');
    });

    it('should complete when question limit reached', () => {
      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        targetMasteryCount: 20,
        masteryThreshold: 10,
        maxTotalQuestions: 3,
        maxActiveWords: 5,
      };
      const manager = new WordQueueManager(words, config);

      // 消耗3个问题
      manager.getNextWordWithReason();
      manager.getNextWordWithReason();
      manager.getNextWordWithReason();

      // 下一次应该返回完成
      const result = manager.getNextWordWithReason();
      expect(result.isCompleted).toBe(true);
      expect(result.completionReason).toBe('question_limit');
    });

    it('should avoid recently shown words', () => {
      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 10,
        minRepeatInterval: 2,
        targetMasteryCount: 20, // 设高一点防止提前完成
        masteryThreshold: 10, // 设高一点防止意外掌握
      };
      const manager = new WordQueueManager(words, config);

      // 获取第一个词并验证
      const result1 = manager.getNextWordWithReason();
      expect(result1.word).not.toBeNull();
      const firstWordId = result1.word!.id;

      // 获取第二个词，应该与第一个不同
      const result2 = manager.getNextWordWithReason();
      expect(result2.word).not.toBeNull();
      expect(result2.word!.id).not.toBe(firstWordId);

      // 验证 minRepeatInterval 生效：最近2个词不应该重复出现
      const shownIds: string[] = [firstWordId, result2.word!.id];
      const result3 = manager.getNextWordWithReason();
      if (result3.word) {
        expect(shownIds.slice(-2)).not.toContain(result3.word.id);
      }
    });

    it('should handle small active queue without infinite loop', () => {
      const words = createTestWords(2);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 8,
        minRepeatInterval: 2,
        targetMasteryCount: 20,
        masteryThreshold: 10,
        maxTotalQuestions: 100,
      };
      const manager = new WordQueueManager(words, config);

      const word1 = manager.getNextWordWithReason().word!;
      const word2 = manager.getNextWordWithReason().word!;
      expect(word1.id).not.toBe(word2.id);

      const shownSequence: string[] = [word1.id, word2.id];

      for (let i = 0; i < 6; i++) {
        const result = manager.getNextWordWithReason();
        expect(result.word).not.toBeNull();
        expect(result.isCompleted).toBe(false);
        shownSequence.push(result.word!.id);
      }

      expect(shownSequence.length).toBe(8);
      const wordCounts = new Map<string, number>();
      shownSequence.forEach((id) => {
        wordCounts.set(id, (wordCounts.get(id) || 0) + 1);
      });
      expect(wordCounts.size).toBe(2);
      const counts = Array.from(wordCounts.values());
      expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(2);
    });
  });

  describe('markCompleted', () => {
    it('should mark word as completed via AMAS decision', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 2,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      // AMAS 判定掌握
      const result = manager.recordAnswer(word.id, true, 5000, MASTERED);

      expect(result.mastered).toBe(true);
      expect(manager.getWordStatus(word.id)).toBe('mastered');
    });

    it('should update queue', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 1,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;
      const initialProgress = manager.getProgress();

      manager.recordAnswer(word.id, true, 1000, MASTERED);

      const finalProgress = manager.getProgress();

      expect(finalProgress.masteredCount).toBe(initialProgress.masteredCount + 1);
      expect(finalProgress.activeCount).toBe(initialProgress.activeCount - 1);
    });

    it('should handle wrong answer', () => {
      const words = createTestWords(3);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const word = manager.getNextWordWithReason().word!;
      const result = manager.recordAnswer(word.id, false, 1000, NOT_MASTERED);

      expect(result.mastered).toBe(false);
      expect(result.progress.wrongCount).toBe(1);
      expect(result.progress.consecutiveCorrect).toBe(0);
    });

    it('should reset consecutive correct on wrong answer', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 5,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      manager.recordAnswer(word.id, true, 5000, NOT_MASTERED);
      let progress = manager.getWordProgress(word.id);
      expect(progress?.consecutiveCorrect).toBe(1);

      manager.recordAnswer(word.id, false, 5000, NOT_MASTERED);
      progress = manager.getWordProgress(word.id);
      expect(progress?.consecutiveCorrect).toBe(0);
    });
  });

  describe('requeue', () => {
    it('should requeue failed word', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 3,
        masteryThreshold: 2,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word.id, false, 1000, NOT_MASTERED);

      expect(manager.getWordStatus(word.id)).toBe('learning');
      const activeProgresses = manager.getActiveWordProgresses();
      const wordInActive = activeProgresses.find(([id]) => id === word.id);
      expect(wordInActive).toBeDefined();
    });

    it('should adjust priority', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 5,
        minRepeatInterval: 0,
        masteryThreshold: 10,
      };
      const manager = new WordQueueManager(words, config);

      const word1 = manager.getNextWordWithReason().word!;
      const word2 = manager.getNextWordWithReason().word!;

      manager.recordAnswer(word1.id, false, 5000, NOT_MASTERED);
      manager.recordAnswer(word2.id, true, 5000, NOT_MASTERED);

      const progress1 = manager.getWordProgress(word1.id);
      const progress2 = manager.getWordProgress(word2.id);

      expect(progress1?.wrongCount).toBe(1);
      if (progress2) {
        expect(progress2.wrongCount).toBe(0);
      }
    });

    it('should auto-master word after max attempts', () => {
      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 10,
        maxAttemptsPerWord: 3,
        masteryThreshold: 10,
        minRepeatInterval: 1,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      manager.recordAnswer(word.id, false, 5000, NOT_MASTERED);
      manager.recordAnswer(word.id, false, 5000, NOT_MASTERED);
      manager.recordAnswer(word.id, false, 5000, NOT_MASTERED);

      manager.getNextWordWithReason();
      manager.getNextWordWithReason();

      expect(manager.getWordStatus(word.id)).toBe('mastered');
    });
  });

  describe('progress', () => {
    it('should return progress info', () => {
      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        targetMasteryCount: 5,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const progress = manager.getProgress();

      expect(progress).toEqual({
        masteredCount: 0,
        targetCount: 5,
        totalQuestions: 0,
        activeCount: 0,
        pendingCount: 10,
      });
    });

    it('should track completed count', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        targetMasteryCount: 5,
        masteryThreshold: 1,
        maxActiveWords: 5,
      };
      const manager = new WordQueueManager(words, config);

      for (let i = 0; i < 3; i++) {
        const word = manager.getNextWordWithReason().word!;
        manager.recordAnswer(word.id, true, 1000, MASTERED);
      }

      const progress = manager.getProgress();

      expect(progress.masteredCount).toBe(3);
      expect(progress.totalQuestions).toBe(3);
    });

    it('should return correct word status', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 3,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      expect(manager.getWordStatus('word-5')).toBe('new');

      const word = manager.getNextWordWithReason().word!;
      expect(manager.getWordStatus(word.id)).toBe('learning');

      manager.recordAnswer(word.id, true, 5000, NOT_MASTERED);
      expect(manager.getWordStatus(word.id)).toBe('learning');

      manager.recordAnswer(word.id, true, 5000, NOT_MASTERED);
      expect(manager.getWordStatus(word.id)).toBe('almost');

      manager.recordAnswer(word.id, true, 5000, MASTERED);
      expect(manager.getWordStatus(word.id)).toBe('mastered');
    });
  });

  describe('peekNextWord', () => {
    it('should not consume when peeking', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const peek1 = manager.peekNextWordWithReason();
      const peek2 = manager.peekNextWordWithReason();

      expect(peek1.word?.id).toBe(peek2.word?.id);
      expect(manager.getProgress().totalQuestions).toBe(0);
    });
  });

  describe('skipWord', () => {
    it('should skip word from active queue', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const word = manager.getNextWordWithReason().word!;
      const result = manager.skipWord(word.id);

      expect(result).toBe(true);
      expect(manager.getWordStatus(word.id)).toBe('new');
    });

    it('should fail to skip word not in active queue', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const result = manager.skipWord('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('should save and restore state', () => {
      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 2,
        maxActiveWords: 5,
      };
      const manager = new WordQueueManager(words, config);

      const word1 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word1.id, true, 5000, NOT_MASTERED);
      manager.recordAnswer(word1.id, true, 5000, MASTERED); // mastered

      const word2 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word2.id, false, 5000, NOT_MASTERED);

      const state = manager.getState();

      const manager2 = new WordQueueManager(words, config);
      manager2.restoreState(state);

      expect(manager2.getProgress()).toEqual(manager.getProgress());
      expect(manager2.getMasteredWordIds()).toEqual(manager.getMasteredWordIds());
      expect(manager2.getPendingWordIds()).toEqual(manager.getPendingWordIds());
    });
  });

  describe('applyAdjustments', () => {
    it('should remove words from queue', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      manager.getNextWordWithReason();

      manager.applyAdjustments({
        remove: ['word-1', 'word-2'],
        add: [],
      });

      const currentIds = manager.getCurrentWordIds();
      expect(currentIds).not.toContain('word-1');
      expect(currentIds).not.toContain('word-2');
    });

    it('should add new words to queue', () => {
      const words = createTestWords(3);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const newWords: WordItem[] = [
        {
          id: 'new-word-1',
          spelling: 'newword1',
          phonetic: '/new/',
          meanings: ['new meaning'],
          examples: ['new example'],
          isNew: true,
        },
      ];

      manager.applyAdjustments({
        remove: [],
        add: newWords,
      });

      const currentIds = manager.getCurrentWordIds();
      expect(currentIds).toContain('new-word-1');
    });

    it('should not add duplicate words', () => {
      const words = createTestWords(3);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const duplicateWord: WordItem = {
        id: 'word-1',
        spelling: 'word1',
        phonetic: '/wɜːd1/',
        meanings: ['meaning 1'],
        examples: ['example 1'],
        isNew: true,
      };

      const initialIds = manager.getCurrentWordIds();
      const initialCount = initialIds.filter((id) => id === 'word-1').length;

      manager.applyAdjustments({
        remove: [],
        add: [duplicateWord],
      });

      const finalIds = manager.getCurrentWordIds();
      const finalCount = finalIds.filter((id) => id === 'word-1').length;

      expect(finalCount).toBe(initialCount);
    });
  });

  describe('AMAS decision integration', () => {
    it('should use AMAS decision when confidence is high', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 5,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      const amasDecision: MasteryDecision = {
        isMastered: true,
        confidence: 0.9,
        suggestedRepeats: 0,
      };

      const result = manager.recordAnswer(word.id, true, 1000, amasDecision);

      expect(result.mastered).toBe(true);
    });

    it('should use AMAS decision regardless of confidence level', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 5,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      const amasDecision: MasteryDecision = {
        isMastered: true,
        confidence: 0.5,
        suggestedRepeats: 0,
      };

      const result = manager.recordAnswer(word.id, true, 5000, amasDecision);

      expect(result.mastered).toBe(true);
    });

    it('should not master when AMAS says not mastered', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 1,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      const result = manager.recordAnswer(word.id, true, 2000, NOT_MASTERED);

      expect(result.mastered).toBe(false);
    });
  });
});
