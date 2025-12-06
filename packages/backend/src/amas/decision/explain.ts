/**
 * AMAS Decision Layer - Explainability Engine
 * 可解释性生成器
 */

import { DecisionExplanation, StrategyParams, UserState, Action } from '../types';
import {
  MIN_ATTENTION,
  HIGH_FATIGUE,
  LOW_MOTIVATION
} from '../config/action-space';

// ==================== 类型定义 ====================

interface Contribution {
  factor: string;
  value: number;
  impact: string;
  percentage: number;
}

export interface FactorContribution {
  factor: string;
  value: number;
  impact: 'positive' | 'negative' | 'neutral';
  percentage: number;
  description: string;
}

export interface EnhancedExplanation {
  text: string;
  primaryReason: string;
  factorContributions: FactorContribution[];
  algorithmInfo: {
    algorithm: 'linucb' | 'thompson' | 'ensemble' | 'coldstart';
    confidence: number;
    phase?: string;
  };
  alternativeActions?: Array<{
    action: Action;
    score: number;
    reason: string;
  }>;
}

// ==================== 解释生成函数 ====================

/**
 * 生成决策解释
 *
 * @param state 用户状态
 * @param oldParams 旧策略参数
 * @param newParams 新策略参数
 * @returns 解释文本
 */
export function generateExplanation(
  state: UserState,
  oldParams: StrategyParams,
  newParams: StrategyParams
): string {
  // 识别主要影响因素
  const contributions = identifyContributions(state);

  // 生成状态描述
  const stateDesc = contributions
    .slice(0, 3)
    .map(c => `${c.factor}${c.impact}${c.percentage}%`)
    .join('，');

  // 生成变化描述
  const changes = identifyChanges(oldParams, newParams);
  const changesDesc = changes.join('，');

  // 组合解释
  if (!stateDesc && !changesDesc) {
    return '当前状态良好，维持现有策略。';
  }

  return `检测到${stateDesc || '状态稳定'}。已${changesDesc || '保持当前策略'}。`;
}

/**
 * 生成详细决策解释
 */
export function generateDetailedExplanation(
  state: UserState,
  oldParams: StrategyParams,
  newParams: StrategyParams
): DecisionExplanation {
  const factors = identifyContributions(state).map(c => ({
    name: c.factor,
    value: c.value,
    impact: c.impact,
    percentage: c.percentage
  }));

  const changes = identifyChanges(oldParams, newParams);
  const text = generateExplanation(state, oldParams, newParams);

  return { factors, changes, text };
}

// ==================== 内部函数 ====================

/**
 * 识别主要影响因素
 */
function identifyContributions(state: UserState): Contribution[] {
  const contributions: Contribution[] = [];

  // 注意力
  if (state.A < 0.5) {
    contributions.push({
      factor: '注意力',
      value: state.A,
      impact: state.A < MIN_ATTENTION ? '严重下降' : '下降',
      percentage: Math.round((1 - state.A) * 100)
    });
  }

  // 疲劳度
  if (state.F > 0.5) {
    contributions.push({
      factor: '疲劳度',
      value: state.F,
      impact: state.F > HIGH_FATIGUE ? '较高' : '中等',
      percentage: Math.round(state.F * 100)
    });
  }

  // 动机
  if (state.M < 0) {
    contributions.push({
      factor: '动机',
      value: state.M,
      impact: state.M < LOW_MOTIVATION ? '偏低' : '略低',
      percentage: Math.round(Math.abs(state.M) * 100)
    });
  }

  // 记忆力
  if (state.C.mem < 0.6) {
    contributions.push({
      factor: '记忆力',
      value: state.C.mem,
      impact: '需巩固',
      percentage: Math.round((1 - state.C.mem) * 100)
    });
  }

  // 稳定性
  if (state.C.stability < 0.5) {
    contributions.push({
      factor: '稳定性',
      value: state.C.stability,
      impact: '波动',
      percentage: Math.round((1 - state.C.stability) * 100)
    });
  }

  // 按影响程度排序
  contributions.sort((a, b) => b.percentage - a.percentage);

  return contributions;
}

