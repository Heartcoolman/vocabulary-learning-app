import React from 'react';
import { useSimilarWords } from '../../hooks/queries/useSimilarWords';
import { SemanticWord } from '../../services/client';
import { ShareNetwork } from '@phosphor-icons/react';

interface RelatedWordsProps {
  wordId: string;
  onSelectWord?: (wordId: string) => void;
  limit?: number;
  className?: string;
  variant?: 'default' | 'card';
}

export const RelatedWords: React.FC<RelatedWordsProps> = ({
  wordId,
  onSelectWord,
  limit = 8,
  className = '',
  variant = 'default',
}) => {
  const { words, isLoading } = useSimilarWords({ wordId, limit });

  const containerStyles =
    variant === 'card'
      ? 'rounded-card border border-slate-100 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800'
      : 'rounded-button border border-gray-200 bg-white/50 p-4 dark:border-slate-700 dark:bg-slate-800/50';

  const titleStyles =
    variant === 'card'
      ? 'text-2xl font-bold text-slate-800 dark:text-slate-100'
      : 'mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300';

  const renderHeader = () => {
    if (variant === 'card') {
      return (
        <div className="mb-6 flex items-center gap-3">
          <ShareNetwork size={28} className="text-purple-500" />
          <h3 className={titleStyles}>相关单词</h3>
        </div>
      );
    }
    return <h3 className={titleStyles}>相关单词</h3>;
  };

  if (isLoading) {
    return (
      <div className={`${containerStyles} ${className}`}>
        {renderHeader()}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-20 animate-pulse rounded-button bg-gray-200 dark:bg-slate-700"
            />
          ))}
        </div>
      </div>
    );
  }

  const filteredWords = words.filter((word) => word.id !== wordId);

  if (filteredWords.length === 0) {
    return null;
  }

  return (
    <div className={`${containerStyles} ${className}`}>
      {renderHeader()}
      <div className="flex flex-wrap gap-2">
        {filteredWords.map((word: SemanticWord) => (
          <button
            key={word.id}
            type="button"
            onClick={() => onSelectWord?.(word.id)}
            className="group flex items-center gap-1.5 rounded-button border border-gray-200 bg-white px-3 py-1.5 text-sm transition-all hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-blue-600 dark:hover:bg-slate-600"
          >
            <span className="font-medium text-gray-800 dark:text-gray-200">{word.spelling}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {(word.meanings[0] || '').slice(0, 15)}
              {(word.meanings[0] || '').length > 15 ? '...' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RelatedWords;
