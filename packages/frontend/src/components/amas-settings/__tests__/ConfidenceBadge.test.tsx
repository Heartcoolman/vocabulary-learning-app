/**
 * ConfidenceBadge Component Tests
 *
 * Tests C8 constraints:
 * - Low: confidence < 0.5 → red
 * - Medium: 0.5 <= confidence <= 0.8 → yellow
 * - High: confidence > 0.8 → green
 * - Unknown: confidence === undefined → gray
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge } from '../ConfidenceBadge';
import { getConfidenceCategory } from '../confidenceBadgeUtils';

describe('ConfidenceBadge', () => {
  describe('C8: confidence thresholds', () => {
    it('should show red styling for low confidence (< 0.5)', () => {
      render(<ConfidenceBadge confidence={0.3} />);

      const badge = screen.getByTitle('置信度: 30%');
      expect(badge.className).toContain('bg-red');
      expect(badge.className).toContain('text-red');
    });

    it('should show yellow styling for medium confidence (0.5-0.8)', () => {
      render(<ConfidenceBadge confidence={0.65} />);

      const badge = screen.getByTitle('置信度: 65%');
      expect(badge.className).toContain('bg-yellow');
      expect(badge.className).toContain('text-yellow');
    });

    it('should show green styling for high confidence (> 0.8)', () => {
      render(<ConfidenceBadge confidence={0.9} />);

      const badge = screen.getByTitle('置信度: 90%');
      expect(badge.className).toContain('bg-green');
      expect(badge.className).toContain('text-green');
    });

    it('should show gray styling for undefined confidence', () => {
      render(<ConfidenceBadge confidence={undefined} />);

      const badge = screen.getByTitle('置信度未知');
      expect(badge.className).toContain('bg-gray');
      expect(badge.className).toContain('text-gray');
    });
  });

  describe('boundary conditions', () => {
    it('should show yellow at exactly 0.5', () => {
      render(<ConfidenceBadge confidence={0.5} />);

      const badge = screen.getByTitle('置信度: 50%');
      expect(badge.className).toContain('bg-yellow');
    });

    it('should show yellow at exactly 0.8', () => {
      render(<ConfidenceBadge confidence={0.8} />);

      const badge = screen.getByTitle('置信度: 80%');
      expect(badge.className).toContain('bg-yellow');
    });

    it('should show green at 0.81', () => {
      render(<ConfidenceBadge confidence={0.81} />);

      const badge = screen.getByTitle('置信度: 81%');
      expect(badge.className).toContain('bg-green');
    });

    it('should show red at 0.49', () => {
      render(<ConfidenceBadge confidence={0.49} />);

      const badge = screen.getByTitle('置信度: 49%');
      expect(badge.className).toContain('bg-red');
    });
  });

  describe('label display', () => {
    it('should show label by default', () => {
      render(<ConfidenceBadge confidence={0.9} />);

      expect(screen.getByText('高')).toBeInTheDocument();
    });

    it('should hide label when showLabel is false', () => {
      render(<ConfidenceBadge confidence={0.9} showLabel={false} />);

      expect(screen.queryByText('高')).not.toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should show correct labels for each category', () => {
      const { rerender } = render(<ConfidenceBadge confidence={0.3} />);
      expect(screen.getByText('低')).toBeInTheDocument();

      rerender(<ConfidenceBadge confidence={0.6} />);
      expect(screen.getByText('中')).toBeInTheDocument();

      rerender(<ConfidenceBadge confidence={0.9} />);
      expect(screen.getByText('高')).toBeInTheDocument();
    });

    it('should show dash for unknown with showLabel', () => {
      render(<ConfidenceBadge confidence={undefined} showLabel />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('should show dash for unknown without showLabel', () => {
      render(<ConfidenceBadge confidence={undefined} showLabel={false} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('should apply sm size by default', () => {
      render(<ConfidenceBadge confidence={0.9} />);

      const badge = screen.getByTitle('置信度: 90%');
      expect(badge.className).toContain('px-2');
      expect(badge.className).toContain('text-xs');
    });

    it('should apply md size when specified', () => {
      render(<ConfidenceBadge confidence={0.9} size="md" />);

      const badge = screen.getByTitle('置信度: 90%');
      expect(badge.className).toContain('px-3');
      expect(badge.className).toContain('text-sm');
    });
  });

  describe('tooltip', () => {
    it('should show confidence percentage in tooltip', () => {
      render(<ConfidenceBadge confidence={0.75} />);

      const badge = screen.getByTitle('置信度: 75%');
      expect(badge).toBeInTheDocument();
    });

    it('should show unknown tooltip for undefined confidence', () => {
      render(<ConfidenceBadge confidence={undefined} />);

      const badge = screen.getByTitle('置信度未知');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle null confidence as unknown', () => {
      render(<ConfidenceBadge confidence={null as unknown as undefined} />);

      const badge = screen.getByTitle('置信度未知');
      expect(badge.className).toContain('bg-gray');
    });

    it('should handle NaN as unknown', () => {
      render(<ConfidenceBadge confidence={NaN} />);

      const badge = screen.getByTitle('置信度未知');
      expect(badge.className).toContain('bg-gray');
    });

    it('should handle confidence of 0', () => {
      render(<ConfidenceBadge confidence={0} />);

      const badge = screen.getByTitle('置信度: 0%');
      expect(badge.className).toContain('bg-red');
    });

    it('should handle confidence of 1', () => {
      render(<ConfidenceBadge confidence={1} />);

      const badge = screen.getByTitle('置信度: 100%');
      expect(badge.className).toContain('bg-green');
    });
  });
});

describe('getConfidenceCategory', () => {
  it('should return correct category for low confidence', () => {
    const result = getConfidenceCategory(0.3);
    expect(result.level).toBe('low');
    expect(result.label).toBe('低');
  });

  it('should return correct category for medium confidence', () => {
    const result = getConfidenceCategory(0.6);
    expect(result.level).toBe('medium');
    expect(result.label).toBe('中');
  });

  it('should return correct category for high confidence', () => {
    const result = getConfidenceCategory(0.9);
    expect(result.level).toBe('high');
    expect(result.label).toBe('高');
  });

  it('should return unknown category for undefined', () => {
    const result = getConfidenceCategory(undefined);
    expect(result.level).toBe('unknown');
    expect(result.label).toBe('—');
  });
});
