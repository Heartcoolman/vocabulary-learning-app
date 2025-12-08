import type { Meta, StoryObj } from '@storybook/react-vite';
import WordCard from '@/components/WordCard';

/**
 * WordCard - 单词学习卡片组件
 *
 * 用于展示单词的完整信息，包括拼写、音标、例句、发音按钮、掌握程度等。
 * 是词汇学习应用的核心交互组件。
 */
const meta: Meta<typeof WordCard> = {
  title: 'Components/WordCard',
  component: WordCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'WordCard 是词汇学习的核心组件，展示单词的完整信息并提供发音功能。',
      },
    },
  },
  argTypes: {
    word: {
      description: '单词数据对象',
    },
    isPronouncing: {
      control: 'boolean',
      description: '是否正在播放发音',
    },
    masteryLevel: {
      control: { type: 'range', min: 0, max: 5, step: 1 },
      description: '掌握程度（0-5）',
    },
    wordScore: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: '单词得分',
    },
    nextReviewDate: {
      control: 'text',
      description: '下次复习日期',
    },
    onPronounce: {
      action: 'pronounce',
      description: '发音按钮点击事件',
    },
  },
  decorators: [
    (Story) => (
      <div className="min-w-[400px] max-w-[600px]">
        <Story />
      </div>
    ),
  ],
  args: {
    onPronounce: () => console.log('Pronounce clicked'),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 示例单词数据
const sampleWords = {
  simple: {
    id: '1',
    spelling: 'apple',
    phonetic: 'ˈæpl',
    meanings: ['苹果', '苹果树'],
    examples: ['I eat an apple every day.'],
  },
  intermediate: {
    id: '2',
    spelling: 'serendipity',
    phonetic: 'ˌserənˈdɪpɪti',
    meanings: ['意外发现珍奇事物的本领', '机缘巧合'],
    examples: ['Finding that book was pure serendipity - it changed my life.'],
  },
  advanced: {
    id: '3',
    spelling: 'ephemeral',
    phonetic: 'ɪˈfemərəl',
    meanings: ['短暂的', '瞬息的', '朝生暮死的'],
    examples: ['Fame in the digital age can be ephemeral, lasting only a few viral moments.'],
  },
  noExample: {
    id: '4',
    spelling: 'test',
    phonetic: 'test',
    meanings: ['测试'],
    examples: [],
  },
};

/**
 * 默认状态
 *
 * 展示基础的单词卡片，不包含学习状态信息。
 */
export const Default: Story = {
  args: {
    word: sampleWords.simple,
    isPronouncing: false,
  },
};

/**
 * 带学习状态
 *
 * 展示包含掌握程度、得分和复习日期的完整卡片。
 */
export const WithLearningStatus: Story = {
  args: {
    word: sampleWords.intermediate,
    isPronouncing: false,
    masteryLevel: 3,
    wordScore: 75,
    nextReviewDate: '明天',
  },
};

/**
 * 新词状态
 *
 * 刚添加的新单词，掌握程度为0。
 */
export const NewWord: Story = {
  args: {
    word: sampleWords.advanced,
    isPronouncing: false,
    masteryLevel: 0,
    wordScore: 0,
    nextReviewDate: '今天',
  },
};

/**
 * 已掌握状态
 *
 * 完全掌握的单词，5星评级。
 */
export const Mastered: Story = {
  args: {
    word: sampleWords.simple,
    isPronouncing: false,
    masteryLevel: 5,
    wordScore: 98,
    nextReviewDate: '3天后',
  },
};

/**
 * 正在发音
 *
 * 发音按钮处于播放状态。
 */
export const Pronouncing: Story = {
  args: {
    word: sampleWords.simple,
    isPronouncing: true,
    masteryLevel: 2,
    wordScore: 45,
    nextReviewDate: '今天',
  },
};

/**
 * 长单词
 *
 * 展示较长单词的显示效果。
 */
export const LongWord: Story = {
  args: {
    word: {
      id: '5',
      spelling: 'pneumonoultramicroscopicsilicovolcanoconiosis',
      phonetic: 'ˌnjuːmənəʊˌʌltrəˌmaɪkrəˌskɒpɪkˌsɪlɪkəʊvɒlˌkeɪnəʊˌkəʊnɪˈəʊsɪs',
      meanings: ['矽肺病（由吸入极细硅尘引起的肺病）'],
      examples: [
        'Pneumonoultramicroscopicsilicovolcanoconiosis is one of the longest words in the English language.',
      ],
    },
    isPronouncing: false,
    masteryLevel: 1,
    wordScore: 20,
  },
};

/**
 * 无例句
 *
 * 当单词没有例句时的显示效果。
 */
export const NoExample: Story = {
  args: {
    word: sampleWords.noExample,
    isPronouncing: false,
  },
};

/**
 * 多释义
 *
 * 展示多个释义的单词。
 */
export const MultiMeanings: Story = {
  args: {
    word: {
      id: '6',
      spelling: 'run',
      phonetic: 'rʌn',
      meanings: ['跑，奔跑', '运行，运转', '经营，管理', '流淌', '蔓延，延伸'],
      examples: ['She likes to run in the morning.'],
    },
    isPronouncing: false,
    masteryLevel: 4,
    wordScore: 88,
    nextReviewDate: '2天后',
  },
};

/**
 * 中等难度单词
 *
 * 学习进度中等的单词状态。
 */
export const InProgress: Story = {
  args: {
    word: sampleWords.intermediate,
    isPronouncing: false,
    masteryLevel: 2,
    wordScore: 55,
    nextReviewDate: '今天',
  },
};

/**
 * 即将复习
 *
 * 需要立即复习的单词状态。
 */
export const DueForReview: Story = {
  args: {
    word: sampleWords.simple,
    isPronouncing: false,
    masteryLevel: 3,
    wordScore: 70,
    nextReviewDate: '已过期',
  },
};
