import { Tag, X } from '../Icon';

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
}

export function TagFilter({ allTags, selectedTags, onTagToggle, onClearAll }: TagFilterProps) {
  if (allTags.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
          <Tag className="mr-1.5 h-4 w-4" />
          标签筛选
        </h3>
        {selectedTags.length > 0 && (
          <button
            onClick={onClearAll}
            className="flex items-center text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <X className="mr-0.5 h-3 w-3" />
            清除筛选
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
