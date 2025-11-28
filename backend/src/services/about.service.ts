/**
 * AMAS 公开展示模拟服务
 *
 * 功能：
 * - 使用独立的 EnsembleLearningFramework 实例进行模拟决策
 * - 内存级统计：概览、算法贡献分布、状态分布、近期决策
 * - 数据脱敏：用户 ID 使用每日轮换盐值哈希
 * - 缓存优化：统计数据 60 秒 TTL
 */

import crypto from 'crypto';
import { ACTION_SPACE } from '../amas/config/action-space';
import {
  EnsembleContext,
  EnsembleLearningFramework,
  EnsembleMember,
  EnsembleWeights
} from '../amas/decision/ensemble';
import { Action, ColdStartPhase, UserState, CognitiveProfile } from '../amas/types';
import { ActionSelection } from '../amas/learning/base-learner';

// ==================== 类型定义 ====================

/** 成员投票详情 */
export interface MemberVoteDetail {
  action: string;
  contribution: number;
  confidence: number;
}

/** 成员投票记录 */
export type MemberVotes = Record<string, MemberVoteDetail>;

/** 状态分类桶 */
export type StateBucket = 'focused' | 'fatigued' | 'demotivated' | 'balanced';

/** 模拟请求输入 */
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

/** 状态快照（脱敏后） */
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

