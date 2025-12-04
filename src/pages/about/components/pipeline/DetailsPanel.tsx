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

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  node,
  state,
  trace,
  onClose,
}) => {
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
            className="absolute inset-0 bg-black/30 z-30"
          />

          {/* 侧边栏 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={g3SpringSnappy}
            className="absolute top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-lg border-l border-slate-700 z-40 overflow-y-auto"
          >
            {/* 头部 */}
            <div
              className="p-4 border-b border-slate-700"
              style={{ background: `linear-gradient(135deg, ${typeColor}10, transparent)` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: typeColor }}
                    />
                    <span className="text-xs text-slate-400 uppercase tracking-wider">
                      {stageInfo?.name || `Stage ${node.stage}`}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{node.label}</h3>
                  {node.description && (
                    <p className="text-sm text-slate-400 mt-1">{node.description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* 状态信息 */}
            {state && (
              <div className="p-4 border-b border-slate-700">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
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
              <div className="p-4 border-b border-slate-700">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  技术参数
                </h4>
                <div className="space-y-2">
                  {node.meta.inputDim && (
                    <MetaItem label="输入维度" value={node.meta.inputDim} />
                  )}
                  {node.meta.outputDim && (
                    <MetaItem label="输出维度" value={node.meta.outputDim} />
                  )}
                  {node.meta.algorithm && (
                    <MetaItem label="算法" value={node.meta.algorithm} />
                  )}
                </div>
              </div>
            )}

            {/* 处理轨迹 */}
            {trace && trace.stages.length > 0 && (
              <div className="p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  处理轨迹
                </h4>
                <div className="space-y-2">
                  {trace.stages.map((stage: StageTrace, index: number) => (
                    <TraceItem key={index} stage={stage} isLast={index === trace.stages.length - 1} />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between text-sm">
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
  <div className="bg-slate-800/50 rounded-lg p-2.5">
    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
    <div className="text-sm font-medium" style={{ color }}>
      {value}
    </div>
  </div>
);

/** 元信息项 */
const MetaItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
    <span className="text-sm text-slate-400">{label}</span>
    <span className="text-sm font-mono text-slate-200">{value}</span>
  </div>
);

/** 轨迹项 */
const TraceItem: React.FC<{ stage: StageTrace; isLast: boolean }> = ({ stage, isLast }) => (
  <div className="flex gap-3">
    {/* 时间线 */}
    <div className="flex flex-col items-center">
      <div className="w-2 h-2 rounded-full bg-cyan-500" />
      {!isLast && <div className="w-0.5 flex-1 bg-slate-700 my-1" />}
    </div>

    {/* 内容 */}
    <div className="flex-1 pb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-200">{stage.stageName}</span>
        <span className="text-xs font-mono text-slate-500">{stage.duration}ms</span>
      </div>
      <div className="text-xs text-slate-400 mb-1">
        {stage.input} → {stage.output}
      </div>
      {stage.details && (
        <div className="text-xs text-slate-500 bg-slate-800/50 rounded px-2 py-1">
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
