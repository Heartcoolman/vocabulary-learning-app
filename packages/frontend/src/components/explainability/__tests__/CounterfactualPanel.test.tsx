/**
 * CounterfactualPanel Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CounterfactualPanel from '../CounterfactualPanel';
import { explainabilityApi } from '../../../services/explainabilityApi';

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Flask: ({ className }: { className?: string }) => (
    <span data-testid="icon-flask" className={className}>
      Flask
    </span>
  ),
  ArrowRight: ({ className }: { className?: string }) => (
    <span data-testid="icon-arrow" className={className}>
      Arrow
    </span>
  ),
  CheckCircle: () => <span data-testid="icon-check">Check</span>,
  WarningCircle: () => <span data-testid="icon-warning">Warning</span>,
  CircleNotch: ({ className }: { className?: string }) => (
    <span data-testid="icon-loading" className={className}>
      Loading
    </span>
  ),
}));

// Mock API
vi.mock('../../../services/explainabilityApi', () => ({
  explainabilityApi: {
    runCounterfactual: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
  },
}));

const mockSuccessResult = {
  baseDecisionId: 'test-decision-1',
  baseState: { attention: 0.5, fatigue: 0.5, motivation: 0.5 },
  counterfactualState: { attention: 0.7, fatigue: 0.3, motivation: 0.8 },
  prediction: {
    wouldTriggerAdjustment: true,
    suggestedDifficulty: 'easier' as const,
    estimatedAccuracyChange: 0.15,
  },
  explanation: '提高注意力和学习动机会显著改善学习效果。',
};

describe('CounterfactualPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the component title', () => {
      render(<CounterfactualPanel />);

      expect(screen.getByText('如果我的状态不同会怎样？')).toBeInTheDocument();
    });

    it('should render description text', () => {
      render(<CounterfactualPanel />);

      expect(screen.getByText(/调整下面的参数/)).toBeInTheDocument();
    });

    it('should render all sliders', () => {
      render(<CounterfactualPanel />);

      expect(screen.getByText('注意力')).toBeInTheDocument();
      expect(screen.getByText('疲劳度')).toBeInTheDocument();
      expect(screen.getByText('学习动机')).toBeInTheDocument();
      expect(screen.getByText('近期正确率')).toBeInTheDocument();
    });

    it('should render simulate button', () => {
      render(<CounterfactualPanel />);

      expect(screen.getByRole('button', { name: /模拟分析/ })).toBeInTheDocument();
    });

    it('should display initial slider values', () => {
      render(<CounterfactualPanel />);

      expect(screen.getByText('70%')).toBeInTheDocument(); // attention
      expect(screen.getByText('30%')).toBeInTheDocument(); // fatigue
      expect(screen.getByText('80%')).toBeInTheDocument(); // motivation
      expect(screen.getByText('75%')).toBeInTheDocument(); // recentAccuracy
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should update slider value when changed', () => {
      render(<CounterfactualPanel />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '90' } });

      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should call API when simulate button clicked', async () => {
      (explainabilityApi.runCounterfactual as Mock).mockResolvedValue(mockSuccessResult);

      render(<CounterfactualPanel decisionId="test-decision-1" />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(explainabilityApi.runCounterfactual).toHaveBeenCalledWith({
          decisionId: 'test-decision-1',
          overrides: {
            attention: 0.7,
            fatigue: 0.3,
            motivation: 0.8,
            recentAccuracy: 0.75,
          },
        });
      });
    });

    it('should show loading state when simulating', async () => {
      (explainabilityApi.runCounterfactual as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSuccessResult), 100)),
      );

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(screen.getByText('分析中...')).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('should disable button while simulating', async () => {
      (explainabilityApi.runCounterfactual as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSuccessResult), 100)),
      );

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      expect(button).toBeDisabled();
    });
  });

  // ==================== Result Display Tests ====================

  describe('result display', () => {
    it('should display result after successful simulation', async () => {
      (explainabilityApi.runCounterfactual as Mock).mockResolvedValue(mockSuccessResult);

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('+15.0%')).toBeInTheDocument();
        expect(screen.getByText('会触发调整')).toBeInTheDocument();
        expect(screen.getByText('降低难度')).toBeInTheDocument();
        expect(screen.getByText(mockSuccessResult.explanation)).toBeInTheDocument();
      });
    });

    it('should display "保持当前策略" when no adjustment triggered', async () => {
      const resultNoAdjustment = {
        ...mockSuccessResult,
        prediction: {
          ...mockSuccessResult.prediction,
          wouldTriggerAdjustment: false,
          suggestedDifficulty: undefined,
        },
      };
      (explainabilityApi.runCounterfactual as Mock).mockResolvedValue(resultNoAdjustment);

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('保持当前策略')).toBeInTheDocument();
      });
    });

    it('should display negative accuracy change correctly', async () => {
      const resultNegative = {
        ...mockSuccessResult,
        prediction: {
          ...mockSuccessResult.prediction,
          estimatedAccuracyChange: -0.1,
        },
      };
      (explainabilityApi.runCounterfactual as Mock).mockResolvedValue(resultNegative);

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('-10.0%')).toBeInTheDocument();
      });
    });

    it('should display "提高难度" when suggestedDifficulty is harder', async () => {
      const resultHarder = {
        ...mockSuccessResult,
        prediction: {
          ...mockSuccessResult.prediction,
          suggestedDifficulty: 'harder' as const,
        },
      };
      (explainabilityApi.runCounterfactual as Mock).mockResolvedValue(resultHarder);

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('提高难度')).toBeInTheDocument();
      });
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should display error message on API failure', async () => {
      (explainabilityApi.runCounterfactual as Mock).mockRejectedValue(new Error('API Error'));

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('分析失败，请稍后重试')).toBeInTheDocument();
      });
    });

    it('should clear error when simulation succeeds', async () => {
      (explainabilityApi.runCounterfactual as Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockSuccessResult);

      render(<CounterfactualPanel />);

      const button = screen.getByRole('button', { name: /模拟分析/ });

      // First click - error
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('分析失败，请稍后重试')).toBeInTheDocument();
      });

      // Second click - success
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.queryByText('分析失败，请稍后重试')).not.toBeInTheDocument();
      });
    });
  });
});
