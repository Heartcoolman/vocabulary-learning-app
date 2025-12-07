/**
 * DecisionFactors Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DecisionFactors from '../DecisionFactors';
import type { DecisionFactor } from '../../../types/explainability';

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  Brain: ({ className }: any) => (
    <span data-testid="icon-brain" className={className}>
      Brain
    </span>
  ),
  Clock: ({ className }: any) => (
    <span data-testid="icon-clock" className={className}>
      Clock
    </span>
  ),
  Target: ({ className }: any) => (
    <span data-testid="icon-target" className={className}>
      Target
    </span>
  ),
  Lightning: ({ className }: any) => (
    <span data-testid="icon-lightning" className={className}>
      Lightning
    </span>
  ),
  ChartLine: ({ className }: any) => (
    <span data-testid="icon-chartline" className={className}>
      ChartLine
    </span>
  ),
  Info: ({ className }: any) => (
    <span data-testid="icon-info" className={className}>
      Info
    </span>
  ),
}));

const mockFactors: DecisionFactor[] = [
  {
    name: '记忆强度',
    score: 0.75,
    weight: 0.4,
    explanation: '基于遗忘曲线计算的记忆保持率',
    icon: 'memory',
  },
  {
    name: '难度匹配',
    score: 0.6,
    weight: 0.3,
    explanation: '单词难度与学习者能力的匹配度',
    icon: 'difficulty',
  },
  {
    name: '时间因素',
    score: 0.85,
    weight: 0.2,
    explanation: '距上次复习的时间间隔',
    icon: 'time',
  },
];

describe('DecisionFactors', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the component title', () => {
      render(<DecisionFactors factors={mockFactors} />);

      expect(screen.getByText('决策因素解析')).toBeInTheDocument();
    });

    it('should render all factors', () => {
      render(<DecisionFactors factors={mockFactors} />);

      expect(screen.getByText('记忆强度')).toBeInTheDocument();
      expect(screen.getByText('难度匹配')).toBeInTheDocument();
      expect(screen.getByText('时间因素')).toBeInTheDocument();
    });

    it('should render factor explanations', () => {
      render(<DecisionFactors factors={mockFactors} />);

      expect(screen.getByText('基于遗忘曲线计算的记忆保持率')).toBeInTheDocument();
      expect(screen.getByText('单词难度与学习者能力的匹配度')).toBeInTheDocument();
      expect(screen.getByText('距上次复习的时间间隔')).toBeInTheDocument();
    });

    it('should render factor weights as percentages', () => {
      render(<DecisionFactors factors={mockFactors} />);

      expect(screen.getByText('权重: 40%')).toBeInTheDocument();
      expect(screen.getByText('权重: 30%')).toBeInTheDocument();
      expect(screen.getByText('权重: 20%')).toBeInTheDocument();
    });

    it('should render factor scores', () => {
      render(<DecisionFactors factors={mockFactors} />);

      expect(screen.getByText('75')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
    });

    it('should render empty list when no factors provided', () => {
      render(<DecisionFactors factors={[]} />);

      expect(screen.getByText('决策因素解析')).toBeInTheDocument();
      expect(screen.queryByText('记忆强度')).not.toBeInTheDocument();
    });
  });

  // ==================== Icon Mapping Tests ====================

  describe('icon mapping', () => {
    it('should render memory icon for memory type', () => {
      const factors: DecisionFactor[] = [
        { name: '记忆', score: 0.5, weight: 0.5, explanation: 'test', icon: 'memory' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getAllByTestId('icon-brain').length).toBeGreaterThan(0);
    });

    it('should render target icon for difficulty type', () => {
      const factors: DecisionFactor[] = [
        { name: '难度', score: 0.5, weight: 0.5, explanation: 'test', icon: 'difficulty' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByTestId('icon-target')).toBeInTheDocument();
    });

    it('should render clock icon for time type', () => {
      const factors: DecisionFactor[] = [
        { name: '时间', score: 0.5, weight: 0.5, explanation: 'test', icon: 'time' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
    });

    it('should render lightning icon for risk type', () => {
      const factors: DecisionFactor[] = [
        { name: '风险', score: 0.5, weight: 0.5, explanation: 'test', icon: 'risk' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
    });

    it('should render chartline icon for rhythm type', () => {
      const factors: DecisionFactor[] = [
        { name: '节奏', score: 0.5, weight: 0.5, explanation: 'test', icon: 'rhythm' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByTestId('icon-chartline')).toBeInTheDocument();
    });

    it('should render info icon for unknown type', () => {
      const factors: DecisionFactor[] = [
        { name: '未知', score: 0.5, weight: 0.5, explanation: 'test', icon: 'unknown' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByTestId('icon-info')).toBeInTheDocument();
    });
  });

  // ==================== Props Tests ====================

  describe('props handling', () => {
    it('should handle factors with zero scores', () => {
      const factors: DecisionFactor[] = [
        { name: '零分', score: 0, weight: 0.5, explanation: 'test', icon: 'memory' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle factors with full scores', () => {
      const factors: DecisionFactor[] = [
        { name: '满分', score: 1, weight: 1, explanation: 'test', icon: 'memory' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('权重: 100%')).toBeInTheDocument();
    });

    it('should handle decimal weight values', () => {
      const factors: DecisionFactor[] = [
        { name: '小数', score: 0.333, weight: 0.256, explanation: 'test', icon: 'memory' },
      ];
      render(<DecisionFactors factors={factors} />);

      expect(screen.getByText('权重: 26%')).toBeInTheDocument();
      expect(screen.getByText('33')).toBeInTheDocument();
    });
  });
});
