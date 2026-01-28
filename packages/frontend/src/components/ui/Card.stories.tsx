import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardFooter, CardVariant } from './Card';
import { Button } from './Button';
import { DotsThreeVertical, Star, Check, User, Target } from '../Icon';

/**
 * # Card 卡片组件
 *
 * 卡片是一种容器组件，用于展示相关信息的集合。
 *
 * ## 特性
 * - 支持多种变体：elevated, outlined, filled, glass
 * - 支持可点击和选中状态
 * - 支持多种内边距：none, sm, md, lg
 * - 提供 CardHeader、CardContent、CardFooter 子组件
 *
 * ## 使用方式
 * ```tsx
 * import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
 *
 * <Card variant="elevated">
 *   <CardHeader title="标题" subtitle="副标题" />
 *   <CardContent>内容区域</CardContent>
 *   <CardFooter>
 *     <Button>操作</Button>
 *   </CardFooter>
 * </Card>
 * ```
 */
const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '卡片容器组件，用于展示相关信息的集合。',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['elevated', 'outlined', 'filled', 'glass'] as CardVariant[],
      description: '卡片变体样式',
      table: {
        type: { summary: 'CardVariant' },
        defaultValue: { summary: 'elevated' },
      },
    },
    clickable: {
      control: 'boolean',
      description: '是否可点击（带悬浮效果）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    selected: {
      control: 'boolean',
      description: '是否选中状态',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
      description: '内边距大小',
      table: {
        type: { summary: "'none' | 'sm' | 'md' | 'lg'" },
        defaultValue: { summary: 'md' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/* ========================================
 * 默认状态
 * ======================================== */

/**
 * 默认卡片状态
 */
export const Default: Story = {
  args: {
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">卡片标题</h3>
        <p className="mt-2 text-sm text-gray-600">这是卡片的内容区域，你可以在这里放置任何内容。</p>
      </div>
    ),
  },
};

/* ========================================
 * 变体展示
 * ======================================== */

/**
 * 展示所有卡片变体
 */
export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card variant="elevated" className="w-64">
        <h3 className="font-semibold text-gray-900">Elevated</h3>
        <p className="mt-2 text-sm text-gray-600">带阴影的悬浮卡片</p>
      </Card>
      <Card variant="outlined" className="w-64">
        <h3 className="font-semibold text-gray-900">Outlined</h3>
        <p className="mt-2 text-sm text-gray-600">带边框的卡片</p>
      </Card>
      <Card variant="filled" className="w-64">
        <h3 className="font-semibold text-gray-900">Filled</h3>
        <p className="mt-2 text-sm text-gray-600">填充背景的卡片</p>
      </Card>
      <Card variant="glass" className="w-64">
        <h3 className="font-semibold text-gray-900">Glass</h3>
        <p className="mt-2 text-sm text-gray-600">毛玻璃效果卡片</p>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '卡片支持 4 种变体：elevated（悬浮）、outlined（描边）、filled（填充）、glass（毛玻璃）。',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="rounded-card bg-gradient-to-br from-blue-50 to-purple-50 p-8">
        <Story />
      </div>
    ),
  ],
};

/**
 * Elevated ���体
 */
export const Elevated: Story = {
  args: {
    variant: 'elevated',
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">Elevated 卡片</h3>
        <p className="mt-2 text-sm text-gray-600">带柔和阴影的悬浮效果</p>
      </div>
    ),
  },
};

/**
 * Outlined 变体
 */
export const Outlined: Story = {
  args: {
    variant: 'outlined',
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">Outlined 卡片</h3>
        <p className="mt-2 text-sm text-gray-600">简洁的边框样式</p>
      </div>
    ),
  },
};

/**
 * Filled 变体
 */
export const Filled: Story = {
  args: {
    variant: 'filled',
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">Filled 卡片</h3>
        <p className="mt-2 text-sm text-gray-600">灰色背景填充效果</p>
      </div>
    ),
  },
};

/**
 * Glass 变体
 */
export const Glass: Story = {
  args: {
    variant: 'glass',
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">Glass 卡片</h3>
        <p className="mt-2 text-sm text-gray-600">毛玻璃透明效果</p>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div className="rounded-card bg-gradient-to-br from-blue-400 to-purple-500 p-8">
        <Story />
      </div>
    ),
  ],
};

/* ========================================
 * 内边距展示
 * ======================================== */

/**
 * 展示所有内边距
 */
