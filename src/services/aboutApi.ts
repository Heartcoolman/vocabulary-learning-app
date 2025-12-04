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

/** 性能指标 */
export interface PerformanceMetrics {
  globalAccuracy: number;
  accuracyImprovement: number;
  avgInferenceMs: number;
  p99InferenceMs: number;
  causalATE: number;
  causalConfidence: number;
}

/** 优化事件 */
export interface OptimizationEvent {
  id: string;
  type: 'bayesian' | 'ab_test' | 'causal';
  title: string;
  description: string;
  timestamp: string;
  impact: string;
}

/** 掌握度雷达数据 */
export interface MasteryRadarData {
  speed: number;
  stability: number;
  complexity: number;
  consistency: number;
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
 * 获取性能指标
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const response = await fetch(`${API_BASE}/stats/performance`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<PerformanceMetrics>(response, '获取性能指标失败');
}

/**
 * 获取优化事件日志
 */
export async function getOptimizationEvents(): Promise<OptimizationEvent[]> {
  const response = await fetch(`${API_BASE}/stats/optimization-events`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<OptimizationEvent[]>(response, '获取优化事件失败');
}

/**
 * 获取掌握度雷达数据
 */
export async function getMasteryRadar(): Promise<MasteryRadarData> {
  const response = await fetch(`${API_BASE}/stats/mastery-radar`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<MasteryRadarData>(response, '获取掌握度雷达失败');
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
 * 混合决策数据
 */
export interface MixedDecisions {
  real: RecentDecision[];
  virtual: RecentDecision[];
}

/**
 * 获取近期决策
 * @param mixed 是否同时返回真实和模拟数据
 */
export async function getRecentDecisions(mixed?: boolean): Promise<RecentDecision[] | MixedDecisions> {
  const url = mixed 
    ? `${API_BASE}/stats/recent-decisions?mixed=true`
    : `${API_BASE}/stats/recent-decisions`;
  const response = await fetch(url, {
    headers: buildHeaders()
  });
  return parseJsonResponse<RecentDecision[] | MixedDecisions>(response, '获取近期决策失败');
}

/**
 * 获取混合决策数据（真实 + 模拟）
 */
export async function getMixedDecisions(): Promise<MixedDecisions> {
  const response = await fetch(`${API_BASE}/stats/recent-decisions?mixed=true`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<MixedDecisions>(response, '获取混合决策失败');
}

/**
 * 获取决策详情
 * @param decisionId 决策ID
 * @param source 数据源 ('real' | 'virtual')
 * @returns DecisionDetail | null (404时返回null)
 * @throws Error 其他HTTP错误
 */
export async function getDecisionDetail(
  decisionId: string, 
  source?: 'real' | 'virtual'
): Promise<DecisionDetail | null> {
  const url = source === 'virtual'
    ? `${API_BASE}/decision/${encodeURIComponent(decisionId)}?source=virtual`
    : `${API_BASE}/decision/${encodeURIComponent(decisionId)}`;
  
  const response = await fetch(url, {
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

// ==================== 系统状态页面 API ====================

/** Pipeline 层状态 */
export interface PipelineLayerStatus {
  id: string;
  name: string;
  nameCn: string;
  processedCount: number;
  avgLatencyMs: number;
  successRate: number;
  status: 'healthy' | 'degraded' | 'error';
  lastProcessedAt: string | null;
}

/** Pipeline 状态响应 */
export interface PipelineStatusResponse {
  layers: PipelineLayerStatus[];
  totalThroughput: number;
  systemHealth: 'healthy' | 'degraded' | 'error';
}

/** 算法状态 */
export interface AlgorithmStatus {
  id: string;
  name: string;
  weight: number;
  callCount: number;
  avgLatencyMs: number;
  explorationRate: number;
  lastCalledAt: string | null;
}

/** 冷启动统计 */
export interface ColdstartStats {
  classifyCount: number;
  exploreCount: number;
  normalCount: number;
  userTypeDistribution: { fast: number; stable: number; cautious: number };
}

/** 算法状态响应 */
export interface AlgorithmStatusResponse {
  algorithms: AlgorithmStatus[];
  ensembleConsensusRate: number;
  coldstartStats: ColdstartStats;
}

/** 用户状态分布 */
export interface UserStateDistributions {
  attention: { avg: number; low: number; medium: number; high: number; lowAlertCount: number };
  fatigue: { avg: number; fresh: number; normal: number; tired: number; highAlertCount: number };
  motivation: { avg: number; frustrated: number; neutral: number; motivated: number; lowAlertCount: number };
  cognitive: { memory: number; speed: number; stability: number };
}

/** 最近推断记录 */
export interface RecentInference {
  id: string;
  timestamp: string;
  attention: number;
  fatigue: number;
  motivation: number;
  confidence: number;
}

/** 模型参数 */
export interface ModelParams {
  attention: { beta: number; weights: Record<string, number> };
  fatigue: { decayK: number; longBreakThreshold: number };
  motivation: { rho: number; kappa: number; lambda: number };
}

/** 用户状态监控响应 */
export interface UserStateStatusResponse {
  distributions: UserStateDistributions;
  recentInferences: RecentInference[];
  modelParams: ModelParams;
}

/** 记忆强度分布 */
export interface MemoryStrengthRange {
  range: string;
  count: number;
  percentage: number;
}

/** 记忆状态响应 */
export interface MemoryStatusResponse {
  strengthDistribution: MemoryStrengthRange[];
  urgentReviewCount: number;
  soonReviewCount: number;
  stableCount: number;
  avgHalfLifeDays: number;
  todayConsolidationRate: number;
}

/**
 * 获取 Pipeline 各层实时运行状态
 */
export async function getPipelineLayerStatus(): Promise<PipelineStatusResponse> {
  const response = await fetch(`${API_BASE}/system/pipeline-status`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<PipelineStatusResponse>(response, '获取 Pipeline 状态失败');
}

/**
 * 获取算法实时运行状态
 */
export async function getAlgorithmStatus(): Promise<AlgorithmStatusResponse> {
  const response = await fetch(`${API_BASE}/system/algorithm-status`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<AlgorithmStatusResponse>(response, '获取算法状态失败');
}

/**
 * 获取用户状态分布实时监控数据
 */
export async function getUserStateStatus(): Promise<UserStateStatusResponse> {
  const response = await fetch(`${API_BASE}/system/user-state-status`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<UserStateStatusResponse>(response, '获取用户状态监控数据失败');
}

/**
 * 获取记忆状态分布
 */
export async function getMemoryStatus(): Promise<MemoryStatusResponse> {
  const response = await fetch(`${API_BASE}/system/memory-status`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<MemoryStatusResponse>(response, '获取记忆状态失败');
}

/** 功能开关状态 */
export interface FeatureFlagsStatus {
  readEnabled: boolean;
  writeEnabled: boolean;
  flags: Record<string, boolean>;
}

/**
 * 获取功能开关状态
 */
export async function getFeatureFlags(): Promise<FeatureFlagsStatus> {
  const response = await fetch(`${API_BASE}/feature-flags`, {
    headers: buildHeaders()
  });
  return parseJsonResponse<FeatureFlagsStatus>(response, '获取功能开关状态失败');
}

// 默认导出
export default {
  simulate,
  getOverviewStats,
  getAlgorithmDistribution,
  getPerformanceMetrics,
  getOptimizationEvents,
  getMasteryRadar,
  getStateDistribution,
  getRecentDecisions,
  getDecisionDetail,
  getPipelineSnapshot,
  getPacketTrace,
  injectFault,
  // 系统状态页面 API
  getPipelineLayerStatus,
  getAlgorithmStatus,
  getUserStateStatus,
  getMemoryStatus,
  getFeatureFlags,
};
