
import { Clock, Hash, GitBranch, IdentificationBadge } from '@/components/Icon';
import { MemberVotesSection } from './MemberVotesSection';
import { MiniPipelineFlow } from './MiniPipelineFlow';
import { DecisionMetricsSection } from './DecisionMetricsSection';
import type { DecisionDetail } from '@/services/aboutApi';

interface DecisionDetailPanelProps {
  decision: DecisionDetail | null;
}

export function DecisionDetailPanel({ decision }: DecisionDetailPanelProps) {
  if (!decision) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 border-dashed">
        <div className="text-center text-slate-400">
          <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm font-medium">请从左侧选择一条决策记录</p>
          <p className="text-xs mt-1 text-slate-300">Select a decision to view details</p>
        </div>
      </div>
    );
  }

  const formatTimestamp = (iso: string) => {
    return new Date(iso).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header Section */}
        <header className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <GitBranch size={20} weight="bold" className="text-indigo-500" />
                决策轨迹
              </h2>
              <div className="text-xs text-slate-500 font-mono mt-1.5">
                <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {decision.decisionId}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <Clock size={14} />
              <span className="font-mono">{formatTimestamp(decision.timestamp)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <IdentificationBadge size={18} weight="fill" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Pseudo ID</p>
                <p className="text-sm font-mono font-medium text-slate-700">{decision.pseudoId}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Hash size={18} weight="fill" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">决策来源</p>
                <p className="text-sm font-medium text-slate-700 capitalize">
                  {decision.decisionSource}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Pipeline Flow */}
        <section>
          <MiniPipelineFlow stages={decision.pipeline} />
        </section>

        {/* Member Votes (Ensemble Only) */}
        {decision.decisionSource === 'ensemble' && (
          <section>
            <MemberVotesSection
              votes={decision.memberVotes}
              weights={decision.weights}
            />
          </section>
        )}

        {/* Metrics & Strategy */}
        <section>
          <DecisionMetricsSection
            strategy={decision.strategy}
            confidence={decision.confidence}
            reward={decision.reward}
            totalDurationMs={decision.totalDurationMs}
            decisionSource={decision.decisionSource}
            coldstartPhase={decision.coldstartPhase}
          />
        </section>

      </div>
    </div>
  );
}
