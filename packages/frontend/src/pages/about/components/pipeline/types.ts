/**
 * AMAS Neural Pipeline 可视化类型定义
 */

// 从API重新导出类型
export type {
  DataPacket,
  NodeState,
  PipelineSnapshot,
  PipelineMetrics,
  PacketTrace,
  StageTrace,
  FaultInjectionRequest,
  FaultInjectionResponse,
  PacketStatus,
} from '@/services/aboutApi';

/** 管道节点类型 */
export type PipelineNodeType =
  | 'perception'
  | 'model'
  | 'learner'
  | 'decision'
  | 'guard'
  | 'eval'
  | 'optim';

/** 管道节点定义 */
export interface PipelineNode {
  id: string;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  type: PipelineNodeType;
  description?: string;
  meta?: {
    inputDim?: string;
    outputDim?: string;
    algorithm?: string;
  };
}

/** 连接类型 */
export type ConnectionType = 'normal' | 'branch' | 'merge' | 'feedback';

/** 连接定义 */
export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
}

/** 阶段信息 */
export interface StageInfo {
  id: number;
  name: string;
  description: string;
  color: string;
  bgColor: string;
}

/** 节点位置 */
export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 控制面板状态 */
export interface ControlPanelState {
  isPaused: boolean;
  animationSpeed: number;
  showLabels: boolean;
}

/** 故障类型选项 */
export interface FaultOption {
  type: 'high_fatigue' | 'low_attention' | 'anomaly';
  label: string;
  description: string;
  color: string;
}
