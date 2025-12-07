import { motion } from 'framer-motion';
import { Brain, ChartBar, Lightning, Target } from '@/components/Icon';
import type { MemberVoteDetail } from '@/services/aboutApi';

const MEMBER_CONFIG: Record<
  string,
  {
    color: string;
    label: string;
    icon: typeof Brain;
  }
> = {
  thompson: { color: '#3b82f6', label: 'Thompson', icon: ChartBar },
  linucb: { color: '#a855f7', label: 'LinUCB', icon: Target },
  actr: { color: '#f59e0b', label: 'ACT-R', icon: Brain },
  heuristic: { color: '#10b981', label: 'Heuristic', icon: Lightning },
};

interface MemberVotesSectionProps {
  votes: MemberVoteDetail[];
  weights: Record<string, number>;
}

export function MemberVotesSection({ votes, weights }: MemberVotesSectionProps) {
  const members = ['thompson', 'linucb', 'actr', 'heuristic'];

  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
        成员投票详情
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {members.map((member) => {
          const vote = votes.find((v) => v.member === member);
          const weight = weights[member] || 0;
          const config = MEMBER_CONFIG[member];
          if (!config) return null;
          const Icon = config.icon;

          return (
            <div
              key={member}
              className="rounded-lg border border-slate-200 bg-white/60 p-3 backdrop-blur-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${config.color}15` }}
                >
                  <Icon size={14} color={config.color} weight="fill" />
                </div>
                <span className="text-xs font-semibold" style={{ color: config.color }}>
                  {config.label}
                </span>
              </div>

              {vote && vote.action && (
                <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  <div className="mb-0.5 text-[9px] text-slate-400">决策动作</div>
                  <div
                    className="truncate font-mono text-[10px] text-slate-700"
                    title={vote.action}
                  >
                    {vote.action}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">贡献度</span>
                  <span className="font-mono font-medium">
                    {((vote?.contribution || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: config.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(vote?.contribution || 0) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-between text-[10px] text-slate-500">
                <span>权重: {(weight * 100).toFixed(0)}%</span>
                <span>置信: {((vote?.confidence || 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
