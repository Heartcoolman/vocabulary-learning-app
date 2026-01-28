import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Navigation - 导航组件
 *
 * 应用的顶部导航栏，支持桌面端和移动端响应式布局。
 *
 * 注意：实际的 Navigation 组件依赖 AuthContext 和 React Router，
 * 这里使用静态 HTML 展示导航栏的视觉设计。
 */
const meta = {
  title: 'Components/Navigation',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: '顶部导航栏组件，提供应用内页面导航，支持下拉菜单和移动端响应式。',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// 导航链接类名
const linkClass = (active = false) =>
  `px-4 py-2 rounded-button text-base font-medium transition-all duration-g3-fast ${
    active ? 'bg-blue-500 text-white shadow-soft' : 'text-gray-700 hover:bg-gray-100'
  }`;

/**
 * 默认状态
 *
 * 未登录状态下的导航栏。
 */
export const Default: Story = {
  render: () => (
    <div className="min-h-[400px] bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <nav className="flex items-center space-x-2">
              <a href="#" className={linkClass(true)}>
                学习
              </a>
              <a href="#" className={linkClass()}>
                词库管理
              </a>
              <a href="#" className={linkClass()}>
                学习设置
              </a>
              <a href="#" className={linkClass()}>
                学习历史
              </a>
              <a href="#" className={linkClass()}>
                登录
              </a>
            </nav>
          </div>
        </div>
      </header>

      <div className="p-8 pt-24">
        <p className="text-gray-600">页面内容区域</p>
      </div>
    </div>
  ),
};

/**
 * 已登录状态
 *
 * 用户登录后显示更���导航选项。
 */
export const LoggedIn: Story = {
  render: () => (
    <div className="min-h-[400px] bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <nav className="flex items-center space-x-2">
              <a href="#" className={linkClass()}>
                学习
              </a>
              <a href="#" className={linkClass()}>
                词库管理
              </a>
              <a href="#" className={linkClass()}>
                学习设置
              </a>
              <a href="#" className={linkClass()}>
                学习历史
              </a>

              {/* 学习洞察下拉菜单 */}
              <div className="relative">
                <button className="flex items-center gap-1 rounded-button px-4 py-2 text-base font-medium text-gray-700 transition-all duration-g3-fast hover:bg-gray-100">
                  学习洞察
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              <a href="#" className={linkClass()}>
                张三
              </a>
            </nav>
          </div>
        </div>
      </header>

      <div className="p-8 pt-24">
        <p className="text-gray-600">页面内容区域</p>
      </div>
    </div>
  ),
};

/**
 * 下拉菜单展开
 *
 * 展示学习洞察下拉菜单的展开状态。
 */
export const WithDropdown: Story = {
  render: () => (
    <div className="min-h-[400px] bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <nav className="flex items-center space-x-2">
              <a href="#" className={linkClass()}>
                学习
              </a>
              <a href="#" className={linkClass()}>
                词库管理
              </a>

              {/* 学习洞察下拉菜单 - 展开状态 */}
              <div className="relative">
                <button className="flex items-center gap-1 rounded-button bg-blue-500 px-4 py-2 text-base font-medium text-white shadow-soft">
                  学习洞察
                  <svg
                    className="h-4 w-4 rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-button border border-gray-200 bg-white py-1 shadow-elevated">
                  {[
                    { icon: 'ChartBar', label: '学习统计' },
                    { icon: 'Clock', label: '学习时机' },
                    { icon: 'TrendUp', label: '趋势分析' },
                    { icon: 'Trophy', label: '成就徽章' },
                    { icon: 'Calendar', label: '学习计划' },
                    { icon: 'Target', label: '单词精通度' },
                    { icon: 'User', label: '习惯画像' },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href="#"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <span className="text-gray-500">{item.icon}</span>
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>

              <a href="#" className={linkClass()}>
                张三
              </a>
            </nav>
          </div>
        </div>
      </header>

      <div className="p-8 pt-24">
        <p className="text-gray-600">页面内容区域</p>
      </div>
    </div>
  ),
};

/**
 * 移动端视图
 *
 * 在移动端宽度下的汉堡菜单导航。
 */
export const Mobile: Story = {
  render: () => (
    <div className="min-h-[400px] w-[375px] bg-gray-50">
      <header className="border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <button className="rounded-button p-2 text-gray-700 hover:bg-gray-100">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="p-4">
        <p className="text-gray-600">页面内容区域</p>
      </div>
    </div>
  ),
};

/**
 * 移动端菜单展开
 *
 * 移动端汉堡菜单展开状态。
 */
export const MobileMenuOpen: Story = {
  render: () => (
    <div className="min-h-[600px] w-[375px] bg-gray-50">
      <header className="border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <button className="rounded-button p-2 text-gray-700 hover:bg-gray-100">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* 移动端菜单 */}
          <nav className="mt-4 flex flex-col space-y-2 border-t border-gray-200 pt-4">
            <a
              href="#"
              className="block rounded-button bg-blue-500 px-4 py-3 text-base font-medium text-white shadow-soft"
            >
              学习
            </a>
            <a
              href="#"
              className="block rounded-button px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              词库管理
            </a>
            <a
              href="#"
              className="block rounded-button px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              学习设置
            </a>
            <a
              href="#"
              className="block rounded-button px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              学习历史
            </a>

            <div className="my-2 border-t border-gray-200" />

            <div className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              学习洞察
            </div>
            {[
              '学习统计',
              '学习时机',
              '趋势分析',
              '成就徽章',
              '学习计划',
              '单词精通度',
              '习惯画像',
            ].map((item) => (
              <a
                key={item}
                href="#"
                className="block rounded-button px-4 py-3 pl-8 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                {item}
              </a>
            ))}

            <div className="my-2 border-t border-gray-200" />

            <a
              href="#"
              className="block rounded-button px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              登录
            </a>
          </nav>
        </div>
      </header>
    </div>
  ),
};

/**
 * 滚动时固定
 *
 * 展示导航栏的固定定位效果。
 */
export const Sticky: Story = {
  render: () => (
    <div className="min-h-[1200px] bg-gray-50">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-white/80 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="#" className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-gray-900">词汇学习</h1>
            </a>

            <nav className="flex items-center space-x-2">
              <a href="#" className={linkClass(true)}>
                学习
              </a>
              <a href="#" className={linkClass()}>
                词库管理
              </a>
              <a href="#" className={linkClass()}>
                学习设置
              </a>
              <a href="#" className={linkClass()}>
                登录
              </a>
            </nav>
          </div>
        </div>
      </header>

      <div className="space-y-4 p-8 pt-24">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="rounded-button border border-gray-200 bg-white p-4 shadow-soft">
            <h3 className="font-medium text-gray-900">内容块 {i + 1}</h3>
            <p className="text-gray-600">滚动页面查看导航栏的固定效果。导航栏会保持在页面顶部。</p>
          </div>
        ))}
      </div>
    </div>
  ),
};
