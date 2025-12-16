/**
 * 数据库状态机
 *
 * 管理数据库状态转换：
 * NORMAL (PostgreSQL) <-> DEGRADED (SQLite) <-> SYNCING
 *                              |
 *                              v
 *                         UNAVAILABLE (两者都不可用)
 */

import { EventEmitter } from 'events';
import { DatabaseState } from '../adapters/types';

// ============================================
// 类型定义
// ============================================

/**
 * 状态转换事件
 */
export interface StateTransition {
  from: DatabaseState;
  to: DatabaseState;
  reason: string;
  timestamp: number;
}

/**
 * 状态机事件
 */
export interface StateMachineEvents {
  'state-changed': (transition: StateTransition) => void;
  'enter-normal': () => void;
  'enter-degraded': () => void;
  'enter-syncing': () => void;
  'enter-unavailable': () => void;
  'transition-blocked': (from: DatabaseState, to: DatabaseState, reason: string) => void;
}

/**
 * 状态转换规则
 *
 * - NORMAL -> DEGRADED: 主库故障，切换到备库
 * - DEGRADED -> SYNCING: 主库恢复，开始同步
 * - DEGRADED -> UNAVAILABLE: 备库也故障
 * - SYNCING -> NORMAL: 同步完成
 * - SYNCING -> DEGRADED: 同步失败
 * - UNAVAILABLE -> DEGRADED: 备库恢复
 * - UNAVAILABLE -> NORMAL: 主库恢复（极少见）
 */
const VALID_TRANSITIONS: Record<DatabaseState, DatabaseState[]> = {
  NORMAL: ['DEGRADED'],
  DEGRADED: ['SYNCING', 'UNAVAILABLE'],
  SYNCING: ['NORMAL', 'DEGRADED'],
  UNAVAILABLE: ['DEGRADED', 'NORMAL'],
};

// ============================================
// 状态机
// ============================================

/**
 * 数据库状态机
 */
export class DatabaseStateMachine extends EventEmitter {
  private currentState: DatabaseState = 'NORMAL';
  private stateHistory: StateTransition[] = [];
  private stateChangeCount = 0;
  private lastStateChangeTime: number | null = null;
  private startTime = Date.now();

  constructor(initialState: DatabaseState = 'NORMAL') {
    super();
    this.currentState = initialState;
  }

  /**
   * 获取当前状态
   */
  getState(): DatabaseState {
    return this.currentState;
  }

  /**
   * 是否为正常状态
   */
  isNormal(): boolean {
    return this.currentState === 'NORMAL';
  }

  /**
   * 是否为降级状态
   */
  isDegraded(): boolean {
    return this.currentState === 'DEGRADED';
  }

  /**
   * 是否为同步状态
   */
  isSyncing(): boolean {
    return this.currentState === 'SYNCING';
  }

  /**
   * 是否为不可用状态
   */
  isUnavailable(): boolean {
    return this.currentState === 'UNAVAILABLE';
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransitionTo(targetState: DatabaseState): boolean {
    const validTargets = VALID_TRANSITIONS[this.currentState];
    return validTargets.includes(targetState);
  }

  /**
   * 转换到目标状态
   */
  transitionTo(targetState: DatabaseState, reason: string): boolean {
    if (!this.canTransitionTo(targetState)) {
      this.emit(
        'transition-blocked',
        this.currentState,
        targetState,
        `Invalid transition from ${this.currentState} to ${targetState}`,
      );
      return false;
    }

    const transition: StateTransition = {
      from: this.currentState,
      to: targetState,
      reason,
      timestamp: Date.now(),
    };

    const previousState = this.currentState;
    this.currentState = targetState;
    this.stateChangeCount++;
    this.lastStateChangeTime = transition.timestamp;
    this.stateHistory.push(transition);

    // 限制历史记录大小
    if (this.stateHistory.length > 100) {
      this.stateHistory.shift();
    }

    this.emit('state-changed', transition);

    // 触发状态特定事件
    switch (targetState) {
      case 'NORMAL':
        this.emit('enter-normal');
        break;
      case 'DEGRADED':
        this.emit('enter-degraded');
        break;
      case 'SYNCING':
        this.emit('enter-syncing');
        break;
      case 'UNAVAILABLE':
        this.emit('enter-unavailable');
        break;
    }

    return true;
  }

  /**
   * 快捷方法：转换到降级状态
   */
  degraded(reason: string = 'PostgreSQL health check failed'): boolean {
    return this.transitionTo('DEGRADED', reason);
  }

  /**
   * 快捷方法：开始同步
   */
  startSync(reason: string = 'PostgreSQL recovered, starting sync'): boolean {
    return this.transitionTo('SYNCING', reason);
  }

  /**
   * 快捷方法：恢复正常
   */
  recover(reason: string = 'Sync completed successfully'): boolean {
    return this.transitionTo('NORMAL', reason);
  }

  /**
   * 快捷方法：同步失败，回到降级状态
   */
  syncFailed(reason: string = 'Sync failed, falling back to degraded mode'): boolean {
    return this.transitionTo('DEGRADED', reason);
  }

  /**
   * 快捷方法：转换到不可用状态（主备库都不可用）
   */
  unavailable(reason: string = 'Both primary and fallback databases are unavailable'): boolean {
    return this.transitionTo('UNAVAILABLE', reason);
  }

  /**
   * 快捷方法：从不可用状态恢复到降级状态（备库恢复）
   */
  recoverToDegraded(reason: string = 'Fallback database recovered'): boolean {
    return this.transitionTo('DEGRADED', reason);
  }

  /**
   * 获取状态历史
   */
  getHistory(): StateTransition[] {
    return [...this.stateHistory];
  }

  /**
   * 获取最近一次状态转换
   */
  getLastTransition(): StateTransition | null {
    return this.stateHistory.length > 0 ? this.stateHistory[this.stateHistory.length - 1] : null;
  }

  /**
   * 获取状态统计
   */
  getStats(): {
    currentState: DatabaseState;
    stateChangeCount: number;
    lastStateChangeTime: number | null;
    uptime: number;
    recentTransitions: StateTransition[];
  } {
    return {
      currentState: this.currentState,
      stateChangeCount: this.stateChangeCount,
      lastStateChangeTime: this.lastStateChangeTime,
      uptime: Date.now() - this.startTime,
      recentTransitions: this.stateHistory.slice(-10),
    };
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this.currentState = 'NORMAL';
    this.stateHistory = [];
    this.stateChangeCount = 0;
    this.lastStateChangeTime = null;
    this.startTime = Date.now();
  }
}

/**
 * 创建状态机
 */
export function createStateMachine(initialState?: DatabaseState): DatabaseStateMachine {
  return new DatabaseStateMachine(initialState);
}
