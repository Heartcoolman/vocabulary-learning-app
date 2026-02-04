import React from 'react';
import { BookOpen } from '@phosphor-icons/react';
import type { ConfusionPair } from '../../services/client/semantic/SemanticClient';

interface ConfusionPairCardProps {
  pair: ConfusionPair;
  onPractice?: (pair: ConfusionPair) => void;
}

export const ConfusionPairCard: React.FC<ConfusionPairCardProps> = ({ pair, onPractice }) => {
  const similarity = Math.max(0, Math.min(100, (1 - pair.distance) * 100));
  const colorClass =
    similarity > 90 ? 'bg-red-500' : similarity > 85 ? 'bg-orange-500' : 'bg-yellow-500';

  return (
    <div className="rounded-card border border-gray-200/60 bg-white/80 p-5 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800/80">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{pair.word1.spelling}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{pair.word1.phonetic}</p>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{pair.word1.meanings[0]}</p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{pair.word2.spelling}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{pair.word2.phonetic}</p>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{pair.word2.meanings[0]}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>相似度</span>
          <span className="font-medium">{similarity.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-gray-200 dark:bg-slate-700">
          <div
            className={`h-full rounded-full transition-all ${colorClass}`}
            style={{ width: `${similarity}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onPractice?.(pair)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-button bg-blue-500 px-4 py-2 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
      >
        <BookOpen size={18} />
        一起练习
      </button>
    </div>
  );
};
