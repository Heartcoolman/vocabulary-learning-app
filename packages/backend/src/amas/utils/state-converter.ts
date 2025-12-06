import { UserState as BackendUserState, CognitiveProfile } from '../types';

export interface FrontendUserState {
  attention: number;
  fatigue: number;
  motivation: number;
  memory: number;
  speed: number;
  stability: number;
  cognitive?: CognitiveProfile;
  confidence?: number;
  timestamp?: number;
}

export function toFrontendState(state: BackendUserState): FrontendUserState {
  // 将后端的 mem 字段转换为前端期望的 memory 字段
  const frontendCognitive = {
    memory: state.C.mem,
    speed: state.C.speed,
    stability: state.C.stability
  };

  return {
    attention: state.A,
    fatigue: state.F,
    motivation: state.M,
    memory: state.C.mem,
    speed: state.C.speed,
    stability: state.C.stability,
    cognitive: frontendCognitive as unknown as CognitiveProfile,
    confidence: state.conf,
    timestamp: state.ts
  };
}

export function toBackendState(state: FrontendUserState, defaults: Partial<BackendUserState> = {}): BackendUserState {
  return {
    A: state.attention,
    F: state.fatigue,
    M: state.motivation,
    C: state.cognitive || { mem: state.memory, speed: state.speed, stability: state.stability },
    conf: state.confidence ?? 0.5,
    ts: state.timestamp ?? Date.now(),
    ...defaults
  };
}
