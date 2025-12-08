/**
 * 用户状态格式转换工具
 *
 * 前端使用展开格式（可读性好）：attention, fatigue, motivation, memory, speed, stability
 * 后端使用紧凑格式（节省存储）：A, F, M, C.mem, C.speed, C.stability
 */

import { UserStateFrontend, UserStateBackend } from '../types/amas';

// 重新导出类型，保持向后兼容
export type { UserStateFrontend, UserStateBackend };

/**
 * 将展开格式转换为紧凑格式（前端 -> 后端存储）
 */
export function toCompactState(state: UserStateFrontend): UserStateBackend {
  return {
    A: state.attention,
    F: state.fatigue,
    M: state.motivation,
    C: {
      mem: state.memory,
      speed: state.speed,
      stability: state.stability,
    },
    conf: state.confidence,
    ts: state.timestamp,
  };
}

/**
 * 将紧凑格式转换为展开格式（后端 -> 前端）
 */
export function toExpandedState(compact: UserStateBackend): UserStateFrontend {
  return {
    attention: compact.A,
    fatigue: compact.F,
    motivation: compact.M,
    memory: compact.C.mem,
    speed: compact.C.speed,
    stability: compact.C.stability,
    confidence: compact.conf,
    timestamp: compact.ts,
  };
}
