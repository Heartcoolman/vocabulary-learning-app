import { CenterWordBook } from '../../services/client';
import { Books, Download, Tag } from '../Icon';

interface CenterWordBookCardProps {
  wordbook: CenterWordBook;
  onSelect: (wordbook: CenterWordBook) => void;
}

export function CenterWordBookCard({ wordbook, onSelect }: CenterWordBookCardProps) {
  return (
    <div
      onClick={() => onSelect(wordbook)}
      className="cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {wordbook.coverImage ? (
        <div className="h-32 bg-gray-100 dark:bg-slate-700">
          <img
            src={wordbook.coverImage}
            alt={wordbook.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
          <Books className="h-12 w-12 text-white/80" />
        </div>
      )}

      <div className="p-4">
        <h3 className="truncate font-semibold text-gray-900 dark:text-white" title={wordbook.name}>
          {wordbook.name}
        </h3>

        {wordbook.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {wordbook.description}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">{wordbook.wordCount} 词</span>
          {wordbook.downloadCount !== undefined && (
            <span className="flex items-center text-gray-400 dark:text-gray-500">
              <Download className="mr-1 h-3.5 w-3.5" />
              {wordbook.downloadCount}
            </span>
          )}
        </div>

        {wordbook.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {wordbook.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-gray-300"
              >
                <Tag className="mr-1 h-3 w-3" />
                {tag}
              </span>
            ))}
            {wordbook.tags.length > 3 && (
              <span className="text-xs text-gray-400">+{wordbook.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
