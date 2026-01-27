/**
 * FlowNode - 管道节点组件
 *
 * 可交互的节点，显示状态、支持悬停高亮和点击详情
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Pulse,
  Warning,
  Lightning,
  Stack,
  Cpu,
  Database,
  ShieldCheck,
  TrendUp,
  Target,
} from '@/components/Icon';
import type { Icon } from '@/components/Icon';
import { g3SpringStandard } from '@/utils/animations';
import type { PipelineNode, NodeState, PipelineNodeType } from './types';
import { NODE_TYPE_COLORS } from './constants';

/** 节点位置信息 */
export interface NodePositionInfo {
  input: { x: number; y: number };
  output: { x: number; y: number };
}

interface FlowNodeProps {
  node: PipelineNode;
  state: NodeState;
  isSelected?: boolean;
  isHighlighted?: boolean;
  onClick: (node: PipelineNode) => void;
  onHover: (nodeId: string | null) => void;
  onRegisterPosition?: (id: string, pos: NodePositionInfo) => void;
}

/** 状态样式配置 */
const STATUS_STYLES = {
  idle: {
    border: 'border-slate-700',
    bg: 'bg-slate-800/50',
    text: 'text-slate-400',
    glow: '',
  },
  processing: {
    border: 'border-cyan-500/80',
    bg: 'bg-slate-800/90',
    text: 'text-cyan-100',
    glow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]',
  },
  warning: {
    border: 'border-amber-500/80',
    bg: 'bg-slate-800/90',
    text: 'text-amber-100',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]',
  },
  error: {
    border: 'border-red-500/80',
    bg: 'bg-red-900/20',
    text: 'text-red-100',
    glow: 'shadow-[0_0_10px_rgba(239,68,68,0.4)]',
  },
};

/** 类型图标映射 */
const TYPE_ICONS: Record<PipelineNodeType, Icon> = {
  perception: Stack,
  model: Cpu,
  learner: Database,
  decision: Target,
  guard: ShieldCheck,
  eval: TrendUp,
  optim: Pulse,
};

export const FlowNode: React.FC<FlowNodeProps> = ({
  node,
  state,
  isSelected = false,
  isHighlighted = false,
  onClick,
  onHover,
  onRegisterPosition,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const currentStyle = STATUS_STYLES[state.status] || STATUS_STYLES.idle;
  const typeColor = NODE_TYPE_COLORS[node.type] || '#64748b';

  // 注册节点位置
  useEffect(() => {
    if (!ref.current || !onRegisterPosition) return;

    const updatePosition = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const parentRect = el.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };

      const relativeLeft = rect.left - parentRect.left;
      const relativeTop = rect.top - parentRect.top;

      onRegisterPosition(node.id, {
        input: { x: relativeLeft, y: relativeTop + rect.height / 2 },
        output: { x: relativeLeft + rect.width, y: relativeTop + rect.height / 2 },
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(ref.current);

    window.addEventListener('resize', updatePosition);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [node.id, onRegisterPosition]);

  // 状态指示器图标
  const StatusIcon = useMemo(() => {
    switch (state.status) {
      case 'processing':
        return <Lightning size={12} className="animate-pulse text-cyan-400" weight="fill" />;
      case 'warning':
        return <Warning size={12} className="text-amber-400" weight="fill" />;
      case 'error':
        return <Warning size={12} className="text-red-500" weight="fill" />;
      default:
        return null;
    }
  }, [state.status]);

  // 类型图标
  const NodeIcon = TYPE_ICONS[node.type] || Stack;

  // 微型可视化
  const renderMicroViz = useCallback(() => {
    // 感知层：8维向量条形图
    if (node.stage === 1 && node.id === 'feature_builder') {
      return (
        <div className="mt-2 flex h-5 w-full items-end gap-[2px]">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className={`flex-1 rounded-sm ${
                state.status === 'processing' ? 'bg-cyan-500' : 'bg-slate-600'
              }`}
              initial={{ height: '20%' }}
              animate={{
                height: state.status === 'processing' ? `${30 + Math.random() * 70}%` : '20%',
              }}
              transition={{
                duration: 0.5,
                repeat: state.status === 'processing' ? Infinity : 0,
                repeatType: 'reverse',
                delay: i * 0.05,
              }}
            />
          ))}
        </div>
      );
    }

    // 学习层：权重进度条
    if (node.stage === 3) {
      return (
        <div className="mt-2 flex w-full items-center gap-1">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-700">
            <motion.div
              className="h-full bg-emerald-500"
              animate={{ width: `${state.load * 100}%` }}
              transition={g3SpringStandard}
            />
          </div>
          <span className="w-8 text-right font-mono text-[9px] text-slate-500 dark:text-gray-400">
            {(state.load * 100).toFixed(0)}%
          </span>
        </div>
      );
    }

    // 决策层护栏：盾牌指示
    if (node.type === 'guard') {
      return (
        <div className="mt-2 flex items-center justify-center">
          <motion.div
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              state.status === 'error'
                ? 'bg-red-500/30'
                : state.status === 'warning'
                  ? 'bg-amber-500/30'
                  : 'bg-emerald-500/30'
            }`}
            animate={state.status === 'error' ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <ShieldCheck
              size={14}
              weight="fill"
              className={
                state.status === 'error'
                  ? 'text-red-400'
                  : state.status === 'warning'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }
            />
          </motion.div>
        </div>
      );
    }

    // 默认：负载指示器
    return (
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-700">
        <motion.div
          className={`h-full ${state.status === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}
          animate={{ width: `${Math.max(10, state.load * 100)}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    );
  }, [node.stage, node.id, node.type, state.status, state.load]);

  return (
    <motion.div
      ref={ref}
      layoutId={`node-${node.id}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03, y: -2 }}
      onClick={() => onClick(node)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      transition={g3SpringStandard}
      className={`relative w-full min-w-[100px] max-w-[140px] cursor-pointer rounded-button border p-2 backdrop-blur-sm transition-colors duration-g3-fast lg:p-2.5 ${currentStyle.border} ${currentStyle.bg} ${currentStyle.glow} ${isSelected ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900' : ''} ${isHighlighted ? 'border-cyan-400/60' : ''} `}
    >
      {/* 头部：图标 + 状态 */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="rounded p-1" style={{ backgroundColor: `${typeColor}20` }}>
          <NodeIcon size={14} style={{ color: typeColor }} />
        </div>
        {StatusIcon}
      </div>

      {/* 标签 */}
      <div className="truncate text-xs font-medium leading-tight text-slate-200 dark:text-gray-300">
        {node.label}
      </div>

      {/* 元信息 */}
      {node.meta?.outputDim && (
        <div className="mt-0.5 truncate font-mono text-[9px] text-slate-500 dark:text-gray-400">
          {node.meta.outputDim}
        </div>
      )}

      {/* 微型可视化 */}
      {renderMicroViz()}

      {/* 处理中的发光效果 */}
      {state.status === 'processing' && (
        <motion.div
          className="absolute -inset-0.5 -z-10 rounded-button"
          style={{ backgroundColor: `${typeColor}10` }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
};

export default FlowNode;