/**
 * 识别策略变化
 */
function identifyChanges(
  oldParams: StrategyParams,
  newParams: StrategyParams
): string[] {
  const changes: string[] = [];

  // 新词比例
  if (newParams.new_ratio !== oldParams.new_ratio) {
    const oldPct = Math.round(oldParams.new_ratio * 100);
    const newPct = Math.round(newParams.new_ratio * 100);
    if (newParams.new_ratio < oldParams.new_ratio) {
      changes.push(`新词比例从${oldPct}%降至${newPct}%`);
    } else {
      changes.push(`新词比例从${oldPct}%升至${newPct}%`);
    }
  }

  // 批量大小
  if (newParams.batch_size !== oldParams.batch_size) {
    if (newParams.batch_size < oldParams.batch_size) {
      changes.push(`批量从${oldParams.batch_size}降至${newParams.batch_size}`);
    } else {
      changes.push(`批量从${oldParams.batch_size}提升至${newParams.batch_size}`);
    }
  }

  // 提示级别
  if (newParams.hint_level !== oldParams.hint_level) {
    if (newParams.hint_level > oldParams.hint_level) {
      changes.push(`增加提示至${newParams.hint_level}级`);
    } else {
      changes.push(`降低提示至${newParams.hint_level}级`);
    }
  }

  // 间隔缩放
  if (Math.abs(newParams.interval_scale - oldParams.interval_scale) > 0.05) {
    const delta = Math.round((newParams.interval_scale - oldParams.interval_scale) * 100);
    if (delta > 0) {
      changes.push(`复习间隔延长${delta}%`);
    } else {
      changes.push(`复习间隔缩短${Math.abs(delta)}%`);
    }
  }

  // 难度
  if (newParams.difficulty !== oldParams.difficulty) {
    const diffMap: Record<string, string> = {
      easy: '简单',
      mid: '中等',
      hard: '困难'
    };
    changes.push(`难度调整为${diffMap[newParams.difficulty]}`);
  }

  return changes;
}

// ==================== 辅助函数 ====================

/**
 * 生成简短解释（用于UI显示）
 */
export function generateShortExplanation(state: UserState): string {
  const issues: string[] = [];

  if (state.A < MIN_ATTENTION) issues.push('注意力低');
  if (state.F > HIGH_FATIGUE) issues.push('疲劳度高');
  if (state.M < LOW_MOTIVATION) issues.push('动机不足');

  if (issues.length === 0) return '状态良好';
  return issues.join('、');
}

/**
 * 生成建议文本
 */
export function generateSuggestion(state: UserState): string | null {
  if (state.F > HIGH_FATIGUE) {
    return '建议休息一下，稍后继续学习效果更佳。';
  }
  if (state.M < LOW_MOTIVATION) {
    return '当前学习状态不佳，已降低难度帮助你找回信心。';
  }
  if (state.A < MIN_ATTENTION) {
    return '检测到注意力下降，已减少内容帮助你集中精力。';
  }
  return null;
}

// ==================== 增强可解释性功能 ====================

/**
 * 生成增强的决策解释（包含详细因素分析）
 */
export function generateEnhancedExplanation(
  state: UserState,
  oldParams: StrategyParams,
  newParams: StrategyParams,
  decisionContext: {
    algorithm: string;
    confidence?: number;
    phase?: string;
    topActions?: Array<{ action: Action; score: number }>;
  }
): EnhancedExplanation {
  const factors = analyzeFactorContributions(state, oldParams, newParams);
  const primaryReason = identifyPrimaryReason(factors);
  const text = generateExplanation(state, oldParams, newParams);

  return {
    text,
    primaryReason,
    factorContributions: factors,
    algorithmInfo: {
      algorithm: decisionContext.algorithm as any,
      confidence: decisionContext.confidence || 0.5,
      phase: decisionContext.phase
    },
    alternativeActions: decisionContext.topActions?.slice(0, 3).map((a, i) => ({
      action: a.action,
      score: a.score,
      reason: generateAlternativeReason(a.action, newParams, i)
    }))
  };
}

