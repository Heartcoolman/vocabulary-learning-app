/**
 * AmasStatus Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AmasStatus from '../AmasStatus';
import ApiClient from '../../services/client';

// Mock ApiClient - define mock functions first
vi.mock('../../services/client', () => ({
  default: {
    getAmasState: vi.fn(),
    getAmasColdStartPhase: vi.fn(),
  },
}));

// Get typed reference to mocked module
const mockApiClient = ApiClient as unknown as {
  getAmasState: ReturnType<typeof vi.fn>;
  getAmasColdStartPhase: ReturnType<typeof vi.fn>;
};

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    MagnifyingGlass: () => <span data-testid="search-icon">Search</span>,
    Compass: () => <span data-testid="compass-icon">Compass</span>,
    CheckCircle: () => <span data-testid="check-icon">Check</span>,
    Question: () => <span data-testid="question-icon">Question</span>,
  };
});

// Mock logger
vi.mock('../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockUserState = {
  attention: 0.8,
  fatigue: 0.3,
  memory: 0.75,
  speed: 0.65,
  motivation: 0.5,
  stability: 0.7,
};

const mockPhaseInfo = {
  phase: 'classify',
  progress: 0.5,
  description: 'Classifying user',
};

describe('AmasStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockApiClient.getAmasState).mockResolvedValue(mockUserState);
    vi.mocked(mockApiClient.getAmasColdStartPhase).mockResolvedValue(mockPhaseInfo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should show loading skeleton initially', () => {
      render(<AmasStatus />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ==================== Error State Tests ====================

  describe('error state', () => {
    it('should show error message when API fails', async () => {
      mockApiClient.getAmasState.mockRejectedValue(new Error('API Error'));

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('加载AMAS状态失败，请稍后重试')).toBeInTheDocument();
      });
    });

    it('should show error icon when API fails', async () => {
      mockApiClient.getAmasState.mockRejectedValue(new Error('API Error'));

      render(<AmasStatus />);

      await waitFor(() => {
        const errorContainer = screen.getByText('加载AMAS状态失败，请稍后重试').closest('div');
        expect(errorContainer?.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  // ==================== No Data State Tests ====================

  describe('no data state', () => {
    it('should show no data message when state is null', async () => {
      mockApiClient.getAmasState.mockResolvedValue(null);

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('暂无学习状态数据')).toBeInTheDocument();
      });
    });

    it('should show no data message when phase is null', async () => {
      mockApiClient.getAmasColdStartPhase.mockResolvedValue(null);

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('暂无学习状态数据')).toBeInTheDocument();
      });
    });
  });

  // ==================== Data Display Tests ====================

  describe('data display', () => {
    it('should display learning status title', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('学习状态')).toBeInTheDocument();
      });
    });

    it('should display attention metric', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('注意力')).toBeInTheDocument();
        expect(screen.getByText('80%')).toBeInTheDocument();
      });
    });

    it('should display fatigue metric', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('疲劳度')).toBeInTheDocument();
        expect(screen.getByText('30%')).toBeInTheDocument();
      });
    });

    it('should display memory metric', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('记忆力')).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });

    it('should display speed metric', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('反应速度')).toBeInTheDocument();
        expect(screen.getByText('65%')).toBeInTheDocument();
      });
    });
  });

  // ==================== Phase Display Tests ====================

  describe('phase display', () => {
    it('should display classify phase', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('分类中')).toBeInTheDocument();
        expect(screen.getByTestId('search-icon')).toBeInTheDocument();
      });
    });

    it('should display explore phase', async () => {
      mockApiClient.getAmasColdStartPhase.mockResolvedValue({
        phase: 'explore',
        progress: 0.7,
        description: 'Exploring',
      });

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('探索中')).toBeInTheDocument();
        expect(screen.getByTestId('compass-icon')).toBeInTheDocument();
      });
    });

    it('should display normal phase', async () => {
      mockApiClient.getAmasColdStartPhase.mockResolvedValue({
        phase: 'normal',
        progress: 1.0,
        description: 'Normal',
      });

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('正常')).toBeInTheDocument();
        expect(screen.getByTestId('check-icon')).toBeInTheDocument();
      });
    });

    it('should display unknown phase', async () => {
      mockApiClient.getAmasColdStartPhase.mockResolvedValue({
        phase: 'unknown',
        progress: 0,
        description: 'Unknown',
      });

      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('未知')).toBeInTheDocument();
        expect(screen.getByTestId('question-icon')).toBeInTheDocument();
      });
    });
  });

  // ==================== Detailed Mode Tests ====================

  describe('detailed mode', () => {
    it('should not show detailed info by default', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByText('学习状态')).toBeInTheDocument();
      });

      expect(screen.queryByText('动机:')).not.toBeInTheDocument();
      expect(screen.queryByText('稳定性:')).not.toBeInTheDocument();
    });

    it('should show detailed info when detailed prop is true', async () => {
      render(<AmasStatus detailed={true} />);

      await waitFor(() => {
        expect(screen.getByText('动机:')).toBeInTheDocument();
        expect(screen.getByText('稳定性:')).toBeInTheDocument();
      });
    });

    it('should display motivation in detailed mode', async () => {
      render(<AmasStatus detailed={true} />);

      await waitFor(() => {
        expect(screen.getByText('动机:')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should display stability in detailed mode', async () => {
      render(<AmasStatus detailed={true} />);

      await waitFor(() => {
        expect(screen.getByText('稳定性:')).toBeInTheDocument();
        expect(screen.getByText('70%')).toBeInTheDocument();
      });
    });
  });

  // ==================== Refresh Trigger Tests ====================

  describe('refresh trigger', () => {
    it('should reload data when refreshTrigger changes', async () => {
      const { rerender } = render(<AmasStatus refreshTrigger={0} />);

      await waitFor(() => {
        expect(mockApiClient.getAmasState).toHaveBeenCalledTimes(1);
      });

      rerender(<AmasStatus refreshTrigger={1} />);

      await waitFor(() => {
        expect(mockApiClient.getAmasState).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ==================== Color Coding Tests ====================

  describe('color coding', () => {
    it('should show green color for high attention', async () => {
      mockApiClient.getAmasState.mockResolvedValue({
        ...mockUserState,
        attention: 0.85, // Use different value from other metrics
      });

      render(<AmasStatus />);

      await waitFor(() => {
        const attentionValue = screen.getByText('85%');
        expect(attentionValue.className).toContain('text-green');
      });
    });

    it('should show yellow color for medium attention', async () => {
      mockApiClient.getAmasState.mockResolvedValue({
        ...mockUserState,
        attention: 0.5,
      });

      render(<AmasStatus />);

      await waitFor(() => {
        const attentionValue = screen.getByText('50%');
        expect(attentionValue.className).toContain('text-yellow');
      });
    });

    it('should show red color for low attention', async () => {
      mockApiClient.getAmasState.mockResolvedValue({
        ...mockUserState,
        attention: 0.25, // Use different value from fatigue (0.3)
        fatigue: 0.5, // Change fatigue to avoid 30% conflict
      });

      render(<AmasStatus />);

      await waitFor(() => {
        const attentionValue = screen.getByText('25%');
        expect(attentionValue.className).toContain('text-red');
      });
    });

    it('should show green color for low fatigue (inverse)', async () => {
      mockApiClient.getAmasState.mockResolvedValue({
        ...mockUserState,
        fatigue: 0.2,
      });

      render(<AmasStatus />);

      await waitFor(() => {
        const fatigueValue = screen.getByText('20%');
        expect(fatigueValue.className).toContain('text-green');
      });
    });

    it('should show red color for high fatigue (inverse)', async () => {
      mockApiClient.getAmasState.mockResolvedValue({
        ...mockUserState,
        attention: 0.7, // Set different from fatigue to avoid conflicts
        fatigue: 0.8,
      });

      render(<AmasStatus />);

      await waitFor(() => {
        const fatigueValue = screen.getByText('80%');
        expect(fatigueValue.className).toContain('text-red');
      });
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have region role', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByRole('region')).toBeInTheDocument();
      });
    });

    it('should have aria-label', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(screen.getByRole('region')).toHaveAttribute('aria-label', '学习状态监控');
      });
    });

    it('should have progressbar role for metrics', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        const progressbars = screen.getAllByRole('progressbar');
        expect(progressbars.length).toBeGreaterThan(0);
      });
    });

    it('should have correct aria attributes on progressbar', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        const progressbars = screen.getAllByRole('progressbar');
        const attentionBar = progressbars.find((bar) =>
          bar.getAttribute('aria-label')?.includes('注意力'),
        );
        expect(attentionBar).toHaveAttribute('aria-valuenow', '80');
        expect(attentionBar).toHaveAttribute('aria-valuemin', '0');
        expect(attentionBar).toHaveAttribute('aria-valuemax', '100');
      });
    });
  });

  // ==================== Auto Refresh Tests ====================
  // Note: These tests verify the component makes API calls on mount.
  // Testing intervals with async operations requires more complex setup.

  describe('auto refresh', () => {
    it('should make initial API call on mount', async () => {
      render(<AmasStatus />);

      // Wait for component to finish loading
      await waitFor(() => {
        expect(mockApiClient.getAmasState).toHaveBeenCalled();
      });
    });

    it('should call both API methods on mount', async () => {
      render(<AmasStatus />);

      await waitFor(() => {
        expect(mockApiClient.getAmasState).toHaveBeenCalled();
        expect(mockApiClient.getAmasColdStartPhase).toHaveBeenCalled();
      });
    });
  });
});
