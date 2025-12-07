/**
 * ChronotypeCard Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChronotypeCard } from '../ChronotypeCard';

vi.mock('@phosphor-icons/react', () => ({
  Sun: ({ className }: { className?: string }) => (
    <span data-testid="sun-icon" className={className}>
      ☀️
    </span>
  ),
  Moon: ({ className }: { className?: string }) => (
    <span data-testid="moon-icon" className={className}>
      🌙
    </span>
  ),
  SunHorizon: ({ className }: { className?: string }) => (
    <span data-testid="sun-horizon-icon" className={className}>
      🌅
    </span>
  ),
}));

describe('ChronotypeCard', () => {
  describe('morning type', () => {
    it('should render morning type card', () => {
      render(<ChronotypeCard type="morning" confidence={0.8} peakHours={[8, 9, 10]} />);

      expect(screen.getByText('早鸟型')).toBeInTheDocument();
      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    });

    it('should display morning description', () => {
      render(<ChronotypeCard type="morning" confidence={0.8} peakHours={[8, 9, 10]} />);

      expect(screen.getByText(/早晨最充沛/)).toBeInTheDocument();
    });
  });

  describe('evening type', () => {
    it('should render evening type card', () => {
      render(<ChronotypeCard type="evening" confidence={0.75} peakHours={[20, 21, 22]} />);

      expect(screen.getByText('夜猫子型')).toBeInTheDocument();
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('should display evening description', () => {
      render(<ChronotypeCard type="evening" confidence={0.75} peakHours={[20, 21, 22]} />);

      expect(screen.getByText(/夜深人静/)).toBeInTheDocument();
    });
  });

  describe('neutral type', () => {
    it('should render neutral type card', () => {
      render(<ChronotypeCard type="neutral" confidence={0.6} peakHours={[10, 14, 20]} />);

      expect(screen.getByText('全天候型')).toBeInTheDocument();
      expect(screen.getByTestId('sun-horizon-icon')).toBeInTheDocument();
    });

    it('should display neutral description', () => {
      render(<ChronotypeCard type="neutral" confidence={0.6} peakHours={[10, 14, 20]} />);

      expect(screen.getByText(/精力分配比较均衡/)).toBeInTheDocument();
    });
  });

  describe('confidence display', () => {
    it('should display confidence percentage', () => {
      render(<ChronotypeCard type="morning" confidence={0.85} peakHours={[8, 9]} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should round confidence correctly', () => {
      render(<ChronotypeCard type="evening" confidence={0.756} peakHours={[20]} />);

      expect(screen.getByText('76%')).toBeInTheDocument();
    });

    it('should display 0% for zero confidence', () => {
      render(<ChronotypeCard type="neutral" confidence={0} peakHours={[]} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('peak hours display', () => {
    it('should format peak hours correctly', () => {
      render(<ChronotypeCard type="morning" confidence={0.8} peakHours={[8, 9, 10]} />);

      expect(screen.getByText('8:00, 9:00, 10:00')).toBeInTheDocument();
    });

    it('should display single peak hour', () => {
      render(<ChronotypeCard type="evening" confidence={0.7} peakHours={[22]} />);

      expect(screen.getByText('22:00')).toBeInTheDocument();
    });

    it('should display 暂无数据 for empty peak hours', () => {
      render(<ChronotypeCard type="neutral" confidence={0.5} peakHours={[]} />);

      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should display 黄金时间 label', () => {
      render(<ChronotypeCard type="morning" confidence={0.8} peakHours={[9]} />);

      expect(screen.getByText('黄金时间')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should render card container', () => {
      const { container } = render(
        <ChronotypeCard type="morning" confidence={0.8} peakHours={[8]} />,
      );

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
      expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
    });
  });
});
