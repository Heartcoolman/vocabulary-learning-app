import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestOptions from '../TestOptions';

describe('TestOptions Component', () => {
  const mockOptions = ['喜欢', '讨厌', '爱', '恨'];
  const correctAnswer = '喜欢';

  it('应该显示所有选项', () => {
    render(
      <TestOptions
        options={mockOptions}
        correctAnswer={correctAnswer}
        onSelect={vi.fn()}
        showResult={false}
      />
    );

    mockOptions.forEach(option => {
      expect(screen.getByText(option)).toBeInTheDocument();
    });
  });

  it('应该在点击时调用onSelect', () => {
    const onSelect = vi.fn();
    render(
      <TestOptions
        options={mockOptions}
        correctAnswer={correctAnswer}
        onSelect={onSelect}
        showResult={false}
      />
    );

    const button = screen.getByText('喜欢');
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledWith('喜欢');
  });

  it('应该在显示结果时禁用按钮', () => {
    render(
      <TestOptions
        options={mockOptions}
        correctAnswer={correctAnswer}
        onSelect={vi.fn()}
        selectedAnswer="喜欢"
        showResult={true}
      />
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});
