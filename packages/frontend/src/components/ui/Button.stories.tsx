import type { Meta, StoryObj } from '@storybook/react-vite';
import { vi } from 'vitest';
import { Button, ButtonVariant } from './Button';
import { Plus, ArrowRight, Trash, Check, Star } from '../Icon';

/**
 * # Button 按钮组件
 *
 * 按钮用于触发操作或事件，如提交表单、打开对话框、取消操作或执行删除操作。
 *
 * ## 特性
 * - 支持多种变体：primary, secondary, ghost, danger, success, warning
 * - 支持多种尺寸：xs, sm, md, lg, xl
 * - 支持加载状态和禁用状态
 * - 支持左右图标
 * - 支持全宽和图标按钮模式
 *
 * ## 使用方式
 * ```tsx
 * import { Button } from '@/components/ui/Button';
 *
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   点击我
 * </Button>
 * ```
 */
const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '通用按钮组件，支持多种变体、尺寸和状态。',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'success', 'warning'] as ButtonVariant[],
      description: '按钮变体样式',
      table: {
        type: { summary: 'ButtonVariant' },
        defaultValue: { summary: 'primary' },
      },
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: '按钮尺寸',
      table: {
        type: { summary: 'Size' },
        defaultValue: { summary: 'md' },
      },
    },
    loading: {
      control: 'boolean',
      description: '是否显示加载状态',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    fullWidth: {
      control: 'boolean',
      description: '是否占满容器宽度',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    iconOnly: {
      control: 'boolean',
      description: '是否为纯图标按钮',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    onClick: {
      action: 'clicked',
      description: '点击事件回调',
    },
  },
  args: {
    onClick: vi.fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ========================================
 * 默认状态
 * ======================================== */

/**
 * 默认按钮状态，使用 primary 变体和 md 尺寸
 */
export const Default: Story = {
  args: {
    children: '按钮',
    variant: 'primary',
    size: 'md',
  },
};

/* ========================================
 * 变体展示
 * ======================================== */

/**
 * 展示所有按钮变体
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="success">Success</Button>
      <Button variant="warning">Warning</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '按钮支持 6 种变体：primary（主要）、secondary（次要）、ghost（幽灵）、danger（危险）、success（成功）、warning（警告）。',
      },
    },
  },
};

/**
 * Primary 变体 - 用于主要操作
 */
export const Primary: Story = {
  args: {
    children: '主要按钮',
    variant: 'primary',
  },
};

/**
 * Secondary 变体 - 用于次要操作
 */
export const Secondary: Story = {
  args: {
    children: '次要按钮',
    variant: 'secondary',
  },
};

/**
 * Ghost 变体 - 用于轻量级操作
 */
export const Ghost: Story = {
  args: {
    children: '幽灵按钮',
    variant: 'ghost',
  },
};

/**
 * Danger 变体 - 用于危险操作
 */
export const Danger: Story = {
  args: {
    children: '危险按钮',
    variant: 'danger',
  },
};

/**
 * Success 变体 - 用于成功/确认操作
 */
export const Success: Story = {
  args: {
    children: '成功按钮',
    variant: 'success',
  },
};

/**
 * Warning 变体 - 用于警告操作
 */
export const Warning: Story = {
  args: {
    children: '警告按钮',
    variant: 'warning',
  },
};

/* ========================================
 * 尺寸展示
 * ======================================== */

/**
 * 展示所有按钮尺寸
 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="xs">超小</Button>
      <Button size="sm">小</Button>
      <Button size="md">中</Button>
      <Button size="lg">大</Button>
      <Button size="xl">超大</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '按钮支持 5 种尺寸：xs、sm、md、lg、xl。',
      },
    },
  },
};

/* ========================================
 * 状态展示
 * ======================================== */

/**
 * 加载状态
 */
export const Loading: Story = {
  args: {
    children: '加载中',
    loading: true,
  },
  parameters: {
    docs: {
      description: {
        story: '按钮可以显示加载状态，此时按钮会禁用并显示旋转图标。',
      },
    },
  },
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  args: {
    children: '禁用按钮',
    disabled: true,
  },
  parameters: {
    docs: {
      description: {
        story: '按钮可以被禁用，此时无法点击且显示为半透明状态。',
      },
    },
  },
};

/**
 * 所有状态对比
 */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm text-gray-500">正常</span>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm text-gray-500">加载中</span>
        <Button variant="primary" loading>
          Primary
        </Button>
        <Button variant="secondary" loading>
          Secondary
        </Button>
        <Button variant="danger" loading>
          Danger
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm text-gray-500">禁用</span>
        <Button variant="primary" disabled>
          Primary
        </Button>
        <Button variant="secondary" disabled>
          Secondary
        </Button>
        <Button variant="danger" disabled>
          Danger
        </Button>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '对比展示不同变体在正常、加载和禁用状态下的表现。',
      },
    },
  },
};

