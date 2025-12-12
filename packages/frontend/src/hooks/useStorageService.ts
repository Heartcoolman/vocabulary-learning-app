/**
 * 存储服务 Hook
 *
 * 提供统一的存储服务访问接口，支持：
 * - 自动检测运行环境 (Web/Tauri)
 * - 根据环境选择对应的存储实现
 * - 缓存服务实例避免重复创建
 *
 * 设计说明：
 * - 在 Tauri 环境中使用本地 SQLite + Rust 原生命令
 * - 在 Web 环境中使用后端 API
 * - 两种实现提供统一的 IStorageService 接口
 */

import { useMemo } from 'react';
import { usePlatform } from './usePlatform';
import { getStorageService } from '../services/storage';
import type { IStorageService } from '../services/IStorageService';

/**
 * 存储服务 Hook 配置选项
 */
export interface UseStorageServiceOptions {
  /**
   * 强制使用指定的存储类型
   * - 'tauri': 强制使用 Tauri 本地存储
   * - 'web': 强制使用 Web API 存储
   * - undefined: 自动检测环境
   */
  forceType?: 'tauri' | 'web';
}

/**
 * 存储服务 Hook
 *
 * 根据运行环境自动选择合适的存储服务实现：
 * - Tauri 环境：使用本地 SQLite 数据库，通过 Rust 命令访问
 * - Web 环境：使用后端 API，数据存储在云端
 *
 * @param options 配置选项
 * @returns 存储服务实例
 *
 * @example
 * ```tsx
 * function LearningComponent() {
 *   const storage = useStorageService();
 *
 *   // 获取单词
 *   const word = await storage.getWord('word-id');
 *
 *   // 保存学习状态
 *   await storage.saveLearningState(state);
 *
 *   // 同步数据到云端 (仅 Tauri 环境有实际效果)
 *   const result = await storage.syncToCloud();
 * }
 * ```
 *
 * @example
 * ```tsx
 * // 强制使用 Web 存储（用于测试或特殊场景）
 * function TestComponent() {
 *   const storage = useStorageService({ forceType: 'web' });
 *   // ...
 * }
 * ```
 */
export function useStorageService(options?: UseStorageServiceOptions): IStorageService {
  const platform = usePlatform();

  const storageService = useMemo(() => {
    // 如果强制指定类型，可以在这里处理
    // 目前 getStorageService 已经实现了环境检测和缓存逻辑
    // 所以直接使用即可
    if (options?.forceType) {
      // 注意：当前实现不支持强制切换类型
      // 如果需要支持，需要扩展 TauriStorageService.ts 中的工厂函数
      console.warn(
        `[useStorageService] forceType='${options.forceType}' 选项暂不支持，使用自动检测`,
      );
    }

    return getStorageService();
  }, [platform.isTauri, options?.forceType]);

  return storageService;
}

// ==================== 类型导出 ====================

// 重新导出存储服务相关类型，方便使用者导入
export type {
  IStorageService,
  LearningStats,
  DailyStats,
  SyncResult,
  SyncStatus,
} from '../services/IStorageService';

export { StorageServiceError } from '../services/IStorageService';

export default useStorageService;
