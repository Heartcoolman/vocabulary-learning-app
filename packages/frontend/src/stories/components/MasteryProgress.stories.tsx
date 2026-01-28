import type { Meta, StoryObj } from '@storybook/react-vite';
import MasteryProgress from '@/components/MasteryProgress';

/**
 * MasteryProgress - 学习进度组件
 *
 * 展示单词掌握进度，包括进度条、统计数据和当前状态。
 */
const meta: Meta<typeof MasteryProgress> = {
  title: 'Components/MasteryProgress',
  component: MasteryProgress,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'MasteryProgress 组件用于展示学习进度，包括已掌握单词数、目标数、答题数等。',
      },
    },
  },
  argTypes: {
    progress: {
      description: '进度数据对象',
    },
    currentWordStatus: {
      control: 'select',
      options: ['new', 'learning', 'almost', 'mastered', undefined],
      description: '当前单词状态',
    },
    isCompleted: {
      control: 'boolean',
      description: '是否已完成目标',
    },
    className: {
      control: 'text',
      description: '自定义类名',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认状态
 *
 * 学习进度中的基础状态。
 */
export const Default: Story = {
  args: {
    progress: {
      masteredCount: 15,
      targetCount: 30,
      totalQuestions: 45,
      activeCount: 10,
      pendingCount: 5,
    },
    currentWordStatus: 'learning',
  },
};

/**
 * 新词状态
 *
 * 当前单词为新词时的显示。
 */
export const NewWord: Story = {
  args: {
    progress: {
      masteredCount: 5,
      targetCount: 30,
      totalQuestions: 10,
      activeCount: 5,
      pendingCount: 20,
    },
    currentWordStatus: 'new',
  },
};

/**
 * 即将掌握
 *
 * 当前单词即将掌握时的显示。
 */
export const AlmostMastered: Story = {
  args: {
    progress: {
      masteredCount: 25,
      targetCount: 30,
      totalQuestions: 80,
      activeCount: 5,
      pendingCount: 0,
    },
    currentWordStatus: 'almost',
  },
};

/**
 * 已掌握状态
 *
 * 当前单词已掌握时的显示。
 */
export const Mastered: Story = {
  args: {
    progress: {
      masteredCount: 28,
      targetCount: 30,
      totalQuestions: 95,
      activeCount: 2,
      pendingCount: 0,
    },
    currentWordStatus: 'mastered',
  },
};

/**
 * 目标达成
 *
 * 学习目标已完成时的显示。
 */
export const Completed: Story = {
  args: {
    progress: {
      masteredCount: 30,
      targetCount: 30,
      totalQuestions: 120,
      activeCount: 0,
      pendingCount: 0,
    },
    isCompleted: true,
  },
};

/**
 * 刚开始
 *
 * 学习刚开始时的初始状态。
 */
export const JustStarted: Story = {
  args: {
    progress: {
      masteredCount: 0,
      targetCount: 20,
      totalQuestions: 0,
      activeCount: 0,
      pendingCount: 20,
    },
    currentWordStatus: 'new',
  },
};

/**
 * 高目标
 *
 * 设置较高学习目标时的显示。
 */
export const HighTarget: Story = {
  args: {
    progress: {
      masteredCount: 45,
      targetCount: 100,
      totalQuestions: 200,
      activeCount: 30,
      pendingCount: 25,
    },
    currentWordStatus: 'learning',
  },
};

/**
 * 无状态显示
 *
 * 不显示当前单词状态标签。
 */
export const NoStatus: Story = {
  args: {
    progress: {
      masteredCount: 18,
      targetCount: 30,
      totalQuestions: 55,
      activeCount: 8,
      pendingCount: 4,
    },
  },
};

/**
 * 带操作按钮
 *
 * 在标题栏右侧显示自定义操作按钮。
 */
export const WithActions: Story = {
  args: {
    progress: {
      masteredCount: 20,
      targetCount: 30,
      totalQuestions: 65,
      activeCount: 6,
      pendingCount: 4,
    },
    currentWordStatus: 'learning',
    headerActions: (
      <div className="flex gap-1">
        <button className="rounded-button p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        <button className="rounded-button p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>
    ),
  },
};

/**
 * 进度动画演示
 *
 * 展示进度条的渐进效果（静态展示不同进度）。
 */
export const ProgressVariants: Story = {
  render: (_args) => (
    <div className="space-y-4">
      <MasteryProgress
        progress={{
          masteredCount: 3,
          targetCount: 30,
          totalQuestions: 5,
          activeCount: 2,
          pendingCount: 25,
        }}
        currentWordStatus="new"
      />
      <MasteryProgress
        progress={{
          masteredCount: 15,
          targetCount: 30,
          totalQuestions: 45,
          activeCount: 10,
          pendingCount: 5,
        }}
        currentWordStatus="learning"
      />
      <MasteryProgress
        progress={{
          masteredCount: 27,
          targetCount: 30,
          totalQuestions: 90,
          activeCount: 3,
          pendingCount: 0,
        }}
        currentWordStatus="almost"
      />
      <MasteryProgress
        progress={{
          masteredCount: 30,
          targetCount: 30,
          totalQuestions: 100,
          activeCount: 0,
          pendingCount: 0,
        }}
        isCompleted
      />
    </div>
  ),
  args: {
    progress: {
      masteredCount: 15,
      targetCount: 30,
      totalQuestions: 45,
      activeCount: 10,
      pendingCount: 5,
    },
    currentWordStatus: 'learning',
  },
};
