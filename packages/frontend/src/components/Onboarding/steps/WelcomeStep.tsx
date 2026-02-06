import { Rocket, ArrowRight } from '../../Icon';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="bg-primary-100 dark:bg-primary-900/30 mb-8 rounded-full p-8">
        <Rocket className="text-primary-600 dark:text-primary-400 h-24 w-24" />
      </div>
      <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-white">欢迎使用单词</h1>
      <p className="mb-12 max-w-lg text-lg text-gray-600 dark:text-gray-300">
        您的个人词汇学习伙伴。使用科学的间隔重复系统高效掌握新单词。
      </p>
      <button
        onClick={onNext}
        className="bg-primary-600 hover:bg-primary-700 focus:ring-primary-300 dark:bg-primary-500 dark:hover:bg-primary-600 flex items-center gap-2 rounded-lg px-8 py-3 text-lg font-semibold text-white transition-colors focus:outline-none focus:ring-4"
      >
        开始使用
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}
