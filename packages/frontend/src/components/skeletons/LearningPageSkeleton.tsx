export const LearningPageSkeleton = () => (
  <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-900">
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-3 pb-24">
      <div className="w-full animate-pulse space-y-3">
        {/* 进度条骨架 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700" />
        </div>

        {/* 单词卡片骨架 */}
        <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-8 w-32 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="h-5 w-20 rounded bg-gray-200 dark:bg-slate-700" />
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700" />
          </div>
        </div>

        {/* 选项骨架 */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 rounded-button border border-gray-200/60 bg-white/80 dark:border-slate-700 dark:bg-slate-800/80"
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default LearningPageSkeleton;
