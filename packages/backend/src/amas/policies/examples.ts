/**
 * AMAS Policies Module - 使用示例
 *
 * 此文件展示如何使用策略注册表和创建自定义策略
 */

import { policyRegistry } from './policy-registry';
import { createFatigueBasedPolicy } from './fatigue-based';
import { UserState } from '../types';

// ==================== 示例 1: 注册内置策略 ====================

// 注册疲劳度策略
policyRegistry.register('fatigue', createFatigueBasedPolicy);

// ==================== 示例 2: 使用已注册的策略 ====================

function useRegisteredPolicy() {
  // 获取策略实例
  const policy = policyRegistry.get('fatigue');

  // 模拟用户状态
  const userState: UserState = {
    A: 0.6, // 注意力
    F: 0.7, // 疲劳度
    M: 0.3, // 动机
    C: {
      // 认知能力
      mem: 0.5,
      speed: 0.6,
      stability: 0.7,
    },
    conf: 0.8,
    ts: Date.now(),
  };

  // 根据状态做决策
  const strategy = policy.decide(userState);

  console.log('策略输出:', strategy);
  // 输出示例:
  // {
  //   batch_size: 5,
  //   difficulty: 'easy',
  //   hint_level: 2,
  //   interval_scale: 0.8,
  //   new_ratio: 0.1
  // }
}

// ==================== 示例 3: 列出所有策略 ====================

function listAllPolicies() {
  const policies = policyRegistry.list();
  console.log('已注册策略:', policies);
  // 输出: ['fatigue']
}

// ==================== 示例 4: 创建自定义策略 ====================

import { ISimpleDecisionPolicy } from './policy-registry';
import { StrategyParams } from '../types';

class CustomPolicy implements ISimpleDecisionPolicy {
  getName(): string {
    return 'CustomPolicy';
  }

  getVersion(): string {
    return '1.0.0';
  }

  getDescription(): string {
    return '自定义策略示例';
  }

  decide(state: UserState): StrategyParams {
    // 自定义决策逻辑
    return {
      batch_size: 8,
      difficulty: 'mid',
      hint_level: 1,
      interval_scale: 1.0,
      new_ratio: 0.2,
    };
  }
}

// 注册自定义策略
policyRegistry.register('custom', () => new CustomPolicy());

// ==================== 示例 5: 条件策略选择 ====================

function selectPolicyByCondition(userState: UserState) {
  // 根据条件选择不同策略
  const policyName = userState.F > 0.6 ? 'fatigue' : 'custom';

  const policy = policyRegistry.get(policyName);
  return policy.decide(userState);
}

// ==================== 示例 6: 策略组合 ====================

function combinePolicies(userState: UserState) {
  const policy1 = policyRegistry.get('fatigue');
  const policy2 = policyRegistry.get('custom');

  const result1 = policy1.decide(userState);
  const result2 = policy2.decide(userState);

  // 取平均值或使用其他组合策略
  return {
    batch_size: Math.round((result1.batch_size + result2.batch_size) / 2),
    difficulty: result1.difficulty, // 选择第一个策略的难度
    hint_level: Math.max(result1.hint_level, result2.hint_level),
    interval_scale: (result1.interval_scale + result2.interval_scale) / 2,
    new_ratio: (result1.new_ratio + result2.new_ratio) / 2,
  };
}

// ==================== 导出示例函数 ====================

export { useRegisteredPolicy, listAllPolicies, selectPolicyByCondition, combinePolicies };
