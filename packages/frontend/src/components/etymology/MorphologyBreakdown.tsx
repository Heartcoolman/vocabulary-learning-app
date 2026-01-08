import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WordPart, MorphemeType } from '@danci/shared';

export interface MorphologyBreakdownProps {
  parts: WordPart[];
  showMeanings?: boolean;
  compact?: boolean;
  onPartClick?: (part: WordPart) => void;
}

const TYPE_STYLES: Record<
  MorphemeType,
  { bg: string; border: string; text: string; label: string }
> = {
  prefix: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-700',
    text: 'text-blue-800 dark:text-blue-200',
    label: '前缀',
  },
  root: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-300 dark:border-amber-600',
    text: 'text-amber-900 dark:text-amber-100',
    label: '词根',
  },
  suffix: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    border: 'border-green-200 dark:border-green-700',
    text: 'text-green-800 dark:text-green-200',
    label: '后缀',
  },
};

function MorphologyBreakdown({
  parts,
  showMeanings = true,
  compact = false,
  onPartClick,
}: MorphologyBreakdownProps) {
  if (!parts || parts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <AnimatePresence mode="popLayout">
        {parts.map((part, idx) => {
          const style = TYPE_STYLES[part.type];
          const meaning = part.meaningZh || part.meaning;

          return (
            <motion.div
              key={`${part.part}-${idx}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-center"
            >
              <motion.button
                type="button"
                onClick={() => onPartClick?.(part)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                disabled={!onPartClick}
                className={`flex flex-col items-center rounded-lg border px-3 py-2 transition-all ${style.bg} ${style.border} ${style.text} ${onPartClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${compact ? 'px-2 py-1' : 'px-3 py-2'} `}
              >
                <span className={`font-mono font-bold ${compact ? 'text-base' : 'text-lg'}`}>
                  {part.part}
                </span>
                <span className="text-[10px] uppercase tracking-wider opacity-60">
                  {style.label}
                </span>
                {showMeanings && meaning && (
                  <span
                    className={`mt-0.5 text-center opacity-75 ${compact ? 'text-[10px]' : 'text-xs'}`}
                  >
                    {meaning}
                  </span>
                )}
              </motion.button>

              {idx < parts.length - 1 && (
                <span className="mx-1.5 text-gray-300 dark:text-gray-600">+</span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default memo(MorphologyBreakdown);
