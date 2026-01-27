import React, { memo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Books,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CaretDown,
  ArrowUp,
  ArrowDown,
} from '../../../../components/Icon';
import { getMasteryLevelLabel, getMasteryLevelColor } from './UserStatistics';

export interface FilterState {
  scoreRange?: 'low' | 'medium' | 'high';
  masteryLevel?: number;
  minAccuracy?: number;
  state?: 'new' | 'learning' | 'reviewing' | 'mastered';
  sortBy: 'score' | 'accuracy' | 'reviewCount' | 'lastReview';
  sortOrder: 'asc' | 'desc';
}

export interface WordDetail {
  word: {
    id: string;
    spelling: string;
    phonetic: string;
  };
  score: number;
  masteryLevel: number;
  accuracy: number;
  reviewCount: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  state: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserWordListProps {
  userId: string;
  words: WordDetail[];
  pagination: PaginationInfo;
  isLoading: boolean;
  isExporting: boolean;
  filters: FilterState;
  showFilters: boolean;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onPageChange: (page: number) => void;
  onToggleFilters: () => void;
  onToggleSortOrder: () => void;
  onExport: (format: 'csv' | 'excel') => void;
}

/**
 * 获取学习状态标签
 */
const getStateLabel = (state: string): string => {
  const labels: Record<string, string> = {
    NEW: '新单词',
    LEARNING: '学习中',
    REVIEWING: '复习中',
    MASTERED: '已掌握',
  };
  return labels[state] || state;
};

/**
 * 获取学习状态颜色
 */
const getStateColor = (state: string): string => {
  const colors: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300',
    LEARNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    REVIEWING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    MASTERED: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  };
  return colors[state] || 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300';
};

/**
 * 格式化日期
 */
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/**
 * UserWordList Component
 * 显示用户单词列表，包含筛选和分页功能
 */
