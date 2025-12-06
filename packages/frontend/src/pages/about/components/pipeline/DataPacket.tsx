/**
 * DataPacket - 流动的数据包组件
 *
 * 在管道中展示流动的数据粒子
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { DataPacket as DataPacketType, PacketStatus } from './types';
import { PACKET_STATUS_COLORS } from './constants';

interface DataPacketProps {
  packet: DataPacketType;
  pathData: string;
  duration?: number;
  onComplete?: (packetId: string) => void;
}

export const DataPacketViz: React.FC<DataPacketProps> = ({
  packet,
  pathData,
  duration = 2,
  onComplete,
}) => {
  const status = packet.status as PacketStatus;
  const color = PACKET_STATUS_COLORS[status] || PACKET_STATUS_COLORS.normal;

  // 根据进度计算动画起始位置
  const initialProgress = `${packet.progress}%`;

  // 故障包有特殊样式
  const isFault = packet.status === 'fault_sim' || packet.status === 'blocked';

  return (
    <g className="pointer-events-none">
      {/* 主粒子 */}
      <motion.circle
        r={isFault ? 6 : 5}
        fill={color}
        filter={isFault ? 'url(#fault-glow)' : 'url(#glow)'}
        initial={{ offsetDistance: initialProgress }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          duration: duration * (1 - packet.progress / 100),
          ease: 'linear',
        }}
        onAnimationComplete={() => onComplete?.(packet.id)}
        style={{ offsetPath: `path('${pathData}')` } as React.CSSProperties}
      />

      {/* 故障包额外的脉冲效果 */}
      {isFault && (
        <motion.circle
          r={10}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          initial={{ offsetDistance: initialProgress, scale: 0.5, opacity: 0.8 }}
          animate={{
            offsetDistance: '100%',
            scale: [0.5, 1.5, 0.5],
            opacity: [0.8, 0, 0.8],
          }}
          transition={{
            duration: duration * (1 - packet.progress / 100),
            ease: 'linear',
            scale: { duration: 0.8, repeat: Infinity },
            opacity: { duration: 0.8, repeat: Infinity },
          }}
          style={{ offsetPath: `path('${pathData}')` } as React.CSSProperties}
        />
      )}

      {/* 拖尾 */}
      <motion.circle
        r={isFault ? 4 : 3}
        fill={color}
        opacity={0.5}
        initial={{ offsetDistance: initialProgress }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          duration: duration * (1 - packet.progress / 100),
          ease: 'linear',
          delay: 0.05,
        }}
        style={{ offsetPath: `path('${pathData}')` } as React.CSSProperties}
      />
    </g>
  );
};

/** 数据包滤镜定义 */
export const DataPacketFilters: React.FC = () => (
  <defs>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="fault-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values="1 0 0 0 0.2
                0 0.3 0 0 0
                0 0 0.3 0 0
                0 0 0 1 0"
      />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

export default DataPacketViz;
