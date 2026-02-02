import { useState, useEffect, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh, Check, X } from './Icon';
import { g3SpringSnappy, G3_DURATION } from '../utils/animations';
import { Button, Card } from './ui';
import { cn } from './ui/utils';

export interface FlashCardWord {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
}

export interface FlashCardProps {
  word: FlashCardWord;
  onKnown: () => void;
  onUnknown: () => void;
  onPronounce: () => void;
  isPronouncing?: boolean;
}

function FlashCard({
  word,
  onKnown,
  onUnknown,
  onPronounce,
  isPronouncing = false,
}: FlashCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  // 单词变化时重置翻转状态
  useEffect(() => {
    setIsFlipped(false);
  }, [word.id]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 避免输入框等组件的按键冲突
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space' && !isFlipped) {
        e.preventDefault();
        setIsFlipped(true);
      } else if (isFlipped) {
        if (e.key === '1') {
          e.preventDefault();
          onKnown();
        } else if (e.key === '2') {
          e.preventDefault();
          onUnknown();
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFlipped, onKnown, onUnknown]);

  const handleFlip = useCallback(() => {
    if (!isFlipped) setIsFlipped(true);
  }, [isFlipped]);

  // Card 通用样式
  const cardStyle = {
    backfaceVisibility: 'hidden' as const,
  };

  const cardClassName =
    'flex min-h-[440px] w-full flex-col items-center justify-center py-10 px-10';

  return (
    <div className="perspective-1000 w-full" style={{ perspective: '1000px' }}>
      <motion.div
        className={cn('relative w-full', !isFlipped && 'cursor-pointer')}
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: G3_DURATION.slower / 1000, ease: 'easeInOut' }}
        onClick={!isFlipped ? handleFlip : undefined}
      >
        {/* 正面 - 单词 */}
        <Card
          variant="glass"
          className={cardClassName}
          style={{
            ...cardStyle,
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onPronounce();
            }}
            disabled={isPronouncing}
            variant="primary"
            size="xl"
            iconOnly
            className={cn('mb-5 h-16 w-16 rounded-full', isPronouncing && 'animate-pulse')}
            aria-label="播放发音"
          >
            <SpeakerHigh size={32} weight="fill" className="text-white" />
          </Button>
          <h2 className="text-6xl font-bold text-gray-900 dark:text-white">{word.spelling}</h2>
          <span className="mt-4 rounded-full bg-gray-100 px-5 py-2 text-2xl text-gray-600 dark:bg-slate-700 dark:text-gray-300">
            /{word.phonetic}/
          </span>
          <p className="mt-6 text-sm text-gray-400">点击卡片或按空格键翻转</p>
        </Card>

        {/* 背面 - 释义 */}
        <Card
          variant="glass"
          className={cn(cardClassName, 'absolute inset-0')}
          style={{
            ...cardStyle,
            transform: 'rotateY(180deg)',
            pointerEvents: isFlipped ? 'auto' : 'none',
          }}
        >
          <div className="mb-4 text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {word.meanings.join('；')}
            </p>
          </div>
          {word.examples[0] && (
            <p className="mb-8 max-w-lg text-center text-lg text-gray-600 dark:text-gray-300">
              {word.examples[0]}
            </p>
          )}
          <div className="flex gap-5">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onUnknown();
              }}
              variant="danger"
              size="lg"
              className="px-8 py-4 text-lg"
              leftIcon={<X size={20} />}
              aria-label="标记为不认识"
            >
              不认识 (2)
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onKnown();
              }}
              variant="success"
              size="lg"
              className="px-8 py-4 text-lg"
              leftIcon={<Check size={20} />}
              aria-label="标记为认识"
            >
              认识 (1)
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

export default memo(FlashCard);
