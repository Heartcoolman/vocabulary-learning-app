import React from 'react';
import { Check, X, Minus } from '@/components/Icon';
import type { PipelineStageDetail } from '@/services/aboutApi';

const STAGE_NAMES: Record<string, string> = {
  PERCEPTION: '感知',
  MODELING: '建模',
  LEARNING: '学习',
  DECISION: '决策',
  EVALUATION: '评估',
  OPTIMIZATION: '优化'
};

const STAGE_COLORS: Record<string, string> = {
  SUCCESS: '#10b981',
  FAILED: '#ef4444',
  SKIPPED: '#94a3b8'
};

interface MiniPipelineFlowProps {
  stages: PipelineStageDetail[];
}

export function MiniPipelineFlow({ stages }: MiniPipelineFlowProps) {
  const orderedStages = ['PERCEPTION', 'MODELING', 'LEARNING', 'DECISION', 'EVALUATION', 'OPTIMIZATION'];

  const stageMap = new Map(stages.map(s => [s.stageType, s]));

  return (
    <div>
      <h3 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
        流水线执行轨迹
      </h3>

      <div className="bg-white/60 backdrop-blur-sm rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          {orderedStages.map((stageType, index) => {
            const stage = stageMap.get(stageType);
            const status = stage?.status || 'SKIPPED';
            const color = STAGE_COLORS[status] || STAGE_COLORS.SKIPPED;
            const isLast = index === orderedStages.length - 1;

            return (
              <React.Fragment key={stageType}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all"
                    style={{
                      borderColor: color,
                      backgroundColor: status === 'SUCCESS' ? `${color}15` : 'white'
                    }}
                  >
                    {status === 'SUCCESS' && <Check size={16} color={color} weight="bold" />}
                    {status === 'FAILED' && <X size={16} color={color} weight="bold" />}
                    {status === 'SKIPPED' && <Minus size={16} color={color} />}
                  </div>

                  <span className="text-[9px] text-slate-600 mt-1.5 font-medium text-center">
                    {STAGE_NAMES[stageType]}
                  </span>

                  {stage?.durationMs !== undefined && (
                    <span className="text-[8px] text-slate-400 font-mono">
                      {stage.durationMs}ms
                    </span>
                  )}
                </div>

                {!isLast && (
                  <div
                    className="w-6 h-0.5 -mt-4 flex-shrink-0"
                    style={{
                      backgroundColor: stageMap.get(orderedStages[index + 1])?.status === 'SUCCESS'
                        ? STAGE_COLORS.SUCCESS + '60'
                        : '#e2e8f0'
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
