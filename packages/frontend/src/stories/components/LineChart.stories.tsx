import type { Meta, StoryObj } from '@storybook/react-vite';
import LineChart, { LineChartData } from '@/components/LineChart';

/**
 * LineChart - 折线图组件
 *
 * 用于展示时间序列数据的趋势变化。
 */
const meta: Meta<typeof LineChart> = {
  title: 'Components/LineChart',
  component: LineChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'LineChart 是一个响应式的折线图组件，支持悬浮显示数据点详情。',
      },
    },
  },
  argTypes: {
    data: {
      description: '图表数据数组',
    },
    title: {
      control: 'text',
      description: '图表标题',
    },
    yAxisLabel: {
      control: 'text',
      description: 'Y轴标签',
    },
    height: {
      control: { type: 'number', min: 200, max: 600 },
      description: '图表高度',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-[800px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// 生成模拟数据
const generateData = (days: number, baseValue: number, variance: number): LineChartData[] => {
  const data: LineChartData[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const value = baseValue + Math.random() * variance - variance / 2;
    data.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Math.max(0, Math.round(value * 10) / 10),
    });
  }

  return data;
};

// 学习单词数量数据
const wordsLearnedData = generateData(14, 25, 15);

// 正确率数据
const accuracyData = generateData(14, 85, 10);

// 学习时间数据
const studyTimeData = generateData(14, 45, 20);

/**
 * 默认状态
 *
 * 展示两周的学习单词数量趋势。
 */
export const Default: Story = {
  args: {
    data: wordsLearnedData,
    title: '每日学习单词数',
    yAxisLabel: '单词数',
    height: 300,
  },
};

/**
 * 正确率趋势
 *
 * 展示答题正确率的变化趋势。
 */
export const AccuracyTrend: Story = {
  args: {
    data: accuracyData,
    title: '答题正确率趋势',
    yAxisLabel: '正确率 (%)',
    height: 300,
  },
};

/**
 * 学习时间趋势
 *
 * 展示每日学习时间的变化趋势。
 */
export const StudyTimeTrend: Story = {
  args: {
    data: studyTimeData,
    title: '每日学习时长',
    yAxisLabel: '分钟',
    height: 300,
  },
};

/**
 * 无数据状态
 *
 * 当没有数据时显示的占位内容。
 */
export const NoData: Story = {
  args: {
    data: [],
    title: '学习趋势',
    height: 300,
  },
};

/**
 * 长时间范围
 *
 * 展示30天的数据趋势。
 */
export const LongRange: Story = {
  args: {
    data: generateData(30, 30, 15),
    title: '月度学习趋势',
    yAxisLabel: '单词数',
    height: 300,
  },
};

/**
 * 短时间范围
 *
 * 展示一周的数据趋势。
 */
export const ShortRange: Story = {
  args: {
    data: generateData(7, 20, 10),
    title: '周学习趋势',
    yAxisLabel: '单词数',
    height: 300,
  },
};

/**
 * 高值数据
 *
 * 展示较高数值的数据趋势。
 */
export const HighValues: Story = {
  args: {
    data: generateData(14, 500, 100),
    title: '累计学习单词',
    yAxisLabel: '总数',
    height: 300,
  },
};

/**
 * 低值数据
 *
 * 展示较低数值的数据趋势。
 */
export const LowValues: Story = {
  args: {
    data: generateData(14, 5, 3),
    title: '每日错误数',
    yAxisLabel: '错误数',
    height: 300,
  },
};

/**
 * 无标题
 *
 * 不显示标题的简洁版本。
 */
export const NoTitle: Story = {
  args: {
    data: wordsLearnedData,
    yAxisLabel: '单词数',
    height: 250,
  },
};

/**
 * 自定义高度
 *
 * 展示较大高度的图表。
 */
export const TallChart: Story = {
  args: {
    data: wordsLearnedData,
    title: '学习趋势',
    yAxisLabel: '单词数',
    height: 450,
  },
};

/**
 * 紧凑高度
 *
 * 展示较小高度的紧凑图表。
 */
export const CompactChart: Story = {
  args: {
    data: wordsLearnedData,
    title: '学习趋势',
    yAxisLabel: '单词数',
    height: 200,
  },
};

/**
 * 在卡片中使用
 *
 * 图表在卡片组件中的使用示例。
 */
export const InCard: Story = {
  render: (args) => (
    <div className="card-elevated p-6">
      <LineChart {...args} />
    </div>
  ),
  args: {
    data: wordsLearnedData,
    title: '学习进度',
    yAxisLabel: '单词数',
    height: 280,
  },
};

/**
 * 多图表组合
 *
 * 多个图表组合展示的场景。
 */
export const MultipleCharts: Story = {
  render: (_args) => (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card-elevated p-4">
        <LineChart data={wordsLearnedData} title="学习单词数" yAxisLabel="数量" height={220} />
      </div>
      <div className="card-elevated p-4">
        <LineChart data={accuracyData} title="正确率" yAxisLabel="%" height={220} />
      </div>
      <div className="card-elevated p-4">
        <LineChart data={studyTimeData} title="学习时长" yAxisLabel="分钟" height={220} />
      </div>
      <div className="card-elevated p-4">
        <LineChart
          data={generateData(14, 7, 3)}
          title="连续学习天数"
          yAxisLabel="天"
          height={220}
        />
      </div>
    </div>
  ),
  args: {
    data: wordsLearnedData,
    title: '多图表组合示例',
    height: 220,
  },
};
