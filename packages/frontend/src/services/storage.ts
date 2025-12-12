/**
 * Storage Service 统一入口
 *
 * 提供存储服务的工厂函数和统一导出
 * 根据运行环境自动选择合适的实现
 *
 * 使用方式：
 * ```typescript
 * import { getStorageService } from './services/storage';
 *
 * const storage = getStorageService();
 * const word = await storage.getWord('word-id');
 * ```
 */

import { isTauri } from '../utils/platform';
import type { IStorageService } from './IStorageService';
import { WebStorageService } from './WebStorageService';
import { TauriStorageService } from './TauriStorageService';

// ===================== 重新导出类型 =====================

export type {
  IStorageService,
  LearningStats,
  DailyStats,
  SyncResult,
  SyncStatus,
} from './IStorageService';

export { StorageServiceError } from './IStorageService';
export { WebStorageService } from './WebStorageService';
export { TauriStorageService } from './TauriStorageService';

// ===================== 服务工厂 =====================

/** 缓存的服务实例 */
let cachedService: IStorageService | null = null;

/**
 * 获取存储服务实例
 * 根据运行环境自动选择实现
 *
 * @returns 存储服务实例
 *
 * @example
 * ```typescript
 * const storage = getStorageService();
 *
 * // 获取单词
 * const word = await storage.getWord('word-id');
 *
 * // 保存学习状态
 * await storage.saveLearningState(state);
 *
 * // 同步数据
 * const result = await storage.syncToCloud();
 * ```
 */
export function getStorageService(): IStorageService {
  if (cachedService) {
    return cachedService;
  }

  if (isTauri()) {
    cachedService = new TauriStorageService();
    console.log('[StorageService] 使用 Tauri 存储服务');
  } else {
    cachedService = new WebStorageService();
    console.log('[StorageService] 使用 Web 存储服务');
  }

  return cachedService;
}

/**
 * 重置存储服务实例
 * 用于测试或环境切换
 */
export function resetStorageService(): void {
  cachedService = null;
}

/**
 * 创建 Web 存储服务实例
 * 显式创建 Web 存储服务，不使用工厂缓存
 *
 * @returns Web 存储服务实例
 */
export function createWebStorageService(): WebStorageService {
  return new WebStorageService();
}

/**
 * 创建 Tauri 存储服务实例
 * 显式创建 Tauri 存储服务，不使用工厂缓存
 * 仅在 Tauri 环境中有效
 *
 * @returns Tauri 存储服务实例
 */
export function createTauriStorageService(): TauriStorageService {
  return new TauriStorageService();
}

// ===================== 默认导出 =====================

export default getStorageService;
