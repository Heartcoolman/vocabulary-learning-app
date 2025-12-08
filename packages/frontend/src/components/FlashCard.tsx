import { useState, useEffect, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SpeakerHigh, Check, X } from './Icon';
import { g3SpringSnappy } from '../utils/animations';

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

  return (
    <div className="perspective-1000 w-full" style={{ perspective: '1000px' }}>
      <motion.div
        className={`relative w-full ${!isFlipped ? 'cursor-pointer' : ''}`}
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        onClick={!isFlipped ? handleFlip : undefined}
      >
        {/* 正面 - 单词 */}
        <div
          className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-gray-200/60 bg-white/80 px-10 py-10 shadow-sm backdrop-blur-sm"
          style={{
            backfaceVisibility: 'hidden',
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onPronounce();
            }}
            disabled={isPronouncing}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={g3SpringSnappy}
            className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 shadow-lg hover:bg-blue-600 ${isPronouncing ? 'animate-pulse' : ''}`}
          >
            <SpeakerHigh size={32} weight="fill" className="text-white" />
          </motion.button>
          <h2 className="text-6xl font-bold text-gray-900">{word.spelling}</h2>
          <span className="mt-4 rounded-full bg-gray-100 px-5 py-2 text-2xl text-gray-600">
            /{word.phonetic}/
          </span>
          <p className="mt-6 text-sm text-gray-400">点击卡片或按空格键翻转</p>
        </div>

        {/* 背面 - 释义 */}
        <div
          className="absolute inset-0 flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-gray-200/60 bg-white/80 px-10 py-10 shadow-sm backdrop-blur-sm"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            pointerEvents: isFlipped ? 'auto' : 'none',
          }}
        >
          <div className="mb-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{word.meanings.join('；')}</p>
          </div>
          {word.examples[0] && (
            <p className="mb-8 max-w-lg text-center text-lg text-gray-600">{word.examples[0]}</p>
          )}
          <div className="flex gap-5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnknown();
              }}
              className="flex items-center gap-2 rounded-xl bg-red-100 px-8 py-4 text-lg font-medium text-red-700 transition-colors hover:bg-red-200"
            >
              <X size={22} /> 不认识 (2)
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKnown();
              }}
              className="flex items-center gap-2 rounded-xl bg-green-100 px-8 py-4 text-lg font-medium text-green-700 transition-colors hover:bg-green-200"
            >
              <Check size={22} /> 认识 (1)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(FlashCard);
