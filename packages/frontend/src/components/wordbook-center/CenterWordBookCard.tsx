import type { KeyboardEvent } from 'react';
import { CenterWordBook } from '../../services/client';
import { Books, Download, Tag, User, CaretRight } from '../Icon';

interface CenterWordBookCardProps {
  wordbook: CenterWordBook;
  onSelect: (wordbook: CenterWordBook) => void;
}

export function CenterWordBookCard({ wordbook, onSelect }: CenterWordBookCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(wordbook);
    }
  };

  return (
    <div
      onClick={() => onSelect(wordbook)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`查看词书: ${wordbook.name}, ${wordbook.wordCount} 词`}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200/60 bg-white/80 px-4 py-3 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/80 dark:hover:border-blue-600 dark:hover:bg-slate-700/50"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
        <Books className="h-6 w-6 text-blue-500 dark:text-blue-400" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
            {wordbook.name}
          </h3>
          <span className="flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">
            {wordbook.wordCount} 词
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          {wordbook.author?.trim() && (
            <span className="flex items-center">
              <User className="mr-1 h-3 w-3" />
              <span className="max-w-[100px] truncate">{wordbook.author.trim()}</span>
            </span>
          )}
          {wordbook.version && <span>v{wordbook.version}</span>}
          {wordbook.downloadCount !== undefined && wordbook.downloadCount > 0 && (
            <span className="flex items-center">
              <Download className="mr-1 h-3 w-3" />
              {wordbook.downloadCount}
            </span>
          )}
        </div>

        {wordbook.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {wordbook.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {tag}
              </span>
            ))}
            {wordbook.tags.length > 3 && (
              <span className="text-xs text-gray-400">+{wordbook.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <CaretRight className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-500 dark:text-gray-500" />
    </div>
  );
}
