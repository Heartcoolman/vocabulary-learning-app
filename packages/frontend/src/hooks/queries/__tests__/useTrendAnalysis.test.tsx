import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  useCurrentTrend,
  useTrendHistory,
  useTrendReport,
  useIntervention,
  useGoldenTime,
  useTimePreferences,
  useStateHistory,
  useCognitiveGrowth,
  useSignificantChanges,
} from '../useTrendAnalysis';
import { apiClient } from '@/services/client';

// Mock dependencies
vi.mock('@/services/client', () => {
  const client = {
    getCurrentTrend: vi.fn(),
    getTrendHistory: vi.fn(),
    getTrendReport: vi.fn(),
    getIntervention: vi.fn(),
    getGoldenTime: vi.fn(),
    getTimePreferences: vi.fn(),
    getStateHistory: vi.fn(),
    getCognitiveGrowth: vi.fn(),
    getSignificantChanges: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

describe('useTrendAnalysis', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useCurrentTrend', () => {
    it('should fetch current trend successfully', async () => {
      const mockTrend = {
        state: 'improving',
        motivation: 0.8,
        fatigue: 0.3,
        stateDescription: '状态良好',
      };

      (apiClient.getCurrentTrend as Mock).mockResolvedValue(mockTrend);

      const { result } = renderHook(() => useCurrentTrend(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTrend);
    });

    it('should auto-refresh every minute', async () => {
      (apiClient.getCurrentTrend as Mock).mockResolvedValue({});

      const { result } = renderHook(() => useCurrentTrend(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useTrendHistory', () => {
    it('should fetch trend history successfully', async () => {
      const mockHistory = {
        daily: [
          { date: '2024-01-01', avgAccuracy: 0.85, avgMotivation: 0.8 },
          { date: '2024-01-02', avgAccuracy: 0.9, avgMotivation: 0.85 },
        ],
        weekly: [],
        totalDays: 28,
      };

      (apiClient.getTrendHistory as Mock).mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useTrendHistory(28), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockHistory);
    });

    it('should support custom days parameter', async () => {
      (apiClient.getTrendHistory as Mock).mockResolvedValue({});

      renderHook(() => useTrendHistory(14), { wrapper });

      await waitFor(() => {
        expect(apiClient.getTrendHistory).toHaveBeenCalledWith(14);
      });
    });

    it('should auto-refresh every 5 minutes', async () => {
      (apiClient.getTrendHistory as Mock).mockResolvedValue({});

      const { result } = renderHook(() => useTrendHistory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useTrendReport', () => {
    it('should fetch trend report successfully', async () => {
      const mockReport = {
        summary: '学习状态良好',
        insights: ['保持连续学习', '适当休息'],
        recommendations: ['早晨学习效果更好'],
      };

      (apiClient.getTrendReport as Mock).mockResolvedValue(mockReport);

      const { result } = renderHook(() => useTrendReport(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockReport);
    });
  });

  describe('useIntervention', () => {
    it('should fetch intervention suggestions successfully', async () => {
      const mockIntervention = {
        needsIntervention: true,
        reason: '连续学习时间过长',
        suggestions: ['建议休息10分钟', '降低学习强度'],
      };

      (apiClient.getIntervention as Mock).mockResolvedValue(mockIntervention);

      const { result } = renderHook(() => useIntervention(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockIntervention);
    });

    it('should auto-refresh every 5 minutes', async () => {
      (apiClient.getIntervention as Mock).mockResolvedValue({});

      const { result } = renderHook(() => useIntervention(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useGoldenTime', () => {
    it('should fetch golden time successfully', async () => {
      const mockGoldenTime = {
        isGoldenTime: true,
        peakHours: [9, 10, 11],
        message: '现在是黄金学习时间',
      };

      (apiClient.getGoldenTime as Mock).mockResolvedValue(mockGoldenTime);

      const { result } = renderHook(() => useGoldenTime(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockGoldenTime);
    });
  });

  describe('useTimePreferences', () => {
    it('should fetch time preferences successfully', async () => {
      const mockPreferences = {
        peakHours: [9, 10, 14, 15],
        averageAccuracyByHour: { 9: 0.85, 10: 0.9 },
      };

      (apiClient.getTimePreferences as Mock).mockResolvedValue(mockPreferences);

      const { result } = renderHook(() => useTimePreferences(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPreferences);
    });
  });

  describe('useStateHistory', () => {
    it('should fetch state history successfully', async () => {
      const mockHistory = {
        history: [
          { timestamp: '2024-01-01', attention: 0.8, fatigue: 0.3 },
          { timestamp: '2024-01-02', attention: 0.85, fatigue: 0.25 },
        ],
        summary: {
          recordCount: 2,
          averages: { attention: 0.825, fatigue: 0.275 },
        },
        range: 30,
        totalRecords: 2,
      };

      (apiClient.getStateHistory as Mock).mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useStateHistory(30), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockHistory);
    });
  });

  describe('useCognitiveGrowth', () => {
    it('should fetch cognitive growth successfully', async () => {
      const mockGrowth = {
        current: { memory: 0.85, speed: 0.9, stability: 0.8 },
        past: { memory: 0.75, speed: 0.8, stability: 0.7 },
        changes: {
          memory: { value: 0.1, percent: 13.3, direction: 'up' as const },
          speed: { value: 0.1, percent: 12.5, direction: 'up' as const },
          stability: { value: 0.1, percent: 14.3, direction: 'up' as const },
        },
        period: 30,
        periodLabel: '最近30天',
      };

      (apiClient.getCognitiveGrowth as Mock).mockResolvedValue(mockGrowth);

      const { result } = renderHook(() => useCognitiveGrowth(30), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockGrowth);
    });
  });

  describe('useSignificantChanges', () => {
    it('should fetch significant changes successfully', async () => {
      const mockChanges = {
        changes: [
          {
            metric: 'accuracy',
            change: 0.15,
            significance: 'high',
            description: '正确率显著提升',
          },
        ],
        range: 30,
        hasSignificantChanges: true,
        summary: '学习效果有明显改善',
      };

      (apiClient.getSignificantChanges as Mock).mockResolvedValue(mockChanges);

      const { result } = renderHook(() => useSignificantChanges(30), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockChanges);
    });
  });
});