/**
 * 分析因素贡献度
 */
function analyzeFactorContributions(
  state: UserState,
  oldParams: StrategyParams,
  newParams: StrategyParams
): FactorContribution[] {
  const factors: FactorContribution[] = [];

  // 注意力因素
  if (state.A < 0.4) {
    factors.push({
      factor: '注意力',
      value: state.A,
      impact: 'negative',
      percentage: 30,
      description: `注意力较低 (${(state.A * 100).toFixed(0)}%)，降低了学习难度`
    });
  } else if (state.A > 0.8) {
    factors.push({
      factor: '注意力',
      value: state.A,
      impact: 'positive',
      percentage: 15,
      description: `注意力集中 (${(state.A * 100).toFixed(0)}%)，可以挑战更难内容`
    });
  }

  // 疲劳因素
  if (state.F > 0.6) {
    factors.push({
      factor: '疲劳度',
      value: state.F,
      impact: 'negative',
      percentage: 25,
      description: `疲劳度较高 (${(state.F * 100).toFixed(0)}%)，减少了单词数量`
    });
  }

  // 动机因素
  if (state.M < -0.2) {
    factors.push({
      factor: '学习动力',
      value: state.M,
      impact: 'negative',
      percentage: 20,
      description: `动力下降 (${((state.M + 1) * 50).toFixed(0)}%)，增加了提示级别`
    });
  } else if (state.M > 0.5) {
    factors.push({
      factor: '学习动力',
      value: state.M,
      impact: 'positive',
      percentage: 15,
      description: `动力充沛 (${((state.M + 1) * 50).toFixed(0)}%)，可以挑战更难内容`
    });
  }

  // 时间因素
  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 9) {
    factors.push({
      factor: '时段',
      value: hour,
      impact: 'positive',
      percentage: 10,
      description: '早晨时段，认知效率较高'
    });
  } else if (hour >= 22 || hour <= 5) {
    factors.push({
      factor: '时段',
      value: hour,
      impact: 'negative',
      percentage: 15,
      description: '深夜时段，建议减少学习强度'
    });
  }

  // 记忆力因素
  if (state.C.mem < 0.5) {
    factors.push({
      factor: '记忆水平',
      value: state.C.mem,
      impact: 'negative',
      percentage: 18,
      description: `记忆水平较低 (${(state.C.mem * 100).toFixed(0)}%)，增加复习频率`
    });
  } else if (state.C.mem > 0.8) {
    factors.push({
      factor: '记忆水平',
      value: state.C.mem,
      impact: 'positive',
      percentage: 12,
      description: `记忆水平优秀 (${(state.C.mem * 100).toFixed(0)}%)，可延长复习间隔`
    });
  }

  // 按百分比排序
  factors.sort((a, b) => b.percentage - a.percentage);

  return factors.slice(0, 5); // 最多返回前5个因素
}

/**
 * 识别主要原因
 */
function identifyPrimaryReason(factors: FactorContribution[]): string {
  if (factors.length === 0) {
    return '系统维持当前策略，继续观察学习状态';
  }

  const primary = factors[0];
  return primary.description;
}

/**
 * 生成替代方案的原因说明
 */
function generateAlternativeReason(
  action: Action,
  currentAction: StrategyParams,
  rank: number
): string {
  if (rank === 0) {
    return '最接近的备选方案';
  }

  const reasons: string[] = [];

  if (action.difficulty !== currentAction.difficulty) {
    reasons.push(`难度${action.difficulty === 'hard' ? '更高' : '更低'}`);
  }

  if (action.batch_size > currentAction.batch_size) {
    reasons.push('更多单词');
  } else if (action.batch_size < currentAction.batch_size) {
    reasons.push('更少单词');
  }

  if (action.hint_level !== currentAction.hint_level) {
    reasons.push(`提示级别${action.hint_level > currentAction.hint_level ? '更高' : '更低'}`);
  }

  return reasons.join('，') || '其他策略组合';
}
