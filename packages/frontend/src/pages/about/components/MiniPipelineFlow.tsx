import React from 'react';
import { Check, X, Minus } from '@/components/Icon';
import type { PipelineStageDetail } from '@/services/aboutApi';

const STAGE_NAMES: Record<string, string> = {
  PERCEPTION: '感知',
  MODELING: '建模',
  LEARNING: '学习',
  DECISION: '决策',
  EVALUATION: '评估',
  OPTIMIZATION: '优化',
};

const STAGE_COLORS: Record<string, string> = {
  SUCCESS: '#10b981',
  FAILED: '#ef4444',
  SKIPPED: '#94a3b8',
};

interface MiniPipelineFlowProps {
  stages: PipelineStageDetail[];
}

export function MiniPipelineFlow({ stages }: MiniPipelineFlowProps) {
  const orderedStages = [
    'PERCEPTION',
    'MODELING',
    'LEARNING',
    'DECISION',
    'EVALUATION',
    'OPTIMIZATION',
  ];

  const stageMap = new Map(stages.map((s) => [s.stageType, s]));

  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-gray-400">
        流水线执行轨迹
      </h3>

      <div className="rounded-button border border-slate-200 bg-white/60 p-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex items-center justify-between">
          {orderedStages.map((stageType, index) => {
            const stage = stageMap.get(stageType);
            const status = stage?.status || 'SKIPPED';
            const color = STAGE_COLORS[status] || STAGE_COLORS.SKIPPED;
            const isLast = index === orderedStages.length - 1;

            return (
              <React.Fragment key={stageType}>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all"
                    style={{
                      borderColor: color,
                      backgroundColor: status === 'SUCCESS' ? `${color}15` : 'white',
                    }}
                  >
                    {status === 'SUCCESS' && <Check size={16} color={color} weight="bold" />}
                    {status === 'FAILED' && <X size={16} color={color} weight="bold" />}
                    {status === 'SKIPPED' && <Minus size={16} color={color} />}
                  </div>

                  <span className="mt-1.5 text-center text-[9px] font-medium text-slate-600 dark:text-gray-400">
                    {STAGE_NAMES[stageType]}
                  </span>

                  {stage?.durationMs !== undefined && (
                    <span className="font-mono text-[8px] text-slate-400 dark:text-gray-400">
                      {stage.durationMs}ms
                    </span>
                  )}
                </div>

                {!isLast && (
                  <div
                    className="-mt-4 h-0.5 w-6 flex-shrink-0"
                    style={{
                      backgroundColor:
                        stageMap.get(orderedStages[index + 1])?.status === 'SUCCESS'
                          ? STAGE_COLORS.SUCCESS + '60'
                          : '#e2e8f0',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
