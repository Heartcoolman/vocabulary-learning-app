import type { Meta, StoryObj } from '@storybook/react-vite';
import BadgeCelebration from '@/components/BadgeCelebration';

/**
 * BadgeCelebration - 成就徽章庆祝组件
 *
 * 用于展示用户获得新成就徽章时的庆祝动画和提示。
 */
const meta = {
  title: 'Components/BadgeCelebration',
  component: BadgeCelebration,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'BadgeCelebration 组件在用户获得新成就时显示庆祝动画和徽章信息。',
      },
    },
  },
  argTypes: {
    badge: {
      description: '徽章数据对象',
    },
    onClose: {
      action: 'closed',
      description: '关闭回调',
    },
    isVisible: {
      control: 'boolean',
      description: '是否显示',
    },
  },
  args: {
    onClose: () => console.log('Badge celebration closed'),
  },
} satisfies Meta<typeof BadgeCelebration>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 首次学习徽章
 *
 * 用户完成首次学习后获得的徽章。
 */
export const FirstLesson: Story = {
  args: {
    badge: {
      id: '1',
      name: '初学者',
      description: '完成第一次学习',
      iconUrl: '/badges/star.svg',
      category: 'MILESTONE',
      tier: 1,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 连续学习徽章
 *
 * 连续学习多天获得的徽章。
 */
export const Streak: Story = {
  args: {
    badge: {
      id: '2',
      name: '坚持不懈',
      description: '连续学习7天',
      iconUrl: '/badges/fire.svg',
      category: 'STREAK',
      tier: 2,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 单词大师徽章
 *
 * 掌握一定数量单词后获得的徽章。
 */
export const WordMaster: Story = {
  args: {
    badge: {
      id: '3',
      name: '单词大师',
      description: '掌握100个单词',
      iconUrl: '/badges/trophy.svg',
      category: 'MILESTONE',
      tier: 3,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 完美答题徽章
 *
 * 一次学习全部答对获得的徽章。
 */
export const Perfect: Story = {
  args: {
    badge: {
      id: '4',
      name: '完美答题',
      description: '一次学习全部答对',
      iconUrl: '/badges/check.svg',
      category: 'ACCURACY',
      tier: 2,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 早起学习徽章
 *
 * 早间学习获得的徽章。
 */
export const EarlyBird: Story = {
  args: {
    badge: {
      id: '5',
      name: '早起的鸟儿',
      description: '早晨6-8点完成学习',
      iconUrl: '/badges/sun.svg',
      category: 'COGNITIVE',
      tier: 1,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 夜猫子徽章
 *
 * 夜间学习获得的徽章。
 */
export const NightOwl: Story = {
  args: {
    badge: {
      id: '6',
      name: '夜猫子',
      description: '深夜22点后完成学习',
      iconUrl: '/badges/moon.svg',
      category: 'COGNITIVE',
      tier: 1,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 速度达人徽章
 *
 * 快速完成学习获得的徽章。
 */
export const SpeedDemon: Story = {
  args: {
    badge: {
      id: '7',
      name: '速度达人',
      description: '10分钟内完成50个单词',
      iconUrl: '/badges/lightning.svg',
      category: 'COGNITIVE',
      tier: 3,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 长期坚持徽章
 *
 * 长期坚持学习获得的徽章。
 */
export const LongStreak: Story = {
  args: {
    badge: {
      id: '8',
      name: '学习达人',
      description: '连续学习30天',
      iconUrl: '/badges/crown.svg',
      category: 'STREAK',
      tier: 4,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 复习大师徽章
 *
 * 完成大量复习获得的徽章。
 */
export const ReviewMaster: Story = {
  args: {
    badge: {
      id: '9',
      name: '复习大师',
      description: '完成1000次复习',
      iconUrl: '/badges/refresh.svg',
      category: 'MILESTONE',
      tier: 4,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};

/**
 * 词汇量徽章
 *
 * 累计学习大量单词获得的徽章。
 */
export const VocabularyExpert: Story = {
  args: {
    badge: {
      id: '10',
      name: '词汇专家',
      description: '累计学习500个单词',
      iconUrl: '/badges/book.svg',
      category: 'MILESTONE',
      tier: 5,
      unlockedAt: new Date().toISOString(),
    },
    isVisible: true,
  },
};
