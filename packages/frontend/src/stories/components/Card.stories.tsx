import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Card - 卡片组件展示
 *
 * 展示项目中使用的各种卡片样式，包括质感卡片、毛玻璃卡片、骨架屏等。
 */
const meta = {
  title: 'Components/Card',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '卡片是内容展示的核心容器组件，提供多种视觉风格。',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 质感卡片
 *
 * 使用多层阴影和顶部光带效果，提供立体感和高级质感。
 */
export const Elevated: Story = {
  render: () => (
    <div className="card-elevated w-80 p-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">质感卡片</h3>
      <p className="text-gray-600">多层阴影配合顶部光带效果，悬浮时有微妙的上升动画。</p>
    </div>
  ),
};

/**
 * 毛玻璃卡片
 *
 * 细腻渐变背景配合模糊效果，提供现代化的视觉体验。
 */
export const Glass: Story = {
  render: () => (
    <div
      className="rounded-card p-8"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <div className="card-glass w-80 p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">毛玻璃卡片</h3>
        <p className="text-gray-600">半透明背景配合模糊效果，适合在彩色背景上使用。</p>
      </div>
    </div>
  ),
};

/**
 * 简单卡片
 *
 * 基础的边框卡片样式，适合列表项展示。
 */
export const Simple: Story = {
  render: () => (
    <div className="w-80 rounded-card border border-gray-200 bg-white p-6 shadow-soft">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">简单卡片</h3>
      <p className="text-gray-600">基础边框样式，轻量级的卡片设计。</p>
    </div>
  ),
};

/**
 * 可点击卡片
 *
 * 带有交互效果的卡片，适合作为导航入口。
 */
export const Clickable: Story = {
  render: () => (
    <button className="card-elevated w-80 p-6 text-left transition-all duration-g3-fast hover:scale-[1.02]">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">可点击卡片</h3>
      <p className="text-gray-600">点击此卡片可以触发相应操作。悬浮时有放大效果。</p>
      <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600">
        查看详情
        <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  ),
};

/**
 * 带图片卡片
 *
 * 包含图片的卡片布局。
 */
export const WithImage: Story = {
  render: () => (
    <div className="card-elevated w-80 overflow-hidden">
      <div className="h-40 bg-gradient-to-br from-blue-400 to-blue-600" />
      <div className="p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">带图片卡片</h3>
        <p className="text-gray-600">顶部图片区域配合下方内容区域的常见布局。</p>
      </div>
    </div>
  ),
};

/**
 * 水平卡片
 *
 * 图片和内容水平排列的布局。
 */
export const Horizontal: Story = {
  render: () => (
    <div className="card-elevated flex w-[480px] overflow-hidden">
      <div className="h-auto w-40 flex-shrink-0 bg-gradient-to-br from-purple-400 to-purple-600" />
      <div className="p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">水平卡片</h3>
        <p className="text-gray-600">图片和内容水平排列的布局，适合列表展示。</p>
      </div>
    </div>
  ),
};

/**
 * 骨架屏卡片
 *
 * 加载状态时的占位卡片。
 */
export const Skeleton: Story = {
  render: () => (
    <div className="skeleton-card w-80">
      <div className="skeleton-circle mb-4 h-12 w-12" />
      <div className="skeleton-line mb-2" />
      <div className="skeleton-line-short mb-4" />
      <div className="skeleton-line mb-2" />
      <div className="skeleton-line" />
    </div>
  ),
};

/**
 * 卡片列表
 *
 * 多张卡片组成的列表布局。
 */
export const CardList: Story = {
  render: () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-elevated flex w-[480px] items-center gap-4 p-4">
          <div className="h-16 w-16 flex-shrink-0 rounded-button bg-gradient-to-br from-blue-400 to-blue-600" />
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">卡片标题 {i}</h4>
            <p className="text-sm text-gray-600">这是卡片的简要描述内容。</p>
          </div>
          <button className="btn-ghost">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  ),
};

/**
 * 统计卡片
 *
 * 用于展示数据统计的卡片样式。
 */
export const Stats: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="card-elevated w-40 p-4 text-center">
        <div className="mb-2 text-3xl font-bold text-blue-600">128</div>
        <div className="text-sm text-gray-600">已学单词</div>
      </div>
      <div className="card-elevated w-40 p-4 text-center">
        <div className="mb-2 text-3xl font-bold text-green-600">85%</div>
        <div className="text-sm text-gray-600">正确率</div>
      </div>
      <div className="card-elevated w-40 p-4 text-center">
        <div className="mb-2 text-3xl font-bold text-purple-600">7</div>
        <div className="text-sm text-gray-600">连续天数</div>
      </div>
    </div>
  ),
};

/**
 * 带状态的卡片
 *
 * 展示不同状态的卡片变体。
 */
export const WithStatus: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="card-elevated w-60 border-l-4 border-l-green-500 p-4">
        <div className="mb-1 text-sm font-medium text-green-600">成功</div>
        <p className="text-gray-600">操作已成功完成</p>
      </div>
      <div className="card-elevated w-60 border-l-4 border-l-amber-500 p-4">
        <div className="mb-1 text-sm font-medium text-amber-600">警告</div>
        <p className="text-gray-600">请注意检查内容</p>
      </div>
      <div className="card-elevated w-60 border-l-4 border-l-red-500 p-4">
        <div className="mb-1 text-sm font-medium text-red-600">错误</div>
        <p className="text-gray-600">��作失败，请重试</p>
      </div>
    </div>
  ),
};
