/**
 * AMAS Decision Layer - Explainability Engine
 * 可解释性生成器
 */

import { DecisionExplanation, StrategyParams, UserState } from '../types';
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
