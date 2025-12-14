import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh } from './Icon';
import { slideUpVariants, fadeInVariants, g3SpringSnappy } from '../utils/animations';
import { WordCardWord } from './WordCard';

export interface ReverseWordCardProps {
  word: WordCardWord;
  onPronounce?: () => void;
  isPronouncing?: boolean;
  showSpelling?: boolean;
}

/**
 * ReverseWordCard 组件 - 中译英单词卡片
 * 显示中文释义，隐藏单词拼写（用于猜词）
 * 答题后可显示单词拼写和发音按钮
 */
function ReverseWordCard({
  word,
  onPronounce,
  isPronouncing = false,
  showSpelling = false,
}: ReverseWordCardProps) {
  const handlePronounce = useCallback(() => {
    onPronounce?.();
  }, [onPronounce]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={slideUpVariants}
      className="flex min-h-[440px] flex-col items-center justify-center space-y-5 rounded-card border border-gray-200/60 bg-white/80 px-10 py-10 shadow-soft backdrop-blur-sm md:px-16 md:py-14"
      role="article"
      aria-label="中译英单词卡片"
      data-testid="reverse-word-card"
    >
      {/* 中文释义 - 大字体居中 */}
      <motion.div
        variants={fadeInVariants}
        className="text-center"
        role="region"
        aria-label="中文释义"
      >
        <p className="text-3xl font-bold text-gray-900 md:text-4xl" data-testid="word-meaning">
          {word.meanings.join('；')}
        </p>
      </motion.div>

      {/* 例句 */}
      {word.examples && word.examples.length > 0 && (
        <motion.p
          variants={fadeInVariants}
          className="mt-3 max-w-4xl text-center text-lg text-gray-700 md:text-xl"
          role="region"
          aria-label="例句"
          data-testid="word-example"
        >
          {word.examples[0]}
        </motion.p>
      )}

      {/* 答题后显示单词拼写和发音按钮 */}
      {showSpelling && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6 flex flex-col items-center space-y-3"
        >
          {/* 单词拼写 */}
          <h2 className="text-4xl font-bold text-blue-600 md:text-5xl" data-testid="word-spelling">
            {word.spelling}
          </h2>

          {/* 音标 */}
          <span
            className="rounded-full bg-gray-100 px-4 py-1.5 text-xl text-gray-600 md:text-2xl"
            aria-label={`音标: ${word.phonetic}`}
          >
            /{word.phonetic}/
          </span>

          {/* 发音按钮 */}
          {onPronounce && (
            <motion.button
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
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 shadow-elevated hover:bg-blue-600 hover:shadow-floating ${isPronouncing ? 'animate-pulse' : ''} focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed`}
              aria-label={isPronouncing ? '正在播放发音' : `播放 ${word.spelling} 的发音`}
              aria-pressed={isPronouncing}
              title="播放发音"
            >
              <SpeakerHigh size={24} weight="fill" className="text-white" aria-hidden="true" />
            </motion.button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function arePropsEqual(prevProps: ReverseWordCardProps, nextProps: ReverseWordCardProps): boolean {
  if (
    prevProps.isPronouncing !== nextProps.isPronouncing ||
    prevProps.showSpelling !== nextProps.showSpelling
  ) {
    return false;
  }

  const prevWord = prevProps.word;
  const nextWord = nextProps.word;

  if (
    prevWord.id !== nextWord.id ||
    prevWord.spelling !== nextWord.spelling ||
    prevWord.phonetic !== nextWord.phonetic
  ) {
    return false;
  }

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

export default memo(ReverseWordCard, arePropsEqual);
