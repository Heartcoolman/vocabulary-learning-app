import { useEffect, useState } from 'react';
import { UserState, ColdStartPhaseInfo } from '../types/amas';
import ApiClient from '../services/ApiClient';
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
 */
export default function AmasStatus({ detailed = false, refreshTrigger = 0 }: AmasStatusProps) {
  const [state, setState] = useState<UserState | null>(null);
  const [phase, setPhase] = useState<ColdStartPhaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: number | null = null;

    const loadAmasData = async () => {
      try {
        if (isMounted && isInitialLoad) setLoading(true);

        const [stateData, phaseData] = await Promise.all([
          ApiClient.getAmasState(),
          ApiClient.getAmasColdStartPhase(),
        ]);

        if (isMounted) {
          setState(stateData);
          setPhase(phaseData);
          setIsInitialLoad(false);
        }
      } catch (error) {
        amasLogger.error({ err: error }, '加载AMAS状态失败');
      } finally {
        if (isMounted && isInitialLoad) setLoading(false);
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
      <div className="p-4 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-2 bg-gray-200 rounded w-full"></div>
          <div className="h-2 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (!state || !phase) {
    return null;
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
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          icon: <MagnifyingGlass size={16} weight="duotone" className="text-blue-600" />,
          label: '分类中'
        };
      case 'explore':
        return {
          color: 'text-purple-600',
          bg: 'bg-purple-50',
          icon: <Compass size={16} weight="duotone" className="text-purple-600" />,
          label: '探索中'
        };
      case 'normal':
        return {
          color: 'text-green-600',
          bg: 'bg-green-50',
          icon: <CheckCircle size={16} weight="duotone" className="text-green-600" />,
          label: '正常'
        };
      default:
        return {
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          icon: <Question size={16} weight="duotone" className="text-gray-600" />,
          label: '未知'
        };
    }
  };

  const phaseStyle = getPhaseStyle(phase.phase);

  return (
    <div
      className="p-4 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-xl shadow-sm transition-all duration-200"
      role="region"
      aria-label="学习状态监控"
    >
      {/* 标题和阶段 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-700">学习状态</h3>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${phaseStyle.bg}`}>
          {phaseStyle.icon}
          <span className={`text-xs font-medium ${phaseStyle.color}`}>
            {phaseStyle.label}
          </span>
        </div>
      </div>

      {/* 核心状态指标 - 紧凑布局 */}
      <div className="space-y-3">
        {/* 注意力 */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">注意力</span>
            <span className={`text-xs font-medium ${getStateColor(state.attention)}`}>
              {Math.round(state.attention * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getBarColor(state.attention)}`}
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
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">疲劳度</span>
            <span className={`text-xs font-medium ${getStateColor(state.fatigue, true)}`}>
              {Math.round(state.fatigue * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getBarColor(state.fatigue, true)}`}
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
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">记忆力</span>
            <span className={`text-xs font-medium ${getStateColor(state.memory)}`}>
              {Math.round(state.memory * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getBarColor(state.memory)}`}
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
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">反应速度</span>
            <span className={`text-xs font-medium ${getStateColor(state.speed)}`}>
              {Math.round(state.speed * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getBarColor(state.speed)}`}
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
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">动机:</span>
              <span className={`font-medium ${getStateColor((state.motivation + 1) / 2)}`}>
                {Math.round(state.motivation * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">稳定性:</span>
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
