import React from 'react';

/**
 * LearningObjectivesSkeleton - 学习目标页面骨架屏
 */
export function LearningObjectivesSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8">
      <span className="sr-only" role="status" aria-live="polite">
        加载中...
      </span>
      {/* 标题骨架 */}
      <div className="mb-8 h-8 w-48 rounded bg-gray-200 dark:bg-slate-700" />

      {/* 模式选择骨架 */}
      <div className="mb-8 rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-card border-2 border-gray-200 p-5 dark:border-slate-600"
            >
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-200 dark:bg-slate-700" />
              <div className="mx-auto mb-2 h-4 w-20 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="mx-auto h-3 w-28 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      </div>

      {/* 配置显示骨架 */}
      <div className="rounded-card border border-gray-100 bg-white p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="space-y-4">
          <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200 dark:bg-slate-600" />
            <div className="h-5 w-24 rounded bg-gray-200 dark:bg-slate-600" />
          </div>
          <div className="rounded-button bg-gray-50 p-4 dark:bg-slate-700">
            <div className="mb-3 h-3 w-16 rounded bg-gray-200 dark:bg-slate-600" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-20 rounded bg-gray-200 dark:bg-slate-600" />
                  <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-slate-600" />
                  <div className="h-3 w-10 rounded bg-gray-200 dark:bg-slate-600" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LearningObjectivesSkeleton;
