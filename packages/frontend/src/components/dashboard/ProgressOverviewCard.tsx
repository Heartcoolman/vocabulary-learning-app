import React from 'react';
import { Trophy, Target, BookOpen } from '../../components/Icon';
import { StudyProgressData } from '../../hooks/useStudyProgress';
import { useTheme } from '../../contexts/ThemeContext';

interface ProgressOverviewCardProps {
  data: StudyProgressData;
}

const ProgressOverviewCardComponent = ({ data }: ProgressOverviewCardProps) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { todayStudied, todayTarget, totalStudied, correctRate } = data;

  const percentComplete = Math.min(
    100,
    todayTarget > 0 ? Math.round((todayStudied / todayTarget) * 100) : 0,
  );
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentComplete / 100) * circumference;

  const ringBgColor = isDark ? '#374151' : '#F3F4F6';
  const ringFgColor = isDark ? '#60a5fa' : '#3B82F6';

  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <div className="grid grid-cols-1 items-center gap-5 p-4 sm:p-6 md:grid-cols-3">
        <div className="relative col-span-1 flex flex-col items-center justify-center">
          <div className="relative h-36 w-36">
            <svg className="h-full w-full -rotate-90 transform">
              <circle
                cx="72"
                cy="72"
                r={radius}
                stroke={ringBgColor}
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                stroke={ringFgColor}
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-g3-slower ease-g3"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {todayStudied}
              </span>
              <span className="text-sm font-medium uppercase text-gray-500 dark:text-gray-400">
                / {todayTarget}
              </span>
            </div>
          </div>
          <div className="mt-3 text-center">
            <h3 className="flex items-center justify-center gap-2 text-base font-bold text-gray-900 dark:text-white">
              <Target className="h-4 w-4 text-blue-500" weight="bold" />
              今日目标
            </h3>
            <p className="text-base text-gray-500 dark:text-gray-400">
              {percentComplete >= 100 ? '太棒了，已完成！' : '继续加油！'}
            </p>
          </div>
        </div>

        <div className="col-span-1 grid grid-cols-2 gap-3 md:col-span-2">
          <div className="group flex h-28 flex-col justify-between rounded-card border border-blue-100 bg-blue-50 p-4 transition-shadow hover:shadow-elevated dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-start justify-between">
              <div className="rounded-button bg-white p-2 shadow-soft dark:bg-slate-700">
                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" weight="bold" />
              </div>
              <span className="text-sm font-bold uppercase tracking-wider text-blue-400">累计</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {totalStudied.toLocaleString()}
              </span>
              <p className="mt-1 text-base font-medium text-blue-600/80 dark:text-blue-400/80">
                已学单词
              </p>
            </div>
          </div>

          <div className="group flex h-28 flex-col justify-between rounded-card border border-amber-100 bg-amber-50 p-4 transition-shadow hover:shadow-elevated dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-start justify-between">
              <div className="rounded-button bg-white p-2 shadow-soft dark:bg-slate-700">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" weight="bold" />
              </div>
              <span className="text-sm font-bold uppercase tracking-wider text-amber-400">
                准确率
              </span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {correctRate}%
              </span>
              <p className="mt-1 text-base font-medium text-amber-600/80 dark:text-amber-400/80">
                答题正确率
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Deep comparison for StudyProgressData object
 */
const compareProgressData = (prev: StudyProgressData, next: StudyProgressData): boolean => {
  return (
    prev.todayStudied === next.todayStudied &&
    prev.todayTarget === next.todayTarget &&
    prev.totalStudied === next.totalStudied &&
    prev.correctRate === next.correctRate
  );
};

/**
 * Memoized ProgressOverviewCard component
 * Optimizes re-renders by deep comparing data object
 */
export const ProgressOverviewCard = React.memo(
  ProgressOverviewCardComponent,
  (prevProps, nextProps) => {
    return compareProgressData(prevProps.data, nextProps.data);
  },
);
