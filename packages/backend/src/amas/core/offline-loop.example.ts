/**
 * Offline Loop 使用示例
 *
 * 演示如何使用 Offline Loop 进行异步的延迟奖励处理
 */

import { OfflineLoop, RewardApplier, UserStateProvider } from './offline-loop';
import { PersistableFeatureVector, UserState } from '../types';
import { amasService } from '../../services/amas.service';

// ==================== 示例 1: 基本使用 ====================

/**
 * 创建 Offline Loop 实例
 */
function createOfflineLoop() {
  // 实现奖励应用器（调用 AMAS 服务）
  const rewardApplier: RewardApplier = {
    async applyReward(
      userId: string,
      reward: number,
      featureVector?: PersistableFeatureVector,
      actionIndex?: number,
    ) {
      // 调用 AMAS 服务应用延迟奖励
      await amasService.applyDelayedReward(
        userId,
        reward,
        undefined, // sessionId（可选）
        undefined, // answerRecordId（可选）
      );
    },
  };

  // 实现用户状态提供器（用于评估和过滤）
  const userStateProvider: UserStateProvider = {
    async getUserState(userId: string): Promise<UserState | null> {
      // 从数据库加载用户状态
      const state = await amasService.getUserState(userId);
      return state;
    },
  };

  // 创建 Offline Loop 实例
  const offlineLoop = new OfflineLoop(rewardApplier, userStateProvider, {
    // 可选配置
    evaluationThreshold: 0.3, // 奖励评估阈值
    enableQualityControl: true, // 启用质量控制
    batchSize: 50, // 批处理大小
    cronSchedule: '* * * * *', // 每分钟执行
    fatigueThreshold: 0.8, // 疲劳度过滤阈值
    verboseLogging: false, // 详细日志
  });

  return offlineLoop;
}

// ==================== 示例 2: 添加延迟奖励事件 ====================

/**
 * 添加延迟奖励事件到队列
 */
async function addDelayedReward() {
  const offlineLoop = createOfflineLoop();

  // 添加奖励事件
  const eventId = offlineLoop.addReward(
    'user-123',
    0.8, // 奖励值 [-1, 1]
    {
      featureVector: {
        values: [0.5, 0.3, 0.7],
        version: 1,
        ts: Date.now(),
        labels: ['attention', 'fatigue', 'motivation'],
      },
      actionIndex: 5,
      timestamp: Date.now(),
    },
  );

  console.log('Event added:', eventId);
}

// ==================== 示例 3: 手动触发处理 ====================

/**
 * 手动触发一次离线处理
 */
async function manualProcess() {
  const offlineLoop = createOfflineLoop();

  // 添加一些测试数据
  offlineLoop.addReward('user-1', 0.8);
  offlineLoop.addReward('user-1', 0.6);
  offlineLoop.addReward('user-2', -0.5);

  // 手动触发处理
  const result = await offlineLoop.processOnce();

  console.log('Processing result:', {
    totalUsers: result.totalUsers,
    totalRewards: result.totalRewards,
    successCount: result.successCount,
    failureCount: result.failureCount,
    filteredCount: result.filteredCount,
  });
}

// ==================== 示例 4: 启动定时任务 ====================

/**
 * 启动定时任务（生产环境）
 */
function startScheduledProcessing() {
  const offlineLoop = createOfflineLoop();

  // 启动定时任务（每分钟执行）
  offlineLoop.start();

  // 应用关闭时停止
  process.on('SIGTERM', () => {
    console.log('Stopping offline loop...');
    offlineLoop.stop();
  });

  process.on('SIGINT', () => {
    console.log('Stopping offline loop...');
    offlineLoop.stop();
  });
}

// ==================== 示例 5: 自定义配置 ====================

/**
 * 使用自定义奖励时间表
 */
