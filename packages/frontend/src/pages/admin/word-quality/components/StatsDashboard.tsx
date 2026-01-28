import React from 'react';
import { motion } from 'framer-motion';
import { QualityStats } from '../api';
import { Books, WarningCircle, CheckCircle, Clock } from '../../../../components/Icon';

interface Props {
  stats?: QualityStats;
  loading: boolean;
}

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay: number;
}

const Card = ({ title, value, icon: Icon, color, delay }: CardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="flex items-start justify-between rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800"
  >
    <div>
      <p className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
    </div>
    <div className={`rounded-button p-3 ${color}`}>
      <Icon className="h-6 w-6 text-white" />
    </div>
  </motion.div>
);

export const StatsDashboard: React.FC<Props> = ({ stats, loading }) => {
  if (loading && !stats) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-gray-100 dark:bg-slate-700" />
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
        color="bg-blue-500"
        delay={0.3}
      />
    </div>
  );
};
