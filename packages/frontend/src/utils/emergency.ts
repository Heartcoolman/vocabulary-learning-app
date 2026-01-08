/**
 * 应急响应系统
 *
 * 提供服务降级、紧急回滚、用户通知等应急功能
 * 用于在生产环境出现问题时快速响应和恢复
 */

import { env } from '../config/env';

// ============================================
// 类型定义
// ============================================

/** 服务降级级别 */
export type DegradationLevel = 'none' | 'partial' | 'minimal' | 'maintenance';

/** 功能开关状态 */
export interface FeatureFlags {
  /** 学习功能是否可用 */
  learningEnabled: boolean;
  /** AMAS 算法是否可用 */
  amasEnabled: boolean;
  /** 同步功能是否可用 */
  syncEnabled: boolean;
  /** 离线模式是否强制开启 */
  forceOfflineMode: boolean;
  /** 是否显示维护横幅 */
  showMaintenanceBanner: boolean;
  /** 是否允许新用户注册 */
  registrationEnabled: boolean;
  /** 是否启用实验性功能 */
  experimentalEnabled: boolean;
}

/** 通知类型 */
export type NotificationType = 'info' | 'warning' | 'error' | 'maintenance';

/** 用户通知 */
export interface UserNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  dismissible: boolean;
  actionUrl?: string;
  actionText?: string;
  expiresAt?: number;
  createdAt: number;
}

/** 应急状态 */
export interface EmergencyState {
  degradationLevel: DegradationLevel;
  featureFlags: FeatureFlags;
  notifications: UserNotification[];
  lastUpdated: number;
  isRecoveryMode: boolean;
}

/** 回滚配置 */
export interface RollbackConfig {
  targetVersion?: string;
  clearCache: boolean;
  clearLocalStorage: boolean;
  forceReload: boolean;
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  learningEnabled: true,
  amasEnabled: true,
  syncEnabled: true,
  forceOfflineMode: false,
  showMaintenanceBanner: false,
  registrationEnabled: true,
  experimentalEnabled: false,
};

const STORAGE_KEY = 'danci_emergency_state';
const NOTIFICATION_STORAGE_KEY = 'danci_notifications';

// ============================================
// 应急响应管理器
// ============================================

/**
 * 应急响应管理器
 * 管理服务降级、功能开关和用户通知
 */
class EmergencyManager {
  private state: EmergencyState;
  private listeners: Set<(state: EmergencyState) => void> = new Set();
  private checkInterval?: ReturnType<typeof setInterval>;

  constructor() {
    this.state = this.loadState();
    this.startPeriodicCheck();
  }

  // ============================================
  // 状态管理
  // ============================================

