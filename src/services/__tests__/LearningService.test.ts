import { describe, it, expect, beforeEach, vi } from 'vitest';
import LearningService from '../LearningService';
import StorageService from '../StorageService';
import { Word } from '../../types/models';

// Mock StorageService
vi.mock('../StorageService', () => ({
  default: {
    getWords: vi.fn(),
    saveAnswerRecord: vi.fn(),
    saveAnswerRecordExtended: vi.fn(),
  },
}));

describe('LearningService', () => {
  const mockWords: Word[] = [
    {
      id: 'word-1',
      spelling: 'hello',
      phonetic: '/həˈloʊ/',
      meanings: ['你好'],
      examples: ['Hello, world!'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-2',
      spelling: 'world',
      phonetic: '/wɜːrld/',
      meanings: ['世界'],
      examples: ['The world is beautiful.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-3',
      spelling: 'friend',
      phonetic: '/frend/',
      meanings: ['朋友'],
      examples: ['He is my friend.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-4',
      spelling: 'book',
      phonetic: '/bʊk/',
      meanings: ['书'],
      examples: ['I like reading books.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    LearningService.endSession();
  });

  describe('generateTestOptions', () => {
    it('should generate options with correct count', () => {
      const result = LearningService.generateTestOptions(mockWords[0], mockWords, 3);
      expect(result.options.length).toBe(3);
    });

    it('should include the correct answer', () => {
      const correctWord = mockWords[0];
      const result = LearningService.generateTestOptions(correctWord, mockWords, 3);
      expect(result.options).toContain(correctWord.meanings[0]);
    });

    it('should have only one correct answer', () => {
      const correctWord = mockWords[0];
      const result = LearningService.generateTestOptions(correctWord, mockWords, 3);
      const correctCount = result.options.filter((opt: string) => opt === correctWord.meanings[0]).length;
      expect(correctCount).toBe(1);
    });

    it('should respect min and max option count', () => {
      const result1 = LearningService.generateTestOptions(mockWords[0], mockWords, 1);
      expect(result1.options.length).toBeGreaterThanOrEqual(2);

      const result2 = LearningService.generateTestOptions(mockWords[0], mockWords, 5);
      expect(result2.options.length).toBeLessThanOrEqual(4);
    });
  });

  describe('submitAnswer', () => {
    const storageMock = StorageService as unknown as {
      getWords: ReturnType<typeof vi.fn>;
      saveAnswerRecord: ReturnType<typeof vi.fn>;
      saveAnswerRecordExtended: ReturnType<typeof vi.fn>;
    };

    it('should persist a single record per answer', async () => {
      storageMock.getWords.mockResolvedValue(mockWords);

      await LearningService.startSession([mockWords[0].id]);
      await LearningService.submitAnswer(mockWords[0].id, mockWords[0].meanings[0], true, 1000, 2000);

      expect(storageMock.saveAnswerRecordExtended).toHaveBeenCalledTimes(1);
    });
  });
});
