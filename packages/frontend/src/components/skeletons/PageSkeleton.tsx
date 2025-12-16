/**
 * 页面骨架屏组件
 * 用于页面加载时显示，替代全屏旋转加载器，提供更好的用户体验
 */

/**
 * 通用页面骨架屏 - 适用于大多数页面
 */
export const PageSkeleton = () => (
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="mx-auto max-w-7xl animate-pulse">
      {/* 页面标题骨架 */}
      <div className="mb-6 h-8 w-1/4 rounded bg-gray-200"></div>

      {/* 内容区域骨架 */}
      <div className="space-y-4">
        <div className="h-4 w-full rounded bg-gray-200"></div>
        <div className="h-4 w-5/6 rounded bg-gray-200"></div>
        <div className="h-4 w-4/6 rounded bg-gray-200"></div>
      </div>

      {/* 卡片网格骨架 */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-button bg-gray-200"></div>
        <div className="h-32 rounded-button bg-gray-200"></div>
        <div className="h-32 rounded-button bg-gray-200"></div>
      </div>

      {/* 列表骨架 */}
      <div className="mt-8 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center space-x-4 rounded-button bg-white p-4 shadow-soft"
          >
            <div className="h-12 w-12 rounded-full bg-gray-200"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200"></div>
              <div className="h-3 w-1/2 rounded bg-gray-200"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * 简洁版骨架屏 - 用于小型页面或模态框
 */
export const CompactSkeleton = () => (
  <div className="animate-pulse p-4">
    <div className="mb-4 h-6 w-1/3 rounded bg-gray-200"></div>
    <div className="space-y-3">
      <div className="h-4 w-full rounded bg-gray-200"></div>
      <div className="h-4 w-5/6 rounded bg-gray-200"></div>
      <div className="h-4 w-4/6 rounded bg-gray-200"></div>
    </div>
  </div>
);

/**
 * 卡片骨架屏 - 用于卡片式布局页面
 */
export const CardSkeleton = () => (
  <div className="animate-pulse rounded-button bg-white p-6 shadow-soft">
    <div className="mb-4 h-6 w-1/2 rounded bg-gray-200"></div>
    <div className="space-y-3">
      <div className="h-4 w-full rounded bg-gray-200"></div>
      <div className="h-4 w-3/4 rounded bg-gray-200"></div>
    </div>
    <div className="mt-4 flex space-x-2">
      <div className="h-8 w-20 rounded bg-gray-200"></div>
      <div className="h-8 w-20 rounded bg-gray-200"></div>
    </div>
  </div>
);

/**
 * 统计页面骨架屏 - 适用于数据统计类页面
 */
export const StatsSkeleton = () => (
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="mx-auto max-w-7xl animate-pulse">
      {/* 标题 */}
      <div className="mb-6 h-8 w-1/4 rounded bg-gray-200"></div>

      {/* 统计卡片 */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-button bg-white p-4 shadow-soft">
            <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
            <div className="h-8 w-3/4 rounded bg-gray-200"></div>
          </div>
        ))}
      </div>

      {/* 图表区域 */}
      <div className="rounded-button bg-white p-6 shadow-soft">
        <div className="mb-4 h-6 w-1/4 rounded bg-gray-200"></div>
        <div className="h-64 w-full rounded bg-gray-200"></div>
      </div>
    </div>
  </div>
);

/**
 * 词库/列表页面骨架屏
 */
export const ListSkeleton = () => (
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="mx-auto max-w-7xl animate-pulse">
      {/* 标题和搜索 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-1/4 rounded bg-gray-200"></div>
        <div className="h-10 w-64 rounded bg-gray-200"></div>
      </div>

      {/* 列表项 */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-button bg-white p-4 shadow-soft"
          >
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 rounded bg-gray-200"></div>
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200"></div>
                <div className="h-3 w-48 rounded bg-gray-200"></div>
              </div>
            </div>
            <div className="h-8 w-24 rounded bg-gray-200"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default PageSkeleton;
