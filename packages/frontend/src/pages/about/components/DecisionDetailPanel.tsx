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
      <div className="flex h-full items-center justify-center rounded-card border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center text-slate-400">
          <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm font-medium">请从左侧选择一条决策记录</p>
          <p className="mt-1 text-xs text-slate-300">Select a decision to view details</p>
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
      second: '2-digit',
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header Section */}
        <header className="rounded-card border border-slate-200 bg-white/80 p-5 shadow-soft backdrop-blur-md">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <GitBranch size={20} weight="bold" className="text-indigo-500" />
                决策轨迹
              </h2>
              <div className="mt-1.5 font-mono text-xs text-slate-500">
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5">
                  {decision.decisionId}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock size={14} />
              <span className="font-mono">{formatTimestamp(decision.timestamp)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-button bg-indigo-50 p-2 text-indigo-600">
                <IdentificationBadge size={18} weight="fill" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Pseudo ID</p>
                <p className="font-mono text-sm font-medium text-slate-700">{decision.pseudoId}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-button bg-emerald-50 p-2 text-emerald-600">
                <Hash size={18} weight="fill" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">决策来源</p>
                <p className="text-sm font-medium capitalize text-slate-700">
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
            <MemberVotesSection votes={decision.memberVotes} weights={decision.weights} />
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
