import React from 'react';
import { motion } from 'framer-motion';
import { QualityStats } from '../api';
import { Books, WarningCircle, CheckCircle, Clock } from '@phosphor-icons/react';

// Using Phosphor Icons as they seem to be used in the project (from package.json)
// If not, I'll fallback to text or check Icon.tsx again.
// package.json has "@phosphor-icons/react": "^2.1.10"

interface Props {
  stats?: QualityStats;
  loading: boolean;
}

const Card = ({ title, value, icon: Icon, color, delay }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="flex items-start justify-between rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
  >
    <div>
      <p className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
    </div>
    <div className={`rounded-lg p-3 ${color}`}>
      <Icon className="h-6 w-6 text-white" weight="fill" />
    </div>
  </motion.div>
);

export const StatsDashboard: React.FC<Props> = ({ stats, loading }) => {
  if (loading && !stats) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-700" />
        ))}
      </div>
    );
  }

  const formatDate = (date?: string) => {
    if (!date) return '从未';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card
        title="总单词数"
        value={stats?.totalWords || 0}
        icon={Books}
        color="bg-blue-500"
        delay={0}
      />
      <Card
        title="待处理问题"
        value={stats?.openIssues || 0}
        icon={WarningCircle}
        color="bg-amber-500"
        delay={0.1}
      />
      <Card
        title="已修复问题"
        value={stats?.fixedIssues || 0}
        icon={CheckCircle}
        color="bg-green-500"
        delay={0.2}
      />
      <Card
        title="上次检查"
        value={formatDate(stats?.lastCheck)}
        icon={Clock}
        color="bg-indigo-500"
        delay={0.3}
      />
    </div>
  );
};
