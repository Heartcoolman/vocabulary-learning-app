/**
 * DetailsPanel - 节点详情侧边栏
 *
 * 点击节点时滑出，显示详细信息
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { g3SpringSnappy } from '@/utils/animations';
import type { PipelineNode, NodeState, PacketTrace, StageTrace } from './types';
import { STAGES, NODE_TYPE_COLORS } from './constants';

interface DetailsPanelProps {
  node: PipelineNode | null;
  state: NodeState | null;
  trace: PacketTrace | null;
  onClose: () => void;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({ node, state, trace, onClose }) => {
  const stageInfo = node ? STAGES.find((s) => s.id === node.stage) : null;
  const typeColor = node ? NODE_TYPE_COLORS[node.type] || '#64748b' : '#64748b';

  return (
    <AnimatePresence>
      {node && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-30 bg-black/30"
          />

          {/* 侧边栏 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={g3SpringSnappy}
            className="absolute right-0 top-0 z-40 h-full w-80 overflow-y-auto border-l border-slate-700 bg-slate-900/95 backdrop-blur-lg"
          >
            {/* 头部 */}
            <div
              className="border-b border-slate-700 p-4"
              style={{ background: `linear-gradient(135deg, ${typeColor}10, transparent)` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: typeColor }} />
                    <span className="text-xs uppercase tracking-wider text-slate-400">
                      {stageInfo?.name || `Stage ${node.stage}`}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{node.label}</h3>
                  {node.description && (
                    <p className="mt-1 text-sm text-slate-400">{node.description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* 状态信息 */}
            {state && (
              <div className="border-b border-slate-700 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  实时状态
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <StatusCard
                    label="状态"
                    value={state.status}
                    color={
                      state.status === 'processing'
                        ? '#22d3ee'
                        : state.status === 'warning'
                          ? '#fbbf24'
                          : state.status === 'error'
                            ? '#ef4444'
                            : '#64748b'
                    }
                  />
                  <StatusCard
                    label="负载"
                    value={`${(state.load * 100).toFixed(0)}%`}
                    color={state.load > 0.8 ? '#ef4444' : state.load > 0.5 ? '#fbbf24' : '#22d3ee'}
                  />
                  <StatusCard
                    label="已处理"
                    value={state.processedCount.toString()}
                    color="#a78bfa"
                  />
                  <StatusCard
                    label="最后活动"
                    value={state.lastProcessedAt > 0 ? formatTime(state.lastProcessedAt) : '-'}
                    color="#64748b"
                  />
                </div>
              </div>
            )}

            {/* 元信息 */}
            {node.meta && Object.keys(node.meta).length > 0 && (
              <div className="border-b border-slate-700 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  技术参数
                </h4>
                <div className="space-y-2">
                  {node.meta.inputDim && <MetaItem label="输入维度" value={node.meta.inputDim} />}
                  {node.meta.outputDim && <MetaItem label="输出维度" value={node.meta.outputDim} />}
                  {node.meta.algorithm && <MetaItem label="算法" value={node.meta.algorithm} />}
                </div>
              </div>
            )}

            {/* 处理轨迹 */}
            {trace && trace.stages.length > 0 && (
              <div className="p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  处理轨迹
                </h4>
                <div className="space-y-2">
                  {trace.stages.map((stage: StageTrace, index: number) => (
                    <TraceItem
                      key={index}
                      stage={stage}
                      isLast={index === trace.stages.length - 1}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-3 text-sm">
                  <span className="text-slate-500">总耗时</span>
                  <span className="font-mono text-cyan-400">{trace.totalDuration}ms</span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/** 状态卡片 */
const StatusCard: React.FC<{ label: string; value: string; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="rounded-lg bg-slate-800/50 p-2.5">
    <div className="mb-0.5 text-xs text-slate-500">{label}</div>
    <div className="text-sm font-medium" style={{ color }}>
      {value}
    </div>
  </div>
);

/** 元信息项 */
const MetaItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between border-b border-slate-800 py-1.5 last:border-0">
    <span className="text-sm text-slate-400">{label}</span>
    <span className="font-mono text-sm text-slate-200">{value}</span>
  </div>
);

/** 轨迹项 */
const TraceItem: React.FC<{ stage: StageTrace; isLast: boolean }> = ({ stage, isLast }) => (
  <div className="flex gap-3">
    {/* 时间线 */}
    <div className="flex flex-col items-center">
      <div className="h-2 w-2 rounded-full bg-cyan-500" />
      {!isLast && <div className="my-1 w-0.5 flex-1 bg-slate-700" />}
    </div>

    {/* 内容 */}
    <div className="flex-1 pb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">{stage.stageName}</span>
        <span className="font-mono text-xs text-slate-500">{stage.duration}ms</span>
      </div>
      <div className="mb-1 text-xs text-slate-400">
        {stage.input} → {stage.output}
      </div>
      {stage.details && (
        <div className="rounded bg-slate-800/50 px-2 py-1 text-xs text-slate-500">
          {stage.details}
        </div>
      )}
    </div>
  </div>
);

/** 格式化时间 */
function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return '刚刚';
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  return new Date(timestamp).toLocaleTimeString();
}

export default DetailsPanel;
