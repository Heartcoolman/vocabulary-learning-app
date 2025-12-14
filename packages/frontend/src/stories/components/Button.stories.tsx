import type { Meta, StoryObj } from '@storybook/react-vite';

// 定义按钮属性接口用于 Storybook
interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

// 基础按钮渲染函数
const ButtonTemplate = ({ children, className, disabled, onClick }: ButtonProps) => (
  <button className={className} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

/**
 * Button - 按钮组件展示
 *
 * 展示项目中使用的各种按钮样式，包括主要按钮、次要按钮、幽灵按钮等。
 * 这些按钮样式定义在 `index.css` 中的 `@layer components` 部分。
 */
const meta = {
  title: 'Components/Button',
  component: ButtonTemplate,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '按钮组件是用户交互的核心元素，提供多种变体以适应不同的使用场景。',
      },
    },
  },
  argTypes: {
    children: {
      control: 'text',
      description: '按钮文本内容',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    onClick: {
      action: 'clicked',
      description: '点击事件处理函数',
    },
  },
} satisfies Meta<typeof ButtonTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 主要按钮 - 用于核心操作
 *
 * 使用渐变背景、内高光、悬浮阴影等效果，适用于 CTA、提交、确认等核心操作。
 */
export const Primary: Story = {
  render: (args) => (
    <ButtonTemplate {...args} className="btn-primary">
      {args.children || '主要按钮'}
    </ButtonTemplate>
  ),
  args: {
    children: '主要按钮',
  },
};

/**
 * 次要按钮 - 用于辅助操作
 *
 * 玻璃态背景配合微妙边框，适用于取消、返回等辅助操作。
 */
export const Secondary: Story = {
  render: (args) => (
    <ButtonTemplate {...args} className="btn-secondary">
      {args.children || '次要按钮'}
    </ButtonTemplate>
  ),
  args: {
    children: '次要按钮',
  },
};

/**
 * 幽灵按钮 - 轻量级操作
 *
 * 透明背景，适用于文字链接风格的轻量级操作。
 */
export const Ghost: Story = {
  render: (args) => (
    <ButtonTemplate {...args} className="btn-ghost">
      {args.children || '幽灵按钮'}
    </ButtonTemplate>
  ),
  args: {
    children: '幽灵按钮',
  },
};

/**
 * 禁用状态
 *
 * 展示各种按钮在禁用状态下的样式。
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex gap-4">
      <button className="btn-primary" disabled>
        主要按钮
      </button>
      <button className="btn-secondary" disabled>
        次要按钮
      </button>
      <button className="btn-ghost" disabled>
        幽灵按钮
      </button>
    </div>
  ),
};

/**
 * 按钮尺寸变体
 *
 * 通过调整 padding 和字体大小实现不同尺寸的按钮。
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <button className="btn-primary px-3 py-1.5 text-sm">小号</button>
      <button className="btn-primary">默认</button>
      <button className="btn-primary px-6 py-3 text-lg">大号</button>
    </div>
  ),
};

/**
 * 带图标的按钮
 *
 * 按钮可以配合图标使用，提升视觉效果和可识别性。
 */
export const WithIcon: Story = {
  render: () => (
    <div className="flex gap-4">
      <button className="btn-primary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        添加
      </button>
      <button className="btn-secondary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        上传
      </button>
    </div>
  ),
};

/**
 * 按钮组合
 *
 * 展示按钮在实际场景中的组合使用方式。
 */
export const ButtonGroup: Story = {
  render: () => (
    <div className="flex gap-2 rounded-button border border-gray-200 p-4">
      <button className="btn-primary">确认</button>
      <button className="btn-secondary">取消</button>
    </div>
  ),
};

/**
 * 全宽按钮
 *
 * 适用于移动端或表单提交场景的全宽按钮。
 */
export const FullWidth: Story = {
  render: () => (
    <div className="w-80 space-y-3">
      <button className="btn-primary w-full">登录</button>
      <button className="btn-secondary w-full">注册新账号</button>
    </div>
  ),
};
