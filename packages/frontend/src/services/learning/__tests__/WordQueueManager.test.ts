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
      manager.recordAnswer(word1.id, true, 1000);

      const word2 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word2.id, true, 1000);

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
      // 由于实现使用 isRecentlyShown 检查，连续获取应该返回不同的词
      const shownIds: string[] = [firstWordId, result2.word!.id];
      const result3 = manager.getNextWordWithReason();
      if (result3.word) {
        // 第三个词应该与最近2个不同（或者是新词）
        expect(shownIds.slice(-2)).not.toContain(result3.word.id);
      }
    });
  });

  describe('markCompleted', () => {
    it('should mark word as completed', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 2,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      // 连续答对2次达到掌握（使用较长响应时间避免首次秒答规则）
      manager.recordAnswer(word.id, true, 5000);
      const result = manager.recordAnswer(word.id, true, 5000);

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

      manager.recordAnswer(word.id, true, 1000);

      const finalProgress = manager.getProgress();

      expect(finalProgress.masteredCount).toBe(initialProgress.masteredCount + 1);
      expect(finalProgress.activeCount).toBe(initialProgress.activeCount - 1);
    });

    it('should handle wrong answer', () => {
      const words = createTestWords(3);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const word = manager.getNextWordWithReason().word!;
      const result = manager.recordAnswer(word.id, false, 1000);

      expect(result.mastered).toBe(false);
      expect(result.progress.wrongCount).toBe(1);
      expect(result.progress.consecutiveCorrect).toBe(0);
    });

    it('should reset consecutive correct on wrong answer', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 5, // 设高一点防止意外掌握
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      // 连续答对1次（使用较长响应时间避免首次秒答规则）
      manager.recordAnswer(word.id, true, 5000);
      let progress = manager.getWordProgress(word.id);
      expect(progress?.consecutiveCorrect).toBe(1);

      // 答错，重置连续正确计数
      manager.recordAnswer(word.id, false, 5000);
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

      // 答错
      manager.recordAnswer(word.id, false, 1000);

      // 单词应该仍在活跃队列中
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
        masteryThreshold: 10, // 设高一点防止意外掌握
      };
      const manager = new WordQueueManager(words, config);

      // 获取多个单词并让它们进入活跃队列
      const word1 = manager.getNextWordWithReason().word!;
      const word2 = manager.getNextWordWithReason().word!;

      // word1 答错
      manager.recordAnswer(word1.id, false, 5000);
      // word2 答对但不掌握（使用较长响应时间）
      manager.recordAnswer(word2.id, true, 5000);

      // 错误更多的词应该有更高优先级
      const progress1 = manager.getWordProgress(word1.id);
      // word2可能已经被掌握（由于首次秒答规则），所以需要使用长响应时间
      const progress2 = manager.getWordProgress(word2.id);

      expect(progress1?.wrongCount).toBe(1);
      // 如果word2还在活跃队列，验证其wrongCount为0
      if (progress2) {
        expect(progress2.wrongCount).toBe(0);
      }
    });

    it('should auto-master word after max attempts', () => {
      // 测试当单词达到最大尝试次数时，会在selectFromActiveWords中被自动标记为掌握
      // 注意：这个逻辑在 selectFromActiveWords 的 filter 中实现，
      // 只有当该词被选中（不在 recentlyShown 中）时才会触发

      const words = createTestWords(10);
      const config: Partial<QueueConfig> = {
        maxActiveWords: 10,
        maxAttemptsPerWord: 3,
        masteryThreshold: 10, // 设高一点，确保不会正常掌握
        minRepeatInterval: 1, // 设置为1，这样下一次就能选中
      };
      const manager = new WordQueueManager(words, config);

      // 获取第一个词
      const word = manager.getNextWordWithReason().word!;

      // 答错3次达到最大尝试次数
      manager.recordAnswer(word.id, false, 5000);
      manager.recordAnswer(word.id, false, 5000);
      manager.recordAnswer(word.id, false, 5000);

      // 获取另一个词，让 recentlyShown 更新
      manager.getNextWordWithReason();

      // 再获取一个词，此时应该会触发 selectFromActiveWords 检查
      // 并且 word 应该被检查到超过最大尝试次数
      manager.getNextWordWithReason();

      // 单词应该被自动标记为已掌握（降级处理）
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

      // 掌握3个单词
      for (let i = 0; i < 3; i++) {
        const word = manager.getNextWordWithReason().word!;
        manager.recordAnswer(word.id, true, 1000);
      }

      const progress = manager.getProgress();

      expect(progress.masteredCount).toBe(3);
      expect(progress.totalQuestions).toBe(3);
    });

    it('should return correct word status', () => {
      const words = createTestWords(5);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 3, // 需要连续3次正确
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      // 新词状态
      expect(manager.getWordStatus('word-5')).toBe('new');

      // 学习中状态
      const word = manager.getNextWordWithReason().word!;
      expect(manager.getWordStatus(word.id)).toBe('learning');

      // 答对1次后仍为学习中（使用较长响应时间避免首次秒答规则）
      manager.recordAnswer(word.id, true, 5000);
      expect(manager.getWordStatus(word.id)).toBe('learning');

      // 差一次就掌握状态（consecutiveCorrect = masteryThreshold - 1 = 2）
      manager.recordAnswer(word.id, true, 5000);
      expect(manager.getWordStatus(word.id)).toBe('almost');

      // 已掌握状态
      manager.recordAnswer(word.id, true, 5000);
      expect(manager.getWordStatus(word.id)).toBe('mastered');
    });
  });

  describe('peekNextWord', () => {
    it('should not consume when peeking', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      const peek1 = manager.peekNextWordWithReason();
      const peek2 = manager.peekNextWordWithReason();

      // peek 应该返回相同的单词
      expect(peek1.word?.id).toBe(peek2.word?.id);

      // 总题数不应增加
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
      expect(manager.getWordStatus(word.id)).toBe('new'); // 不在任何队列中
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

      // 进行一些操作（使用较长响应时间避免首次秒答规则）
      const word1 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word1.id, true, 5000);
      manager.recordAnswer(word1.id, true, 5000); // mastered

      const word2 = manager.getNextWordWithReason().word!;
      manager.recordAnswer(word2.id, false, 5000);

      // 保存状态
      const state = manager.getState();

      // 创建新管理器并恢复状态
      const manager2 = new WordQueueManager(words, config);
      manager2.restoreState(state);

      // 验证状态一致
      expect(manager2.getProgress()).toEqual(manager.getProgress());
      expect(manager2.getMasteredWordIds()).toEqual(manager.getMasteredWordIds());
      expect(manager2.getPendingWordIds()).toEqual(manager.getPendingWordIds());
    });
  });

  describe('applyAdjustments', () => {
    it('should remove words from queue', () => {
      const words = createTestWords(5);
      const manager = new WordQueueManager(words, { maxActiveWords: 3 });

      // 获取一个词使其进入活跃队列
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
        masteryThreshold: 5, // 设高一点
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
        masteryThreshold: 5, // 设高一点
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      const amasDecision: MasteryDecision = {
        isMastered: true,
        confidence: 0.5, // 低置信度
        suggestedRepeats: 0,
      };

      // AMAS 决策优先，无论置信度
      const result = manager.recordAnswer(word.id, true, 5000, amasDecision);

      expect(result.mastered).toBe(true);
    });

    it('should master on quick first correct answer', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 3,
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      // 首次秒答 (<3秒)
      const result = manager.recordAnswer(word.id, true, 2000);

      expect(result.mastered).toBe(true);
    });

    it('should master with 3/4 correct answers', () => {
      const words = createTestWords(3);
      const config: Partial<QueueConfig> = {
        masteryThreshold: 10, // 设高一点
        maxActiveWords: 3,
      };
      const manager = new WordQueueManager(words, config);

      const word = manager.getNextWordWithReason().word!;

      // 3对1错
      manager.recordAnswer(word.id, true, 5000);
      manager.recordAnswer(word.id, true, 5000);
      manager.recordAnswer(word.id, false, 5000);
      const result = manager.recordAnswer(word.id, true, 5000);

      expect(result.mastered).toBe(true);
    });
  });
});
