/**
 * API适配器索引
 * 统一导出所有适配器
 */

export * from './base-client';
export * from './realtime-adapter';
export * from './learning-state-adapter';
export * from './user-profile-adapter';

// 导出工厂函数
export { createApiClient } from './base-client';
export { createRealtimeAdapter } from './realtime-adapter';
export { createLearningStateAdapter } from './learning-state-adapter';
export { createUserProfileAdapter } from './user-profile-adapter';
