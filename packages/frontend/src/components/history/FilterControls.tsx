import React from 'react';
import { CheckCircle, Warning, Clock, TrendUp, Hash } from '../Icon';

type SortType = 'time' | 'correctRate' | 'attempts';
type FilterType = 'all' | 'mastered' | 'reviewing' | 'struggling';

interface Statistics {
  total: number;
  mastered: number;
  reviewing: number;
  struggling: number;
}

interface FilterControlsProps {
  sortBy: SortType;
  filterBy: FilterType;
  statistics: Statistics;
  onSortChange: (sort: SortType) => void;
  onFilterChange: (filter: FilterType) => void;
}

/**
 * FilterControls - 筛选和排序控件
 */
const FilterControls: React.FC<FilterControlsProps> = React.memo(
  ({ sortBy, filterBy, statistics, onSortChange, onFilterChange }) => {
    return (
      <div className="mb-8 rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">筛选</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onFilterChange('all')}
                className={`rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  filterBy === 'all'
                    ? 'bg-blue-500 text-white shadow-elevated'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                全部 ({statistics.total})
              </button>
              <button
                onClick={() => onFilterChange('mastered')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  filterBy === 'mastered'
                    ? 'bg-green-500 text-white shadow-elevated'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <CheckCircle size={16} weight="bold" />
                已掌握 ({statistics.mastered})
              </button>
              <button
                onClick={() => onFilterChange('reviewing')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  filterBy === 'reviewing'
                    ? 'bg-yellow-500 text-white shadow-elevated'
                    : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                }`}
              >
                <Warning size={16} weight="bold" />
                需复习 ({statistics.reviewing})
              </button>
              <button
                onClick={() => onFilterChange('struggling')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  filterBy === 'struggling'
                    ? 'bg-red-500 text-white shadow-elevated'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                <Warning size={16} weight="bold" />
                未掌握 ({statistics.struggling})
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">排序</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onSortChange('time')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  sortBy === 'time'
                    ? 'bg-gray-900 text-white shadow-elevated'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Clock size={16} weight="bold" />
                最近学习
              </button>
              <button
                onClick={() => onSortChange('correctRate')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  sortBy === 'correctRate'
                    ? 'bg-gray-900 text-white shadow-elevated'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <TrendUp size={16} weight="bold" />
                正确率
              </button>
              <button
                onClick={() => onSortChange('attempts')}
                className={`flex items-center gap-2 rounded-button px-4 py-2 font-medium transition-all duration-g3-fast hover:scale-105 active:scale-95 ${
                  sortBy === 'attempts'
                    ? 'bg-gray-900 text-white shadow-elevated'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Hash size={16} weight="bold" />
                学习次数
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

FilterControls.displayName = 'FilterControls';

export default FilterControls;
