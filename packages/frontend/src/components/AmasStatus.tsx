import { useEffect, useState, useRef, memo } from 'react';
import { UserState, ColdStartPhaseInfo } from '../types/amas';
import ApiClient from '../services/client';
import { MagnifyingGlass, Compass, CheckCircle, Question } from './Icon';
import { amasLogger } from '../utils/logger';

interface AmasStatusProps {
  /** 是否显示详细信息 */
  detailed?: boolean;
  /** 刷新触发器：每次变化时重新加载数据 */
  refreshTrigger?: number;
}

/**
 * AMAS状态组件 - 显示用户学习状态和冷启动阶段
 * 符合ui-design-system.md设计规范
 * 使用 React.memo 优化：仅当 props 变化时重新渲染
 */
function AmasStatusComponent({ detailed = false, refreshTrigger = 0 }: AmasStatusProps) {
  const [state, setState] = useState<UserState | null>(null);
  const [phase, setPhase] = useState<ColdStartPhaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 使用 useRef 跟踪初始加载状态，避免 useEffect 依赖问题
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: number | null = null;

    const loadAmasData = async () => {
      try {
        // 只在初始加载时设置 loading=true，后续刷新不显示加载状态
        if (isMounted && isInitialLoadRef.current) {
          setLoading(true);
        }

        const [stateData, phaseData] = await Promise.all([
          ApiClient.getAmasState(),
          ApiClient.getAmasColdStartPhase(),
        ]);

        if (isMounted) {
          setState(stateData);
          setPhase(phaseData);
          setError(null); // 清除之前的错误
        }
      } catch (err) {
        amasLogger.error({ err }, '加载AMAS状态失败');
        if (isMounted) {
          setError('加载AMAS状态失败，请稍后重试');
        }
      } finally {
        // 无论成功还是失败，都要在初始加载后设置 loading=false
        if (isMounted && isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    };

    loadAmasData();

    // 每60秒自动刷新一次
    refreshTimer = setInterval(() => {
      if (isMounted) {
        loadAmasData();
      }
    }, 60000) as unknown as number;

    return () => {
      isMounted = false;
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
      }
    };
  }, [refreshTrigger]); // 当 refreshTrigger 变化时重新加载

  if (loading) {
    return (
      <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-slate-700"></div>
          <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700"></div>
          <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-red-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-red-800/60 dark:bg-slate-800/80">
        <div className="flex items-center gap-2 text-red-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (!state || !phase) {
    return (
      <div className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/80">
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">暂无学习状态数据</div>
      </div>
    );
  }

  const getStateColor = (value: number, inverse = false): string => {
    const normalizedValue = inverse ? 1 - value : value;
    if (normalizedValue >= 0.7) return 'text-green-600';
    if (normalizedValue >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBarColor = (value: number, inverse = false): string => {
    const normalizedValue = inverse ? 1 - value : value;
    if (normalizedValue >= 0.7) return 'bg-green-500';
    if (normalizedValue >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getPhaseStyle = (currentPhase: string) => {
    switch (currentPhase) {
      case 'classify':
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-900/30',
          icon: (
            <MagnifyingGlass
              size={16}
              weight="duotone"
              className="text-blue-600 dark:text-blue-400"
            />
          ),
          label: '分类中',
        };
      case 'explore':
        return {
          color: 'text-purple-600 dark:text-purple-400',
          bg: 'bg-purple-50 dark:bg-purple-900/30',
          icon: (
            <Compass size={16} weight="duotone" className="text-purple-600 dark:text-purple-400" />
          ),
          label: '探索中',
        };
      case 'normal':
        return {
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-50 dark:bg-green-900/30',
          icon: (
            <CheckCircle
              size={16}
              weight="duotone"
              className="text-green-600 dark:text-green-400"
            />
          ),
          label: '正常',
        };
      default:
        return {
          color: 'text-gray-600 dark:text-gray-400',
          bg: 'bg-gray-50 dark:bg-slate-700',
          icon: (
            <Question size={16} weight="duotone" className="text-gray-600 dark:text-gray-400" />
          ),
          label: '未知',
        };
    }
  };

  const phaseStyle = getPhaseStyle(phase.phase);

  return (
    <div
      className="rounded-card border border-gray-200/60 bg-white/80 p-4 shadow-soft backdrop-blur-sm transition-all duration-g3-fast dark:border-slate-700/60 dark:bg-slate-800/80"
      role="region"
      aria-label="学习状态监控"
    >
      {/* 标题和阶段 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">学习状态</h3>
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${phaseStyle.bg}`}>
          {phaseStyle.icon}
          <span className={`text-xs font-medium ${phaseStyle.color}`}>{phaseStyle.label}</span>
        </div>
      </div>

      {/* 核心状态指标 - 紧凑布局 */}
      <div className="space-y-3">
        {/* 注意力 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">注意力</span>
            <span className={`text-xs font-medium ${getStateColor(state.attention)}`}>
              {Math.round(state.attention * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className={`h-full transition-all duration-g3-slow ${getBarColor(state.attention)}`}
              style={{ width: `${state.attention * 100}%` }}
              role="progressbar"
              aria-valuenow={state.attention * 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`注意力 ${Math.round(state.attention * 100)}%`}
            />
          </div>
        </div>

        {/* 疲劳度 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">疲劳度</span>
            <span className={`text-xs font-medium ${getStateColor(state.fatigue, true)}`}>
              {Math.round(state.fatigue * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className={`h-full transition-all duration-g3-slow ${getBarColor(state.fatigue, true)}`}
              style={{ width: `${state.fatigue * 100}%` }}
              role="progressbar"
              aria-valuenow={state.fatigue * 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`疲劳度 ${Math.round(state.fatigue * 100)}%`}
            />
          </div>
        </div>

        {/* 记忆力 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">记忆力</span>
            <span className={`text-xs font-medium ${getStateColor(state.memory)}`}>
              {Math.round(state.memory * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className={`h-full transition-all duration-g3-slow ${getBarColor(state.memory)}`}
              style={{ width: `${state.memory * 100}%` }}
              role="progressbar"
              aria-valuenow={state.memory * 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`记忆力 ${Math.round(state.memory * 100)}%`}
            />
          </div>
        </div>

        {/* 反应速度 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">反应速度</span>
            <span className={`text-xs font-medium ${getStateColor(state.speed)}`}>
              {Math.round(state.speed * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className={`h-full transition-all duration-g3-slow ${getBarColor(state.speed)}`}
              style={{ width: `${state.speed * 100}%` }}
              role="progressbar"
              aria-valuenow={state.speed * 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`反应速度 ${Math.round(state.speed * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* 详细信息（可选） */}
      {detailed && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-slate-600">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">动机:</span>
              <span className={`font-medium ${getStateColor((state.motivation + 1) / 2)}`}>
                {Math.round(state.motivation * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">稳定性:</span>
              <span className={`font-medium ${getStateColor(state.stability)}`}>
                {Math.round(state.stability * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// AmasStatus 使用默认浅比较
// props 仅包含简单类型: detailed (boolean) 和 refreshTrigger (number)
const AmasStatus = memo(AmasStatusComponent);

export default AmasStatus;
