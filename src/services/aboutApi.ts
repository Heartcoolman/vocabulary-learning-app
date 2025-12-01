/**
 * AMAS 公开展示 API 客户端
 *
 * 提供模拟决策和统计数据的 API 调用
 */

const API_BASE = '/api/about';

// ==================== 类型定义 ====================

/** 模拟请求参数 */
export interface SimulateRequest {
  attention: number;
  fatigue: number;
  motivation: number;
  cognitive: {
    memory: number;
    speed: number;
    stability: number;
  };
  scenario?: 'newUser' | 'tired' | 'motivated' | 'struggling';
}

/** 状态快照 */
export interface StateSnapshot {
  A: number;
  F: number;
  M: number;
  C: {
    mem: number;
    speed: number;
    stability: number;
  };
  conf: number;
}

/** 投票详情 */
export interface MemberVote {
  action: string;
  contribution: number;
  confidence: number;
}

/** 集成权重 */
export interface EnsembleWeights {
  thompson: number;
  linucb: number;
  actr: number;
  heuristic: number;
}

/** 解释因素 */
export interface ExplanationFactor {
  name: string;
  value: number;
  impact: string;
  percentage: number;
}

/** 模拟响应 */
export interface SimulateResponse {
  inputState: StateSnapshot;
  decisionProcess: {
    phase: 'classify' | 'explore' | 'normal';
    votes: Record<string, MemberVote>;
    weights: EnsembleWeights;
    decisionSource: 'coldstart' | 'ensemble';
  };
  outputStrategy: {
    interval_scale: number;
    new_ratio: number;
    difficulty: string;
    batch_size: number;
    hint_level: number;
  };
  explanation: {
    factors: ExplanationFactor[];
    summary: string;
  };
}

/** 概览统计 */
export interface OverviewStats {
  todayDecisions: number;
  activeUsers: number;
  avgEfficiencyGain: number;
  timestamp: string;
}

/** 算法分布 */
export interface AlgorithmDistribution {
  thompson: number;
  linucb: number;
  actr: number;
  heuristic: number;
  coldstart: number;
}

/** 状态分布 */
export interface StateDistribution {
  attention: { low: number; medium: number; high: number };
  fatigue: { fresh: number; normal: number; tired: number };
  motivation: { frustrated: number; neutral: number; motivated: number };
}

/** 近期决策 */
export interface RecentDecision {
  decisionId: string;
  pseudoId: string;
  timestamp: string;
  decisionSource: string;
  strategy: {
    difficulty: string;
    batch_size: number;
  };
  dominantFactor: string;
}

/** Pipeline阶段详情 */
export interface PipelineStageDetail {
  stage: number;
  stageType: string;
  stageName: string;
  status: string;
  durationMs?: number;
  startedAt: string;
  endedAt?: string;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/** 成员投票详情 */
export interface MemberVoteDetail {
  member?: string;
  action: string;
  contribution: number;
  confidence: number;
}

/** 决策详情 */
export interface DecisionDetail {
  decisionId: string;
  timestamp: string;
  pseudoId: string;
  decisionSource: string;
  coldstartPhase?: string;
  confidence: number;
  reward?: number;
  totalDurationMs?: number;
  strategy: {
    interval_scale?: number;
    new_ratio?: number;
    difficulty?: string;
    batch_size?: number;
    hint_level?: number;
  };
  weights: Record<string, number>;
  memberVotes: MemberVoteDetail[];
  pipeline: PipelineStageDetail[];
}

// ==================== Pipeline 可视化类型 ====================

/** 数据包状态 */
export type PacketStatus = 'normal' | 'warning' | 'blocked' | 'fault_sim';

/** 数据包 */
export interface DataPacket {
  id: string;
  currentStage: 1 | 2 | 3 | 4 | 5 | 6;
  currentNode: string;
  progress: number;
  status: PacketStatus;
  faultType?: string;
  data: Record<string, number>;
  createdAt: number;
}

/** 节点状态 */
export interface NodeState {
  id: string;
  status: 'idle' | 'processing' | 'warning' | 'error';
  load: number;
  processedCount: number;
  lastProcessedAt: number;
}

/** 管道指标 */
export interface PipelineMetrics {
  throughput: number;
  avgLatency: number;
  activePackets: number;
  totalProcessed: number;
}

/** 管道快照 */
export interface PipelineSnapshot {
  timestamp: number;
  currentPackets: DataPacket[];
  nodeStates: Record<string, NodeState>;
  metrics: PipelineMetrics;
}

/** 阶段轨迹 */
export interface StageTrace {
  stage: string;
  stageName: string;
  nodeId: string;
  duration: number;
  input: string;
  output: string;
  details?: string;
  timestamp: number;
}

/** 数据包轨迹 */
export interface PacketTrace {
  packetId: string;
  status: 'completed' | 'in_progress' | 'blocked';
  stages: StageTrace[];
  totalDuration: number;
}

/** 故障注入请求 */
export interface FaultInjectionRequest {
  faultType: 'high_fatigue' | 'low_attention' | 'anomaly';
  intensity?: number;
}

/** 故障注入响应 */
export interface FaultInjectionResponse {
  packetId: string;
  faultType: string;
  expectedPath: string[];
  guardRailTriggers: string[];
  expectedOutcome: string;
}

/** API 响应包装 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== 辅助函数 ====================

/**
 * 获取认证token（用于需要管理员权限的真实数据接口）
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * 构建带认证的fetch headers
 */
function buildHeaders(additionalHeaders?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * 安全解析 JSON 响应
 */
async function parseJsonResponse<T>(response: Response, errorPrefix: string): Promise<T> {
  // 检查响应状态
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${errorPrefix}: HTTP ${response.status} - ${text || response.statusText}`);
  }

  // 检查内容类型
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(`${errorPrefix}: 响应不是 JSON 格式 - ${text.slice(0, 100)}`);
  }

  // 解析 JSON
  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${errorPrefix}: JSON 解析失败`);
  }