/* ========================================
 * 图标按钮
 * ======================================== */

/**
 * 带左侧图标
 */
export const WithLeftIcon: Story = {
  args: {
    children: '新建',
    leftIcon: <Plus size={16} />,
  },
  parameters: {
    docs: {
      description: {
        story: '按钮可以在文字左侧添加图标。',
      },
    },
  },
};

/**
 * 带右侧图标
 */
export const WithRightIcon: Story = {
  args: {
    children: '下一步',
    rightIcon: <ArrowRight size={16} />,
  },
  parameters: {
    docs: {
      description: {
        story: '按钮可以在文字右侧添加图标。',
      },
    },
  },
};

/**
 * 带双侧图标
 */
export const WithBothIcons: Story = {
  args: {
    children: '收藏',
    leftIcon: <Star size={16} />,
    rightIcon: <Check size={16} />,
  },
};

/**
 * 图标按钮展示
 */
export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button leftIcon={<Plus size={16} />}>新建</Button>
        <Button leftIcon={<Trash size={16} />} variant="danger">
          删除
        </Button>
        <Button rightIcon={<ArrowRight size={16} />} variant="secondary">
          下一步
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">纯图标按钮：</span>
        <Button iconOnly leftIcon={<Plus size={16} />} size="xs" aria-label="新建" />
        <Button iconOnly leftIcon={<Plus size={16} />} size="sm" aria-label="新建" />
        <Button iconOnly leftIcon={<Plus size={16} />} size="md" aria-label="新建" />
        <Button iconOnly leftIcon={<Plus size={16} />} size="lg" aria-label="新建" />
        <Button iconOnly leftIcon={<Plus size={16} />} size="xl" aria-label="新建" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '展示带图标的按钮和纯图标按钮（iconOnly 模式）。',
      },
    },
  },
};

/**
 * 纯图标按钮
 */
export const IconOnly: Story = {
  args: {
    iconOnly: true,
    leftIcon: <Plus size={18} />,
    'aria-label': '添加',
  },
  parameters: {
    docs: {
      description: {
        story: '纯图标按钮会显示为圆形，需要提供 aria-label 以保证无障碍访问性。',
      },
    },
  },
};

/* ========================================
 * 全宽按钮
 * ======================================== */

/**
 * 全宽按钮
 */
export const FullWidth: Story = {
  args: {
    children: '全宽按钮',
    fullWidth: true,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: '设置 fullWidth 属性可使按钮占满容器宽度。',
      },
    },
  },
};

/* ========================================
 * 交互示例
 * ======================================== */

/**
 * 交互示例 - 点击计数器
 */
export const InteractiveCounter: Story = {
  render: function Render() {
    const [count, setCount] = React.useState(0);
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-lg font-medium">点击次数：{count}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCount(Math.max(0, count - 1))}>
            减少
          </Button>
          <Button variant="primary" onClick={() => setCount(count + 1)}>
            增加
          </Button>
          <Button variant="ghost" onClick={() => setCount(0)}>
            重置
          </Button>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '一个简单的交互示例，展示按钮的点击事件处理。',
      },
    },
  },
};

/**
 * 交互示例 - 异步操作
 */
export const AsyncOperation: Story = {
  render: function Render() {
    const [loading, setLoading] = React.useState(false);
    const [saved, setSaved] = React.useState(false);

    const handleSave = async () => {
      setLoading(true);
      setSaved(false);
      // 模拟异步操作
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setLoading(false);
      setSaved(true);
    };

    return (
      <div className="flex flex-col items-center gap-4">
        <Button
          variant={saved ? 'success' : 'primary'}
          loading={loading}
          leftIcon={saved ? <Check size={16} /> : undefined}
          onClick={handleSave}
        >
          {saved ? '已保存' : '保存'}
        </Button>
        <p className="text-sm text-gray-500">
          {loading ? '正在保存...' : saved ? '保存成功！' : '点击按钮保存'}
        </p>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示异步操作时的加载状态和完成状态转换。',
      },
    },
  },
};

// 需要导入 React 用于 render 函数中的 useState
import React from 'react';
