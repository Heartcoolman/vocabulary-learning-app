import React from 'react';
import { CheckCircle, Warning, MagnifyingGlass } from '../Icon';
import { formatDate, getCorrectRateColor, getMasteryLabel } from '../../utils/historyUtils';

interface WordStats {
  wordId: string;
  spelling: string;
  attempts: number;
  correct: number;
  correctRate: number;
  lastStudied: number;
}

interface WordStatsTableProps {
  stats: WordStats[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * WordStatsTable - 单词统计卡片网格和分页
 */
const WordStatsTable: React.FC<WordStatsTableProps> = React.memo(
  ({ stats, currentPage, totalPages, onPageChange }) => {
    if (stats.length === 0) {
      return (
        <div className="animate-g3-fade-in py-12 text-center">
          <MagnifyingGlass className="mx-auto mb-4" size={80} weight="thin" color="#9ca3af" />
          <p className="text-lg text-gray-600">没有找到符合条件的单词</p>
        </div>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {stats.map((stat, index) => {
            const mastery = getMasteryLabel(stat.correctRate);
            return (
              <div
                key={stat.wordId}
                className={`group relative animate-g3-fade-in rounded-card border bg-white/80 p-4 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-105 hover:shadow-elevated dark:bg-slate-800/80 ${mastery.border}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* 掌握程度标签 */}
                <div
                  className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${mastery.bg} ${mastery.color}`}
                >
                  {stat.correctRate >= 80 ? (
                    <CheckCircle size={10} weight="bold" />
                  ) : (
                    <Warning size={10} weight="bold" />
                  )}
                  {mastery.label}
                </div>

                {/* 单词名称 */}
                <div className="mb-4">
                  <h3
                    className="mb-0.5 truncate text-xl font-bold text-gray-900 dark:text-white"
                    title={stat.spelling}
                  >
                    {stat.spelling}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {formatDate(stat.lastStudied)}
                  </p>
                </div>

                {/* 圆形进度条 */}
                <div className="mb-4 flex items-center justify-center">
                  <div className="relative h-20 w-20">
                    <svg className="h-20 w-20 -rotate-90 transform">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        className="text-gray-200 dark:text-slate-700"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 36}`}
                        strokeDashoffset={`${2 * Math.PI * 36 * (1 - stat.correctRate / 100)}`}
                        className={`transition-all duration-g3-slow ${
                          stat.correctRate >= 80
                            ? 'text-green-500'
                            : stat.correctRate >= 40
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        }`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span
                        className={`text-lg font-bold ${getCorrectRateColor(stat.correctRate)}`}
                      >
                        {stat.correctRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 统计信息 */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 dark:border-slate-700">
                  <div className="text-center">
                    <p className="mb-0.5 text-xs text-gray-500 dark:text-slate-400">次数</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {stat.attempts}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="mb-0.5 text-xs text-gray-500 dark:text-slate-400">正确</p>
                    <p className="text-sm font-bold text-green-600">{stat.correct}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600 dark:text-slate-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="rounded-button border border-gray-200 px-3 py-1 text-gray-600 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              下一页
            </button>
          </div>
        )}
      </>
    );
  },
);

WordStatsTable.displayName = 'WordStatsTable';

export default WordStatsTable;
