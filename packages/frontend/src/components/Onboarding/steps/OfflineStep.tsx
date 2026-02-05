import { WifiSlash, Check, ArrowLeft } from '../../Icon';

interface OfflineStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function OfflineStep({ onNext, onBack }: OfflineStepProps) {
  const features = ['词书下载一次，随处可用', '随时随地学习，无需网络', '数据本地存储，隐私优先'];

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-8 rounded-full bg-gray-100 p-8 dark:bg-gray-700">
        <WifiSlash className="h-24 w-24 text-gray-500 dark:text-gray-300" />
      </div>
      <h2 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">完全离线可用</h2>
      <p className="mb-8 max-w-md text-lg text-gray-600 dark:text-gray-300">
        单词桌面版无需网络即可完美运行。您的学习进度会保存在本地。
      </p>

      <div className="mb-12 space-y-3">
        {features.map((item, i) => (
          <div key={i} className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <Check weight="bold" className="h-3.5 w-3.5" />
            </div>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="flex w-full max-w-md justify-between gap-4">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="mr-2 inline h-4 w-4" />
          返回
        </button>
        <button
          onClick={onNext}
          className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 flex-1 rounded-lg px-6 py-3 font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
        >
          开始学习
        </button>
      </div>
    </div>
  );
}