export const AllPaddings: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card padding="none" variant="outlined">
        <div className="bg-blue-50 p-2 text-center text-sm">padding: none</div>
      </Card>
      <Card padding="sm" variant="outlined">
        <div className="bg-blue-50 text-center text-sm">padding: sm</div>
      </Card>
      <Card padding="md" variant="outlined">
        <div className="bg-blue-50 text-center text-sm">padding: md</div>
      </Card>
      <Card padding="lg" variant="outlined">
        <div className="bg-blue-50 text-center text-sm">padding: lg</div>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '卡片支持 4 种内边距：none（无）、sm（小）、md（中）、lg（大）。',
      },
    },
  },
};

/* ========================================
 * 可点击和选中状态
 * ======================================== */

/**
 * 可点击卡片
 */
export const Clickable: Story = {
  args: {
    clickable: true,
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">可点击卡片</h3>
        <p className="mt-2 text-sm text-gray-600">悬停时会有上浮效果，点击时会有按下效果。</p>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: '设置 clickable 属性可使卡片具有悬浮和点击效果。',
      },
    },
  },
};

/**
 * 选中状态
 */
export const Selected: Story = {
  args: {
    selected: true,
    children: (
      <div className="w-72">
        <h3 className="font-semibold text-gray-900">选中的卡片</h3>
        <p className="mt-2 text-sm text-gray-600">选中状态会显示蓝色边框高亮。</p>
      </div>
    ),
  },
};

/**
 * 交互示例 - 可选择卡片组
 */
export const SelectableCards: Story = {
  render: function Render() {
    const [selected, setSelected] = useState<number | null>(null);

    const plans = [
      { id: 1, name: '免费版', price: '¥0/月', features: ['基础功能', '1GB 存储'] },
      { id: 2, name: '专业版', price: '¥99/月', features: ['所有功能', '100GB 存储', '优先支持'] },
      {
        id: 3,
        name: '企业版',
        price: '¥299/月',
        features: ['所有功能', '无限存储', '专属客服', 'API 访问'],
      },
    ];

    return (
      <div className="flex gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            clickable
            selected={selected === plan.id}
            onClick={() => setSelected(plan.id)}
            className="w-56"
          >
            <h3 className="font-semibold text-gray-900">{plan.name}</h3>
            <p className="mt-1 text-2xl font-bold text-blue-600">{plan.price}</p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check size={14} className="text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '展示可选择的卡片组，常用于套餐选择等场景。',
      },
    },
  },
};

/* ========================================
 * 子组件使用
 * ======================================== */

/**
 * 完整卡片结构
 */
export const WithSubComponents: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader
        title="项目标题"
        subtitle="这是项目的简短描述"
        action={
          <Button variant="ghost" iconOnly size="sm">
            <DotsThreeVertical size={18} />
          </Button>
        }
      />
      <CardContent>
        <p className="text-gray-600">
          这是卡片的主要内容区域。你可以在这里放置任何信息， 包括文本、图片、列表等。
        </p>
      </CardContent>
      <CardFooter divider>
        <Button variant="ghost" size="sm">
          取消
        </Button>
        <Button size="sm">确认</Button>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: '使用 CardHeader、CardContent、CardFooter 子组件构建完整的卡片结构。',
      },
    },
  },
};

/**
 * CardHeader 变体
 */
export const HeaderVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card className="w-80">
        <CardHeader title="只有标题" />
      </Card>
      <Card className="w-80">
        <CardHeader title="带副标题" subtitle="这是副标题文本" />
      </Card>
      <Card className="w-80">
        <CardHeader
          title="带操作按钮"
          subtitle="右侧有操作区"
          action={<Button size="sm">编辑</Button>}
        />
      </Card>
      <Card className="w-80">
        <CardHeader title="带自定义内容" subtitle="下方有额外内容">
          <div className="mt-2 flex gap-2">
            <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">标签1</span>
            <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">标签2</span>
          </div>
        </CardHeader>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'CardHeader 支持标题、副标题、操作区和自定义内容。',
      },
    },
  },
};

/**
 * CardFooter 变体
 */
export const FooterVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card className="w-80">
        <CardContent>
          <p className="text-gray-600">无分割线的底部</p>
        </CardContent>
        <CardFooter>
          <Button size="sm">操作</Button>
        </CardFooter>
      </Card>
      <Card className="w-80">
        <CardContent>
          <p className="text-gray-600">有分割线的底部</p>
        </CardContent>
        <CardFooter divider>
          <Button variant="ghost" size="sm">
            取消
          </Button>
          <Button size="sm">确认</Button>
        </CardFooter>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'CardFooter 可以通过 divider 属性显示分割线。',
      },
    },
  },
};

