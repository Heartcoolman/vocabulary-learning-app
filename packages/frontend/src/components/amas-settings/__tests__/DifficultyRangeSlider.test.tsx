/**
 * DifficultyRangeSlider Component Tests
 *
 * Tests C10 constraints:
 * - Range: [0.1, 1.0]
 * - Step: 0.1
 * - Default: min=0.3, max=0.8
 * - Constraint: min <= max always holds
 * - Labels: 0.1-0.3 (简单), 0.4-0.6 (适中), 0.7-1.0 (困难)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DifficultyRangeSlider } from '../DifficultyRangeSlider';

vi.mock('../../../stores/amasSettingsStore', () => ({
  getDifficultyLabel: (value: number) => {
    if (value <= 0.3) return '简单';
    if (value <= 0.6) return '适中';
    return '困难';
  },
}));

describe('DifficultyRangeSlider', () => {
  describe('rendering', () => {
    it('should render min and max values', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      expect(screen.getByText('0.3')).toBeInTheDocument();
      expect(screen.getByText('0.8')).toBeInTheDocument();
    });

    it('should render scale labels', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      expect(screen.getByText('0.1')).toBeInTheDocument();
      expect(screen.getByText('0.5')).toBeInTheDocument();
      expect(screen.getByText('1.0')).toBeInTheDocument();
    });

    it('should render difficulty zone labels', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      expect(screen.getByText('0.1-0.3: 简单')).toBeInTheDocument();
      expect(screen.getByText('0.4-0.6: 适中')).toBeInTheDocument();
      expect(screen.getByText('0.7-1.0: 困难')).toBeInTheDocument();
    });

    it('should render min/max labels', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      expect(screen.getByText('最低难度')).toBeInTheDocument();
      expect(screen.getByText('最高难度')).toBeInTheDocument();
    });
  });

  describe('difficulty labels', () => {
    it('should show 简单 for low values', () => {
      render(<DifficultyRangeSlider min={0.2} max={0.5} onChange={vi.fn()} />);

      expect(screen.getByText('简单')).toBeInTheDocument();
    });

    it('should show 适中 for medium values', () => {
      render(<DifficultyRangeSlider min={0.4} max={0.6} onChange={vi.fn()} />);

      expect(screen.getAllByText('适中').length).toBeGreaterThan(0);
    });

    it('should show 困难 for high values', () => {
      render(<DifficultyRangeSlider min={0.7} max={0.9} onChange={vi.fn()} />);

      expect(screen.getAllByText('困难').length).toBe(2);
    });
  });

  describe('range sliders', () => {
    it('should have two range inputs', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(2);
    });

    it('should have correct min/max attributes on sliders', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      const sliders = screen.getAllByRole('slider');
      sliders.forEach((slider) => {
        expect(slider).toHaveAttribute('min', '0.1');
        expect(slider).toHaveAttribute('max', '1.0');
        expect(slider).toHaveAttribute('step', '0.1');
      });
    });

    it('should have correct values on sliders', () => {
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={vi.fn()} />);

      const sliders = screen.getAllByRole('slider');
      expect(sliders[0]).toHaveValue('0.3');
      expect(sliders[1]).toHaveValue('0.8');
    });
  });

  describe('onChange handling', () => {
    it('should call onChange with min when min slider changes', () => {
      const handleChange = vi.fn();
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={handleChange} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '0.4' } });

      expect(handleChange).toHaveBeenCalledWith({ min: 0.4 });
    });

    it('should call onChange with max when max slider changes', () => {
      const handleChange = vi.fn();
      render(<DifficultyRangeSlider min={0.3} max={0.8} onChange={handleChange} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[1], { target: { value: '0.9' } });

      expect(handleChange).toHaveBeenCalledWith({ max: 0.9 });
    });
  });

  describe('edge cases', () => {
    it('should handle min equal to max', () => {
      render(<DifficultyRangeSlider min={0.5} max={0.5} onChange={vi.fn()} />);

      const values = screen.getAllByText('0.5');
      expect(values.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle extreme values', () => {
      render(<DifficultyRangeSlider min={0.1} max={1.0} onChange={vi.fn()} />);

      expect(screen.getByText('简单')).toBeInTheDocument();
      expect(screen.getByText('困难')).toBeInTheDocument();
    });
  });
});
