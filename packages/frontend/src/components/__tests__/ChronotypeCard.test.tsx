/**
 * ChronotypeCard 组件单元测试
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChronotypeCard, { ChronotypeProfile } from '../ChronotypeCard';

// Mock Icon components
interface MockIconProps {
  size?: number;
  weight?: string;
}

vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    Sun: ({ size, weight }: MockIconProps) => (
      <span data-testid="sun-icon" data-size={size} data-weight={weight}>
        Sun
      </span>
    ),
    Moon: ({ size, weight }: MockIconProps) => (
      <span data-testid="moon-icon" data-size={size} data-weight={weight}>
        Moon
      </span>
    ),
    SunHorizon: ({ size, weight }: MockIconProps) => (
      <span data-testid="sun-horizon-icon" data-size={size} data-weight={weight}>
        SunHorizon
      </span>
    ),
    TrendUp: ({ size, weight }: MockIconProps) => (
      <span data-testid="trend-up-icon" data-size={size} data-weight={weight}>
        TrendUp
      </span>
    ),
    Sparkle: ({ size, weight }: MockIconProps) => (
      <span data-testid="sparkle-icon" data-size={size} data-weight={weight}>
        Sparkle
      </span>
    ),
  };
});

describe('ChronotypeCard', () => {
  // ==================== Default State Tests ====================

  describe('default state', () => {
    it('should render with default data when no props provided', () => {
      render(<ChronotypeCard />);
      expect(screen.getByText('随时适应 (Intermediate)')).toBeInTheDocument();
    });

    it('should show 85% confidence by default', () => {
      render(<ChronotypeCard />);
      expect(screen.getByText(/置信度: 85%/)).toBeInTheDocument();
    });

    it('should display default peak hours visualization', () => {
      render(<ChronotypeCard />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
      expect(screen.getByText('23:59')).toBeInTheDocument();
    });
  });

  // ==================== Morning Type Tests ====================

  describe('morning type', () => {
    const morningData: ChronotypeProfile = {
      category: 'morning',
      peakHours: [6, 7, 8, 9],
      confidence: 0.9,
    };

    it('should display morning type title', () => {
      render(<ChronotypeCard data={morningData} />);
      expect(screen.getByText('早起鸟 (Morning Lark)')).toBeInTheDocument();
    });

    it('should display sun horizon icon for morning type', () => {
      render(<ChronotypeCard data={morningData} />);
      expect(screen.getAllByTestId('sun-horizon-icon').length).toBeGreaterThan(0);
    });

    it('should display morning description', () => {
      render(<ChronotypeCard data={morningData} />);
      expect(screen.getByText(/大脑在清晨最活跃/)).toBeInTheDocument();
    });

    it('should display confidence level', () => {
      render(<ChronotypeCard data={morningData} />);
      expect(screen.getByText(/置信度: 90%/)).toBeInTheDocument();
    });
  });

  // ==================== Evening Type Tests ====================

  describe('evening type', () => {
    const eveningData: ChronotypeProfile = {
      category: 'evening',
      peakHours: [20, 21, 22, 23],
      confidence: 0.85,
    };

    it('should display evening type title', () => {
      render(<ChronotypeCard data={eveningData} />);
      expect(screen.getByText('夜猫子 (Night Owl)')).toBeInTheDocument();
    });

    it('should display moon icon for evening type', () => {
      render(<ChronotypeCard data={eveningData} />);
      expect(screen.getAllByTestId('moon-icon').length).toBeGreaterThan(0);
    });

    it('should display evening description', () => {
      render(<ChronotypeCard data={eveningData} />);
      expect(screen.getByText(/夜晚思维更敏捷/)).toBeInTheDocument();
    });
  });

  // ==================== Intermediate Type Tests ====================

  describe('intermediate type', () => {
    const intermediateData: ChronotypeProfile = {
      category: 'intermediate',
      peakHours: [10, 11, 14, 15],
      confidence: 0.7,
    };

    it('should display intermediate type title', () => {
      render(<ChronotypeCard data={intermediateData} />);
      expect(screen.getByText('随时适应 (Intermediate)')).toBeInTheDocument();
    });

    it('should display sun icon for intermediate type', () => {
      render(<ChronotypeCard data={intermediateData} />);
      expect(screen.getAllByTestId('sun-icon').length).toBeGreaterThan(0);
    });

    it('should display intermediate description', () => {
      render(<ChronotypeCard data={intermediateData} />);
      expect(screen.getByText(/精力分布较均衡/)).toBeInTheDocument();
    });
  });

  // ==================== Neutral Type Tests (Alias) ====================

  describe('neutral type (alias for intermediate)', () => {
    const neutralData: ChronotypeProfile = {
      category: 'neutral',
      peakHours: [10, 11, 14, 15],
      confidence: 0.75,
    };

    it('should treat neutral as intermediate', () => {
      render(<ChronotypeCard data={neutralData} />);
      expect(screen.getByText('随时适应 (Intermediate)')).toBeInTheDocument();
    });
  });

  // ==================== Flat Props Tests ====================

  describe('flat props support', () => {
    it('should accept type prop', () => {
      render(<ChronotypeCard type="morning" />);
      expect(screen.getByText('早起鸟 (Morning Lark)')).toBeInTheDocument();
    });

    it('should accept confidence prop', () => {
      render(<ChronotypeCard confidence={0.92} />);
      expect(screen.getByText(/置信度: 92%/)).toBeInTheDocument();
    });

    it('should accept peakHours prop', () => {
      render(<ChronotypeCard peakHours={[8, 9, 10]} />);
      // Component should render without crashing
      expect(screen.getByText('随时适应 (Intermediate)')).toBeInTheDocument();
    });

    it('should prioritize data prop over flat props', () => {
      const data: ChronotypeProfile = {
        category: 'evening',
        peakHours: [20, 21],
        confidence: 0.8,
      };
      render(<ChronotypeCard data={data} type="morning" confidence={0.5} />);
      expect(screen.getByText('夜猫子 (Night Owl)')).toBeInTheDocument();
      expect(screen.getByText(/置信度: 80%/)).toBeInTheDocument();
    });
  });

  // ==================== Timeline Visualization Tests ====================

  describe('timeline visualization', () => {
    it('should display time labels', () => {
      const { container } = render(<ChronotypeCard />);
      // Use container query to find the time labels in the header row
      const timeLabelsRow = container.querySelector('.flex.justify-between.px-1.text-xs');
      expect(timeLabelsRow).toBeInTheDocument();
      expect(timeLabelsRow?.textContent).toContain('00:00');
      expect(timeLabelsRow?.textContent).toContain('06:00');
      expect(timeLabelsRow?.textContent).toContain('12:00');
      expect(timeLabelsRow?.textContent).toContain('18:00');
      expect(timeLabelsRow?.textContent).toContain('23:59');
    });

    it('should display golden learning time legend', () => {
      render(<ChronotypeCard />);
      expect(screen.getByText('黄金学习时段')).toBeInTheDocument();
    });

    it('should render 24 hour blocks', () => {
      const { container } = render(<ChronotypeCard />);
      // Look for the timeline container and its children
      const timelineContainer = container.querySelector('.flex.h-12');
      expect(timelineContainer).toBeInTheDocument();
    });
  });

  // ==================== Confidence Bar Tests ====================

  describe('confidence bar', () => {
    it('should render confidence bar', () => {
      const { container } = render(<ChronotypeCard />);
      const confidenceBar = container.querySelector('.h-1\\.5.w-16');
      expect(confidenceBar).toBeInTheDocument();
    });

    it('should display trend up icon', () => {
      render(<ChronotypeCard />);
      expect(screen.getByTestId('trend-up-icon')).toBeInTheDocument();
    });
  });

  // ==================== Color Coding Tests ====================

  describe('color coding', () => {
    it('should have amber color for morning type', () => {
      const morningData: ChronotypeProfile = {
        category: 'morning',
        peakHours: [7, 8, 9],
        confidence: 0.8,
      };
      const { container } = render(<ChronotypeCard data={morningData} />);
      const iconContainer = container.querySelector('.bg-amber-100');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have indigo color for evening type', () => {
      const eveningData: ChronotypeProfile = {
        category: 'evening',
        peakHours: [21, 22, 23],
        confidence: 0.8,
      };
      const { container } = render(<ChronotypeCard data={eveningData} />);
      const iconContainer = container.querySelector('.bg-indigo-100');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have blue color for intermediate type', () => {
      const intermediateData: ChronotypeProfile = {
        category: 'intermediate',
        peakHours: [10, 11, 14, 15],
        confidence: 0.8,
      };
      const { container } = render(<ChronotypeCard data={intermediateData} />);
      const iconContainer = container.querySelector('.bg-blue-100');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have backdrop blur', () => {
      render(<ChronotypeCard />);
      const card = screen.getByText(/Intermediate/).closest('.backdrop-blur-sm');
      expect(card).toBeInTheDocument();
    });

    it('should have border', () => {
      render(<ChronotypeCard />);
      const card = screen.getByText(/Intermediate/).closest('.border');
      expect(card).toBeInTheDocument();
    });

    it('should have shadow', () => {
      render(<ChronotypeCard />);
      const card = screen.getByText(/Intermediate/).closest('.shadow-soft');
      expect(card).toBeInTheDocument();
    });

    it('should have rounded corners', () => {
      render(<ChronotypeCard />);
      const card = screen.getByText(/Intermediate/).closest('.rounded-card');
      expect(card).toBeInTheDocument();
    });
  });

  // ==================== Layout Tests ====================

  describe('layout', () => {
    it('should have header section with border', () => {
      const { container } = render(<ChronotypeCard />);
      const header = container.querySelector('.border-b.border-gray-50');
      expect(header).toBeInTheDocument();
    });

    it('should have body section with padding', () => {
      const { container } = render(<ChronotypeCard />);
      const body = container.querySelector('.p-6');
      expect(body).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases Tests ====================

  describe('edge cases', () => {
    it('should handle empty peakHours array', () => {
      const data: ChronotypeProfile = {
        category: 'intermediate',
        peakHours: [],
        confidence: 0.5,
      };
      render(<ChronotypeCard data={data} />);
      expect(screen.getByText('随时适应 (Intermediate)')).toBeInTheDocument();
    });

    it('should handle zero confidence', () => {
      const data: ChronotypeProfile = {
        category: 'morning',
        peakHours: [7, 8, 9],
        confidence: 0,
      };
      render(<ChronotypeCard data={data} />);
      expect(screen.getByText(/置信度: 0%/)).toBeInTheDocument();
    });

    it('should handle confidence greater than 1 (should show 100+)', () => {
      const data: ChronotypeProfile = {
        category: 'morning',
        peakHours: [7, 8, 9],
        confidence: 1.05,
      };
      render(<ChronotypeCard data={data} />);
      expect(screen.getByText(/置信度: 105%/)).toBeInTheDocument();
    });
  });
});
