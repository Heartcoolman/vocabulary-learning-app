import { useEffect, useRef } from 'react';
import { Word } from '../types/models';
import { Star, Clock, Target } from './Icon';

interface WordCardProps {
  word: Word;
  onPronounce: () => void;
  isPronouncing: boolean;
  masteryLevel?: number; // 掌握程度 (0-5级)
  wordScore?: number; // 单词得分 (0-100)
  nextReviewDate?: string; // 下次复习时间
}

/**
 * WordCard 组件 - 显示单词的完整信息
 * 包括单词拼写、音标、例句、发音按钮、掌握程度、得分和复习时间
 */
export default function WordCard({ 
  word, 
  onPronounce, 
  isPronouncing,
  masteryLevel,
  wordScore,
  nextReviewDate
}: WordCardProps) {
  const pronounceButtonRef = useRef<HTMLButtonElement>(null);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 按空格键播放发音
      if (e.code === 'Space' && !isPronouncing && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        onPronounce();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onPronounce, isPronouncing]);

  return (
    <div 
      className="flex flex-col items-center justify-center space-y-5 py-10 px-8 md:py-16 md:px-12 animate-slide-up"
      role="article"
      aria-label={`单词卡片: ${word.spelling}`}
    >
      {/* 发音按钮 */}
      <button
        ref={pronounceButtonRef}
        onClick={onPronounce}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPronounce();
          }
        }}
        disabled={isPronouncing}
        className={`
          relative w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 
          flex items-center justify-center transition-all duration-150
          ${isPronouncing ? 'animate-pulse' : 'hover:scale-105 active:scale-95'}
          disabled:cursor-not-allowed
          focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
        aria-label={isPronouncing ? '正在播放发音' : `播放 ${word.spelling} 的发音，或按空格键`}
        aria-pressed={isPronouncing}
        title="播放发音 (空格键)"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {isPronouncing ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          )}
        </svg>
      </button>

      {/* 单词拼写 */}
      <h2 
        className="text-5xl md:text-6xl font-bold text-gray-900 animate-fade-in"
        role="heading"
        aria-level={2}
      >
        {word.spelling}
      </h2>

      {/* 音标 */}
      <p 
        className="text-2xl md:text-3xl text-gray-600 animate-fade-in"
        aria-label={`音标: ${word.phonetic}`}
      >
        /{word.phonetic}/
      </p>

      {/* 例句 */}
      <p 
        className="text-lg md:text-xl text-gray-700 text-center max-w-4xl mt-8 animate-fade-in"
        role="region"
        aria-label="例句"
      >
        {word.examples[0]}
      </p>

      {/* 学习状态信息 */}
      {(masteryLevel !== undefined || wordScore !== undefined || nextReviewDate) && (
        <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-fade-in">
          <div className="flex flex-wrap items-center justify-center gap-6">
            {/* 掌握程度 - 用星星表示 */}
            {masteryLevel !== undefined && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 mb-1">掌握程度</span>
                <div className="flex items-center gap-1" aria-label={`掌握程度: ${masteryLevel} 级`}>
                  {[...Array(5)].map((_, index) => (
                    <Star
                      key={index}
                      size={20}
                      weight={index < masteryLevel ? 'fill' : 'regular'}
                      color={index < masteryLevel ? '#f59e0b' : '#d1d5db'}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 单词得分 */}
            {wordScore !== undefined && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 mb-1">单词得分</span>
                <div className="flex items-center gap-1">
                  <Target size={18} weight="duotone" color="#3b82f6" />
                  <span className="text-lg font-bold text-gray-900" aria-label={`得分: ${Math.round(wordScore)} 分`}>
                    {Math.round(wordScore)}
                  </span>
                </div>
              </div>
            )}

            {/* 下次复习时间 */}
            {nextReviewDate && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 mb-1">下次复习</span>
                <div className="flex items-center gap-1">
                  <Clock size={18} weight="duotone" color="#8b5cf6" />
                  <span className="text-sm font-medium text-gray-900" aria-label={`下次复习: ${nextReviewDate}`}>
                    {nextReviewDate}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
