/**
 * 配置预览组件
 *
 * 显示参数变更前后对比
 */
import { memo } from 'react';
import { ArrowRight } from '@phosphor-icons/react';

export interface ConfigPreviewItem {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export interface ConfigPreviewProps {
  items: ConfigPreviewItem[];
  title?: string;
}

export const ConfigPreview = memo(function ConfigPreview({
  items,
  title = '配置变更预览',
}: ConfigPreviewProps) {
  const changedItems = items.filter((item) => item.changed);

  if (changedItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-button border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
      <h4 className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-200">{title}</h4>
      <div className="space-y-2">
        {changedItems.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className="min-w-[80px] text-gray-600 dark:text-gray-400">{item.label}:</span>
            <span className="text-gray-500 line-through dark:text-gray-500">{item.before}</span>
            <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-amber-700 dark:text-amber-300">{item.after}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
