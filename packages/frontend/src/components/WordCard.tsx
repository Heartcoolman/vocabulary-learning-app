import { useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Star, Clock, Target, SpeakerHigh } from './Icon';
import { slideUpVariants, fadeInVariants, g3SpringSnappy } from '../utils/animations';
import { trackingService } from '../services/TrackingService';

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
 * 使用 React.memo 优化：避免因父组件状态变化导致的不必要重渲染
 */
function WordCard({
  word,
  onPronounce,
  isPronouncing,
  masteryLevel,
  wordScore,
  nextReviewDate,
}: WordCardProps) {
  const pronounceButtonRef = useRef<HTMLButtonElement>(null);

  // 处理发音按钮点击，包含埋点
  const handlePronounce = () => {
    // 记录发音按钮点击事件（用于学习风格分析-听觉偏好）
    trackingService.trackPronunciationClick(word.id, word.spelling);
    onPronounce();
  };

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 按空格键播放发音（排除表单控件，避免与原生行为冲突）
      const activeTag = document.activeElement?.tagName || '';
      const isFormControl = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(activeTag);
      if (e.code === 'Space' && !isPronouncing && !isFormControl) {
        e.preventDefault();
        handlePronounce();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onPronounce, isPronouncing, word.id, word.spelling]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={slideUpVariants}
      className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-gray-200/60 bg-white/80 px-8 py-8 shadow-sm backdrop-blur-sm md:px-12 md:py-10"
      role="article"
      aria-label={`单词卡片: ${word.spelling}`}
      data-testid="word-card"
    >
      {/* 发音按钮 */}
      <motion.button
        ref={pronounceButtonRef}
        onClick={handlePronounce}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePronounce();
          }
        }}
        disabled={isPronouncing}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        transition={g3SpringSnappy}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 shadow-lg hover:bg-blue-600 hover:shadow-xl ${isPronouncing ? 'animate-pulse' : ''} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed`}
        aria-label={isPronouncing ? '正在播放发音' : `播放 ${word.spelling} 的发音，或按空格键`}
        aria-pressed={isPronouncing}
        title="播放发音 (空格键)"
      >
        <SpeakerHigh size={28} weight="fill" className="text-white" aria-hidden="true" />
      </motion.button>

      {/* 单词拼写 */}
      <motion.h2
        variants={fadeInVariants}
        className="text-5xl font-bold text-gray-900 md:text-6xl"
        role="heading"
        aria-level={2}
        data-testid="word-spelling"
      >
        {word.spelling}
      </motion.h2>

      {/* 音标 - 圆形背景 */}
      <motion.span
        variants={fadeInVariants}
        className="rounded-full bg-gray-100 px-4 py-1.5 text-2xl text-gray-600 md:text-3xl"
        aria-label={`音标: ${word.phonetic}`}
      >
        /{word.phonetic}/
      </motion.span>

      {/* 例句 */}
      <motion.p
        variants={fadeInVariants}
        className="mt-3 max-w-4xl text-center text-lg text-gray-700 md:text-xl"
        role="region"
        aria-label="例句"
      >
        {word.examples && word.examples.length > 0 ? word.examples[0] : '暂无例句'}
      </motion.p>

      {/* 学习状态信息 */}
      {(masteryLevel !== undefined || wordScore !== undefined || nextReviewDate) && (
        <motion.div
          variants={fadeInVariants}
          className="mt-8 rounded-2xl border border-gray-200/60 bg-white/80 p-4 backdrop-blur-sm"
        >
          <div className="flex flex-wrap items-center justify-center gap-6">
            {/* 掌握程度 - 用星星表示 */}
            {masteryLevel !== undefined && (
              <div className="flex flex-col items-center">
                <span className="mb-1 text-xs text-gray-500">掌握程度</span>
                <div
                  className="flex items-center gap-1"
                  aria-label={`掌握程度: ${masteryLevel} 级`}
                >
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
                <span className="mb-1 text-xs text-gray-500">单词得分</span>
                <div className="flex items-center gap-1">
                  <Target size={18} weight="duotone" color="#3b82f6" />
                  <span
                    className="text-lg font-bold text-gray-900"
                    aria-label={`得分: ${Math.round(wordScore)} 分`}
                  >
                    {Math.round(wordScore)}
                  </span>
                </div>
              </div>
            )}

            {/* 下次复习时间 */}
            {nextReviewDate && (
              <div className="flex flex-col items-center">
                <span className="mb-1 text-xs text-gray-500">下次复习</span>
                <div className="flex items-center gap-1">
                  <Clock size={18} weight="duotone" color="#8b5cf6" />
                  <span
                    className="text-sm font-medium text-gray-900"
                    aria-label={`下次复习: ${nextReviewDate}`}
                  >
                    {nextReviewDate}
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// 自定义比较函数：深度比较 word 对象和其他 props
function arePropsEqual(prevProps: WordCardProps, nextProps: WordCardProps): boolean {
  // 比较基本属性
  if (
    prevProps.isPronouncing !== nextProps.isPronouncing ||
    prevProps.masteryLevel !== nextProps.masteryLevel ||
    prevProps.wordScore !== nextProps.wordScore ||
    prevProps.nextReviewDate !== nextProps.nextReviewDate
  ) {
    return false;
  }

  // 深度比较 word 对象
  const prevWord = prevProps.word;
  const nextWord = nextProps.word;

  if (
    prevWord.id !== nextWord.id ||
    prevWord.spelling !== nextWord.spelling ||
    prevWord.phonetic !== nextWord.phonetic
  ) {
    return false;
  }

  // 比较数组内容
  if (
    prevWord.meanings.length !== nextWord.meanings.length ||
    prevWord.examples.length !== nextWord.examples.length
  ) {
    return false;
  }

  for (let i = 0; i < prevWord.meanings.length; i++) {
    if (prevWord.meanings[i] !== nextWord.meanings[i]) {
      return false;
    }
  }

  for (let i = 0; i < prevWord.examples.length; i++) {
    if (prevWord.examples[i] !== nextWord.examples[i]) {
      return false;
    }
  }

  return true;
}

export default memo(WordCard, arePropsEqual);
