/**
 * State History Service Unit Tests
 * Tests for the actual StateHistoryService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    userStateHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'state-1' }),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn()
    }
  }
}));

import prisma from '../../../src/config/database';

describe('StateHistoryService', () => {
  let stateHistoryService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/state-history.service');
    stateHistoryService = module.stateHistoryService;
  });

  describe('recordState', () => {
    it('should record state', async () => {
      const mockState = { A: 0.8, F: 0.2, M: 0.6, C: { memory: 0.7, speed: 0.6, stability: 0.5 } };
      
      const result = await stateHistoryService.recordState('user-1', mockState);

      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
    });

    it('should include timestamp', async () => {
      const result = await stateHistoryService.recordState('user-1', { A: 0.8 });

      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getHistory', () => {
    it('should return state history for user', async () => {
      const mockHistory = [
        { date: new Date(), attention: 0.8, fatigue: 0.2, motivation: 0.6, memory: 0.7, speed: 0.6, stability: 0.5 },
        { date: new Date(), attention: 0.7, fatigue: 0.3, motivation: 0.5, memory: 0.7, speed: 0.6, stability: 0.5 }
      ];
      (prisma.userStateHistory.findMany as any).mockResolvedValue(mockHistory);

      const result = await stateHistoryService.getHistory('user-1', 7);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept days parameter', async () => {
      (prisma.userStateHistory.findMany as any).mockResolvedValue([]);

      await stateHistoryService.getHistory('user-1', 30);

      expect(prisma.userStateHistory.findMany).toHaveBeenCalled();
    });
  });

  describe('getLatestState', () => {
    it('should return latest state for user', async () => {
      const mockState = {
        date: new Date(),
        attention: 0.8,
        fatigue: 0.2,
        motivation: 0.6,
        memory: 0.7,
        speed: 0.6,
        stability: 0.5
      };
      (prisma.userStateHistory.findFirst as any).mockResolvedValue(mockState);

      const result = await stateHistoryService.getLatestState('user-1');

      expect(result).toBeDefined();
    });

    it('should return null if no state exists', async () => {
      (prisma.userStateHistory.findFirst as any).mockResolvedValue(null);

      const result = await stateHistoryService.getLatestState('new-user');

      expect(result).toBeNull();
    });
  });

  describe('saveStateSnapshot', () => {
    it('should save state snapshot', async () => {
      // Service uses upsert, not create
      (prisma.userStateHistory.upsert as any).mockResolvedValue({ id: 'h1' });

      const state = { A: 0.8, F: 0.2, M: 0.6, C: { memory: 0.7, speed: 0.6, stability: 0.5 } };
      
      await stateHistoryService.saveStateSnapshot('user-1', state);

      expect(prisma.userStateHistory.upsert).toHaveBeenCalled();
    });
  });

  describe('getStateHistory', () => {
    it('should return state history with date range', async () => {
      (prisma.userStateHistory.findMany as any).mockResolvedValue([]);

      const result = await stateHistoryService.getStateHistory('user-1', 7);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getCognitiveGrowth', () => {
    it('should return cognitive growth data', async () => {
      (prisma.userStateHistory.findFirst as any)
        .mockResolvedValueOnce({ memory: 0.8, speed: 0.7, stability: 0.6 }) // current
        .mockResolvedValueOnce({ memory: 0.6, speed: 0.5, stability: 0.5 }); // past

      const result = await stateHistoryService.getCognitiveGrowth('user-1');

      expect(result).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.changes).toBeDefined();
    });
  });

  describe('deleteUserHistory', () => {
    it('should delete user history', async () => {
      (prisma.userStateHistory.deleteMany as any).mockResolvedValue({ count: 10 });

      await stateHistoryService.deleteUserHistory('user-1');

      expect(prisma.userStateHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' }
      });
    });
  });

  describe('exports', () => {
    it('should export stateHistoryService singleton', async () => {
      const module = await import('../../../src/services/state-history.service');
      expect(module.stateHistoryService).toBeDefined();
    });
  });
});
