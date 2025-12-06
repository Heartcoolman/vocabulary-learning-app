/**
 * AMAS Engine - 决策轨迹记录模块
 *
 * 负责记录决策轨迹到数据库，包含：
 * - 决策元数据（来源、权重、投票等）
 * - 流水线阶段（感知/建模/学习/决策/评估/优化）
 *
 * 设计特性：
 * - 异步记录（不阻塞主决策流程）
 * - 失败降级（记录日志但不阻塞）
 * - 依赖注入（便于测试）
 */

import { PipelineStageType, PipelineStageStatus } from '@prisma/client';
import { DecisionRecorderService, generateDecisionId } from '../services/decision-recorder.service';
import { Logger } from './engine-types';

// ==================== 类型定义 ====================

/**
 * 流水线阶段计时信息
 */
export interface StageTiming {
  perception: { start: number; end: number };
  modeling: { start: number; end: number };
  learning: { start: number; end: number };
  decision: { start: number; end: number };
  evaluation: { start: number; end: number };
  optimization: { start: number; end: number };
}

/**
 * 流水线阶段记录
 */
export interface PipelineStage {
  stage: PipelineStageType;
  stageName: string;
  status: PipelineStageStatus;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
}

/**
 * 决策轨迹参数
 */
export interface DecisionTraceParams {
  answerRecordId: string;
  sessionId?: string;
  timestamp: Date;
  decisionSource: string;
  coldstartPhase?: string;
  weightsSnapshot?: Record<string, number>;
  memberVotes?: Record<string, unknown>;
  selectedAction: unknown; // 使用 unknown 以兼容 Action 类型
  confidence: number;
  reward: number;
  totalDurationMs: number;
  stageTiming: StageTiming;
}

// ==================== 接口定义 ====================

/**
 * 决策轨迹记录器接口
 *
 * 定义决策轨迹记录的核心能力，便于依赖注入和测试
 */
export interface DecisionTracer {
  /**
   * 记录决策轨迹（异步，不阻塞主流程）
   * @param params 决策轨迹参数
   * @returns Promise 仅用于等待，失败不抛出异常
   */
  recordDecisionTrace(params: DecisionTraceParams): Promise<void>;
}

// ==================== 默认实现 ====================

/**
 * 流水线阶段映射配置
 */
const STAGE_MAP: Array<{
  key: keyof StageTiming;
  type: PipelineStageType;
  name: string;
}> = [
  { key: 'perception', type: 'PERCEPTION' as PipelineStageType, name: '感知层' },
  { key: 'modeling', type: 'MODELING' as PipelineStageType, name: '建模层' },
  { key: 'learning', type: 'LEARNING' as PipelineStageType, name: '学习层' },
  { key: 'decision', type: 'DECISION' as PipelineStageType, name: '决策层' },
  { key: 'evaluation', type: 'EVALUATION' as PipelineStageType, name: '评估层' },
  { key: 'optimization', type: 'OPTIMIZATION' as PipelineStageType, name: '优化层' }
];

/**
 * 默认决策轨迹记录器
 *
 * 使用 DecisionRecorderService 进行异步批量写入，
 * 失败时降级为日志记录，不阻塞主流程
 */
export class DefaultDecisionTracer implements DecisionTracer {
  constructor(
    private recorder: DecisionRecorderService,
    private logger?: Logger
  ) {}

  /**
   * 记录决策轨迹
   *
   * 失败降级：记录日志但不阻塞主流程
   */
  async recordDecisionTrace(params: DecisionTraceParams): Promise<void> {
    try {
      const decisionId = generateDecisionId();

      await this.recorder.record({
        decisionId,
        answerRecordId: params.answerRecordId,
        sessionId: params.sessionId,
        timestamp: params.timestamp,
        decisionSource: params.decisionSource,
        coldstartPhase: params.coldstartPhase,
        weightsSnapshot: params.weightsSnapshot,
        memberVotes: params.memberVotes,
        selectedAction: params.selectedAction as Record<string, unknown>,
        confidence: params.confidence,
        reward: params.reward,
        traceVersion: 1,
        totalDurationMs: params.totalDurationMs,
        stages: this.buildPipelineStages(params.stageTiming)
      });
    } catch (error) {
      // 降级：记录日志但不阻塞主流程
      this.logger?.warn('Failed to record decision trace', {
        error,
        answerRecordId: params.answerRecordId,
        decisionSource: params.decisionSource
      });
    }
  }

  /**
   * 构建流水线阶段记录
   */
  private buildPipelineStages(stageTiming: StageTiming): PipelineStage[] {
    const stages: PipelineStage[] = [];

    for (const { key, type, name } of STAGE_MAP) {
      const timing = stageTiming[key];
      if (timing && timing.start && timing.end) {
        stages.push({
          stage: type,
          stageName: name,
          status: 'SUCCESS' as PipelineStageStatus,
          startedAt: new Date(timing.start),
          endedAt: new Date(timing.end),
          durationMs: timing.end - timing.start
        });
      }
    }

    return stages;
  }
}

// ==================== 空实现（用于测试或禁用场景） ====================

/**
 * 空决策轨迹记录器
 *
 * 不进行任何记录操作，用于：
 * - 单元测试
 * - 禁用决策轨迹记录的场景
 */
export class NoopDecisionTracer implements DecisionTracer {
  async recordDecisionTrace(_params: DecisionTraceParams): Promise<void> {
    // 不执行任何操作
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建决策轨迹记录器
 *
 * @param recorder DecisionRecorderService 实例（可选）
 * @param logger 日志记录器（可选）
 * @returns DecisionTracer 实例
 */
export function createDecisionTracer(
  recorder?: DecisionRecorderService,
  logger?: Logger
): DecisionTracer {
  if (!recorder) {
    return new NoopDecisionTracer();
  }
  return new DefaultDecisionTracer(recorder, logger);
}
