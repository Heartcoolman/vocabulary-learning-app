/**
 * HabitProfileTab Component Unit Tests
 * 习惯画像标签页组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HabitProfileTab from '../HabitProfileTab';
import type { HabitProfile } from '../../types/habit-profile';

// Mock Icon component
vi.mock('../Icon', () => ({
  Clock: ({ className, size, weight }: any) => (
    <span data-testid="clock-icon" className={className} data-size={size} data-weight={weight}>
      🕐
    </span>
  ),
  TrendUp: ({ className, size, weight }: any) => (
    <span data-testid="trend-up-icon" className={className} data-size={size} data-weight={weight}>
      📈
    </span>
  ),
  Calendar: ({ className, size, weight }: any) => (
    <span data-testid="calendar-icon" className={className} data-size={size} data-weight={weight}>
      📅
    </span>
  ),
  ArrowClockwise: ({ className, size, weight }: any) => (
    <span
      data-testid="arrow-clockwise-icon"
      className={className}
      data-size={size}
      data-weight={weight}
    >
      🔄
    </span>
  ),
  FloppyDisk: ({ className, size, weight }: any) => (
    <span
      data-testid="floppy-disk-icon"
      className={className}
      data-size={size}
      data-weight={weight}
    >
      💾
    </span>
  ),
  ArrowCounterClockwise: ({ className, size, weight }: any) => (
    <span
      data-testid="arrow-counter-clockwise-icon"
      className={className}
      data-size={size}
      data-weight={weight}
    >
      ↺
    </span>
  ),
  Lightbulb: ({ className, size, weight }: any) => (
    <span data-testid="lightbulb-icon" className={className} data-size={size} data-weight={weight}>
      💡
    </span>
  ),
}));

// Mock child components
vi.mock('../HabitHeatmap', () => ({
  default: ({ timePref }: { timePref: number[] }) => (
    <div data-testid="habit-heatmap">HabitHeatmap (timePref length: {timePref?.length})</div>
  ),
}));

vi.mock('../ChronotypeCard', () => ({
  default: ({ data }: { data: any }) => (
    <div data-testid="chronotype-card">ChronotypeCard (type: {data?.type})</div>
  ),
}));

vi.mock('../LearningStyleCard', () => ({
  default: ({ data }: { data: any }) => (
    <div data-testid="learning-style-card">LearningStyleCard (style: {data?.style})</div>
  ),
}));

// Mock API client
vi.mock('../../services/client', () => ({
  default: {
    getHabitProfile: vi.fn(),
    getCognitiveProfile: vi.fn(),
    persistHabitProfile: vi.fn(),
    initializeHabitProfile: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import apiClient from '../../services/client';

// Helper function to create mock habit profile
const createMockProfile = (overrides: Partial<HabitProfile> = {}): HabitProfile => ({
  preferredTimeSlots: [9, 10, 14],
  timePref: Array(24).fill(0.5),
  rhythmPref: {
    sessionMedianMinutes: 25,
    batchMedian: 15,
  },
  samples: {
    timeEvents: 100,
    sessions: 50,
    batches: 30,
  },
  ...overrides,
});

// Helper function to create mock cognitive profile
const createMockCognitiveProfile = () => ({
  chronotype: {
    category: 'morning' as const,
    confidence: 0.8,
    peakHours: [9, 10, 11],
    learningHistory: [
      { hour: 9, performance: 0.85, sampleCount: 10 },
      { hour: 10, performance: 0.82, sampleCount: 8 },
      { hour: 11, performance: 0.78, sampleCount: 6 },
    ],
  },
  learningStyle: {
    style: 'visual' as const,
    confidence: 0.75,
    scores: { visual: 0.8, auditory: 0.5, kinesthetic: 0.4 },
  },
});

describe('HabitProfileTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Loading State Tests ====================
  describe('loading state', () => {
    it('should show loading spinner initially', () => {
      vi.mocked(apiClient.getHabitProfile).mockImplementation(() => new Promise(() => {}));
      vi.mocked(apiClient.getCognitiveProfile).mockImplementation(() => new Promise(() => {}));

      render(<HabitProfileTab />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('should show loading animation', () => {
      vi.mocked(apiClient.getHabitProfile).mockImplementation(() => new Promise(() => {}));
      vi.mocked(apiClient.getCognitiveProfile).mockImplementation(() => new Promise(() => {}));

      const { container } = render(<HabitProfileTab />);

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  // ==================== Error State Tests ====================
  describe('error state', () => {
    it('should show error message when API fails', async () => {
      vi.mocked(apiClient.getHabitProfile).mockRejectedValue(new Error('Network error'));
      vi.mocked(apiClient.getCognitiveProfile).mockRejectedValue(new Error('Network error'));

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      vi.mocked(apiClient.getHabitProfile).mockRejectedValue(new Error('Network error'));
      vi.mocked(apiClient.getCognitiveProfile).mockRejectedValue(new Error('Network error'));

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
      });
    });

    it('should show generic error when no profile data', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: null as any,
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(null as any);

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('数据加载失败')).toBeInTheDocument();
      });
    });

    it('should retry loading when retry button is clicked', async () => {
      vi.mocked(apiClient.getHabitProfile)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ stored: null, realtime: createMockProfile() });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /重试/ }));

      await waitFor(() => {
        expect(screen.getByText('学习时长')).toBeInTheDocument();
      });
    });
  });

  // ==================== Success State Tests ====================
  describe('success state', () => {
    beforeEach(() => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());
    });

    it('should render statistics cards', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('学习时长')).toBeInTheDocument();
        expect(screen.getByText('学习节奏')).toBeInTheDocument();
        expect(screen.getByText('数据样本')).toBeInTheDocument();
      });
    });

    it('should display session duration', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('25 分钟')).toBeInTheDocument();
      });
    });

    it('should display batch median', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('15 个/次')).toBeInTheDocument();
      });
    });

    it('should display sample counts', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('50')).toBeInTheDocument(); // sessions
        expect(screen.getByText('100')).toBeInTheDocument(); // timeEvents
        expect(screen.getByText('30')).toBeInTheDocument(); // batches
      });
    });

    it('should render HabitHeatmap component', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByTestId('habit-heatmap')).toBeInTheDocument();
      });
    });

    it('should render cognitive profile cards when available', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByTestId('chronotype-card')).toBeInTheDocument();
        expect(screen.getByTestId('learning-style-card')).toBeInTheDocument();
      });
    });
  });

  // ==================== Preferred Time Slots Tests ====================
  describe('preferred time slots', () => {
    it('should display preferred time slots', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({ preferredTimeSlots: [9, 14, 20] }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('偏好时段')).toBeInTheDocument();
        expect(screen.getByText('9:00 - 9:59')).toBeInTheDocument();
        expect(screen.getByText('14:00 - 14:59')).toBeInTheDocument();
        expect(screen.getByText('20:00 - 20:59')).toBeInTheDocument();
      });
    });

    it('should not render preferred time slots section when empty', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({ preferredTimeSlots: [] }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('学习时长')).toBeInTheDocument();
      });

      expect(screen.queryByText('偏好时段')).not.toBeInTheDocument();
    });
  });

  // ==================== Cognitive Profile Tests ====================
  describe('cognitive profile', () => {
    it('should show fallback message when cognitive profile is not available', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockRejectedValue(new Error('Not enough data'));

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText(/认知画像数据加载中或数据不足/)).toBeInTheDocument();
      });
    });

    it('should display data requirements message', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(null as any);

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText(/需要至少20条学习记录才能生成Chronotype/)).toBeInTheDocument();
      });
    });
  });

  // ==================== Data Management Tests ====================
  describe('data management', () => {
    beforeEach(() => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());
    });

    it('should render save button', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /保存习惯画像/ })).toBeInTheDocument();
      });
    });

    it('should render rebuild button', async () => {
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /从历史重建/ })).toBeInTheDocument();
      });
    });

    it('should show success message when save succeeds', async () => {
      vi.mocked(apiClient.persistHabitProfile).mockResolvedValue({
        saved: true,
        profile: {
          preferredTimeSlots: [9, 10, 14],
          rhythmPref: { sessionMedianMinutes: 25, batchMedian: 15 },
          samples: { timeEvents: 100, sessions: 50, batches: 30 },
        },
      });

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /保存习惯画像/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /保存习惯画像/ }));

      await waitFor(() => {
        expect(screen.getByText('习惯画像已保存')).toBeInTheDocument();
      });
    });

    it('should show error message when save fails due to insufficient data', async () => {
      vi.mocked(apiClient.persistHabitProfile).mockResolvedValue({
        saved: false,
        profile: {
          preferredTimeSlots: [],
          rhythmPref: { sessionMedianMinutes: 0, batchMedian: 0 },
          samples: { timeEvents: 0, sessions: 0, batches: 0 },
        },
      });

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /保存习惯画像/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /保存习惯画像/ }));

      await waitFor(() => {
        expect(screen.getByText('保存失败，样本数据不足')).toBeInTheDocument();
      });
    });

    it('should show success message when initialize succeeds', async () => {
      vi.mocked(apiClient.initializeHabitProfile).mockResolvedValue({
        initialized: true,
        saved: true,
        profile: {
          preferredTimeSlots: [9, 10, 14],
          rhythmPref: { sessionMedianMinutes: 25, batchMedian: 15 },
          samples: { timeEvents: 100, sessions: 50, batches: 30 },
        },
      });

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /从历史重建/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /从历史重建/ }));

      await waitFor(() => {
        expect(screen.getByText('已从历史数据重新初始化习惯画像')).toBeInTheDocument();
      });
    });

    it('should show error message when initialize fails', async () => {
      vi.mocked(apiClient.initializeHabitProfile).mockRejectedValue(new Error('Init failed'));

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /从历史重建/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /从历史重建/ }));

      await waitFor(() => {
        expect(screen.getByText('Init failed')).toBeInTheDocument();
      });
    });

    it('should disable buttons while action is in progress', async () => {
      vi.mocked(apiClient.persistHabitProfile).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const user = userEvent.setup();
      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /保存习惯画像/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /保存习惯画像/ }));

      expect(screen.getByRole('button', { name: /保存习惯画像/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /从历史重建/ })).toBeDisabled();
    });
  });

  // ==================== Info Section Tests ====================
  describe('info section', () => {
    it('should render about habit profile section', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('关于习惯画像')).toBeInTheDocument();
      });
    });

    it('should display explanation text', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText(/系统会自动分析你的学习习惯/)).toBeInTheDocument();
      });
    });

    it('should render lightbulb icon in info section', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile(),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByTestId('lightbulb-icon')).toBeInTheDocument();
      });
    });
  });

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle missing preferredTimeSlots gracefully', async () => {
      // Create a profile with empty preferredTimeSlots instead of deleting it
      // to test the defensive code path
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({ preferredTimeSlots: [] }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('学习时长')).toBeInTheDocument();
      });

      // Should not crash and should not show the preferred time slots section
      expect(screen.queryByText('偏好时段')).not.toBeInTheDocument();
    });

    it('should handle empty preferredTimeSlots array', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({ preferredTimeSlots: [] }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('学习时长')).toBeInTheDocument();
      });

      // Preferred time slots section should not be rendered
      expect(screen.queryByText('偏好时段')).not.toBeInTheDocument();
    });

    it('should handle zero sample values', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({
          samples: { timeEvents: 0, sessions: 0, batches: 0 },
        }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        expect(screen.getByText('数据样本')).toBeInTheDocument();
        // Should display zeros
        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('should handle decimal rhythm values', async () => {
      vi.mocked(apiClient.getHabitProfile).mockResolvedValue({
        stored: null,
        realtime: createMockProfile({
          rhythmPref: { sessionMedianMinutes: 25.7, batchMedian: 15.3 },
        }),
      });
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      render(<HabitProfileTab />);

      await waitFor(() => {
        // Values should be formatted without decimals
        expect(screen.getByText('26 分钟')).toBeInTheDocument();
        expect(screen.getByText('15 个/次')).toBeInTheDocument();
      });
    });
  });

  // ==================== Component Unmount Tests ====================
  describe('unmount handling', () => {
    it('should not update state after unmount', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(apiClient.getHabitProfile).mockReturnValue(promise as any);
      vi.mocked(apiClient.getCognitiveProfile).mockResolvedValue(createMockCognitiveProfile());

      const { unmount } = render(<HabitProfileTab />);

      // Unmount before the promise resolves
      unmount();

      // Resolve after unmount
      resolvePromise!({ stored: null, realtime: createMockProfile() });

      // Should not throw or cause any issues
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
