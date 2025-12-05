/**
 * Decision Events Service
 *
 * 提供决策事件的实时推送能力
 * 使用 Node.js EventEmitter 实现发布/订阅模式
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { serviceLogger } from '../logger';

// ==================== 类型定义 ====================

export interface DecisionEventData {
  decisionId: string;
  pseudoId: string;
  timestamp: string;
  decisionSource: string;
  strategy: {
    difficulty: string;
    batch_size: number;
  };
  dominantFactor: string;
  source: 'real' | 'virtual';
}

// ==================== 每日盐值管理器 ====================

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

function anonymizeUserId(userId: string): string {
  const salt = saltManager.getSalt();
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}:${salt}`)
    .digest('hex');
  return hash.substring(0, 8);
}

// ==================== 决策事件发射器 ====================

class DecisionEventsService extends EventEmitter {
  private static instance: DecisionEventsService;
  private connectionCount = 0;

  private constructor() {
    super();
    // 设置最大监听器数量，防止内存泄漏警告
    this.setMaxListeners(100);
  }

  static getInstance(): DecisionEventsService {
    if (!DecisionEventsService.instance) {
      DecisionEventsService.instance = new DecisionEventsService();
    }
    return DecisionEventsService.instance;
  }

  /**
   * 发布新决策事件
   */
  emitDecision(data: {
    decisionId: string;
    userId?: string;
    timestamp: Date;
    decisionSource: string;
    selectedAction: Record<string, unknown>;
    stateSnapshot?: Record<string, unknown>;
    isSimulation?: boolean;
  }): void {
    const event: DecisionEventData = {
      decisionId: data.decisionId,
      pseudoId: data.userId ? anonymizeUserId(data.userId) : 'anonymous',
      timestamp: data.timestamp.toISOString(),
      decisionSource: data.decisionSource,
      strategy: {
        difficulty: String(data.selectedAction?.difficulty ?? 'mid'),
        batch_size: Number(data.selectedAction?.batch_size ?? 5)
      },
      dominantFactor: this.getDominantFactor(data.stateSnapshot),
      source: data.isSimulation ? 'virtual' : 'real'
    };

    this.emit('decision', event);

    serviceLogger.debug({
      decisionId: data.decisionId,
      source: event.source,
      connectionCount: this.connectionCount
    }, '[DecisionEvents] Emitted decision event');
  }

  /**
   * 增加连接计数
   */
  incrementConnections(): void {
    this.connectionCount++;
    serviceLogger.info({ count: this.connectionCount }, '[DecisionEvents] SSE connection opened');
  }

  /**
   * 减少连接计数
   */
  decrementConnections(): void {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    serviceLogger.info({ count: this.connectionCount }, '[DecisionEvents] SSE connection closed');
  }

  /**
   * 获取当前连接数
   */
  getConnectionCount(): number {
    return this.connectionCount;
  }

  /**
   * 获取主导因素
   */
  private getDominantFactor(state?: Record<string, unknown>): string {
    if (!state) return 'unknown';

    const factors = [
      { name: 'attention', value: Number(state.A ?? state.attention ?? 0.5) },
      { name: 'fatigue', value: Number(state.F ?? state.fatigue ?? 0.5) },
      { name: 'motivation', value: Number(state.M ?? state.motivation ?? 0.5) }
    ];

    // 疲劳高是负面因素
    const fatigueIdx = factors.findIndex(f => f.name === 'fatigue');
    if (fatigueIdx >= 0) {
      factors[fatigueIdx].value = 1 - factors[fatigueIdx].value;
    }

    // 找出最极端的因素
    let maxDeviation = 0;
    let dominant = 'balanced';

    for (const factor of factors) {
      const deviation = Math.abs(factor.value - 0.5);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        dominant = factor.name;
      }
    }

    return dominant;
  }
}

// ==================== 导出 ====================

export const decisionEventsService = DecisionEventsService.getInstance();

export default decisionEventsService;
