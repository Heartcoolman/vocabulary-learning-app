import React from 'react';
import { useSimilarWords } from '../../hooks/queries/useSimilarWords';
import { useSemanticStats } from '../../hooks/queries/useSemanticStats';

interface RelatedWordsPanelProps {
  wordId: string;
  limit?: number;
}

export const RelatedWordsPanel: React.FC<RelatedWordsPanelProps> = ({ wordId, limit = 3 }) => {
  const { stats } = useSemanticStats();
  const { words, isLoading } = useSimilarWords({
    wordId,
    limit,
    enabled: !!wordId && (stats?.available ?? false),
  });

  if (!stats?.available || (!isLoading && words.length === 0)) {
    return null;
  }

  return (
    <div className="mt-3 animate-g3-fade-in rounded-button border border-gray-200 bg-white/60 p-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        语义相关
      </div>
      {isLoading ? (
        <div className="text-xs text-gray-400">加载中...</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {words.map((word) => (
            <div
              key={word.id}
              className="rounded-button border border-gray-200 bg-white px-3 py-1.5 text-sm transition-all hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-600"
            >
              <span className="font-medium text-gray-900 dark:text-white">{word.spelling}</span>
              {word.meanings[0] && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {word.meanings[0].slice(0, 15)}
                  {word.meanings[0].length > 15 ? '...' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
