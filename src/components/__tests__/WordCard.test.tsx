import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WordCard from '../WordCard';
import { Word } from '../../types/models';

describe('WordCard Component', () => {
  const mockWord: Word = {
    id: '1',
    spelling: 'like',
    phonetic: 'laɪk',
    meanings: ['喜欢', '像'],
    examples: ['She likes going to the zoo.'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('应该显示单词拼写', () => {
    render(
      <WordCard
        word={mockWord}
        onPronounce={vi.fn()}
        isPronouncing={false}
      />
    );

    expect(screen.getByText('like')).toBeInTheDocument();
  });

  it('应该显示音标', () => {
    render(
      <WordCard
        word={mockWord}
        onPronounce={vi.fn()}
        isPronouncing={false}
      />
    );

    expect(screen.getByText('/laɪk/')).toBeInTheDocument();
  });

  it('应该显示例句', () => {
    render(
      <WordCard
        word={mockWord}
        onPronounce={vi.fn()}
        isPronouncing={false}
      />
    );

    expect(screen.getByText('She likes going to the zoo.')).toBeInTheDocument();
  });

  it('应该有发音按钮', () => {
    render(
      <WordCard
        word={mockWord}
        onPronounce={vi.fn()}
        isPronouncing={false}
      />
    );

    const button = screen.getByRole('button', { name: /播放 like 的发音/i });
    expect(button).toBeInTheDocument();
  });
});
