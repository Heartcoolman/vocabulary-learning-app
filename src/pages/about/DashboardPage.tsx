/**
 * AMAS Decision Flow Dashboard
 *
 * 决策流程仪表盘 - 完整展示决策全流程
 * - 左侧：近期决策列表（实时轮询）
 * - 右侧：选中决策的完整流程详情
 */

import { useState, useEffect } from 'react';
import { GitBranch, Clock, CircleNotch, WarningCircle, Lightning, Target } from '../../components/Icon';
import { getRecentDecisions, getDecisionDetail } from '../../services/aboutApi';
import type { RecentDecision, DecisionDetail } from '../../services/aboutApi';
import { DecisionDetailPanel } from './components/DecisionDetailPanel';

interface DecisionCardProps {
  decision: RecentDecision;
  isSelected: boolean;
  onClick: () => void;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-green-100 text-green-700 border-green-200',
  mid: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200'
};

function DecisionCard({ decision, isSelected, onClick }: DecisionCardProps) {
  const difficultyStyle = DIFFICULTY_STYLES[decision.strategy.difficulty?.toLowerCase() || ''] ||
    'bg-slate-100 text-slate-600 border-slate-200';

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const baseClasses = 'p-3 mb-3 rounded-lg cursor-pointer border transition-all duration-200 group hover:shadow-md hover:scale-[1.01]';
  const selectedClasses = isSelected
    ? 'bg-indigo-50/80 border-indigo-500 shadow-sm ring-1 ring-indigo-200'
    : 'bg-white border-slate-200 hover:border-indigo-200';

  return (
    <div onClick={onClick} className={`${baseClasses} ${selectedClasses}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
          <Clock size={12} />
          <span>{formatTime(decision.timestamp)}</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider ${difficultyStyle}`}>
          {decision.strategy.difficulty || 'N/A'}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1 rounded-md ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:text-indigo-500'}`}>
          <GitBranch size={16} />
        </div>
        <div className="overflow-hidden">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {decision.pseudoId}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80">
        <span className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
          <Lightning size={12} />
          {decision.decisionSource}
        </span>
        <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
          ID: {decision.decisionId.slice(-4)}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [recentDecisions, setRecentDecisions] = useState<RecentDecision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<DecisionDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Poll recent decisions every 3 seconds
  useEffect(() => {
    let isMounted = true;

    const fetchRecent = async () => {
      try {
        const decisions = await getRecentDecisions();
        if (!isMounted) return;

        setRecentDecisions(decisions);
        setError(null);

        // Auto-select first decision if none selected
        if (decisions.length > 0) {
          setSelectedId(prev => prev === null ? decisions[0].decisionId : prev);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch recent decisions:', err);
          setError('无法连接到决策服务');
        }
      } finally {
        if (isMounted) setIsLoadingList(false);
      }
    };

    fetchRecent();
    const interval = setInterval(fetchRecent, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch decision detail when selection changes
  useEffect(() => {
    if (!selectedId) return;

    let isMounted = true;
    const fetchDetail = async () => {
      setIsLoadingDetail(true);
      setDetailError(null);
      try {
        const detail = await getDecisionDetail(selectedId);
        if (isMounted) {
          if (!detail) {
            // detail为null表示404（决策不存在）或网络错误
            setSelectedDecision(null);
            setDetailError('未找到该决策记录');
          } else {
            setSelectedDecision(detail);
            setDetailError(null);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch details for ${selectedId}:`, err);
        if (isMounted) {
          setSelectedDecision(null);
          const errorMessage = err instanceof Error ? err.message : String(err);
          // 区分不同错误类型
          if (errorMessage.includes('400') || errorMessage.includes('仅支持真实数据源')) {
            setDetailError('演示模式不支持查看决策详情，请切换至真实数据源');
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
  }, [selectedId]);

  const handleDecisionClick = (id: string) => {
    if (id !== selectedId) {
      setSelectedId(id);
    }
  };

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">

      {/* Left Sidebar */}
      <aside className="w-[300px] flex flex-col flex-shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur-lg shadow-xl z-10">

        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Target size={18} weight="fill" className="text-indigo-500" />
            近期决策
          </h2>
          {isLoadingList && <CircleNotch size={16} weight="bold" className="animate-spin text-indigo-400" />}
        </div>

        {/* Sidebar List */}
        <div className="flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-center p-4">
              <WarningCircle size={32} weight="fill" className="mb-2 text-red-300" />
              <p className="text-xs">{error}</p>
            </div>
          ) : recentDecisions.length === 0 && !isLoadingList ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              暂无近期决策记录
            </div>
          ) : (
            <div className="space-y-1">
              {recentDecisions.map((decision) => (
                <DecisionCard
                  key={decision.decisionId}
                  decision={decision}
                  isSelected={selectedId === decision.decisionId}
                  onClick={() => handleDecisionClick(decision.decisionId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 text-[10px] text-center text-slate-400">
          Auto-refreshing every 3s
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        {isLoadingDetail && (
          <div className="absolute top-4 right-4 z-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-200 flex items-center gap-2 text-xs text-slate-500">
            <CircleNotch size={14} weight="bold" className="animate-spin text-indigo-500" />
            Loading details...
          </div>
        )}

        {detailError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-md shadow-sm text-sm flex items-center gap-2">
            <WarningCircle size={16} weight="fill" />
            {detailError}
          </div>
        )}

        <DecisionDetailPanel decision={detailError ? null : selectedDecision} />
      </main>
    </div>
  );
}
