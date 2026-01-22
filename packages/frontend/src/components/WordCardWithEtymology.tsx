import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TreeStructure, CaretDown } from '@phosphor-icons/react';
import WordCard, { WordCardProps } from './WordCard';
import { MorphologyBreakdown } from './etymology';
import { useWordEtymology } from '../hooks/queries/useEtymology';
import { G3_DURATION, G3_EASING } from '../utils/animations';
import { Spinner } from './ui/Spinner';

export interface WordCardWithEtymologyProps extends WordCardProps {
  showEtymology?: boolean;
  defaultExpanded?: boolean;
}

function WordCardWithEtymology({
  word,
  showEtymology = true,
  defaultExpanded = false,
  ...cardProps
}: WordCardWithEtymologyProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const { etymology, isLoading } = useWordEtymology({
    wordId: word.id,
    enabled: showEtymology && (isExpanded || defaultExpanded),
  });

  return (
    <div className="flex flex-col">
      <WordCard word={word} {...cardProps} />

      {showEtymology && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls={`etymology-panel-${word.id}`}
            className="mx-auto flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-500 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-blue-400"
          >
            <TreeStructure size={18} />
            <span>{isExpanded ? '收起词源' : '查看词源拆解'}</span>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: G3_DURATION.fast / 1000, ease: G3_EASING.standard }}
            >
              <CaretDown size={14} />
            </motion.div>
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                id={`etymology-panel-${word.id}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: G3_DURATION.normal / 1000, ease: G3_EASING.standard }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-card border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-700/50">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Spinner size="sm" color="secondary" className="mr-2" />
                      <span className="text-sm text-gray-500">加载词源...</span>
                    </div>
                  ) : etymology ? (
                    <>
                      <MorphologyBreakdown parts={etymology.decomposition} />
                      {etymology.roots.length > 0 && (
                        <div className="mt-3 text-center text-xs text-gray-400">
                          词根:{' '}
                          <span className="font-semibold">
                            {etymology.roots.map((r) => r.surface).join(', ')}
                          </span>
                          {etymology.roots[0]?.meaningZh && (
                            <span className="ml-1">({etymology.roots[0].meaningZh})</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-4 text-center text-sm text-gray-400">暂无词源数据</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

export default memo(WordCardWithEtymology);
