/**
 * DecisionTooltip Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DecisionTooltip } from '../DecisionTooltip';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, ...props }: any) => (
      <div onClick={onClick} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Info: () => <span data-testid="info-icon">ℹ️</span>,
  TrendUp: () => <span data-testid="trend-up">📈</span>,
  TrendDown: () => <span data-testid="trend-down">📉</span>,
  Minus: () => <span data-testid="minus">➖</span>,
}));

const mockExplanation = {
  primaryReason: '根据您的学习表现，建议增加复习频率',
  factorContributions: [
    {
      factor: '记忆强度',
      percentage: 40,
      impact: 'positive' as const,
      description: '您对这个单词的记忆较强',
    },
    {
      factor: '错误率',
      percentage: 30,
      impact: 'negative' as const,
      description: '最近几次回答有误',
    },
    {
      factor: '时间间隔',
      percentage: 30,
      impact: 'neutral' as const,
      description: '距上次复习时间适中',
    },
  ],
  algorithmInfo: {
    algorithm: 'ensemble',
    confidence: 0.85,
    phase: 'normal',
  },
};

describe('DecisionTooltip', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render trigger button', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      expect(screen.getByText('为什么这样安排？')).toBeInTheDocument();
    });

    it('should render null when no explanation', () => {
      const { container } = render(<DecisionTooltip />);

      expect(container.firstChild).toBeNull();
    });

    it('should have proper aria-label on button', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      expect(screen.getByLabelText('查看决策详情')).toBeInTheDocument();
    });
  });

  // ==================== Expansion Tests ====================

  describe('expansion', () => {
    it('should expand on button click', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('决策原因')).toBeInTheDocument();
      expect(screen.getByText(mockExplanation.primaryReason)).toBeInTheDocument();
    });

    it('should show factor contributions when expanded', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('影响因素')).toBeInTheDocument();
      expect(screen.getByText('记忆强度')).toBeInTheDocument();
      expect(screen.getByText('错误率')).toBeInTheDocument();
      expect(screen.getByText('时间间隔')).toBeInTheDocument();
    });

    it('should show percentages for factors', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('40%')).toBeInTheDocument();
      // There are two factors with 30% percentage
      expect(screen.getAllByText('30%').length).toBeGreaterThanOrEqual(1);
    });

    it('should show factor descriptions', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('您对这个单词的记忆较强')).toBeInTheDocument();
      expect(screen.getByText('最近几次回答有误')).toBeInTheDocument();
    });
  });

  // ==================== Impact Icons Tests ====================

  describe('impact icons', () => {
    it('should show trend up icon for positive impact', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByTestId('trend-up')).toBeInTheDocument();
    });

    it('should show trend down icon for negative impact', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByTestId('trend-down')).toBeInTheDocument();
    });

    it('should show minus icon for neutral impact', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByTestId('minus')).toBeInTheDocument();
    });
  });

  // ==================== Algorithm Info Tests ====================

  describe('algorithm info', () => {
    it('should show algorithm name', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('ensemble')).toBeInTheDocument();
    });

    it('should show confidence percentage', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should show phase when provided', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.getByText('normal')).toBeInTheDocument();
    });

    it('should apply green color for high confidence', () => {
      render(<DecisionTooltip explanation={mockExplanation} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      const confidenceValue = screen.getByText('85%');
      expect(confidenceValue.className).toContain('text-green-600');
    });

    it('should apply yellow color for medium confidence', () => {
      const mediumConfidence = {
        ...mockExplanation,
        algorithmInfo: { ...mockExplanation.algorithmInfo, confidence: 0.5 },
      };
      render(<DecisionTooltip explanation={mediumConfidence} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      const confidenceValue = screen.getByText('50%');
      expect(confidenceValue.className).toContain('text-yellow-600');
    });

    it('should apply red color for low confidence', () => {
      const lowConfidence = {
        ...mockExplanation,
        algorithmInfo: { ...mockExplanation.algorithmInfo, confidence: 0.25 },
      };
      render(<DecisionTooltip explanation={lowConfidence} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      const confidenceValue = screen.getByText('25%');
      expect(confidenceValue.className).toContain('text-red-600');
    });
  });

  // ==================== Empty State Tests ====================

  describe('empty states', () => {
    it('should handle empty factor contributions', () => {
      const noFactors = {
        ...mockExplanation,
        factorContributions: [],
      };
      render(<DecisionTooltip explanation={noFactors} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.queryByText('影响因素')).not.toBeInTheDocument();
    });

    it('should handle missing phase', () => {
      const noPhase = {
        ...mockExplanation,
        algorithmInfo: { algorithm: 'linucb', confidence: 0.8 },
      };
      render(<DecisionTooltip explanation={noPhase} />);

      fireEvent.click(screen.getByText('为什么这样安排？'));

      expect(screen.queryByText('阶段:')).not.toBeInTheDocument();
    });
  });
});
