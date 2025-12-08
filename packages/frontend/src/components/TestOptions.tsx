import { useEffect, useRef, memo } from 'react';

interface TestOptionsProps {
  options: string[];
  correctAnswers: string[]; // 支持多个正确答案（多义词）
  onSelect: (selected: string) => void;
  selectedAnswer?: string;
  showResult: boolean;
}

/**
 * TestOptions 组件 - 显示测试选项并处理用户选择
 * 提供答案反馈和正确答案高亮
 * 使用 React.memo 优化：避免因父组件状态变化导致的不必要重渲染
 */
function TestOptions({
  options,
  correctAnswers,
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
      const {
        options: currentOptions,
        onSelect: currentOnSelect,
        showResult: currentShowResult,
      } = stateRef.current;
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

    // 显示结果时的样式 - 支持多个正确答案
    const isCorrect = correctAnswers.includes(option);
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
    const isCorrect = correctAnswers.includes(option);
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
      className="flex w-full flex-wrap justify-center gap-3 px-4 py-5"
      role="group"
      aria-label="测试选项"
      data-testid="test-options"
    >
      {options.map((option, index) => (
        <button
          key={`${option}-${index}`}
          ref={(el) => (optionsRef.current[index] = el)}
          onClick={() => !showResult && onSelect(option)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !showResult) {
              e.preventDefault();
              onSelect(option);
            }
          }}
          disabled={showResult}
          data-testid={`option-${index}`}
          className={`stagger-item btn-scale min-w-[150px] max-w-[260px] flex-1 rounded-xl px-7 py-4 text-lg font-medium opacity-0 sm:min-w-[170px] md:text-xl ${getButtonStyle(option)} ${!showResult ? 'focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : ''} disabled:cursor-not-allowed`}
          style={{ animation: `staggerFadeIn 0.3s ease-out ${index * 50}ms forwards` }}
          aria-label={getAriaLabel(option, index)}
          aria-pressed={showResult && option === selectedAnswer}
          tabIndex={showResult ? -1 : 0}
        >
          <span className="mr-2 inline-block text-sm opacity-70">{index + 1}.</span>
          {option}
        </button>
      ))}
    </div>
  );
}

// 自定义比较函数：深度比较选项数组和正确答案数组
function arePropsEqual(prevProps: TestOptionsProps, nextProps: TestOptionsProps): boolean {
  // 比较基本属性
  if (
    prevProps.selectedAnswer !== nextProps.selectedAnswer ||
    prevProps.showResult !== nextProps.showResult
  ) {
    return false;
  }

  // 比较 options 数组
  if (prevProps.options.length !== nextProps.options.length) {
    return false;
  }
  for (let i = 0; i < prevProps.options.length; i++) {
    if (prevProps.options[i] !== nextProps.options[i]) {
      return false;
    }
  }

  // 比较 correctAnswers 数组
  if (prevProps.correctAnswers.length !== nextProps.correctAnswers.length) {
    return false;
  }
  for (let i = 0; i < prevProps.correctAnswers.length; i++) {
    if (prevProps.correctAnswers[i] !== nextProps.correctAnswers[i]) {
      return false;
    }
  }

  return true;
}

export default memo(TestOptions, arePropsEqual);
