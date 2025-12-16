/**
 * FlowCanvas - 管道可视化主画布
 *
 * 负责渲染整个管道流程图，包括节点、连线和数据包
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { FlowNode, NodePositionInfo } from './FlowNode';
import { ConnectionLine, ConnectionFilters } from './ConnectionLine';
import { DataPacketFilters } from './DataPacket';
import { ControlPanel } from './ControlPanel';
import { DetailsPanel } from './DetailsPanel';
import { PIPELINE_NODES, CONNECTIONS, STAGES } from './constants';
import type {
  PipelineNode,
  NodeState,
  PipelineSnapshot,
  PacketTrace,
  FaultInjectionRequest,
  FaultInjectionResponse,
} from './types';
import { amasLogger } from '@/utils/logger';

interface FlowCanvasProps {
  snapshot: PipelineSnapshot | null;
  onInjectFault: (request: FaultInjectionRequest) => Promise<FaultInjectionResponse>;
  onFetchTrace?: (packetId: string) => Promise<PacketTrace>;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  snapshot,
  onInjectFault,
  onFetchTrace,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePositionInfo>>({});
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<PacketTrace | null>(null);

  // 按阶段分组节点
  const nodesByStage = useMemo(() => {
    const groups: Record<number, PipelineNode[]> = {};
    for (const node of PIPELINE_NODES) {
      if (!groups[node.stage]) {
        groups[node.stage] = [];
      }
      groups[node.stage].push(node);
    }
    return groups;
  }, []);

  // 获取节点状态
  const getNodeState = useCallback(
    (nodeId: string): NodeState => {
      if (snapshot?.nodeStates[nodeId]) {
        return snapshot.nodeStates[nodeId];
      }
      return {
        id: nodeId,
        status: 'idle',
        load: 0,
        processedCount: 0,
        lastProcessedAt: 0,
      };
    },
    [snapshot],
  );

  // 注册节点位置
  const handleRegisterPosition = useCallback((id: string, pos: NodePositionInfo) => {
    setNodePositions((prev) => ({ ...prev, [id]: pos }));
  }, []);

  // 点击节点
  const handleNodeClick = useCallback(
    async (node: PipelineNode) => {
      setSelectedNode(node);
      if (onFetchTrace) {
        try {
          // 获取最近的数据包轨迹
          const trace = await onFetchTrace('latest');
          setSelectedTrace(trace);
        } catch (error) {
          amasLogger.error({ err: error, nodeId: node.id }, '获取轨迹失败');
        }
      }
    },
    [onFetchTrace],
  );

  // 关闭详情面板
  const handleCloseDetails = useCallback(() => {
    setSelectedNode(null);
    setSelectedTrace(null);
  }, []);

  // 计算连线的路径数据
  const getConnectionPath = useCallback(
    (fromId: string, toId: string): string | null => {
      const from = nodePositions[fromId];
      const to = nodePositions[toId];
      if (!from || !to) return null;

      const start = from.output;
      const end = to.input;
      const deltaX = end.x - start.x;

      // 计算控制点
      const cp1x = start.x + deltaX * 0.4;
      const cp2x = end.x - deltaX * 0.4;

      return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
    },
    [nodePositions],
  );

  // 判断连线是否应该高亮
  const isConnectionHighlighted = useCallback(
    (fromId: string, toId: string): boolean => {
      if (!hoveredNodeId) return false;
      return fromId === hoveredNodeId || toId === hoveredNodeId;
    },
    [hoveredNodeId],
  );

  // 判断连线是否有数据包
  const hasPacketOnConnection = useCallback(
    (fromId: string, toId: string): boolean => {
      if (!snapshot?.currentPackets || isPaused) return false;
      // 简化逻辑：如果有数据包在相关阶段就显示
      const fromNode = PIPELINE_NODES.find((n) => n.id === fromId);
      const toNode = PIPELINE_NODES.find((n) => n.id === toId);
      if (!fromNode || !toNode) return false;

      return snapshot.currentPackets.some(
        (p) => p.currentStage === fromNode.stage || p.currentStage === toNode.stage,
      );
    },
    [snapshot, isPaused],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-950">
      {/* 背景网格 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #64748b 1px, transparent 1px),
            linear-gradient(to bottom, #64748b 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* SVG层：连线和数据包 */}
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full">
        <ConnectionFilters />
        <DataPacketFilters />

        {/* 渲染所有连接 */}
        {CONNECTIONS.map((conn) => {
          const pathData = getConnectionPath(conn.from, conn.to);
          if (!pathData) return null;

          return (
            <ConnectionLine
              key={`${conn.from}-${conn.to}`}
              start={nodePositions[conn.from]?.output || { x: 0, y: 0 }}
              end={nodePositions[conn.to]?.input || { x: 0, y: 0 }}
              type={conn.type}
              isHighlighted={isConnectionHighlighted(conn.from, conn.to)}
              hasPacket={hasPacketOnConnection(conn.from, conn.to)}
            />
          );
        })}
      </svg>

      {/* 节点层：响应式6列布局 */}
      <div className="relative z-10 grid h-full grid-cols-2 gap-3 overflow-auto p-4 md:grid-cols-3 lg:grid-cols-6 lg:gap-4 lg:p-6">
        {[1, 2, 3, 4, 5, 6].map((stage) => {
          const stageInfo = STAGES.find((s) => s.id === stage);
          const nodesInStage = nodesByStage[stage] || [];

          return (
            <div key={stage} className="flex flex-col">
              {/* 阶段标题 */}
              <div
                className="mb-4 border-b border-slate-800 pb-2 text-center"
                style={{ borderColor: `${stageInfo?.color}40` }}
              >
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: stageInfo?.color }}
                >
                  {stageInfo?.name}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">{stageInfo?.description}</div>
              </div>

              {/* 节点列表 */}
              <div className="flex flex-1 flex-col justify-center gap-3">
                {nodesInStage.map((node) => (
                  <FlowNode
                    key={node.id}
                    node={node}
                    state={getNodeState(node.id)}
                    isSelected={selectedNode?.id === node.id}
                    isHighlighted={hoveredNodeId === node.id}
                    onClick={handleNodeClick}
                    onHover={setHoveredNodeId}
                    onRegisterPosition={handleRegisterPosition}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 指标面板 */}
      {snapshot && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-2 lg:gap-3"
        >
          <MetricCard label="吞吐量" value={`${snapshot.metrics.throughput}/s`} color="#22d3ee" />
          <MetricCard label="平均延迟" value={`${snapshot.metrics.avgLatency}ms`} color="#a78bfa" />
          <MetricCard
            label="活跃数据包"
            value={snapshot.metrics.activePackets.toString()}
            color="#34d399"
          />
          <MetricCard
            label="总处理量"
            value={snapshot.metrics.totalProcessed.toString()}
            color="#fbbf24"
          />
        </motion.div>
      )}

      {/* 控制面板 */}
      <ControlPanel
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onInjectFault={onInjectFault}
      />

      {/* 详情侧边栏 */}
      <DetailsPanel
        node={selectedNode}
        state={selectedNode ? getNodeState(selectedNode.id) : null}
        trace={selectedTrace}
        onClose={handleCloseDetails}
      />
    </div>
  );
};

/** 指标卡片 */
const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="rounded-button border border-slate-700 bg-slate-900/90 px-3 py-2 backdrop-blur-md">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="font-mono text-lg font-bold" style={{ color }}>
      {value}
    </div>
  </div>
);

export default FlowCanvas;
