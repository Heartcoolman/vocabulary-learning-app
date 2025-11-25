import { useEffect, useRef } from 'react';

interface TestOptionsProps {
  options: string[];
  correctAnswer: string;
  onSelect: (selected: string) => void;
  selectedAnswer?: string;
  showResult: boolean;
}

/**
 * TestOptions 组件 - 显示测试选项并处理用户选择
 * 提供答案反馈和正确答案高亮
 */
export default function TestOptions({
  options,
  correctAnswer,
  onSelect,
  selectedAnswer,
  showResult,
}: TestOptionsProps) {
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // 使用 ref 存储最新的回调和选项，避免频繁重新添加事件监听器
  const stateRef = useRef({ options, onSelect, showResult });
  stateRef.current = { options, onSelect, showResult };

  // 键盘快捷键支持 (1-4数字键选择选项)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const { options: currentOptions, onSelect: currentOnSelect, showResult: currentShowResult } = stateRef.current;
      if (currentShowResult) return;

      const key = e.key;
      const numKey = parseInt(key);

      if (numKey >= 1 && numKey <= currentOptions.length) {
        e.preventDefault();
        currentOnSelect(currentOptions[numKey - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []); // 空依赖数组，只在挂载时添加一次监听器

  const getButtonStyle = (option: string) => {
    // 如果还没有显示结果，使用默认样式
    if (!showResult) {
      return 'bg-gray-100 hover:bg-gray-200 text-gray-900';
    }

    // 显示结果时的样式
    const isCorrect = option === correctAnswer;
    const isSelected = option === selectedAnswer;

    if (isSelected && isCorrect) {
      // 选中且正确
      return 'bg-green-500 text-white shadow-lg';
    } else if (isSelected && !isCorrect) {
      // 选中但错误
      return 'bg-red-500 text-white shadow-lg';
    } else if (isCorrect) {
      // 正确答案高亮（用户选错时）
      return 'bg-green-100 border-2 border-green-500 text-gray-900 shadow-md';
    } else {
      // 其他选项
      return 'bg-gray-100 text-gray-500 opacity-60';
    }
  };

  const getAriaLabel = (option: string, index: number) => {
    const keyHint = !showResult ? ` 按 ${index + 1} 键选择` : '';
    const isCorrect = option === correctAnswer;
    const isSelected = option === selectedAnswer;

    if (showResult) {
      if (isSelected && isCorrect) {
        return `${option} - 正确答案，你选对了`;
      } else if (isSelected && !isCorrect) {
        return `${option} - 你的选择，答案错误`;
      } else if (isCorrect) {
        return `${option} - 正确答案`;
      }
    }

    return `选项 ${index + 1}: ${option}${keyHint}`;
  };

  return (
    <div
      className="flex flex-nowrap justify-center gap-3 px-4 py-8 w-full"
      role="group"
      aria-label="测试选项"
    >
      {options.map((option, index) => (
        <button
          key={index}
          ref={(el) => (optionsRef.current[index] = el)}
          onClick={() => !showResult && onSelect(option)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !showResult) {
              e.preventDefault();
              onSelect(option);
            }
          }}
          disabled={showResult}
          className={`
            flex-1 max-w-[180px] px-4 py-3 rounded-lg text-base font-medium
            transition-all duration-200 animate-fade-in
            ${getButtonStyle(option)}
            ${!showResult ? 'hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : ''}
            disabled:cursor-not-allowed
          `}
          style={{ animationDelay: `${index * 50}ms` }}
          aria-label={getAriaLabel(option, index)}
          aria-pressed={showResult && option === selectedAnswer}
          tabIndex={showResult ? -1 : 0}
        >
          <span className="inline-block mr-2 text-sm opacity-70">
            {index + 1}.
          </span>
          {option}
        </button>
      ))}
    </div>
  );
}
