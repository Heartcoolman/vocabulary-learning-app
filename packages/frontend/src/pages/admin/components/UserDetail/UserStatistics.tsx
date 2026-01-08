import React, { memo } from 'react';

export interface UserStatisticsProps {
  masteryDistribution: Record<string, number>;
}

/**
 * 获取掌握程度标签
 */
const getMasteryLevelLabel = (level: number): string => {
  const labels = ['新单词', '初识', '熟悉', '掌握', '熟练', '精通'];
  return labels[level] || '未知';
};

/**
 * 获取掌握程度颜色
 */
const getMasteryLevelColor = (level: number): string => {
  const colors = [
    'text-gray-500 dark:text-gray-400',
    'text-blue-500',
    'text-green-500',
    'text-yellow-500',
    'text-orange-500',
    'text-purple-500',
  ];
  return colors[level] || 'text-gray-500 dark:text-gray-400';
};

/**
 * UserStatistics Component
 * 显示用户掌握程度分布
 */
const UserStatisticsComponent: React.FC<UserStatisticsProps> = ({ masteryDistribution }) => {
  return (
    <div className="mb-8 rounded-card border border-gray-200 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">掌握程度分布</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Object.entries(masteryDistribution).map(([level, count]) => {
          const levelNum = parseInt(level.replace('level', ''));
          return (
            <div
              key={level}
              className="rounded-button bg-gray-50 p-4 text-center dark:bg-slate-900"
            >
              <div className={`mb-1 text-2xl font-bold ${getMasteryLevelColor(levelNum)}`}>
                {count}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {getMasteryLevelLabel(levelNum)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const UserStatistics = memo(UserStatisticsComponent);

// 导出辅助函数供其他组件使用
export { getMasteryLevelLabel, getMasteryLevelColor };
