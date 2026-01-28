import React, { memo } from 'react';
import { User, ChartBar, Target, Clock, TrendUp, Books, Flame } from '../../../../components/Icon';

export interface UserStatisticsData {
  user: {
    username: string;
    email: string;
  };
  totalWordsLearned: number;
  averageScore: number;
  accuracy: number;
  studyDays: number;
  consecutiveDays: number;
  totalStudyTime: number;
  masteryDistribution: Record<string, number>;
}

export interface UserBasicInfoProps {
  statistics: UserStatisticsData;
}

/**
 * UserBasicInfo Component
 * 显示用户头像、用户名、邮箱和关键统计卡片
 */
const UserBasicInfoComponent: React.FC<UserBasicInfoProps> = ({ statistics }) => {
  return (
    <>
      {/* 用户信息头部 */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <User size={32} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {statistics.user.username}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{statistics.user.email}</p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* 总学习单词数 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <Books size={32} className="text-blue-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.totalWordsLearned}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">总学习单词数</div>
        </div>

        {/* 平均得分 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <Target size={32} className="text-purple-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.averageScore.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">平均单词得分</div>
        </div>

        {/* 整体正确率 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <ChartBar size={32} className="text-green-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.accuracy.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">整体正确率</div>
        </div>

        {/* 学习天数 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <Clock size={32} className="text-orange-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.studyDays}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">学习天数</div>
        </div>

        {/* 连续学习天数 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <Flame size={32} className="text-red-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.consecutiveDays}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">连续学习天数</div>
        </div>

        {/* 总学习时长 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
          <div className="mb-4 flex items-center justify-between">
            <TrendUp size={32} className="text-blue-500" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
            {statistics.totalStudyTime}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">总学习时长（分钟）</div>
        </div>
      </div>
    </>
  );
};

export const UserBasicInfo = memo(UserBasicInfoComponent);
