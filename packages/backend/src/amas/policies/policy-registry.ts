/**
 * AMAS Decision Policy Registry (T1a.4)
 * 决策策略注册表
 *
 * 提供策略的注册、查询和管理功能，支持决策层的策略插件化
 */

import { Action, StrategyParams, UserState } from '../types';

/**
 * 简化的决策策略接口
 *
 * 用于策略注册表的轻量级策略接口
 * 专注于状态到策略参数的映射，不涉及模型更新
 */
export interface ISimpleDecisionPolicy {
  /**
   * 获取策略名称
   */
  getName(): string;

  /**
   * 获取策略版本
   */
  getVersion(): string;

  /**
   * 根据用户状态做出决策
   *
   * @param state - 用户当前状态
   * @param context - 决策上下文（可选）
   * @returns 策略参数
   */
  decide(state: UserState, context?: Record<string, unknown>): StrategyParams;

  /**
   * 获取策略描述
   */
  getDescription(): string;
}

/**
 * 策略工厂函数类型
 */
export type PolicyFactory = () => ISimpleDecisionPolicy;

/**
 * 策略注册表
 *
 * 管理所有可用的决策策略，支持动态注册和查询
 */
export class PolicyRegistry {
  private policies = new Map<string, PolicyFactory>();

  /**
   * 注册策略
   *
   * @param name - 策略名称（唯一标识符）
   * @param factory - 策略工厂函数
   * @throws 如果策略名称已存在
   */
  register(name: string, factory: PolicyFactory): void {
    if (this.policies.has(name)) {
      throw new Error(`Policy "${name}" is already registered`);
    }
    this.policies.set(name, factory);
  }

  /**
   * 获取策略实例
   *
   * @param name - 策略名称
   * @returns 策略实例
   * @throws 如果策略不存在
   */
  get(name: string): ISimpleDecisionPolicy {
    const factory = this.policies.get(name);
    if (!factory) {
      throw new Error(`Policy "${name}" is not registered`);
    }
    return factory();
  }

  /**
   * 检查策略是否已注册
   *
   * @param name - 策略名称
   * @returns 是否已注册
   */
  has(name: string): boolean {
    return this.policies.has(name);
  }

  /**
   * 列出所有已注册的策略名称
   *
   * @returns 策略名称数组
   */
  list(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * 取消注册策略
   *
   * @param name - 策略名称
   * @returns 是否成功取消注册
   */
  unregister(name: string): boolean {
    return this.policies.delete(name);
  }

  /**
   * 清空所有策略
   */
  clear(): void {
    this.policies.clear();
  }

  /**
   * 获取已注册策略数量
   */
  size(): number {
    return this.policies.size;
  }
}

/**
 * 全局策略注册表实例
 */
export const policyRegistry = new PolicyRegistry();
