/**
 * API模块主入口
 * 统一导出所有API相关功能
 */

// 类型定义
export * from './types';

// 工具函数
export * from './utils/helpers';

// API适配器
export * from './adapters';

// React Hooks
export * from './hooks';

// 默认导出工厂函数
export { createApiClient } from './adapters/base-client';
export { createRealtimeAdapter } from './adapters/realtime-adapter';
export { createLearningStateAdapter } from './adapters/learning-state-adapter';
export { createUserProfileAdapter } from './adapters/user-profile-adapter';
