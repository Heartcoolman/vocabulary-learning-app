/**
 * ConnectionLine - SVG连线组件
 *
 * 绘制节点之间的贝塞尔曲线连接
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ConnectionType } from './types';

interface Point {
  x: number;
  y: number;
}

interface ConnectionLineProps {
  start: Point;
  end: Point;
  type?: ConnectionType;
  isActive?: boolean;
  isHighlighted?: boolean;
  hasPacket?: boolean;
  packetColor?: string;
  curvature?: number;
}

/** 连接类型颜色 */
const TYPE_COLORS: Record<ConnectionType, string> = {
  normal: '#475569',
  branch: '#6366f1',
  merge: '#8b5cf6',
  feedback: '#f472b6',
};

export const ConnectionLine: React.FC<ConnectionLineProps> = ({
  start,
  end,
  type = 'normal',
  isActive = false,
  isHighlighted = false,
  hasPacket = false,
  packetColor = '#38bdf8',
  curvature = 0.4,
}) => {
  // 计算贝塞尔曲线路径
  const pathData = useMemo(() => {
    const deltaX = end.x - start.x;

    // 根据连接类型调整曲线
    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

    if (type === 'feedback') {
      // 反馈连接：向下弯曲的曲线
      const offset = Math.abs(deltaX) * 0.3;
      cp1x = start.x;
      cp1y = start.y + offset;
      cp2x = end.x;
      cp2y = end.y + offset;
    } else if (type === 'branch' || type === 'merge') {
      // 分支/合并：更平滑的曲线
      cp1x = start.x + deltaX * curvature;
      cp1y = start.y;
      cp2x = end.x - deltaX * curvature;
      cp2y = end.y;
    } else {
      // 普通连接：标准S曲线
      cp1x = start.x + deltaX * curvature;
      cp1y = start.y;
      cp2x = end.x - deltaX * curvature;
      cp2y = end.y;
    }

    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
  }, [start, end, type, curvature]);

  // 获取线条颜色
  const strokeColor = useMemo(() => {
    if (isHighlighted || isActive) return '#22d3ee';
    return TYPE_COLORS[type];
  }, [type, isHighlighted, isActive]);

  const strokeWidth = isActive ? 2 : 1.5;
  const strokeOpacity = isActive || isHighlighted ? 0.9 : 0.4;

  return (
    <g className="pointer-events-none">
      {/* 主线条 */}
      <motion.path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        strokeDasharray={type === 'feedback' ? '4 4' : undefined}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {/* 高亮发光层 */}
      {(isActive || isHighlighted) && (
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={4}
          strokeOpacity={0.15}
          strokeLinecap="round"
          className="blur-[2px]"
        />
      )}

      {/* 数据传输粒子动画 */}
      {hasPacket && (
        <>
          {/* 主粒子 */}
          <motion.circle
            r={4}
            fill={packetColor}
            filter="url(#glow)"
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{
              duration: 1.5,
              ease: 'linear',
              repeat: Infinity,
              repeatDelay: 0.3,
            }}
            style={{ offsetPath: `path('${pathData}')` } as React.CSSProperties}
          />

          {/* 拖尾粒子 */}
          <motion.circle
            r={2.5}
            fill={packetColor}
            opacity={0.6}
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{
              duration: 1.5,
              ease: 'linear',
              repeat: Infinity,
              repeatDelay: 0.3,
              delay: 0.08,
            }}
            style={{ offsetPath: `path('${pathData}')` } as React.CSSProperties}
          />
        </>
      )}
    </g>
  );
};

/** SVG滤镜定义（放在父SVG中） */
export const ConnectionFilters: React.FC = () => (
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

export default ConnectionLine;
