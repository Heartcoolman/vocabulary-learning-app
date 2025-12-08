import type { Meta, StoryObj } from '@storybook/react-vite';
import ProgressBarChart, { ProgressBarData } from '@/components/ProgressBarChart';

/**
 * ProgressBarChart - 进度条图表组件
 *
 * 用于展示学习进度的柱状进度条。
 */
const meta: Meta<typeof ProgressBarChart> = {
  title: 'Components/ProgressBarChart',
  component: ProgressBarChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'ProgressBarChart 是一个简洁的进度条图表，展示当前进度与目标的关系。',
      },
    },
  },
  argTypes: {
    data: {
      description: '进度数据数组',
    },
    height: {
      control: { type: 'number', min: 20, max: 100 },
      description: '进度条高度',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// 辅助函数：创建单个进度数据
const createProgressData = (
  label: string,
  value: number,
  maxValue: number,
  color?: string,
): ProgressBarData => ({
  label,
  value,
  maxValue,
  color,
});

/**
 * 默认状态
 *
 * 展示基础的进度条状态。
 */
export const Default: Story = {
  args: {
    data: [createProgressData('今日学习', 50, 100)],
  },
};

/**
 * 刚开始
 *
 * 进度很低的初始状态。
 */
export const JustStarted: Story = {
  args: {
    data: [createProgressData('今日学习', 5, 100)],
  },
};

/**
 * 进行中
 *
 * 中等进度的状态。
 */
export const InProgress: Story = {
  args: {
    data: [createProgressData('今日学习', 45, 100)],
  },
};

/**
 * 接近完成
 *
 * 即将达成目标的状态。
 */
export const AlmostComplete: Story = {
  args: {
    data: [createProgressData('今日学习', 95, 100)],
  },
};

/**
 * 已完成
 *
 * 达成或超过目标的状态。
 */
export const Completed: Story = {
  args: {
    data: [createProgressData('今日学习', 100, 100, 'bg-green-500')],
  },
};

/**
 * 超额完成
 *
 * 超过目标值的状态。
 */
export const Exceeded: Story = {
  args: {
    data: [createProgressData('今日学习', 150, 100, 'bg-green-500')],
  },
};

/**
 * 零进度
 *
 * 还没开始的状态。
 */
export const ZeroProgress: Story = {
  args: {
    data: [createProgressData('今日学习', 0, 50)],
  },
};

/**
 * 高目标值
 *
 * 较大目标数值的展示。
 */
export const HighTarget: Story = {
  args: {
    data: [createProgressData('月度目标', 350, 1000)],
  },
};

/**
 * 不同标签
 *
 * 展示不同场景的标签文本。
 */
export const DifferentLabels: Story = {
  args: {
    data: [
      createProgressData('今日学习', 30, 50),
      createProgressData('本周目标', 150, 300),
      createProgressData('本月目标', 800, 1000),
      createProgressData('复习进度', 45, 100),
    ],
  },
};

/**
 * 在卡片中使用
 *
 * 进度条在卡片组件中的使用示例。
 */
export const InCard: Story = {
  render: (args) => (
    <div className="card-elevated p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">学习目标</h3>
      <ProgressBarChart {...args} />
    </div>
  ),
  args: {
    data: [createProgressData('今日学习', 65, 100)],
  },
};

/**
 * 多进度组合
 *
 * 多个进度条的组合展示。
 */
export const MultiProgress: Story = {
  render: (args) => (
    <div className="card-elevated space-y-4 p-6">
      <h3 className="text-lg font-semibold text-gray-900">学习统计</h3>
      <ProgressBarChart {...args} />
    </div>
  ),
  args: {
    data: [
      createProgressData('新学单词', 30, 50),
      createProgressData('复习单词', 45, 50),
      createProgressData('正确率 (%)', 85, 100),
      createProgressData('学习时长 (分)', 25, 30),
    ],
  },
};
