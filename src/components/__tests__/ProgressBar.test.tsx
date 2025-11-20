import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from '../ProgressBar';

describe('ProgressBar Component', () => {
  it('应该显示正确的进度文字', () => {
    render(<ProgressBar current={3} total={10} />);

    // 现在进度文字包含百分比，使用正则表达式匹配
    expect(screen.getByText(/3 \/ 10/)).toBeInTheDocument();
    expect(screen.getByText(/30%/)).toBeInTheDocument();
  });

  it('应该显示进度条', () => {
    render(<ProgressBar current={5} total={10} />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '5');
    expect(progressBar).toHaveAttribute('aria-valuemax', '10');
  });

  it('应该计算正确的百分比', () => {
    const { container } = render(<ProgressBar current={5} total={10} />);

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveStyle({ width: '50%' });
  });

  it('应该处理0总数的情况', () => {
    const { container } = render(<ProgressBar current={0} total={0} />);

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveStyle({ width: '0%' });
  });
});
