import React from 'react';
import { Trophy, Target, BookOpen } from '../../components/Icon';
import { StudyProgressData } from '../../hooks/useStudyProgress';

interface ProgressOverviewCardProps {
  data: StudyProgressData;
}

const ProgressOverviewCardComponent = ({ data }: ProgressOverviewCardProps) => {
  const { todayStudied, todayTarget, totalStudied, correctRate } = data;

  const percentComplete = Math.min(
    100,
    todayTarget > 0 ? Math.round((todayStudied / todayTarget) * 100) : 0,
  );
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentComplete / 100) * circumference;

  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-soft">
      <div className="grid grid-cols-1 items-center gap-8 p-6 sm:p-8 md:grid-cols-3">
        <div className="relative col-span-1 flex flex-col items-center justify-center">
          <div className="relative h-40 w-40">
            <svg className="h-full w-full -rotate-90 transform">
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#F3F4F6"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#3B82F6"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-g3-slower ease-g3"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-gray-900">{todayStudied}</span>
              <span className="text-xs font-medium uppercase text-gray-500">/ {todayTarget}</span>
            </div>
          </div>
          <div className="mt-4 text-center">
            <h3 className="flex items-center justify-center gap-2 font-bold text-gray-900">
              <Target className="h-4 w-4 text-blue-500" weight="bold" />
              今日目标
            </h3>
            <p className="text-sm text-gray-500">
              {percentComplete >= 100 ? '太棒了，已完成！' : '继续加油！'}
            </p>
          </div>
        </div>

        <div className="col-span-1 grid grid-cols-2 gap-4 md:col-span-2">
          <div className="group flex h-32 flex-col justify-between rounded-card border border-indigo-100 bg-indigo-50 p-6 transition-shadow hover:shadow-elevated">
            <div className="flex items-start justify-between">
              <div className="rounded-button bg-white p-2 shadow-soft">
                <BookOpen className="h-5 w-5 text-indigo-600" weight="bold" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                累计
              </span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">
                {totalStudied.toLocaleString()}
              </span>
              <p className="mt-1 text-sm font-medium text-indigo-600/80">已学单词</p>
            </div>
          </div>

          <div className="group flex h-32 flex-col justify-between rounded-card border border-amber-100 bg-amber-50 p-6 transition-shadow hover:shadow-elevated">
            <div className="flex items-start justify-between">
              <div className="rounded-button bg-white p-2 shadow-soft">
                <Trophy className="h-5 w-5 text-amber-600" weight="bold" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                准确率
              </span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">{correctRate}%</span>
              <p className="mt-1 text-sm font-medium text-amber-600/80">答题正确率</p>
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
