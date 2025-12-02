import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChronotypeDetector } from '../../../src/amas/modeling/chronotype';
import prisma from '../../../src/config/database';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn(),
    },
  },
}));

describe('ChronotypeDetector', () => {
  let detector: ChronotypeDetector;

  beforeEach(() => {
    detector = new ChronotypeDetector();
    vi.clearAllMocks();
  });

  describe('analyzeChronotype', () => {
    it('should return intermediate type with low confidence when data is insufficient', async () => {
      // Mock insufficient data (< 20 records)
      vi.mocked(prisma.answerRecord.findMany).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          timestamp: new Date(2024, 0, 1, 10 + (i % 5), 0),
          isCorrect: i % 2 === 0,
        })) as any
      );

      const result = await detector.analyzeChronotype('user-123');

      expect(result.category).toBe('intermediate');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.learningHistory.length).toBeLessThan(20);
    });

    it('should detect morning type when performance is highest in morning hours', async () => {
      // Mock data showing high morning performance
      const morningRecords = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 6 + (i % 4), 0), // Hours 6-9
        isCorrect: true, // 100% accuracy in morning
      }));

      const afternoonRecords = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 14 + (i % 4), 0), // Hours 14-17
        isCorrect: i % 2 === 0, // 50% accuracy in afternoon
      }));

      vi.mocked(prisma.answerRecord.findMany).mockResolvedValue(
        [...morningRecords, ...afternoonRecords] as any
      );

      const result = await detector.analyzeChronotype('user-123');

      expect(result.category).toBe('morning');
      expect(result.peakHours).toContain(6);
      expect(result.peakHours).toContain(7);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect evening type when performance is highest in evening hours', async () => {
      // Mock data showing high evening performance
      const eveningRecords = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 19 + (i % 4), 0), // Hours 19-22
        isCorrect: true, // 100% accuracy in evening
      }));

      const morningRecords = Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 7 + (i % 3), 0), // Hours 7-9
        isCorrect: i % 2 === 0, // 50% accuracy in morning
      }));

      vi.mocked(prisma.answerRecord.findMany).mockResolvedValue(
        [...eveningRecords, ...morningRecords] as any
      );

      const result = await detector.analyzeChronotype('user-123');

      expect(result.category).toBe('evening');
      expect(result.peakHours.some(h => h >= 19)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect intermediate type when performance is balanced', async () => {
      // Mock balanced performance across all time periods
      const allDayRecords = Array.from({ length: 120 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 6 + (i % 16), 0), // Hours 6-21
        isCorrect: i % 2 === 0, // 50% accuracy throughout
      }));

      vi.mocked(prisma.answerRecord.findMany).mockResolvedValue(allDayRecords as any);

      const result = await detector.analyzeChronotype('user-123');

      expect(result.category).toBe('intermediate');
      expect(result.peakHours.length).toBeGreaterThan(0);
    });

    it('should include learning history in the result', async () => {
      vi.mocked(prisma.answerRecord.findMany).mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          timestamp: new Date(2024, 0, 1, 10 + (i % 8), 0),
          isCorrect: i % 3 === 0,
        })) as any
      );

      const result = await detector.analyzeChronotype('user-123');

      expect(result.learningHistory).toBeDefined();
      expect(Array.isArray(result.learningHistory)).toBe(true);
      expect(result.learningHistory.length).toBeGreaterThan(0);

      // Check structure of learning history
      if (result.learningHistory.length > 0) {
        const firstEntry = result.learningHistory[0];
        expect(firstEntry).toHaveProperty('hour');
        expect(firstEntry).toHaveProperty('performance');
        expect(firstEntry).toHaveProperty('sampleCount');
      }
    });
  });
});
