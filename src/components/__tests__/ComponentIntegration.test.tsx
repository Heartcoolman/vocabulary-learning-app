import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WordCard, TestOptions, ProgressBar } from '../index';
import { Word } from '../../types/models';

describe('组件集成测试', () => {
  const mockWord: Word = {
    id: '1',
    spelling: 'test',
    phonetic: 'test',
    meanings: ['测试'],
    examples: ['This is a test.'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('所有组件应该能够正常渲染', () => {
    const { container } = render(
      <div>
        <ProgressBar current={1} total={10} />
        <WordCard word={mockWord} onPronounce={() => {}} isPronouncing={false} />
        <TestOptions
          options={['测试', '选项']}
          correctAnswer="测试"
          onSelect={() => {}}
          showResult={false}
        />
      </div>
    );

    expect(container).toBeTruthy();
  });
});
