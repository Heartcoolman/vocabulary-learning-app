/**
 * 用户模拟器
 * 封装API调用，模拟用户学习行为
 */

import request from 'supertest';
import type { Express } from 'express';
import type { LearningEvent } from './event-generator';

/**
 * AMAS处理结果
 */
export interface AmasProcessResponse {
  success: boolean;
  data: {
    sessionId: string;
    strategy: {
      interval_scale: number;
      new_ratio: number;
      difficulty: 'easy' | 'mid' | 'hard';
      batch_size: number;
      hint_level: number;
    };
    explanation: string;
    suggestion?: string;
    shouldBreak: boolean;
    state: {
      attention: number;
      fatigue: number;
      motivation: number;
      memory: number;
      speed: number;
      stability: number;
    };
  };
}

/**
 * 用户状态结构
 */
export interface UserState {
  attention: number;
  fatigue: number;
  motivation: number;
  memory: number;
  speed: number;
  stability: number;
  cognitive?: {
    mem: number;
    speed: number;
    stability: number;
  };
  confidence?: number;
  timestamp?: number;
}

/**
 * 状态历史记录
 */
export interface StateHistoryItem {
  date: string;
  attention: number;
  fatigue: number;
  motivation: number;
  memory: number;
  speed: number;
  stability: number;
  trendState?: string;
}

/**
 * 习惯画像
 */
export interface HabitProfile {
  stored: {
    timePref: Record<string, number>;
    rhythmPref: string;
    updatedAt: string;
  } | null;
  realtime: {
    timePref: Record<string, number>;
    preferredTimeSlots: number[];
    rhythmPref: string;
    samples: {
      timeEvents: number;
      sessionEnds: number;
    };
  };
}

/**
 * 学习会话结果
 */
export interface SessionResult {
  /** 总事件数 */
  totalEvents: number;
  /** 成功处理数 */
  successCount: number;
  /** 失败数 */
  failureCount: number;
  /** 是否建议休息 */
  shouldBreakSuggested: boolean;
  /** 建议休息的事件索引 */
  breakSuggestedAt?: number;
  /** 所有响应 */
  responses: AmasProcessResponse[];
  /** 失败详情 */
  failures: Array<{
    index: number;
    event: LearningEvent;
    error: string;
  }>;
  /** 最终状态 */
  finalState?: UserState;
  /** 执行耗时(ms) */
  durationMs: number;
}

/**
 * 用户模拟器类
 */
export class UserSimulator {
  private app: Express;
  private authToken: string;
  private userId: string;
  private amasSessionId?: string;

  constructor(app: Express, authToken: string, userId: string) {
    this.app = app;
    this.authToken = authToken;
    this.userId = userId;
  }

  /**
   * 获取用户ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * 获取AMAS会话ID
   */
  getAmasSessionId(): string | undefined {
    return this.amasSessionId;
  }

  /**
   * 执行单次学习事件
   */
  async learnWord(event: LearningEvent): Promise<AmasProcessResponse> {
    const payload = {
      wordId: event.wordId,
      isCorrect: event.isCorrect,
      responseTime: event.responseTime,
      dwellTime: event.dwellTime,
      pauseCount: event.pauseCount,
      retryCount: event.retryCount,
      sessionId: this.amasSessionId || event.sessionId,
    };

    const response = await request(this.app)
      .post('/api/amas/process')
      .set('Authorization', `Bearer ${this.authToken}`)
      .send(payload);

    if (response.status !== 200) {
      throw new Error(`AMAS process failed: ${response.status} - ${JSON.stringify(response.body)}`);
    }

    // 保存sessionId以便复用
    if (response.body.data?.sessionId) {
      this.amasSessionId = response.body.data.sessionId;
    }

    return response.body;
  }

  /**
   * 执行完整学习会话
   */
  async runLearningSession(events: LearningEvent[]): Promise<SessionResult> {
    const startTime = Date.now();
    const result: SessionResult = {
      totalEvents: events.length,
      successCount: 0,
      failureCount: 0,
      shouldBreakSuggested: false,
      responses: [],
      failures: [],
      durationMs: 0,
    };

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      try {
        const response = await this.learnWord(event);
        result.responses.push(response);
        result.successCount++;

        // 检查是否建议休息
        if (response.data?.shouldBreak && !result.shouldBreakSuggested) {
          result.shouldBreakSuggested = true;
          result.breakSuggestedAt = i;
        }
      } catch (error) {
        result.failureCount++;
        result.failures.push({
          index: i,
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 获取最终状态
    try {
      result.finalState = await this.getState();
    } catch {
      // 忽略获取状态失败
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * 获取用户当前AMAS状态
   */
  async getState(): Promise<UserState> {
    const response = await request(this.app)
      .get('/api/amas/state')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status === 404) {
      throw new Error('用户AMAS状态未初始化');
    }

    if (response.status !== 200) {
      throw new Error(`获取状态失败: ${response.status}`);
    }

    return response.body.data;
  }

  /**
   * 获取状态历史
   */
  async getStateHistory(range: 7 | 30 | 90 = 30): Promise<StateHistoryItem[]> {
    const response = await request(this.app)
      .get('/api/amas/history')
      .query({ range })
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status !== 200) {
      throw new Error(`获取状态历史失败: ${response.status}`);
    }

    return response.body.data.history;
  }

  /**
   * 获取习惯画像
   */
  async getHabitProfile(): Promise<HabitProfile> {
    const response = await request(this.app)
      .get('/api/habit-profile')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status !== 200) {
      throw new Error(`获取习惯画像失败: ${response.status}`);
    }

    return response.body.data;
  }

  /**
   * 获取当前策略
   */
  async getStrategy(): Promise<AmasProcessResponse['data']['strategy']> {
    const response = await request(this.app)
      .get('/api/amas/strategy')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status === 404) {
      throw new Error('用户策略未初始化');
    }

    if (response.status !== 200) {
      throw new Error(`获取策略失败: ${response.status}`);
    }

    return response.body.data;
  }

  /**
   * 获取冷启动阶段
   */
  async getPhase(): Promise<{ phase: string; description: string }> {
    const response = await request(this.app)
      .get('/api/amas/phase')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status !== 200) {
      throw new Error(`获取阶段失败: ${response.status}`);
    }

    return response.body.data;
  }

  /**
   * 重置AMAS状态
   */
  async resetState(): Promise<void> {
    const response = await request(this.app)
      .post('/api/amas/reset')
      .set('Authorization', `Bearer ${this.authToken}`);

    if (response.status !== 200) {
      throw new Error(`重置状态失败: ${response.status}`);
    }

    // 清除会话ID
    this.amasSessionId = undefined;
  }
}

/**
 * 创建模拟测试用户
 */
export interface CreateTestUserResult {
  id: string;
  username: string;
  email: string;
  token: string;
}

/**
 * 创建测试用户辅助函数（需要传入app和prisma）
 */
export async function createSimulationUser(
  app: Express,
  prisma: any,
  bcrypt: any,
  faker: any
): Promise<CreateTestUserResult> {
  const username = `sim_test_${faker.string.alphanumeric(8)}`;
  const email = `${username}@simulation.test`;
  const password = 'SimTest123456';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: 'USER',
    },
  });

  // 登录获取token
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (loginResponse.status !== 200) {
    throw new Error(`登录失败: ${loginResponse.status}`);
  }

  return {
    id: user.id,
    username,
    email,
    token: loginResponse.body.data.token,
  };
}