  /**
   * 从本地存储加载状态
   */
  private loadState(): EmergencyState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 验证过期的通知
        parsed.notifications = (parsed.notifications || []).filter(
          (n: UserNotification) => !n.expiresAt || n.expiresAt > Date.now(),
        );
        return parsed;
      }
    } catch (e) {
      console.warn('[Emergency] Failed to load state from storage', e);
    }

    return {
      degradationLevel: 'none',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      notifications: [],
      lastUpdated: Date.now(),
      isRecoveryMode: false,
    };
  }

  /**
   * 保存状态到本地存储
   */
  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[Emergency] Failed to save state to storage', e);
    }
  }

  /**
   * 更新状态并通知监听器
   */
  private updateState(updates: Partial<EmergencyState>): void {
    this.state = {
      ...this.state,
      ...updates,
      lastUpdated: Date.now(),
    };
    this.saveState();
    this.notifyListeners();
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (e) {
        console.error('[Emergency] Listener error', e);
      }
    });
  }

  // ============================================
  // 服务降级
  // ============================================

  /**
   * 设置降级级别
   */
  setDegradationLevel(level: DegradationLevel): void {
    console.info(`[Emergency] Setting degradation level to: ${level}`);

    // 根据降级级别自动调整功能开关
    const featureFlags = { ...this.state.featureFlags };

    switch (level) {
      case 'none':
        // 完全正常
        Object.assign(featureFlags, DEFAULT_FEATURE_FLAGS);
        break;
      case 'partial':
        // 部分功能不可用
        featureFlags.experimentalEnabled = false;
        featureFlags.amasEnabled = false;
        break;
      case 'minimal':
        // 最小功能模式
        featureFlags.amasEnabled = false;
        featureFlags.syncEnabled = false;
        featureFlags.experimentalEnabled = false;
        featureFlags.registrationEnabled = false;
        break;
      case 'maintenance':
        // 维护模式
        featureFlags.learningEnabled = false;
        featureFlags.amasEnabled = false;
        featureFlags.syncEnabled = false;
        featureFlags.registrationEnabled = false;
        featureFlags.experimentalEnabled = false;
        featureFlags.showMaintenanceBanner = true;
        break;
    }

    this.updateState({
      degradationLevel: level,
      featureFlags,
    });
  }

  /**
   * 获取当前降级级别
   */
  getDegradationLevel(): DegradationLevel {
    return this.state.degradationLevel;
  }

  /**
   * 检查服务是否处于降级状态
   */
  isDegraded(): boolean {
    return this.state.degradationLevel !== 'none';
  }

  // ============================================
  // 功能开关
  // ============================================

  /**
   * 设置功能开关
   */
  setFeatureFlag<K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]): void {
    console.info(`[Emergency] Setting feature flag ${flag} to: ${value}`);

    this.updateState({
      featureFlags: {
        ...this.state.featureFlags,
        [flag]: value,
      },
    });
  }

  /**
   * 批量设置功能开关
   */
  setFeatureFlags(flags: Partial<FeatureFlags>): void {
    console.info('[Emergency] Batch setting feature flags', flags);

    this.updateState({
      featureFlags: {
        ...this.state.featureFlags,
        ...flags,
      },
    });
  }

  /**
   * 获取功能开关状态
   */
  getFeatureFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
    return this.state.featureFlags[flag];
  }

  /**
   * 获取所有功能开关
   */
  getFeatureFlags(): FeatureFlags {
    return { ...this.state.featureFlags };
  }

  /**
   * 检查功能是否可用
   */
  isFeatureEnabled(flag: keyof FeatureFlags): boolean {
    return Boolean(this.state.featureFlags[flag]);
  }

  // ============================================
  // 用户通知
  // ============================================

  /**
   * 生成通知 ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加用户通知
   */
  addNotification(notification: Omit<UserNotification, 'id' | 'createdAt'>): string {
    const id = this.generateNotificationId();
    const fullNotification: UserNotification = {
      ...notification,
      id,
      createdAt: Date.now(),
    };

    console.info('[Emergency] Adding notification', fullNotification);

    this.updateState({
      notifications: [...this.state.notifications, fullNotification],
    });

    return id;
  }

  /**
   * 移除通知
   */
  removeNotification(id: string): void {
    this.updateState({
      notifications: this.state.notifications.filter((n) => n.id !== id),
    });
  }

  /**
   * 清除所有通知
   */
  clearNotifications(): void {
    this.updateState({
      notifications: [],
    });
  }

  /**
   * 获取所有通知
   */
  getNotifications(): UserNotification[] {
    // 过滤过期通知
    const validNotifications = this.state.notifications.filter(
      (n) => !n.expiresAt || n.expiresAt > Date.now(),
    );

    if (validNotifications.length !== this.state.notifications.length) {
      this.updateState({ notifications: validNotifications });
    }

    return validNotifications;
  }

  /**
   * 显示维护通知
   */
  showMaintenanceNotification(message: string, estimatedEndTime?: Date): void {
    this.addNotification({
      type: 'maintenance',
      title: '系统维护',
      message: estimatedEndTime
        ? `${message} 预计恢复时间: ${estimatedEndTime.toLocaleString()}`
        : message,
      dismissible: false,
    });
  }

  /**
   * 显示错误通��
   */
  showErrorNotification(
    message: string,
    options?: { dismissible?: boolean; actionUrl?: string; actionText?: string },
  ): void {
    this.addNotification({
      type: 'error',
      title: '系统错误',
      message,
      dismissible: options?.dismissible ?? true,
      actionUrl: options?.actionUrl,
      actionText: options?.actionText,
    });
  }

  /**
   * 显示警告通知
   */
  showWarningNotification(message: string, expiresInMs?: number): void {
    this.addNotification({
      type: 'warning',
      title: '注意',
      message,
      dismissible: true,
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
    });
  }

  // ============================================
  // 紧急回滚
  // ============================================

  /**
   * 触发紧急回滚
   */
  async triggerRollback(
    config: RollbackConfig = { clearCache: true, clearLocalStorage: false, forceReload: true },
  ): Promise<void> {
    console.warn('[Emergency] Triggering rollback', config);

    // 添加回滚通知
    this.addNotification({
      type: 'warning',
      title: '系统回滚',
      message: '正在执行系统回滚，请稍候...',
      dismissible: false,
    });

    try {
      // 清除缓存
      if (config.clearCache && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        console.info('[Emergency] Caches cleared');
      }

      // 清除 LocalStorage（保留应急状态）
      if (config.clearLocalStorage) {
        const emergencyState = localStorage.getItem(STORAGE_KEY);
        localStorage.clear();
        if (emergencyState) {
          localStorage.setItem(STORAGE_KEY, emergencyState);
        }
        console.info('[Emergency] LocalStorage cleared');
      }

      // 清除 SessionStorage
      sessionStorage.clear();

      // 注销 Service Worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        console.info('[Emergency] Service workers unregistered');
      }

      // 进入恢复模式
      this.updateState({
        isRecoveryMode: true,
      });

      // 强制刷新
      if (config.forceReload) {
        // 使用延迟确保状态保存
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (error) {
      console.error('[Emergency] Rollback failed', error);
      this.showErrorNotification('回滚过程中发生错误，请手动清除浏览器缓存');
    }
  }

  /**
   * 清除缓存并刷新
   */
  async clearCacheAndReload(): Promise<void> {
    await this.triggerRollback({
      clearCache: true,
      clearLocalStorage: false,
      forceReload: true,
    });
  }

  /**
   * 重置应用状态
   */
  async resetApplication(): Promise<void> {
    await this.triggerRollback({
      clearCache: true,
      clearLocalStorage: true,
      forceReload: true,
    });
  }

  // ============================================
  // 远程配置同步
  // ============================================

  /**
   * 从服务器获取应急配置
   */
  async fetchRemoteConfig(): Promise<void> {
    try {
      const response = await fetch(`${env.apiUrl}/api/emergency/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const config = data.data || data.config;
      if (data.success && config) {
        const { degradationLevel, featureFlags, notifications } = config;

        if (degradationLevel) {
          this.setDegradationLevel(degradationLevel);
        }

        if (featureFlags) {
          this.setFeatureFlags(featureFlags);
        }

        if (notifications && Array.isArray(notifications)) {
          notifications.forEach((notif: Omit<UserNotification, 'id' | 'createdAt'>) => {
            this.addNotification(notif);
          });
        }

        console.info('[Emergency] Remote config loaded');
      }
    } catch (error) {
      // 静默失败，使用本地配置
      console.debug('[Emergency] Failed to fetch remote config', error);
    }
  }

  /**
   * 启动定期检查
   */
  private startPeriodicCheck(): void {
    // 每 5 分钟检查一次远程配置
    this.checkInterval = setInterval(
      () => {
        this.fetchRemoteConfig();
      },
      5 * 60 * 1000,
    );

    // 首次加载时立即检查
    if (env.isProd) {
      setTimeout(() => this.fetchRemoteConfig(), 1000);
    }
  }

  /**
   * 停止定期检查
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  // ============================================
  // 状态订阅
  // ============================================

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: EmergencyState) => void): () => void {
    this.listeners.add(listener);
    // 立即触发一次
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 获取当前完整状态
   */
  getState(): EmergencyState {
    return { ...this.state };
  }

  // ============================================
  // 恢复操作
  // ============================================

  /**
   * 恢复正常状态
   */
  recover(): void {
    console.info('[Emergency] Recovering to normal state');

    this.updateState({
      degradationLevel: 'none',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      isRecoveryMode: false,
    });

    // 添加恢复通知
    this.addNotification({
      type: 'info',
      title: '服务已恢复',
      message: '所有功能已恢复正常运行',
      dismissible: true,
      expiresAt: Date.now() + 30000, // 30秒后自动消失
    });
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    console.info('[Emergency] Resetting all state');

    this.state = {
      degradationLevel: 'none',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      notifications: [],
      lastUpdated: Date.now(),
      isRecoveryMode: false,
    };

    this.saveState();
    this.notifyListeners();
  }
}

// ============================================
// 单例实例
// ============================================

export const emergencyManager = new EmergencyManager();

// ============================================
// 便捷函数导出
// ============================================

/**
 * 设置降级级别
 */
export function setDegradationLevel(level: DegradationLevel): void {
  emergencyManager.setDegradationLevel(level);
}

/**
 * 检查服务是否降级
 */
export function isDegraded(): boolean {
  return emergencyManager.isDegraded();
}

/**
 * 检查功能是否可用
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return emergencyManager.isFeatureEnabled(flag);
}

/**
 * 设置功能开关
 */
export function setFeatureFlag<K extends keyof FeatureFlags>(
  flag: K,
  value: FeatureFlags[K],
): void {
  emergencyManager.setFeatureFlag(flag, value);
}

/**
 * 添加用户通知
 */
export function addNotification(notification: Omit<UserNotification, 'id' | 'createdAt'>): string {
  return emergencyManager.addNotification(notification);
}

/**
 * 触发紧急回滚
 */
export function triggerRollback(config?: RollbackConfig): Promise<void> {
  return emergencyManager.triggerRollback(config);
}

/**
 * 订阅应急状态变化
 */
export function subscribeEmergencyState(listener: (state: EmergencyState) => void): () => void {
  return emergencyManager.subscribe(listener);
}

/**
 * 获取应急状态
 */
export function getEmergencyState(): EmergencyState {
  return emergencyManager.getState();
}

/**
 * 恢复正常状态
 */
export function recoverFromEmergency(): void {
  emergencyManager.recover();
}

// ============================================
// React Hooks
// ============================================

import { useState, useEffect, useCallback } from 'react';

/**
 * 使用应急状态的 Hook
 */
export function useEmergencyState(): EmergencyState {
  const [state, setState] = useState(emergencyManager.getState());

  useEffect(() => {
    return emergencyManager.subscribe(setState);
  }, []);

  return state;
}

/**
 * 使用功能开关的 Hook
 */
export function useFeatureFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
  const state = useEmergencyState();
  return state.featureFlags[flag];
}

/**
 * 使用用户通知的 Hook
 */
export function useNotifications(): {
  notifications: UserNotification[];
  dismiss: (id: string) => void;
  clearAll: () => void;
} {
  const state = useEmergencyState();

  const dismiss = useCallback((id: string) => {
    emergencyManager.removeNotification(id);
  }, []);

  const clearAll = useCallback(() => {
    emergencyManager.clearNotifications();
  }, []);

  return {
    notifications: state.notifications,
    dismiss,
    clearAll,
  };
}

/**
 * 使用降级状态的 Hook
 */
export function useDegradation(): {
  level: DegradationLevel;
  isDegraded: boolean;
  isMaintenanceMode: boolean;
} {
  const state = useEmergencyState();

  return {
    level: state.degradationLevel,
    isDegraded: state.degradationLevel !== 'none',
    isMaintenanceMode: state.degradationLevel === 'maintenance',
  };
}
