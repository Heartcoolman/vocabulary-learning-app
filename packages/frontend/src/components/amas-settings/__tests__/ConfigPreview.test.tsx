/**
 * ConfigPreview Component Tests
 *
 * Tests configuration change preview display
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigPreview, type ConfigPreviewItem } from '../ConfigPreview';

vi.mock('../../Icon', () => ({
  ArrowRight: () => <span data-testid="arrow-right">→</span>,
}));

describe('ConfigPreview', () => {
  const mockItems: ConfigPreviewItem[] = [
    { label: '难度下限', before: '0.3', after: '0.4', changed: true },
    { label: '难度上限', before: '0.8', after: '0.8', changed: false },
    { label: '调整速度', before: '正常', after: '激进', changed: true },
  ];

  describe('rendering', () => {
    it('should render only changed items', () => {
      render(<ConfigPreview items={mockItems} />);

      expect(screen.getByText('难度下限:')).toBeInTheDocument();
      expect(screen.getByText('调整速度:')).toBeInTheDocument();
      expect(screen.queryByText('难度上限:')).not.toBeInTheDocument();
    });

    it('should render default title', () => {
      render(<ConfigPreview items={mockItems} />);

      expect(screen.getByText('配置变更预览')).toBeInTheDocument();
    });

    it('should render custom title', () => {
      render(<ConfigPreview items={mockItems} title="参数调整" />);

      expect(screen.getByText('参数调整')).toBeInTheDocument();
    });
  });

  describe('change display', () => {
    it('should show before values with strikethrough', () => {
      render(<ConfigPreview items={mockItems} />);

      const beforeValue = screen.getByText('0.3');
      expect(beforeValue.className).toContain('line-through');
    });

    it('should show after values', () => {
      render(<ConfigPreview items={mockItems} />);

      expect(screen.getByText('0.4')).toBeInTheDocument();
      expect(screen.getByText('激进')).toBeInTheDocument();
    });

    it('should show arrows between before and after', () => {
      render(<ConfigPreview items={mockItems} />);

      const arrows = screen.getAllByTestId('arrow-right');
      expect(arrows).toHaveLength(2); // Two changed items
    });
  });

  describe('empty state', () => {
    it('should return null when no items changed', () => {
      const unchangedItems: ConfigPreviewItem[] = [
        { label: 'Item 1', before: 'a', after: 'a', changed: false },
        { label: 'Item 2', before: 'b', after: 'b', changed: false },
      ];

      const { container } = render(<ConfigPreview items={unchangedItems} />);

      expect(container.firstChild).toBeNull();
    });

    it('should return null when items array is empty', () => {
      const { container } = render(<ConfigPreview items={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('styling', () => {
    it('should have amber background for preview card', () => {
      render(<ConfigPreview items={mockItems} />);

      const card = screen.getByText('配置变更预览').closest('div');
      expect(card?.className).toContain('bg-amber');
    });

    it('should have amber border', () => {
      render(<ConfigPreview items={mockItems} />);

      const card = screen.getByText('配置变更预览').closest('div');
      expect(card?.className).toContain('border-amber');
    });
  });

  describe('multiple changes', () => {
    it('should display all changed items', () => {
      const manyChanges: ConfigPreviewItem[] = [
        { label: 'A', before: '1', after: '2', changed: true },
        { label: 'B', before: '3', after: '4', changed: true },
        { label: 'C', before: '5', after: '6', changed: true },
        { label: 'D', before: '7', after: '8', changed: true },
      ];

      render(<ConfigPreview items={manyChanges} />);

      expect(screen.getByText('A:')).toBeInTheDocument();
      expect(screen.getByText('B:')).toBeInTheDocument();
      expect(screen.getByText('C:')).toBeInTheDocument();
      expect(screen.getByText('D:')).toBeInTheDocument();
    });
  });
});
