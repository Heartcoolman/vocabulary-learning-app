/**
 * AMAS 运行时类型验证工具
 *
 * 提供数据库加载数据的类型验证，替代不安全的 as unknown as T 强制转换
 */

import { CognitiveProfile, HabitProfile, TrendState, ColdStartStateData } from '../types';

/**
 * 验证并解析 CognitiveProfile
 *
 * @param data 数据库加载的原始数据
 * @returns 验证后的 CognitiveProfile 或默认值
 */
export function parseCognitiveProfile(data: unknown): CognitiveProfile {
  const defaultProfile: CognitiveProfile = {
    mem: 0.5,
    speed: 0.5,
    stability: 0.5,
  };

  if (!data || typeof data !== 'object') {
    return defaultProfile;
  }

  const obj = data as Record<string, unknown>;

  return {
    mem: isValidNumber(obj.mem, 0, 1) ? (obj.mem as number) : defaultProfile.mem,
    speed: isValidNumber(obj.speed, 0, 1) ? (obj.speed as number) : defaultProfile.speed,
    stability: isValidNumber(obj.stability, 0, 1)
      ? (obj.stability as number)
      : defaultProfile.stability,
  };
}

/**
 * 验证并解析 HabitProfile
 *
 * @param data 数据库加载的原始数据
 * @returns 验证后的 HabitProfile 或 undefined
 */
export function parseHabitProfile(data: unknown): HabitProfile | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const obj = data as Record<string, unknown>;

  // 验证必需字段
  if (!Array.isArray(obj.timePref) || !obj.rhythmPref || !Array.isArray(obj.preferredTimeSlots)) {
    return undefined;
  }

  const rhythmPref = obj.rhythmPref as Record<string, unknown>;
  const samples = (obj.samples as Record<string, unknown>) || {};

  return {
    timePref: (obj.timePref as number[]).map((v) => (isValidNumber(v, 0, 1) ? v : 0)),
    rhythmPref: {
      sessionMedianMinutes: isValidNumber(rhythmPref.sessionMedianMinutes, 0, Infinity)
        ? (rhythmPref.sessionMedianMinutes as number)
        : 15,
      batchMedian: isValidNumber(rhythmPref.batchMedian, 1, Infinity)
        ? (rhythmPref.batchMedian as number)
        : 10,
    },
    preferredTimeSlots: (obj.preferredTimeSlots as number[]).filter((v) =>
      isValidNumber(v, 0, 23)
    ),
    samples: {
      timeEvents: isValidNumber(samples.timeEvents, 0, Infinity)
        ? (samples.timeEvents as number)
        : 0,
      sessions: isValidNumber(samples.sessions, 0, Infinity) ? (samples.sessions as number) : 0,
      batches: isValidNumber(samples.batches, 0, Infinity) ? (samples.batches as number) : 0,
    },
  };
}

/**
 * 验证并解析 TrendState
 *
 * @param data 数据库加载的原始数据
 * @returns 验证后的 TrendState 或 undefined
 */
export function parseTrendState(data: unknown): TrendState | undefined {
  const validStates: TrendState[] = ['up', 'flat', 'stuck', 'down'];

  if (typeof data === 'string' && validStates.includes(data as TrendState)) {
    return data as TrendState;
  }

  return undefined;
}

/**
 * 验证并解析 ColdStartStateData
 *
 * @param data 数据库加载的原始数据
 * @returns 验证后的 ColdStartStateData 或 undefined
 */
export function parseColdStartState(data: unknown): ColdStartStateData | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const obj = data as Record<string, unknown>;

  // 验证 phase
  const validPhases = ['classify', 'explore', 'normal'];
  if (!validPhases.includes(obj.phase as string)) {
    return undefined;
  }

  // 验证 userType
  const validUserTypes = ['fast', 'stable', 'cautious', null];
  if (obj.userType !== null && !['fast', 'stable', 'cautious'].includes(obj.userType as string)) {
    return undefined;
  }

  // 解析 settledStrategy
  let settledStrategy = null;
  if (obj.settledStrategy && typeof obj.settledStrategy === 'object') {
    const strategy = obj.settledStrategy as Record<string, unknown>;
    const validDifficulties = ['easy', 'mid', 'hard'];

    if (
      isValidNumber(strategy.interval_scale, 0.1, 5) &&
      isValidNumber(strategy.new_ratio, 0, 1) &&
      validDifficulties.includes(strategy.difficulty as string) &&
      isValidNumber(strategy.batch_size, 1, 50) &&
      isValidNumber(strategy.hint_level, 0, 3)
    ) {
      settledStrategy = {
        interval_scale: strategy.interval_scale as number,
        new_ratio: strategy.new_ratio as number,
        difficulty: strategy.difficulty as 'easy' | 'mid' | 'hard',
        batch_size: strategy.batch_size as number,
        hint_level: strategy.hint_level as number,
      };
    }
  }

  return {
    phase: obj.phase as 'classify' | 'explore' | 'normal',
    userType: (obj.userType as 'fast' | 'stable' | 'cautious') || null,
    probeIndex: isValidNumber(obj.probeIndex, 0, Infinity) ? (obj.probeIndex as number) : 0,
    updateCount: isValidNumber(obj.updateCount, 0, Infinity) ? (obj.updateCount as number) : 0,
    settledStrategy,
  };
}

/**
 * 辅助函数：检查数值是否有效且在范围内
 */
function isValidNumber(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 验证 BanditModel 原始数据格式
 *
 * @param data 数据库加载的原始数据
 * @returns 类型验证结果
 */
export function validateBanditModelData(
  data: unknown
): data is { A: number[]; b: number[]; L?: number[]; d: number; lambda?: number; alpha?: number; updateCount?: number } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // 必需字段验证
  if (!Array.isArray(obj.A) || !Array.isArray(obj.b)) {
    return false;
  }

  if (typeof obj.d !== 'number' || !Number.isFinite(obj.d) || obj.d <= 0) {
    return false;
  }

  // 数组长度验证
  const d = obj.d as number;
  if (obj.A.length !== d * d || obj.b.length !== d) {
    return false;
  }

  // L 可选，但如果存在必须长度正确
  if (obj.L !== undefined && (!Array.isArray(obj.L) || obj.L.length !== d * d)) {
    return false;
  }

  return true;
}
