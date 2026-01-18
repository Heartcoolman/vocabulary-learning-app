import type { KeyboardEvent } from 'react';
import { CenterWordBook } from '../../services/client';
import { Books, Download, Tag, User } from '../Icon';

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
      className="group animate-g3-fade-in cursor-pointer overflow-hidden rounded-card border border-gray-200/60 bg-white/80 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-[1.02] hover:border-blue-300 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-700/60 dark:bg-slate-800/80 dark:hover:border-blue-600"
    >
      {wordbook.coverImage ? (
        <div className="h-28 bg-gray-100 dark:bg-slate-700">
          <img
            src={wordbook.coverImage}
            alt={wordbook.name}
            className="h-full w-full object-cover transition-transform duration-g3-fast group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center bg-blue-100 dark:bg-blue-900/30">
          <Books className="h-10 w-10 text-blue-400 dark:text-blue-500" />
        </div>
      )}

      <div className="p-3">
        <h3
          className="truncate text-xl font-bold text-gray-900 dark:text-white"
          title={wordbook.name}
        >
          {wordbook.name}
        </h3>

        {wordbook.author?.trim() && (
          <p className="mt-1 flex items-center text-sm text-gray-500 dark:text-gray-400">
            <User aria-hidden="true" className="mr-1 h-3 w-3" />
            {wordbook.author.trim()}
          </p>
        )}

        {wordbook.description && (
          <p className="mt-1 line-clamp-2 text-base text-gray-600 dark:text-gray-400">
            {wordbook.description}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between text-base">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {wordbook.wordCount} 词{wordbook.version != null && ` · v${wordbook.version}`}
          </span>
          {wordbook.downloadCount !== undefined && (
            <span className="flex items-center text-gray-500 dark:text-gray-400">
              <Download className="mr-1 h-4 w-4" />
              {wordbook.downloadCount}
            </span>
          )}
        </div>

        {wordbook.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {wordbook.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-sm text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              >
                <Tag className="mr-1 h-3 w-3" />
                {tag}
              </span>
            ))}
            {wordbook.tags.length > 3 && (
              <span className="text-sm text-gray-400">+{wordbook.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-button bg-blue-500 px-3 py-2.5 text-base font-medium text-white shadow-soft transition-all group-hover:bg-blue-600 group-hover:shadow-elevated">
          <Download className="h-5 w-5" />
          查看详情 / 导入
        </div>
      </div>
    </div>
  );
}
