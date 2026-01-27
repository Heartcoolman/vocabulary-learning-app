/**
 * PlannedFeature - 计划中功能占位组件
 *
 * 用于显示尚未实现但已规划的功能
 */

import { Clock, Wrench } from '@/components/Icon';

interface PlannedFeatureProps {
  title: string;
  description?: string;
  expectedVersion?: string;
  className?: string;
}

export function PlannedFeature({
  title,
  description,
  expectedVersion = '1.8.0',
  className = '',
}: PlannedFeatureProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-card border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-slate-600 dark:bg-slate-800/50 ${className}`}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
        <Wrench className="h-8 w-8 text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mb-4 max-w-md text-sm text-gray-500 dark:text-slate-400">{description}</p>
      )}
      <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
        <Clock className="h-4 w-4" />
        <span>预计上线版本: v{expectedVersion}</span>
      </div>
    </div>
  );
}

export function FeatureUpgrading({ className = '' }: { className?: string }) {
  return (
    <div className={`flex min-h-[400px] flex-col items-center justify-center p-8 ${className}`}>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30">
        <Wrench className="h-10 w-10 text-blue-500 dark:text-blue-400" />
      </div>
      <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-white">功能升级中</h2>
      <p className="mb-4 max-w-sm text-center text-gray-500 dark:text-slate-400">
        该功能正在升级优化，敬请期待 v1.8.0 版本
      </p>
      <div className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
        <Clock className="h-4 w-4" />
        <span>即将上线</span>
      </div>
    </div>
  );
}

export default PlannedFeature;
