import { useEffect, useRef } from 'react';
import { Star, Clock, Target, SpeakerHigh } from './Icon';

interface WordCardWord {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
}

interface WordCardProps {
  word: WordCardWord;
  onPronounce: () => void;
  isPronouncing: boolean;
  masteryLevel?: number;
  wordScore?: number;
  nextReviewDate?: string;
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
      // 按空格键播放发音（排除表单控件，避免与原生行为冲突）
      const activeTag = document.activeElement?.tagName || '';
      const isFormControl = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(activeTag);
      if (e.code === 'Space' && !isPronouncing && !isFormControl) {
        e.preventDefault();
        onPronounce();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onPronounce, isPronouncing]);

  return (
    <div 
      className="flex flex-col items-center justify-center space-y-5 py-10 px-8 md:py-16 md:px-12 animate-g3-slide-up bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm"
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
          relative w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 
          flex items-center justify-center transition-all duration-200
          shadow-lg hover:shadow-xl
          ${isPronouncing ? 'animate-pulse' : 'hover:scale-110 active:scale-95'}
          disabled:cursor-not-allowed
          focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
        aria-label={isPronouncing ? '正在播放发音' : `播放 ${word.spelling} 的发音，或按空格键`}
        aria-pressed={isPronouncing}
        title="播放发音 (空格键)"
      >
        <SpeakerHigh size={28} weight="fill" className="text-white" aria-hidden="true" />
      </button>

      {/* 单词拼写 */}
      <h2 
        className="text-5xl md:text-6xl font-bold text-gray-900 animate-g3-fade-in"
        role="heading"
        aria-level={2}
      >
        {word.spelling}
      </h2>

      {/* 音标 */}
      <p 
        className="text-2xl md:text-3xl text-gray-600 animate-g3-fade-in"
        aria-label={`音标: ${word.phonetic}`}
      >
        /{word.phonetic}/
      </p>

      {/* 例句 */}
      <p
        className="text-lg md:text-xl text-gray-700 text-center max-w-4xl mt-8 animate-g3-fade-in"
        role="region"
        aria-label="例句"
      >
        {word.examples && word.examples.length > 0 ? word.examples[0] : '暂无例句'}
      </p>

      {/* 学习状态信息 */}
      {(masteryLevel !== undefined || wordScore !== undefined || nextReviewDate) && (
        <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/60 animate-g3-fade-in">
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
