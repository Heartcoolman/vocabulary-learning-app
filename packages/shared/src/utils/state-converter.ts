/**
 * 前端展开格式的用户状态
 */
export interface UserStateFrontend {
  attention: number;
  fatigue: number;
  motivation: number;
  memory: number;
  speed: number;
  stability: number;
  confidence?: number;
  timestamp?: number;
}

/**
 * 后端紧凑格式的用户状态
 */
export interface UserStateBackend {
  A: number;
  F: number;
  M: number;
  C: {
    mem: number;
    speed: number;
    stability: number;
  };
  conf?: number;
  ts?: number;
}

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