/** 模拟响应 */
export interface SimulateResponse {
  inputState: StateSnapshot;
  decisionProcess: {
    phase: ColdStartPhase;
    votes: MemberVotes;
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
    factors: Array<{
      name: string;
      value: number;
      impact: string;
      percentage: number;
    }>;
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

/** 状态分布条目 */
export interface StateDistributionBucket {
  bucket: StateBucket;
  count: number;
  ratio: number;
}

/** 状态分布响应 */
export interface StateDistributionResponse {
  attention: { low: number; medium: number; high: number };
  fatigue: { fresh: number; normal: number; tired: number };
  motivation: { frustrated: number; neutral: number; motivated: number };
}

/** 近期决策记录（脱敏） */
export interface RecentDecision {
  pseudoId: string;
  timestamp: string;
  decisionSource: string;
  strategy: {
    difficulty: string;
    batch_size: number;
  };
  dominantFactor: string;
}

// ==================== Pipeline 可视化类型 ====================

/** 管道节点类型 */
export type PipelineNodeType =
  | 'perception'
  | 'model'
  | 'learner'
  | 'decision'
  | 'guard'
  | 'eval'
  | 'optim';

/** 数据包状态 */
export type PacketStatus = 'normal' | 'warning' | 'blocked' | 'fault_sim';

/** 数据包 (可视化) */
export interface DataPacket {
  id: string;
  currentStage: 1 | 2 | 3 | 4 | 5 | 6;
  currentNode: string;
  progress: number; // 0-100 在当前连线上的位置
  status: PacketStatus;
  faultType?: string;
  data: Record<string, number>; // 当前数据快照
  createdAt: number;
}

/** 节点状态 (可视化) */
export interface NodeState {
  id: string;
  status: 'idle' | 'processing' | 'warning' | 'error';
  load: number; // 0-1
  processedCount: number;
  lastProcessedAt: number;
}

/** 管道指标 */
export interface PipelineMetrics {
  throughput: number; // packets per second
  avgLatency: number; // ms
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
  duration: number; // ms
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

/** 内部决策记录 */
interface InternalDecision {
  id: string;
  timestamp: number;
  userId: string;
  pseudoId: string;
  action: Action;
  reward: number;
  score: number;
  confidence: number;
  phase: ColdStartPhase;
  weights: EnsembleWeights;
  votes: MemberVotes;
  stateSnapshot: StateSnapshot;
  decisionSource: 'coldstart' | 'ensemble';
}

/** 缓存条目 */
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// ==================== 脱敏工具 ====================

/** 每日盐值管理 */
class DailySaltManager {
  private salt = '';
  private lastDate = '';

  getSalt(): string {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastDate !== today) {
      this.salt = crypto.randomBytes(16).toString('hex');
      this.lastDate = today;
    }
    return this.salt;
  }
}

const saltManager = new DailySaltManager();

/**
 * 生成脱敏的伪 ID
 * 同一天内相同用户 ID 生成相同的伪 ID
 */
function anonymizeUserId(userId: string): string {
  const salt = saltManager.getSalt();
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}:${salt}`)
    .digest('hex');
  return hash.substring(0, 8);
}

// ==================== 服务实现 ====================

/** 管道节点定义 */
const PIPELINE_NODES = [
  // Stage 1: 感知层
  { id: 'raw_input', stage: 1, label: 'Raw Event' },
  { id: 'feature_builder', stage: 1, label: '特征提取' },
  // Stage 2: 建模层
  { id: 'attention', stage: 2, label: '注意力监测' },
  { id: 'fatigue', stage: 2, label: '疲劳估计' },
  { id: 'cognitive', stage: 2, label: '认知画像' },
  { id: 'motivation', stage: 2, label: '动机追踪' },
  { id: 'trend', stage: 2, label: '趋势分析' },
  // Stage 3: 学习层
  { id: 'coldstart', stage: 3, label: '冷启动' },
  { id: 'linucb', stage: 3, label: 'LinUCB' },
  { id: 'thompson', stage: 3, label: 'Thompson' },
  { id: 'actr', stage: 3, label: 'ACT-R' },
  { id: 'heuristic', stage: 3, label: 'Heuristic' },
  { id: 'ensemble', stage: 3, label: '集成投票' },
  // Stage 4: 决策层
  { id: 'mapper', stage: 4, label: 'Action映射' },
  { id: 'guardrails', stage: 4, label: '安全护栏' },
  { id: 'output', stage: 4, label: '最终策略' },
  // Stage 5: 评估层
  { id: 'delayed_reward', stage: 5, label: '延迟奖励' },
  { id: 'causal', stage: 5, label: '因果推断' },
  // Stage 6: 优化层
  { id: 'bayesian', stage: 6, label: '贝叶斯优化' },
] as const;

class AboutService {
  private readonly ensemble = new EnsembleLearningFramework();
  private readonly maxRecent = 50;
  private readonly cacheTTL = 60 * 1000; // 60秒

  private readonly recentDecisions: InternalDecision[] = [];
  private readonly algorithmContribution: Record<EnsembleMember | 'coldstart', number> = {
    thompson: 0,
    linucb: 0,
    actr: 0,
    heuristic: 0,
    coldstart: 0
  };
  private readonly userActivity = new Map<string, number>();
  private decisionCounter = 0;

  // 缓存
  private overviewCache: CacheEntry<OverviewStats> | null = null;
  private algorithmCache: CacheEntry<AlgorithmDistribution> | null = null;
  private stateDistCache: CacheEntry<StateDistributionResponse> | null = null;

  // 管道可视化状态
  private pipelinePackets: DataPacket[] = [];
  private nodeStates: Record<string, NodeState> = {};
  private lastPipelineUpdate = Date.now();
  private totalProcessed = 0;
  private packetCounter = 0;

  constructor() {
    this.initPipelineNodes();
  }

  /**
   * 初始化管道节点状态
   */
  private initPipelineNodes(): void {
    for (const node of PIPELINE_NODES) {
      this.nodeStates[node.id] = {
        id: node.id,
        status: 'idle',
        load: 0,
        processedCount: 0,
        lastProcessedAt: 0
      };
    }
  }

  /**
   * 模拟一次决策
   */
  simulate(input: SimulateRequest): SimulateResponse {
    const userId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const state = this.buildUserState(input);
    const context = this.buildContext(state);

    // 执行决策
    const decision = this.ensemble.selectAction(state, ACTION_SPACE, context);
    const decisionSource = (decision.meta?.decisionSource as 'coldstart' | 'ensemble') ?? 'ensemble';
    const reward = this.estimateReward(state, decision.action);

    // 更新模型（模拟学习）
    this.ensemble.update(state, decision.action, reward, context);

    // 提取投票信息
    const votes = this.extractVotes(decision.meta);
    const weights = this.ensemble.getWeights();

    // 记录决策
    this.recordDecision({
      userId,
      decision,
      reward,
      state,
      phase: context.phase,
      votes,
      decisionSource
    });

    // 生成解释
    const explanation = this.generateExplanation(state, decision.action, votes);

    return {
      inputState: this.toStateSnapshot(state),
      decisionProcess: {
        phase: context.phase,
        votes,
        weights,
        decisionSource
      },
      outputStrategy: {
        interval_scale: decision.action.interval_scale,
        new_ratio: decision.action.new_ratio,
        difficulty: decision.action.difficulty,
        batch_size: decision.action.batch_size,
        hint_level: decision.action.hint_level
      },
      explanation
    };
  }

  /**
   * 获取概览统计（带缓存）
   */
  getOverviewStats(): OverviewStats {
    const now = Date.now();

    if (this.overviewCache && this.overviewCache.expiry > now) {
      return this.overviewCache.data;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayStart = startOfDay.getTime();
    const activeWindow = 24 * 60 * 60 * 1000;

    const todayDecisions = this.recentDecisions.filter(
      d => d.timestamp >= todayStart
    ).length;

    let activeUsers = 0;
    for (const ts of this.userActivity.values()) {
      if (now - ts <= activeWindow) {
        activeUsers += 1;
      }
    }

    // 计算平均效率提升（基于奖励值）
    const recentRewards = this.recentDecisions
      .slice(0, 20)
      .map(d => d.reward);
    const avgEfficiencyGain = recentRewards.length > 0
      ? recentRewards.reduce((sum, r) => sum + r, 0) / recentRewards.length * 100
      : 0;

    const stats: OverviewStats = {
      todayDecisions,
      activeUsers,
      avgEfficiencyGain: this.round(avgEfficiencyGain, 1),
      timestamp: new Date().toISOString()
    };

    this.overviewCache = { data: stats, expiry: now + this.cacheTTL };
    return stats;
  }

  /**
   * 获取算法贡献分布（带缓存）
   */
  getAlgorithmDistribution(): AlgorithmDistribution {
    const now = Date.now();

    if (this.algorithmCache && this.algorithmCache.expiry > now) {
      return this.algorithmCache.data;
    }

    const total = Object.values(this.algorithmContribution).reduce(
      (sum, v) => sum + v,
      0
    ) || 1;

    const distribution: AlgorithmDistribution = {
      thompson: this.round(this.algorithmContribution.thompson / total, 3),
      linucb: this.round(this.algorithmContribution.linucb / total, 3),
      actr: this.round(this.algorithmContribution.actr / total, 3),
      heuristic: this.round(this.algorithmContribution.heuristic / total, 3),
      coldstart: this.round(this.algorithmContribution.coldstart / total, 3)
    };

    this.algorithmCache = { data: distribution, expiry: now + this.cacheTTL };
    return distribution;
  }

  /**
   * 获取状态分布（带缓存）
   */
  getStateDistribution(): StateDistributionResponse {
    const now = Date.now();

    if (this.stateDistCache && this.stateDistCache.expiry > now) {
      return this.stateDistCache.data;
    }

    const attention = { low: 0, medium: 0, high: 0 };
    const fatigue = { fresh: 0, normal: 0, tired: 0 };
    const motivation = { frustrated: 0, neutral: 0, motivated: 0 };

    for (const d of this.recentDecisions) {
      const s = d.stateSnapshot;

      // 注意力分布
      if (s.A < 0.4) attention.low++;
      else if (s.A < 0.7) attention.medium++;
      else attention.high++;

      // 疲劳分布
      if (s.F < 0.3) fatigue.fresh++;
      else if (s.F < 0.6) fatigue.normal++;
      else fatigue.tired++;

      // 动机分布
      if (s.M < -0.3) motivation.frustrated++;
      else if (s.M < 0.3) motivation.neutral++;
      else motivation.motivated++;
    }

    const total = this.recentDecisions.length || 1;

    const response: StateDistributionResponse = {
      attention: {
        low: this.round(attention.low / total, 3),
        medium: this.round(attention.medium / total, 3),
        high: this.round(attention.high / total, 3)
      },
      fatigue: {
        fresh: this.round(fatigue.fresh / total, 3),
        normal: this.round(fatigue.normal / total, 3),
        tired: this.round(fatigue.tired / total, 3)
      },
      motivation: {
        frustrated: this.round(motivation.frustrated / total, 3),
        neutral: this.round(motivation.neutral / total, 3),
        motivated: this.round(motivation.motivated / total, 3)
      }
    };

    this.stateDistCache = { data: response, expiry: now + this.cacheTTL };
    return response;
  }

  /**
   * 获取近期决策（脱敏）
   */
  getRecentDecisions(): RecentDecision[] {
    return this.recentDecisions.map(d => ({
      pseudoId: d.pseudoId,
      timestamp: new Date(d.timestamp).toISOString(),
      decisionSource: d.decisionSource,
      strategy: {
        difficulty: d.action.difficulty,
        batch_size: d.action.batch_size
      },
      dominantFactor: this.getDominantFactor(d.stateSnapshot)
    }));
  }

  // ==================== Pipeline 可视化 API ====================

  /**
   * 获取管道实时快照
   */
  getPipelineSnapshot(): PipelineSnapshot {
    this.updatePipelineState();

    const now = Date.now();
    const windowMs = 5000; // 5秒窗口

    // 计算吞吐量（每秒处理数）
    const recentPackets = this.pipelinePackets.filter(
      p => now - p.createdAt < windowMs
    );
    const throughput = this.round(recentPackets.length / (windowMs / 1000), 1);

    // 计算平均延迟
    const completedPackets = this.pipelinePackets.filter(p => p.currentStage >= 4);
    const avgLatency = completedPackets.length > 0
      ? Math.round(
          completedPackets.reduce((sum, p) => sum + (now - p.createdAt), 0) /
            completedPackets.length
        )
      : 45;

    return {
      timestamp: now,
      currentPackets: [...this.pipelinePackets],
      nodeStates: { ...this.nodeStates },
      metrics: {
        throughput,
        avgLatency,
        activePackets: this.pipelinePackets.length,
        totalProcessed: this.totalProcessed
      }
    };
  }

  /**
   * 获取单个数据包的处理轨迹
   */
  getPacketTrace(packetId: string): PacketTrace {
    // 尝试从当前流动的数据包中找
    const activePacket = this.pipelinePackets.find(p => p.id === packetId);

    // 尝试从历史决策中找
    const historyDecision = this.recentDecisions.find(d => d.id === packetId);

    const now = Date.now();
    const stages: StageTrace[] = [];

    if (historyDecision) {
      // 从历史决策重建轨迹
      const baseTime = historyDecision.timestamp;
      stages.push(
        {
          stage: '1',
          stageName: '感知层',
          nodeId: 'feature_builder',
          duration: 5,
          input: 'RawEvent',
          output: 'FeatureVector[8]',
          timestamp: baseTime
        },
        {
          stage: '2',
          stageName: '建模层',
          nodeId: 'modeling_group',
          duration: 12,
          input: 'FeatureVector[8]',
          output: `AFCM(A=${historyDecision.stateSnapshot.A}, F=${historyDecision.stateSnapshot.F})`,
          details: '5个建模器并行处理',
          timestamp: baseTime + 5
        },
        {
          stage: '3',
          stageName: '学习层',
          nodeId: historyDecision.decisionSource === 'coldstart' ? 'coldstart' : 'ensemble',
          duration: 15,
          input: 'UserState',
          output: `Votes: ${Object.keys(historyDecision.votes).join(', ')}`,
          details: historyDecision.decisionSource === 'coldstart'
            ? '冷启动策略'
            : `权重: T=${historyDecision.weights.thompson}, L=${historyDecision.weights.linucb}`,
          timestamp: baseTime + 17
        },
        {
          stage: '4',
          stageName: '决策层',
          nodeId: 'guardrails',
          duration: 3,
          input: 'Action',
          output: `难度=${historyDecision.action.difficulty}, 批量=${historyDecision.action.batch_size}`,
          details: '安全护栏检查通过',
          timestamp: baseTime + 32
        },
        {
          stage: '5',
          stageName: '评估层',
          nodeId: 'delayed_reward',
          duration: 1,
          input: 'Strategy',
          output: `Reward: ${historyDecision.reward}`,
          timestamp: baseTime + 35
        }
      );

      return {
        packetId,
        status: 'completed',
        stages,
        totalDuration: 36
      };
    }

    if (activePacket) {
      // 生成进行中的轨迹
      const currentStage = activePacket.currentStage;
      const stageNames = ['感知层', '建模层', '学习层', '决策层', '评估层', '优化层'];

      for (let i = 1; i <= currentStage; i++) {
        stages.push({
          stage: String(i),
          stageName: stageNames[i - 1],
          nodeId: this.getNodeForStage(i),
          duration: i < currentStage ? Math.floor(5 + Math.random() * 10) : 0,
          input: i === 1 ? 'RawEvent' : `Stage${i - 1}Output`,
          output: i < currentStage ? `Stage${i}Output` : '处理中...',
          timestamp: activePacket.createdAt + i * 10
        });
      }

      return {
        packetId,
        status: activePacket.status === 'blocked' ? 'blocked' : 'in_progress',
        stages,
        totalDuration: now - activePacket.createdAt
      };
    }

    // 生成模拟轨迹
    return {
      packetId,
      status: 'completed',
      stages: [
        {
          stage: '1',
          stageName: '感知层',
          nodeId: 'feature_builder',
          duration: 5,
          input: 'RawEvent',
          output: 'FeatureVector[8]',
          timestamp: now - 100
        },
        {
          stage: '2',
          stageName: '建模层',
          nodeId: 'modeling_group',
          duration: 12,
          input: 'FeatureVector[8]',
          output: 'AFCM_State',
          timestamp: now - 95
        },
        {
          stage: '3',
          stageName: '学习层',
          nodeId: 'ensemble',
          duration: 8,
          input: 'UserState',
          output: 'Votes',
          details: 'Thompson(0.4), LinUCB(0.3), ACT-R(0.2), Heuristic(0.1)',
          timestamp: now - 83
        },
        {
          stage: '4',
          stageName: '决策层',
          nodeId: 'guardrails',
          duration: 2,
          input: 'Action',
          output: 'FinalStrategy',
          details: '安全检查通过',
          timestamp: now - 75
        }
      ],
      totalDuration: 27
    };
  }

  /**
   * 注入故障模拟
   */
  injectFault(request: FaultInjectionRequest): FaultInjectionResponse {
    const packetId = `fault-${++this.packetCounter}-${Date.now()}`;
    const intensity = request.intensity ?? 0.8;

    let expectedPath: string[] = [];
    let guardRailTriggers: string[] = [];
    let expectedOutcome = '';

    // 根据故障类型确定预期行为
    switch (request.faultType) {
      case 'high_fatigue':
        expectedPath = [
          'raw_input',
          'feature_builder',
          'fatigue',
          'ensemble',
          'guardrails',
          'output'
        ];
        guardRailTriggers = ['FatigueProtection'];
        expectedOutcome = '策略调整: 降低难度, 减少批量, 增加休息提示';
        break;

      case 'low_attention':
        expectedPath = [
          'raw_input',
          'feature_builder',
          'attention',
          'ensemble',
          'guardrails',
          'output'
        ];
        guardRailTriggers = ['AttentionProtection'];
        expectedOutcome = '策略调整: 增加提示级别, 减小批量, 简化任务';
        break;

      case 'anomaly':
        expectedPath = [
          'raw_input',
          'feature_builder',
          'guardrails'
        ];
        guardRailTriggers = ['AnomalyDetector', 'FallbackTrigger'];
        expectedOutcome = '数据包被拦截, 启用降级策略';
        break;
    }

    // 创建故障数据包
    const faultPacket: DataPacket = {
      id: packetId,
      currentStage: 1,
      currentNode: 'raw_input',
      progress: 0,
      status: 'fault_sim',
      faultType: request.faultType,
      data: this.generateFaultData(request.faultType, intensity),
      createdAt: Date.now()
    };

    this.pipelinePackets.push(faultPacket);

    return {
      packetId,
      faultType: request.faultType,
      expectedPath,
      guardRailTriggers,
      expectedOutcome
    };
  }

  /**
   * 生成故障数据
   */
  private generateFaultData(
    faultType: FaultInjectionRequest['faultType'],
    intensity: number
  ): Record<string, number> {
    switch (faultType) {
      case 'high_fatigue':
        return {
          fatigue: 0.5 + intensity * 0.5,
          attention: 0.3 + (1 - intensity) * 0.4,
          motivation: -0.2,
          responseTime: 2000 + intensity * 3000
        };
      case 'low_attention':
        return {
          fatigue: 0.4,
          attention: 0.1 + (1 - intensity) * 0.2,
          motivation: 0,
          responseTime: 1500 + intensity * 2000
        };
      case 'anomaly':
        return {
          fatigue: Math.random(),
          attention: Math.random() > 0.5 ? 0 : 1,
          motivation: Math.random() * 2 - 1,
          responseTime: intensity > 0.5 ? 60000 : 50
        };
      default:
        return {};
    }
  }

  /**
   * 获取某阶段的主节点
   */
  private getNodeForStage(stage: number): string {
    const stageNodes: Record<number, string> = {
      1: 'feature_builder',
      2: 'cognitive',
      3: 'ensemble',
      4: 'guardrails',
      5: 'delayed_reward',
      6: 'bayesian'
    };
    return stageNodes[stage] || 'unknown';
  }

  /**
   * 更新管道状态（模拟数据流动）
   */
  private updatePipelineState(): void {
    const now = Date.now();
    const dt = now - this.lastPipelineUpdate;
    this.lastPipelineUpdate = now;

    // 移动现有数据包
    for (const packet of this.pipelinePackets) {
      // 每秒移动约50进度
      packet.progress += (dt / 1000) * 50;

      if (packet.progress >= 100) {
        packet.progress = 0;
        packet.currentStage = Math.min(
          packet.currentStage + 1,
          6
        ) as DataPacket['currentStage'];

        // 更新当前节点
        const nodesInStage = PIPELINE_NODES.filter(n => n.stage === packet.currentStage);
        if (nodesInStage.length > 0) {
          packet.currentNode = nodesInStage[0].id;
        }

        // 故障包在护栏处被阻断
        if (packet.status === 'fault_sim' && packet.faultType === 'anomaly') {
          if (packet.currentStage >= 4) {
            packet.status = 'blocked';
          }
        }
      }
    }

    // 移除已完成的数据包（第6阶段完成后）
    const completed = this.pipelinePackets.filter(
      p => p.currentStage >= 6 && p.progress >= 100
    );
    this.totalProcessed += completed.length;

    this.pipelinePackets = this.pipelinePackets.filter(
      p => !(p.currentStage >= 6 && p.progress >= 100)
    );

    // 限制最大数据包数量
    if (this.pipelinePackets.length > 20) {
      this.pipelinePackets = this.pipelinePackets.slice(-20);
    }

    // 随机生成新数据包（模拟真实流量）
    if (Math.random() > 0.6 && this.pipelinePackets.length < 15) {
      this.pipelinePackets.push({
        id: `pkt-${++this.packetCounter}-${now}`,
        currentStage: 1,
        currentNode: 'raw_input',
        progress: 0,
        status: 'normal',
        data: {
          attention: 0.4 + Math.random() * 0.5,
          fatigue: Math.random() * 0.6,
          motivation: Math.random() * 2 - 1,
          responseTime: 800 + Math.random() * 2000
        },
        createdAt: now
      });
    }

    // 更新节点状态
    this.updateNodeStates(now);
  }

  /**
   * 更新节点状态
   */
  private updateNodeStates(now: number): void {
    // 重置所有节点为 idle
    for (const id of Object.keys(this.nodeStates)) {
      this.nodeStates[id].status = 'idle';
      this.nodeStates[id].load = 0;
    }

    // 根据数据包位置更新节点状态
    for (const packet of this.pipelinePackets) {
      const nodesInStage = PIPELINE_NODES.filter(n => n.stage === packet.currentStage);

      for (const node of nodesInStage) {
        if (this.nodeStates[node.id]) {
          // 故障包使节点变为警告状态
          if (packet.status === 'fault_sim' || packet.status === 'warning') {
            this.nodeStates[node.id].status = 'warning';
          } else if (packet.status === 'blocked') {
            this.nodeStates[node.id].status = 'error';
          } else if (this.nodeStates[node.id].status === 'idle') {
            this.nodeStates[node.id].status = 'processing';
          }

          this.nodeStates[node.id].load = Math.min(
            1,
            this.nodeStates[node.id].load + 0.3
          );
          this.nodeStates[node.id].lastProcessedAt = now;
        }
      }
    }
  }

  // ==================== 内部方法 ====================

  private buildUserState(input: SimulateRequest): UserState {
    const scenario = input.scenario;
    let base = {
      A: this.clamp(input.attention, 0, 1),
      F: this.clamp(input.fatigue, 0, 1),
      M: this.clamp(input.motivation, -1, 1),
      C: {
        mem: this.clamp(input.cognitive.memory, 0, 1),
        speed: this.clamp(input.cognitive.speed, 0, 1),
        stability: this.clamp(input.cognitive.stability, 0, 1)
      } as CognitiveProfile,
      conf: 0.7,
      ts: Date.now()
    };

    // 场景预设覆盖
    if (scenario === 'newUser') {
      base.conf = 0.3;
    } else if (scenario === 'tired') {
      base.F = Math.max(base.F, 0.7);
      base.A = Math.min(base.A, 0.4);
    } else if (scenario === 'motivated') {
      base.M = Math.max(base.M, 0.7);
      base.A = Math.max(base.A, 0.8);
    } else if (scenario === 'struggling') {
      base.M = Math.min(base.M, -0.3);
      base.C.stability = Math.min(base.C.stability, 0.4);
    }

    return base;
  }

  private buildContext(state: UserState): EnsembleContext {
    const phase = this.resolvePhase(state);
    const baseError = this.clamp(1 - state.C.stability, 0, 1);
    const responseTime = this.estimateResponseTime(state);
    const hour = new Date(state.ts).getHours();

    const base = {
      recentErrorRate: baseError,
      recentResponseTime: responseTime,
      timeBucket: hour
    };

    return {
      phase,
      base,
      linucb: base,
      thompson: base,
      actr: { ...base, trace: [] },
      heuristic: {
        ...base,
        fatigueBias: state.F,
        motivationBias: state.M
      }
    };
  }

  private resolvePhase(state: UserState): ColdStartPhase {
    if (state.conf < 0.4) return 'classify';
    if (state.conf < 0.65) return 'explore';
    return 'normal';
  }

  private estimateReward(state: UserState, action: Action): number {
    const cognitive = 0.5 * state.C.mem + 0.3 * state.C.speed + 0.2 * state.C.stability;
    const attention = state.A * 0.2;
    const motivation = ((state.M + 1) / 2) * 0.2;
    const fatiguePenalty = state.F * 0.3;
    const difficultyPenalty =
      action.difficulty === 'hard' ? 0.15 : action.difficulty === 'mid' ? 0.05 : 0;
    const hintBoost = action.hint_level > 0 ? 0.05 : 0;

    const raw = cognitive + attention + motivation + hintBoost - fatiguePenalty - difficultyPenalty;
    return this.clamp((raw - 0.5) * 2, -1, 1);
  }

  private estimateResponseTime(state: UserState): number {
    const base = 1200 + (1 - state.C.speed) * 2500 + state.F * 1500;
    return Math.round(this.clamp(base, 200, 60000));
  }

  private extractVotes(meta?: Record<string, unknown>): MemberVotes {
    const votes = meta?.memberVotes as MemberVotes | undefined;
    if (!votes || typeof votes !== 'object') {
      return {};
    }
    return votes;
  }

  private recordDecision(params: {
    userId: string;
    decision: ActionSelection<Action>;
    reward: number;
    state: UserState;
    phase: ColdStartPhase;
    votes: MemberVotes;
    decisionSource: 'coldstart' | 'ensemble';
  }): void {
    const id = `sd-${++this.decisionCounter}-${Date.now()}`;
    const pseudoId = anonymizeUserId(params.userId);
    const weights = this.ensemble.getWeights();

    const record: InternalDecision = {
      id,
      timestamp: Date.now(),
      userId: params.userId,
      pseudoId,
      action: params.decision.action,
      reward: this.round(params.reward, 3),
      score: this.round(params.decision.score, 3),
      confidence: this.round(params.decision.confidence ?? 0, 3),
      phase: params.phase,
      weights,
      votes: params.votes,
      stateSnapshot: this.toStateSnapshot(params.state),
      decisionSource: params.decisionSource
    };

    this.recentDecisions.unshift(record);
    if (this.recentDecisions.length > this.maxRecent) {
      this.recentDecisions.pop();
    }

    this.userActivity.set(params.userId, record.timestamp);
    this.updateAlgorithmContribution(params.votes, weights, params.decisionSource);

    // 清除缓存
    this.overviewCache = null;
    this.algorithmCache = null;
    this.stateDistCache = null;
  }

  private updateAlgorithmContribution(
    votes: MemberVotes,
    weights: EnsembleWeights,
    decisionSource: 'coldstart' | 'ensemble'
  ): void {
    if (decisionSource === 'coldstart') {
      this.algorithmContribution.coldstart += 1;
      return;
    }

    let hasContribution = false;
    const members: EnsembleMember[] = ['thompson', 'linucb', 'actr', 'heuristic'];

    for (const member of members) {
      const contribution = votes[member]?.contribution;
      if (typeof contribution === 'number' && Number.isFinite(contribution)) {
        this.algorithmContribution[member] += Math.abs(contribution);
        hasContribution = true;
      }
    }

    if (!hasContribution) {
      // 无投票信息时按当前权重累积
      for (const member of members) {
        this.algorithmContribution[member] += weights[member];
      }
    }
  }

  private generateExplanation(
    state: UserState,
    action: Action,
    votes: MemberVotes
  ): SimulateResponse['explanation'] {
    const factors: SimulateResponse['explanation']['factors'] = [];

    // 分析影响因素
    if (state.F > 0.5) {
      factors.push({
        name: '疲劳度',
        value: this.round(state.F, 2),
        impact: 'negative',
        percentage: Math.round(state.F * 30)
      });
    }

    if (state.A < 0.5) {
      factors.push({
        name: '注意力',
        value: this.round(state.A, 2),
        impact: 'negative',
        percentage: Math.round((1 - state.A) * 25)
      });
    }

    if (state.M < 0) {
      factors.push({
        name: '动机',
        value: this.round(state.M, 2),
        impact: 'negative',
        percentage: Math.round(Math.abs(state.M) * 20)
      });
    } else if (state.M > 0.3) {
      factors.push({
        name: '动机',
        value: this.round(state.M, 2),
        impact: 'positive',
        percentage: Math.round(state.M * 20)
      });
    }

    if (state.C.mem > 0.7) {
      factors.push({
        name: '记忆力',
        value: this.round(state.C.mem, 2),
        impact: 'positive',
        percentage: Math.round(state.C.mem * 25)
      });
    }

    // 生成摘要
    const summaryParts: string[] = [];

    if (state.F > 0.6) {
      summaryParts.push('检测到疲劳较高，已降低学习强度');
    }
    if (state.A < 0.4) {
      summaryParts.push('注意力不集中，增加了提示');
    }
    if (state.M < -0.2) {
      summaryParts.push('动机偏低，选择简单任务提升信心');
    }
    if (state.M > 0.5 && state.C.mem > 0.6) {
      summaryParts.push('状态良好，适当增加挑战');
    }

    if (summaryParts.length === 0) {
      summaryParts.push('学习状态正常，执行标准策略');
    }

    return {
      factors,
      summary: summaryParts.join('；')
    };
  }

  private getDominantFactor(state: StateSnapshot): string {
    if (state.F > 0.6) return '疲劳';
    if (state.A < 0.4) return '注意力';
    if (state.M < -0.2) return '动机';
    if (state.C.mem > 0.7) return '记忆力';
    return '综合';
  }

  private toStateSnapshot(state: UserState): StateSnapshot {
    return {
      A: this.round(state.A, 2),
      F: this.round(state.F, 2),
      M: this.round(state.M, 2),
      C: {
        mem: this.round(state.C.mem, 2),
        speed: this.round(state.C.speed, 2),
        stability: this.round(state.C.stability, 2)
      },
      conf: this.round(state.conf, 2)
    };
  }

  private round(value: number, decimals: number = 3): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

export const aboutService = new AboutService();
