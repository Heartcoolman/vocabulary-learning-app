/**
 * AMAS Decision Flow Dashboard
 *
 * 决策流程仪表盘 - 完整展示决策全流程
 * - 左侧：近期决策列表（实时轮询）
 * - 右侧：选中决策的完整流程详情
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GitBranch,
  Clock,
  CircleNotch,
  WarningCircle,
  Lightning,
  Target,
  Database,
  Flask,
  WifiHigh,
  WifiSlash,
} from '../../components/Icon';
import {
  getMixedDecisions,
  getDecisionDetail,
  subscribeToDecisions,
} from '../../services/aboutApi';
import type {
  RecentDecision,
  DecisionDetail,
  MixedDecisions,
  SSEDecisionEvent,
} from '../../services/aboutApi';
import { DecisionDetailPanel } from './components/DecisionDetailPanel';
import { amasLogger } from '../../utils/logger';

interface DecisionCardProps {
  decision: RecentDecision;
  isSelected: boolean;
  onClick: () => void;
  source: 'real' | 'virtual';
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-green-100 text-green-700 border-green-200',
  mid: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
};

function DecisionCard({ decision, isSelected, onClick, source }: DecisionCardProps) {
  const difficultyStyle =
    DIFFICULTY_STYLES[decision.strategy.difficulty?.toLowerCase() || ''] ||
    'bg-slate-100 text-slate-600 border-slate-200';

  const sourceStyle =
    source === 'real'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : 'bg-purple-100 text-purple-700 border-purple-200';

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const baseClasses =
    'p-3 mb-3 rounded-lg cursor-pointer border transition-all duration-200 group hover:shadow-md hover:scale-[1.01]';
  const selectedClasses = isSelected
    ? 'bg-indigo-50/80 border-indigo-500 shadow-sm ring-1 ring-indigo-200'
    : 'bg-white border-slate-200 hover:border-indigo-200';

  return (
    <div onClick={onClick} className={`${baseClasses} ${selectedClasses}`}>
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <Clock size={12} />
          <span>{formatTime(decision.timestamp)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${sourceStyle}`}>
            {source === 'real' ? '真实' : '模拟'}
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${difficultyStyle}`}
          >
            {decision.strategy.difficulty || 'N/A'}
          </span>
        </div>
      </div>

      <div className="mb-1 flex items-center gap-2">
        <div
          className={`rounded-md p-1 ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:text-indigo-500'}`}
        >
          <GitBranch size={16} />
        </div>
        <div className="overflow-hidden">
          <p className="truncate text-sm font-semibold text-slate-800">{decision.pseudoId}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100/80 pt-2">
        <span className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
          <Lightning size={12} />
          {decision.decisionSource}
        </span>
        <span className="font-mono text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
          ID: {decision.decisionId.slice(-4)}
        </span>
      </div>
    </div>
  );
}

interface DecisionWithSource extends RecentDecision {
  source: 'real' | 'virtual';
}

export default function DashboardPage() {
  const [mixedData, setMixedData] = useState<MixedDecisions | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<'real' | 'virtual'>('real');
  const [selectedDecision, setSelectedDecision] = useState<DecisionDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'real' | 'virtual'>('all');
  const [isSSEConnected, setIsSSEConnected] = useState(false);

  // 用于跟踪是否已选择过决策
  const hasSelectedRef = useRef(false);

  // 合并并排序决策列表
  const allDecisions: DecisionWithSource[] = mixedData
    ? [
        ...mixedData.real.map((d) => ({ ...d, source: 'real' as const })),
        ...mixedData.virtual.map((d) => ({ ...d, source: 'virtual' as const })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [];

  const filteredDecisions =
    activeTab === 'all' ? allDecisions : allDecisions.filter((d) => d.source === activeTab);

  // SSE 事件处理：添加新决策到列表
  const handleNewDecision = useCallback((event: SSEDecisionEvent) => {
    const newDecision: RecentDecision = {
      decisionId: event.decisionId,
      pseudoId: event.pseudoId,
      timestamp: event.timestamp,
      decisionSource: event.decisionSource,
      strategy: event.strategy,
      dominantFactor: event.dominantFactor,
    };

    setMixedData((prev) => {
      if (!prev) {
        return {
          real: event.source === 'real' ? [newDecision] : [],
          virtual: event.source === 'virtual' ? [newDecision] : [],
        };
      }

      // 添加到对应列表的开头，限制最多 50 条
      if (event.source === 'real') {
        return {
          ...prev,
          real: [newDecision, ...prev.real.filter((d) => d.decisionId !== event.decisionId)].slice(
            0,
            50,
          ),
        };
      } else {
        return {
          ...prev,
          virtual: [
            newDecision,
            ...prev.virtual.filter((d) => d.decisionId !== event.decisionId),
          ].slice(0, 50),
        };
      }
    });
  }, []);

  // 初始加载 + SSE 实时推送
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    // 首次加载历史数据
    const fetchInitial = async () => {
      try {
        const data = await getMixedDecisions();
        if (!isMounted) return;

        setMixedData(data);
        setError(null);

        // 自动选择第一条
        const allDecs = [
          ...data.real.map((d) => ({ ...d, source: 'real' as const })),
          ...data.virtual.map((d) => ({ ...d, source: 'virtual' as const })),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (allDecs.length > 0 && !hasSelectedRef.current) {
          setSelectedId(allDecs[0].decisionId);
          setSelectedSource(allDecs[0].source);
          hasSelectedRef.current = true;
        }
      } catch (err) {
        if (isMounted) {
          amasLogger.error({ err }, '获取近期决策列表失败');
          setError('无法连接到决策服务');
        }
      } finally {
        if (isMounted) setIsLoadingList(false);
      }
    };

    fetchInitial();

    // 建立 SSE 连接
    unsubscribe = subscribeToDecisions(
      // 收到新决策
      (event) => {
        if (isMounted) {
          handleNewDecision(event);
        }
      },
      // 连接成功
      () => {
        if (isMounted) {
          setIsSSEConnected(true);
          amasLogger.info('[Dashboard] SSE connected');
        }
      },
      // 连接错误
      () => {
        if (isMounted) {
          setIsSSEConnected(false);
          amasLogger.warn('[Dashboard] SSE connection error');
        }
      },
    );

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [handleNewDecision]);

  // Fetch decision detail when selection changes
  useEffect(() => {
    if (!selectedId) return;

    let isMounted = true;
    const fetchDetail = async () => {
      setIsLoadingDetail(true);
      setDetailError(null);
      try {
        // 传递 source 参数区分真实/模拟数据
        const detail = await getDecisionDetail(selectedId, selectedSource);
        if (isMounted) {
          if (!detail) {
            setSelectedDecision(null);
            setDetailError('未找到该决策记录');
          } else {
            setSelectedDecision(detail);
            setDetailError(null);
          }
        }
      } catch (err) {
        amasLogger.error(
          { err, decisionId: selectedId, source: selectedSource },
          '获取决策详情失败',
        );
        if (isMounted) {
          setSelectedDecision(null);
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (errorMessage.includes('400')) {
            setDetailError('获取决策详情失败');
          } else if (errorMessage.includes('401') || errorMessage.includes('未授权')) {
            setDetailError('请先登录后查看决策详情');
          } else if (errorMessage.includes('403')) {
            setDetailError('无权限查看该决策详情');
          } else {
            setDetailError('加载决策详情失败，请稍后重试');
          }
        }
      } finally {
        if (isMounted) setIsLoadingDetail(false);
      }
    };

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedId, selectedSource]);

  const handleDecisionClick = (id: string, source: 'real' | 'virtual') => {
    if (id !== selectedId || source !== selectedSource) {
      setSelectedId(id);
      setSelectedSource(source);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Left Sidebar */}
      <aside className="z-10 flex w-[300px] flex-shrink-0 flex-col border-r border-slate-200 bg-white/90 shadow-xl backdrop-blur-lg">
        {/* Sidebar Header */}
        <div className="border-b border-slate-200 bg-white/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
              <Target size={18} weight="fill" className="text-indigo-500" />
              近期决策
            </h2>
            {isLoadingList && (
              <CircleNotch size={16} weight="bold" className="animate-spin text-indigo-400" />
            )}
          </div>
          {/* Tab Filter */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              全部 ({allDecisions.length})
            </button>
            <button
              onClick={() => setActiveTab('real')}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
                activeTab === 'real'
                  ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              <Database size={12} />
              真实 ({mixedData?.real.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('virtual')}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
                activeTab === 'virtual'
                  ? 'bg-purple-50 text-purple-700 shadow-sm'
                  : 'text-slate-500 hover:text-purple-600'
              }`}
            >
              <Flask size={12} />
              模拟 ({mixedData?.virtual.length || 0})
            </button>
          </div>
        </div>

        {/* Sidebar List */}
        <div className="flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="flex h-40 flex-col items-center justify-center p-4 text-center text-slate-400">
              <WarningCircle size={32} weight="fill" className="mb-2 text-red-300" />
              <p className="text-xs">{error}</p>
            </div>
          ) : filteredDecisions.length === 0 && !isLoadingList ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {activeTab === 'real'
                ? '暂无真实决策记录，请先在学习页面使用系统'
                : activeTab === 'virtual'
                  ? '暂无模拟决策数据'
                  : '暂无决策记录'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredDecisions.map((decision) => (
                <DecisionCard
                  key={`${decision.source}-${decision.decisionId}`}
                  decision={decision}
                  isSelected={
                    selectedId === decision.decisionId && selectedSource === decision.source
                  }
                  onClick={() => handleDecisionClick(decision.decisionId, decision.source)}
                  source={decision.source}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-50/50 p-3 text-center text-[10px] text-slate-400">
          {isSSEConnected ? (
            <>
              <WifiHigh size={14} weight="fill" className="text-green-500" />
              <span className="text-green-600">实时连接中</span>
            </>
          ) : (
            <>
              <WifiSlash size={14} weight="fill" className="text-amber-500" />
              <span className="text-amber-600">连接中断，尝试重连...</span>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative flex h-full flex-1 flex-col overflow-hidden">
        {isLoadingDetail && (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm backdrop-blur">
            <CircleNotch size={14} weight="bold" className="animate-spin text-indigo-500" />
            Loading details...
          </div>
        )}

        {detailError && (
          <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 shadow-sm">
            <WarningCircle size={16} weight="fill" />
            {detailError}
          </div>
        )}

        <DecisionDetailPanel decision={detailError ? null : selectedDecision} />
      </main>
    </div>
  );
}
