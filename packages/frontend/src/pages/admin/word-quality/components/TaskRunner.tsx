import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckType, Task } from '../api';
import { TaskProgress } from '../hooks';
import { Play, CircleNotch } from '@phosphor-icons/react';

interface Props {
  onStart: (type: CheckType) => void;
  onCancel: () => void;
  loading: boolean;
  progress: TaskProgress | null;
  activeTask: Task | null;
}

const CHECK_TYPES: { value: CheckType; label: string }[] = [
  { value: 'FULL', label: '全面体检 (Full Check)' },
  { value: 'SPELLING', label: '音标/拼写 (Spelling)' },
  { value: 'MEANING', label: '释义准确性 (Meaning)' },
  { value: 'EXAMPLE', label: '例句质量 (Example)' },
];

export const TaskRunner: React.FC<Props> = ({
  onStart,
  onCancel,
  loading,
  progress,
  activeTask,
}) => {
  const [selectedType, setSelectedType] = useState<CheckType>('FULL');

  // Determine if running based on SSE or API task status
  const isSSERunning = progress?.status === 'running';
  const isTaskRunning = activeTask?.status === 'running';
  const isRunning = isSSERunning || isTaskRunning;

  // Merge data: SSE takes precedence for real-time updates
  const total = progress?.totalItems ?? activeTask?.totalItems ?? 0;
  const processed = progress?.processedItems ?? activeTask?.processedItems ?? 0;
  const issues = progress?.issuesFound ?? activeTask?.issuesFound ?? 0;
  const current = progress?.currentItem ?? activeTask?.currentItem;

  const percent = progress?.percentage ?? (total > 0 ? (processed / total) * 100 : 0);
  const remaining = Math.max(0, total - processed);

  return (
    <div className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        {/* Left: Controls */}
        <div className="w-full flex-1">
          <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">质量检查任务</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            选择检查维度，AI 将自动分析词库中的潜在问题。
          </p>
        </div>

        {/* Right: Action Area */}
        <div className="flex w-full items-center gap-3 md:w-auto">
          {!isRunning ? (
            <>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as CheckType)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300"
                disabled={loading}
              >
                {CHECK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onStart(selectedType)}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <CircleNotch className="h-5 w-5 animate-spin" />
                ) : (
                  <Play weight="fill" className="h-5 w-5" />
                )}
                启动检查
              </button>
            </>
          ) : (
            <div className="flex w-full min-w-[300px] items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span>正在检查: {current || '处理中...'}</span>
                  <span>{Math.round(percent)}%</span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                  <motion.div
                    className="h-full rounded-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                  <span>剩余: {remaining}</span>
                  <span>总计: {total}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="whitespace-nowrap rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Result Stats during run */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 grid grid-cols-4 gap-4 divide-x divide-gray-100 border-t border-gray-100 pt-4 text-center dark:divide-slate-700 dark:border-slate-700"
          >
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">进度</div>
              <div className="font-mono font-semibold dark:text-white">
                {processed} / {total}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">剩余</div>
              <div className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                {remaining}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">发现问题</div>
              <div className="font-mono font-semibold text-amber-600">{issues}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">状态</div>
              <div className="flex items-center justify-center gap-1 font-mono font-semibold text-blue-600">
                <CircleNotch className="h-3 w-3 animate-spin" />
                进行中
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