/* ========================================
 * 实际应用示例
 * ======================================== */

/**
 * 用户卡片
 */
export const UserCard: Story = {
  render: () => (
    <Card className="w-72">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600">
          <User size={24} className="text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">张三</h3>
          <p className="text-sm text-gray-500">前端开发工程师</p>
        </div>
      </div>
      <div className="mt-4 flex gap-4 text-center">
        <div>
          <p className="text-xl font-bold text-gray-900">128</p>
          <p className="text-xs text-gray-500">文章</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">1.2k</p>
          <p className="text-xs text-gray-500">关注者</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">256</p>
          <p className="text-xs text-gray-500">关注</p>
        </div>
      </div>
      <Button fullWidth className="mt-4" variant="secondary">
        关注
      </Button>
    </Card>
  ),
};

/**
 * 文章卡片
 */
export const ArticleCard: Story = {
  render: () => (
    <Card clickable className="w-80" padding="none">
      <div className="h-40 bg-gradient-to-br from-purple-400 to-pink-400" />
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>技术</span>
          <span>·</span>
          <span>5 分钟阅读</span>
        </div>
        <h3 className="mt-2 line-clamp-2 font-semibold text-gray-900">
          React 18 新特性完全指南：并发渲染、Suspense 和更多
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-gray-600">
          深入了解 React 18 带来的革命性变化，包括并发渲染、自动批处理、 新的 Suspense 功能等。
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gray-300" />
            <span className="text-sm text-gray-600">作者名</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Star size={14} />
            <span className="text-sm">128</span>
          </div>
        </div>
      </div>
    </Card>
  ),
};

/**
 * 统计卡片
 */
export const StatsCard: Story = {
  render: () => (
    <div className="flex gap-4">
      <Card className="w-48">
        <p className="text-sm text-gray-500">总用户</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">12,345</p>
        <p className="mt-2 text-sm text-green-600">↑ 12% 较上周</p>
      </Card>
      <Card className="w-48">
        <p className="text-sm text-gray-500">活跃用户</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">8,901</p>
        <p className="mt-2 text-sm text-green-600">↑ 8% 较上周</p>
      </Card>
      <Card className="w-48">
        <p className="text-sm text-gray-500">转化率</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">3.2%</p>
        <p className="mt-2 text-sm text-red-600">↓ 2% 较上周</p>
      </Card>
    </div>
  ),
};

/**
 * 产品卡片
 */
export const ProductCard: Story = {
  render: () => (
    <Card className="w-64" padding="none">
      <div className="relative">
        <div className="flex h-48 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
          <span className="text-4xl">📦</span>
        </div>
        <span className="absolute right-2 top-2 rounded bg-red-500 px-2 py-1 text-xs text-white">
          热卖
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900">产品名称</h3>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          这是产��的简短描述信息，展示产品特点。
        </p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-red-600">¥199</span>
            <span className="ml-1 text-sm text-gray-400 line-through">¥299</span>
          </div>
          <Button size="sm">加入购物车</Button>
        </div>
      </div>
    </Card>
  ),
};

/**
 * 任务卡片
 */
export const TaskCard: Story = {
  render: function Render() {
    const [completed, setCompleted] = useState(false);

    return (
      <Card
        variant={completed ? 'filled' : 'outlined'}
        clickable
        className="w-80"
        onClick={() => setCompleted(!completed)}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
              completed ? 'border-green-500 bg-green-500' : 'border-gray-300'
            }`}
          >
            {completed && <Check size={12} className="text-white" />}
          </div>
          <div className="flex-1">
            <h3
              className={`font-medium ${
                completed ? 'text-gray-400 line-through' : 'text-gray-900'
              }`}
            >
              完成用户界面设计
            </h3>
            <p className="mt-1 text-sm text-gray-500">截止日期：2024-01-15</p>
            <div className="mt-2 flex gap-2">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">设计</span>
              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                高优先级
              </span>
            </div>
          </div>
        </div>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '可交互的任务卡片，点击可切换完成状态。',
      },
    },
  },
};

/**
 * 卡片网格布局
 */
export const CardGrid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} clickable className="w-48">
          <div className="mb-3 flex h-24 items-center justify-center rounded-button bg-gradient-to-br from-blue-100 to-blue-200">
            <Target size={32} className="text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900">项目 {i}</h3>
          <p className="mt-1 text-sm text-gray-500">简短描述</p>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '卡片在网格布局中的展示效果。',
      },
    },
  },
};
