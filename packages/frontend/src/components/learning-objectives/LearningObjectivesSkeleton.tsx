import React from 'react';

/**
 * LearningObjectivesSkeleton - 学习目标页面骨架屏
 */
export function LearningObjectivesSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8">
      {/* 标题骨架 */}
      <div className="mb-8 h-8 w-48 rounded bg-gray-200" />

      {/* 模式选择骨架 */}
      <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border-2 border-gray-200 p-5">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-200" />
              <div className="mx-auto mb-2 h-4 w-20 rounded bg-gray-200" />
              <div className="mx-auto h-3 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>

      {/* 配置显示骨架 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
            <div className="h-5 w-24 rounded bg-gray-200" />
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="mb-3 h-3 w-16 rounded bg-gray-200" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-20 rounded bg-gray-200" />
                  <div className="h-2 flex-1 rounded-full bg-gray-200" />
                  <div className="h-3 w-10 rounded bg-gray-200" />
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
