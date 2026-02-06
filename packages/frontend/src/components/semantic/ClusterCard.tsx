import React, { useState } from 'react';
import { CaretDown, CaretUp, BookOpen } from '@phosphor-icons/react';
import { Spinner } from '../ui';
import { useClusterDetail } from '../../hooks/queries/useWordClusters';
import type { WordCluster, SemanticWord } from '../../services/client';

interface ClusterCardProps {
  cluster: WordCluster;
  onLearnTheme?: (clusterId: string) => void;
}

export const ClusterCard: React.FC<ClusterCardProps> = ({ cluster, onLearnTheme }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { cluster: detail, isLoading } = useClusterDetail(cluster.id, isExpanded);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="flex animate-g3-fade-in flex-col rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm transition-all duration-g3-fast dark:border-slate-700/60 dark:bg-slate-800/80">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{cluster.themeLabel}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {cluster.wordCount} 个单词
          </p>
        </div>
        <button
          type="button"
          onClick={toggleExpand}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
          aria-label={isExpanded ? '收起' : '展开'}
        >
          {isExpanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
        </button>
      </div>

      <div className="mb-3 rounded-button border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-700/50">
        <p className="text-xs text-gray-500 dark:text-gray-400">代表词</p>
        <p className="font-medium text-gray-900 dark:text-white">
          {cluster.representativeWord.spelling}
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {cluster.representativeWord.meanings.slice(0, 2).join('；')}
        </p>
      </div>

      {isExpanded && (
        <div className="mb-3 border-t border-gray-100 pt-3 dark:border-slate-700">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" color="secondary" />
            </div>
          ) : detail?.words && detail.words.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {detail.words.map((word: SemanticWord) => (
                <span
                  key={word.id}
                  className="rounded-button border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300"
                  title={word.meanings[0] || ''}
                >
                  {word.spelling}
                </span>
              ))}
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">
              暂无单词数据
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onLearnTheme?.(cluster.id)}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
      >
        <BookOpen size={18} />
        学习该主题
      </button>
    </div>
  );
};

export default ClusterCard;
