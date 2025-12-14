/**
 * 基于疲劳度的策略 - 示例实现
 *
 * 此策略根据用户的疲劳度动态调整学习参数：
 * - 疲劳度高时：减少批量大小、降低难度、增加提示
 * - 疲劳度低时：增加批量大小、提高难度、减少提示
 */

import { ISimpleDecisionPolicy } from './policy-registry';
import { StrategyParams, UserState, DifficultyLevel } from '../types';

export class FatigueBasedPolicy implements ISimpleDecisionPolicy {
  private version = '1.0.0';

  getName(): string {
    return 'FatigueBasedPolicy';
  }

  getVersion(): string {
    return this.version;
  }

  getDescription(): string {
    return '基于疲劳度的自适应策略：根据用户疲劳状态动态调整学习参数';
  }

  decide(state: UserState, context?: Record<string, unknown>): StrategyParams {
    const fatigue = clamp(state.F, 0, 1); // 疲劳度 [0,1]
    const attention = clamp(state.A, 0, 1); // 注意力 [0,1]
    const motivation = clamp(state.M, -1, 1); // 动机 [-1,1]
    const confidence = clamp(state.conf, 0, 1); // 置信度 [0,1]

    // 计算综合压力指数
    const motivationStress = 1 - (motivation + 1) / 2;
    const stressIndex = fatigue * 0.5 + (1 - attention) * 0.3 + motivationStress * 0.2;

    // 额外的规则触发器：避免仅靠线性阈值导致的策略抖动/边界误判
    const veryFatigued = fatigue >= 0.8;
    const veryDistracted = attention <= 0.25;
    const veryDemotivated = motivation <= -0.7;
    const lowConfidence = confidence <= 0.5;

    // 根据压力指数调整参数
    let batchSize: number;
    let difficulty: DifficultyLevel;
    let hintLevel: number;
    let intervalScale: number;
    let newRatio: number;

    if (
      veryFatigued ||
      veryDemotivated ||
      (veryDistracted && fatigue >= 0.65) ||
      (motivation < 0 && lowConfidence) ||
      stressIndex >= 0.7
    ) {
      // 高压力：轻松模式
      batchSize = 5;
      difficulty = 'easy';
      hintLevel = 2;
      intervalScale = 0.8; // 缩短间隔，增加复习频率
      newRatio = 0.1; // 减少新词
    } else if (stressIndex >= 0.4 || veryDistracted) {
      // 中等压力：平衡模式
      batchSize = 8;
      difficulty = 'mid';
      hintLevel = 1;
      intervalScale = 1.0;
      newRatio = 0.2;
    } else {
      // 低压力：挑战模式
      batchSize = 12;
      difficulty = state.C.mem >= 0.75 ? 'hard' : 'mid'; // 记忆力好则增加难度
      hintLevel = 0;
      intervalScale = 1.2; // 延长间隔
      newRatio = state.C.speed > 0.6 ? 0.3 : 0.2; // 速度快则增加新词
    }

    return {
      batch_size: batchSize,
      difficulty,
      hint_level: hintLevel,
      interval_scale: intervalScale,
      new_ratio: newRatio,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 工厂函数
 */
export function createFatigueBasedPolicy(): ISimpleDecisionPolicy {
  return new FatigueBasedPolicy();
}
