import { Brain, ChartLine, CheckCircle, ArrowRight, ArrowLeft } from '../../Icon';

interface FeaturesStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function FeaturesStep({ onNext, onBack }: FeaturesStepProps) {
  const features = [
    {
      Icon: Brain,
      title: '智能学习',
      description: '我们的间隔重复算法会根据您的学习进度自动调整，专注于您需要加强的单词。',
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      darkBg: 'dark:bg-blue-900/20',
    },
    {
      Icon: CheckCircle,
      title: '高效复习',
      description: '每日快速复习帮助您长期记忆词汇，不会感到疲惫。',
      color: 'text-green-500',
      bg: 'bg-green-50',
      darkBg: 'dark:bg-green-900/20',
    },
    {
      Icon: ChartLine,
      title: '详细统计',
      description: '通过可视化图表追踪您的学习进度，深入了解您的学习习惯。',
      color: 'text-purple-500',
      bg: 'bg-purple-50',
      darkBg: 'dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">核心功能</h2>
        <p className="text-gray-600 dark:text-gray-400">掌握新词汇所需的一切</p>
      </div>

      <div className="grid flex-1 gap-6 md:grid-cols-3">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex flex-col items-center rounded-xl border border-gray-100 bg-white p-6 text-center shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`mb-4 rounded-full p-4 ${feature.bg} ${feature.darkBg}`}>
              <feature.Icon className={`h-8 w-8 ${feature.color}`} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {feature.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-between border-t border-gray-100 pt-6 dark:border-gray-700">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <button
          onClick={onNext}
          className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 flex items-center gap-2 rounded-lg px-8 py-2.5 font-semibold text-white transition-colors"
        >
          下一步 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