  // 检查业务状态
  if (!result.success || !result.data) {
    throw new Error(result.error || `${errorPrefix}: 未知错误`);
  }

  return result.data;
}

// ==================== API 函数 ====================

/**
 * 执行模拟决策
 */
export async function simulate(params: SimulateRequest): Promise<SimulateResponse> {
  const response = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });

  return parseJsonResponse<SimulateResponse>(response, '模拟请求失败');
}

/**
 * 获取概览统计
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const response = await fetch(`${API_BASE}/stats/overview`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<OverviewStats>(response, '获取统计失败');
}

/**
 * 获取算法分布
 */
export async function getAlgorithmDistribution(): Promise<AlgorithmDistribution> {
  const response = await fetch(`${API_BASE}/stats/algorithm-distribution`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<AlgorithmDistribution>(response, '获取算法分布失败');
}

/**
 * 获取状态分布
 */
export async function getStateDistribution(): Promise<StateDistribution> {
  const response = await fetch(`${API_BASE}/stats/state-distribution`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<StateDistribution>(response, '获取状态分布失败');
}

/**
 * 获取近期决策
 */
export async function getRecentDecisions(): Promise<RecentDecision[]> {
  const response = await fetch(`${API_BASE}/stats/recent-decisions`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<RecentDecision[]>(response, '获取近期决策失败');
}

/**
 * 获取决策详情
 * @returns DecisionDetail | null (404时返回null)
 * @throws Error 其他HTTP错误
 */
export async function getDecisionDetail(decisionId: string): Promise<DecisionDetail | null> {
  const response = await fetch(`${API_BASE}/decision/${encodeURIComponent(decisionId)}`, {
    headers: buildHeaders()
  });

  // 404表示决策不存在，返回null
  if (response.status === 404) return null;

  // 其他错误会由parseJsonResponse抛出
  return parseJsonResponse<DecisionDetail>(response, '获取决策详情失败');
}

// ==================== Pipeline 可视化 API ====================

/**
 * 获取管道实时快照
 */
export async function getPipelineSnapshot(): Promise<PipelineSnapshot> {
  const response = await fetch(`${API_BASE}/pipeline/snapshot`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<PipelineSnapshot>(response, '获取管道快照失败');
}

/**
 * 获取数据包处理轨迹
 */
export async function getPacketTrace(packetId: string): Promise<PacketTrace> {
  const response = await fetch(`${API_BASE}/pipeline/trace/${encodeURIComponent(packetId)}`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<PacketTrace>(response, '获取数据包轨迹失败');
}

/**
 * 注入故障测试
 */
export async function injectFault(request: FaultInjectionRequest): Promise<FaultInjectionResponse> {
  const response = await fetch(`${API_BASE}/pipeline/inject-fault`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });
  return parseJsonResponse<FaultInjectionResponse>(response, '故障注入失败');
}

// 默认导出
export default {
  simulate,
  getOverviewStats,
  getAlgorithmDistribution,
  getStateDistribution,
  getRecentDecisions,
  getDecisionDetail,
  getPipelineSnapshot,
  getPacketTrace,
  injectFault,
};