function customScheduleExample() {
  const rewardApplier: RewardApplier = {
    async applyReward(userId: string, reward: number) {
      await amasService.applyDelayedReward(userId, reward);
    },
  };

  const offlineLoop = new OfflineLoop(rewardApplier, undefined, {
    // 自定义奖励时间表
    rewardSchedule: [
      { delaySec: 0, weight: 0.4, label: 'immediate' }, // 即时 40%
      { delaySec: 3600, weight: 0.3, label: '1h' }, // 1小时 30%
      { delaySec: 86400, weight: 0.3, label: '24h' }, // 24小时 30%
    ],
    // 降低评估阈值（接受更多奖励）
    evaluationThreshold: 0.2,
    // 禁用质量控制（接受所有奖励）
    enableQualityControl: false,
  });

  return offlineLoop;
}

// ==================== 示例 6: 查询队列状态 ====================

/**
 * 查询当前队列状态
 */
function checkQueueStatus() {
  const offlineLoop = createOfflineLoop();

  // 添加一些事件
  offlineLoop.addReward('user-1', 0.5);
  offlineLoop.addReward('user-2', 0.3);

  // 查询队列状态
  const status = offlineLoop.getQueueStatus();

  console.log('Queue status:', {
    pendingCount: status.pendingCount,
    schedule: status.schedule,
  });
}

// ==================== 示例 7: 状态持久化 ====================

/**
 * 持久化和恢复状态
 */
async function persistenceExample() {
  const offlineLoop = createOfflineLoop();

  // 添加一些事件
  offlineLoop.addReward('user-1', 0.5);
  offlineLoop.addReward('user-2', 0.3);

  // 获取状态（用于持久化）
  const state = offlineLoop.getState();

  // 保存到数据库或文件
  // await saveToDatabase(state);

  // ... 应用重启 ...

  // 创建新实例并恢复状态
  const newOfflineLoop = createOfflineLoop();
  newOfflineLoop.setState(state);

  // 继续处理
  await newOfflineLoop.processOnce();
}

// ==================== 示例 8: 与 Worker 集成 ====================

/**
 * 集成到现有的 Worker 系统
 */
async function workerIntegration() {
  // 创建全局 Offline Loop 实例
  const offlineLoop = createOfflineLoop();

  // 方式 1: 使用 Offline Loop 替代现有 Worker
  // offlineLoop.start();

  // 方式 2: 保留现有 Worker，使用 Offline Loop 增强功能
  // 在应用奖励时同时添加到 Offline Loop
  const enhancedApplyReward = async (userId: string, reward: number) => {
    // 原有逻辑
    await amasService.applyDelayedReward(userId, reward);

    // 同时添加到 Offline Loop（用于多时间尺度评估）
    offlineLoop.addReward(userId, reward);
  };

  // 使用增强的奖励应用函数
  await enhancedApplyReward('user-1', 0.5);
}

// ==================== 示例 9: 测试和调试 ====================

/**
 * 测试模式（详细日志）
 */
async function debugMode() {
  const rewardApplier: RewardApplier = {
    async applyReward(userId: string, reward: number) {
      console.log(`[DEBUG] Applying reward: userId=${userId}, reward=${reward}`);
      await amasService.applyDelayedReward(userId, reward);
    },
  };

  const offlineLoop = new OfflineLoop(rewardApplier, undefined, {
    verboseLogging: true, // 启用详细日志
    evaluationThreshold: 0.1, // 降低阈值（接受更多奖励）
    enableQualityControl: true, // 启用质量控制
  });

  // 添加测试数据
  offlineLoop.addReward('test-user', 0.5);
  offlineLoop.addReward('test-user', 0.3);
  offlineLoop.addReward('test-user', -0.2);

  // 手动处理并查看日志
  const result = await offlineLoop.processOnce();

  console.log('Test result:', result);
}

// ==================== 导出示例 ====================

export {
  createOfflineLoop,
  addDelayedReward,
  manualProcess,
  startScheduledProcessing,
  customScheduleExample,
  checkQueueStatus,
  persistenceExample,
  workerIntegration,
  debugMode,
};
