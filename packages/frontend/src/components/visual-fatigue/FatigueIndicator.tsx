/**
 * 疲劳度指示器
 *
 * 显示融合后的疲劳度状态：
 * - 融合疲劳评分
 * - 视觉/行为疲劳分解
 * - 疲劳等级指示
 * - 休息建议
 */

import { memo, useMemo } from 'react';
import { useVisualFatigueStore } from '../../stores/visualFatigueStore';

interface FatigueIndicatorProps {
  /** 是否显示详细信息 */
  detailed?: boolean;
  /** 行为疲劳值 (来自现有系统) */
  behaviorFatigue?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 获取疲劳等级颜色
 */
function getFatigueColor(score: number): string {
  if (score < 0.25) return 'text-green-600 dark:text-green-400';
  if (score < 0.5) return 'text-yellow-600 dark:text-yellow-400';
  if (score < 0.75) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * 获取疲劳等级背景色
 */
function getFatigueBgColor(score: number): string {
  if (score < 0.25) return 'bg-green-100 dark:bg-green-900/30';
  if (score < 0.5) return 'bg-yellow-100 dark:bg-yellow-900/30';
  if (score < 0.75) return 'bg-orange-100 dark:bg-orange-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

/**
 * 获取疲劳等级标签
 */
function getFatigueLabel(score: number): string {
  if (score < 0.25) return '精力充沛';
  if (score < 0.5) return '轻度疲劳';
  if (score < 0.75) return '中度疲劳';
  return '严重疲劳';
}

/**
 * 获取疲劳图标
 */
function FatigueIcon({ score }: { score: number }) {
  if (score < 0.25) {
    // 精力充沛 - 笑脸
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  if (score < 0.5) {
    // 轻度疲劳 - 中性脸
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  if (score < 0.75) {
    // 中度疲劳 - 疲惫脸
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  // 严重疲劳 - 警告
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

/**
 * 疲劳度指示器组件
 */
function FatigueIndicatorComponent({
  detailed = false,
  behaviorFatigue = 0,
  className = '',
}: FatigueIndicatorProps) {
  const { enabled, metrics, detectorState } = useVisualFatigueStore();

  // 计算融合疲劳值
  const fusedFatigue = useMemo(() => {
    if (!enabled || !detectorState.isDetecting) {
      return behaviorFatigue;
    }

    // 简单融合：视觉 40% + 行为 60%
    const visualWeight = metrics.confidence > 0.5 ? 0.4 : 0.2;
    const behaviorWeight = 1 - visualWeight;

    return metrics.visualFatigueScore * visualWeight + behaviorFatigue * behaviorWeight;
  }, [enabled, detectorState.isDetecting, metrics, behaviorFatigue]);

  const fatiguePercent = Math.round(fusedFatigue * 100);
  const colorClass = getFatigueColor(fusedFatigue);
  const bgClass = getFatigueBgColor(fusedFatigue);
  const label = getFatigueLabel(fusedFatigue);

  // 简洁版本
  if (!detailed) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className={`rounded-full p-1 ${bgClass}`}>
          <span className={colorClass}>
            <FatigueIcon score={fusedFatigue} />
          </span>
        </div>
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${colorClass}`}>{label}</span>
          <span className="text-xs text-gray-500">{fatiguePercent}%</span>
        </div>
      </div>
    );
  }

  // 详细版本
  return (
    <div
      className={`rounded-button border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      {/* 标题 */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">疲劳状态</h3>
        {enabled && detectorState.isDetecting && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
            摄像头检测中
          </span>
        )}
      </div>

      {/* 主疲劳指示 */}
      <div className="mb-4 flex items-center gap-3">
        <div className={`rounded-full p-2 ${bgClass}`}>
          <span className={colorClass}>
            <FatigueIcon score={fusedFatigue} />
          </span>
        </div>
        <div>
          <div className={`text-lg font-semibold ${colorClass}`}>{label}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            综合疲劳度 {fatiguePercent}%
          </div>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mb-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
          <div
            className={`h-full transition-all duration-g3-normal ${
              fusedFatigue < 0.25
                ? 'bg-green-500'
                : fusedFatigue < 0.5
                  ? 'bg-yellow-500'
                  : fusedFatigue < 0.75
                    ? 'bg-orange-500'
                    : 'bg-red-500'
            }`}
            style={{ width: `${fatiguePercent}%` }}
          />
        </div>
      </div>

      {/* 分解显示 */}
      {enabled && (
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-slate-700">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">视觉疲劳</div>
            <div className={`text-sm font-medium ${getFatigueColor(metrics.visualFatigueScore)}`}>
              {Math.round(metrics.visualFatigueScore * 100)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">行为疲劳</div>
            <div className={`text-sm font-medium ${getFatigueColor(behaviorFatigue)}`}>
              {Math.round(behaviorFatigue * 100)}%
            </div>
          </div>
        </div>
      )}

      {/* 视觉指标详情 */}
      {enabled && detectorState.isDetecting && metrics.confidence > 0.3 && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-700">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-gray-500 dark:text-gray-400">PERCLOS</div>
              <div className="font-medium">{(metrics.perclos * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">眨眼率</div>
              <div className="font-medium">{metrics.blinkRate.toFixed(1)}/分</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">打哈欠</div>
              <div className="font-medium">{metrics.yawnCount} 次</div>
            </div>
          </div>
        </div>
      )}

      {/* 休息建议 */}
      {fusedFatigue > 0.6 && (
        <div className="mt-3 rounded-md bg-orange-50 p-2 text-xs text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
          建议休息一下，远眺放松眼睛
        </div>
      )}
    </div>
  );
}

export const FatigueIndicator = memo(FatigueIndicatorComponent);
export default FatigueIndicator;