const UserWordListComponent: React.FC<UserWordListProps> = ({
  userId,
  words,
  pagination,
  isLoading,
  isExporting,
  filters,
  showFilters,
  onFilterChange,
  onPageChange,
  onToggleFilters,
  onToggleSortOrder,
  onExport,
}) => {
  const navigate = useNavigate();

  const handleWordClick = useCallback(
    (wordId: string) => {
      navigate(`/admin/users/${userId}/words?wordId=${wordId}`);
    },
    [navigate, userId],
  );

  return (
    <div className="rounded-card border border-gray-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-gray-200 p-6 dark:border-slate-700">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">单词列表</h2>
          <div className="flex items-center gap-3">
            {/* 导出按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExport('csv')}
                disabled={isExporting || isLoading || words.length === 0}
                className="flex items-center gap-2 rounded-button bg-green-500 px-4 py-2 text-white transition-all hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="导出为CSV格式"
              >
                {isExporting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                <span>{isExporting ? '导出中...' : '导出CSV'}</span>
              </button>
              <button
                onClick={() => onExport('excel')}
                disabled={isExporting || isLoading || words.length === 0}
                className="flex items-center gap-2 rounded-button bg-blue-500 px-4 py-2 text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="导出为Excel格式"
              >
                {isExporting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                <span>{isExporting ? '导出中...' : '导出Excel'}</span>
              </button>
            </div>
            <button
              onClick={onToggleFilters}
              className="flex items-center gap-2 rounded-button bg-gray-100 px-4 py-2 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <MagnifyingGlass size={16} />
              <span>筛选和排序</span>
              <CaretDown
                size={16}
                className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* 筛选器 */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-4 rounded-button bg-gray-50 p-4 dark:bg-slate-900 md:grid-cols-2 lg:grid-cols-4">
            {/* 得分范围 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                得分范围
              </label>
              <select
                value={filters.scoreRange || ''}
                onChange={(e) =>
                  onFilterChange({
                    scoreRange: (e.target.value as FilterState['scoreRange']) || undefined,
                  })
                }
                className="w-full rounded-button border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">全部</option>
                <option value="low">低分 (0-40)</option>
                <option value="medium">中等 (40-80)</option>
                <option value="high">高分 (80-100)</option>
              </select>
            </div>

            {/* 掌握程度 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                掌握程度
              </label>
              <select
                value={filters.masteryLevel !== undefined ? filters.masteryLevel : ''}
                onChange={(e) =>
                  onFilterChange({
                    masteryLevel: e.target.value === '' ? undefined : parseInt(e.target.value),
                  })
                }
                className="w-full rounded-button border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">全部</option>
                <option value="0">新单词</option>
                <option value="1">初识</option>
                <option value="2">熟悉</option>
                <option value="3">掌握</option>
                <option value="4">熟练</option>
                <option value="5">精通</option>
              </select>
            </div>

            {/* 学习状态 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                学习状态
              </label>
              <select
                value={filters.state || ''}
                onChange={(e) =>
                  onFilterChange({
                    state: (e.target.value as FilterState['state']) || undefined,
                  })
                }
                className="w-full rounded-button border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">全部</option>
                <option value="new">新单词</option>
                <option value="learning">学习中</option>
                <option value="reviewing">复习中</option>
                <option value="mastered">已掌握</option>
              </select>
            </div>

            {/* 排序方式 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                排序方式
              </label>
              <div className="flex gap-2">
                <select
                  value={filters.sortBy}
                  onChange={(e) =>
                    onFilterChange({
                      sortBy: e.target.value as FilterState['sortBy'],
                    })
                  }
                  className="flex-1 rounded-button border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="score">单词得分</option>
                  <option value="accuracy">正确率</option>
                  <option value="reviewCount">学习次数</option>
                  <option value="lastReview">最近学习时间</option>
                </select>
                <button
                  onClick={onToggleSortOrder}
                  className="rounded-button bg-gray-100 px-3 py-2 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                  title={filters.sortOrder === 'asc' ? '升序' : '降序'}
                >
                  {filters.sortOrder === 'asc' ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 单词表格 */}
      {isLoading ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      ) : words.length === 0 ? (
        <div className="p-12 text-center">
          <Books size={64} weight="thin" className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg text-gray-500 dark:text-gray-400">暂无单词数据</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    单词
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    得分
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    掌握程度
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    正确率
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    学习次数
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    最近学习
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    下次复习
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {words.map((wordDetail) => (
                  <tr
                    key={wordDetail.word.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
                    onClick={() => handleWordClick(wordDetail.word.id)}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                          {wordDetail.word.spelling}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {wordDetail.word.phonetic}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-bold ${
                          wordDetail.score >= 80
                            ? 'text-green-600'
                            : wordDetail.score >= 40
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {wordDetail.score.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-medium ${getMasteryLevelColor(wordDetail.masteryLevel)}`}
                      >
                        {getMasteryLevelLabel(wordDetail.masteryLevel)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-medium ${
                          wordDetail.accuracy >= 80
                            ? 'text-green-600'
                            : wordDetail.accuracy >= 60
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {wordDetail.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-900 dark:text-white">
                        {wordDetail.reviewCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(wordDetail.lastReviewDate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(wordDetail.nextReviewDate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStateColor(
                          wordDetail.state,
                        )}`}
                      >
                        {getStateLabel(wordDetail.state)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 p-6 dark:border-slate-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                显示第 {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共{' '}
                {pagination.total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  <CaretLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      return (
                        page === 1 ||
                        page === pagination.totalPages ||
                        Math.abs(page - pagination.page) <= 2
                      );
                    })
                    .map((page, index, array) => {
                      const showEllipsis = index > 0 && page - array[index - 1] > 1;
                      return (
                        <span key={page} className="contents">
                          {showEllipsis && (
                            <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
                          )}
                          <button
                            onClick={() => onPageChange(page)}
                            className={`rounded-button px-4 py-2 transition-all ${
                              page === pagination.page
                                ? 'bg-blue-500 text-white'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700'
                            }`}
                          >
                            {page}
                          </button>
                        </span>
                      );
                    })}
                </div>
                <button
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="rounded-button border border-gray-300 px-4 py-2 text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  <CaretRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const UserWordList = memo(UserWordListComponent);

// 导出辅助函数供其他组件使用
export { getStateLabel, getStateColor, formatDate };
