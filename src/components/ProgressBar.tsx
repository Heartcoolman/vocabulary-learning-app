interface ProgressBarProps {
  current: number;
  total: number;
}

/**
 * ProgressBar 组件 - 显示学习进度
 * 包括进度文字和视觉进度条
 */
export default function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const percentageText = `${Math.round(percentage)}%`;

  return (
    <div 
      className="w-full max-w-5xl mx-auto px-4 pt-6 pb-4"
      role="region"
      aria-label="学习进度"
    >
      {/* 进度文字 */}
      <div className="flex justify-between items-center mb-2">
        <span 
          className="text-sm md:text-base text-gray-600"
          id="progress-label"
        >
          学习进度
        </span>
        <span 
          className="text-sm md:text-base font-medium text-gray-900"
          aria-live="polite"
          aria-atomic="true"
        >
          {current} / {total} ({percentageText})
        </span>
      </div>

      {/* 进度条 */}
      <div 
        className="w-full h-2 bg-gray-200 rounded-full overflow-hidden"
        role="presentation"
      >
        <div
          className="h-full bg-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-labelledby="progress-label"
          aria-label={`已完成 ${current} 个，共 ${total} 个单词，进度 ${percentageText}`}
        />
      </div>
    </div>
  );
}
