/**
 * 数据模型类型定义
 *
 * 注意: 大部分类型已迁移到 @danci/shared
 * 此文件重新导出这些类型以保持向后兼容
 *
 * 推荐直接从 '@danci/shared' 或 '../types' 导入
 */

// 从 @danci/shared 重新导出所有共享类型
export type {
  // 单词相关
  Word,
  WordBookType,
  WordBook,
  WordLearningState,
  WordScore,
  WordStatistics,
  MasteryLevel,
  // 学习相关
  AnswerRecord,
  LearningSession,
  StudyStatistics,
  StudyConfig,
  AlgorithmConfig,
  ConfigHistory,
  // 用户相关
  UserRole,
  UserInfo,
} from '@danci/shared';

// 重新导出 WordState 枚举
export { WordState } from '@danci/shared';

// ============================================
// 前端专用类型（未迁移到 shared）
// ============================================

/**
 * 系统统计数据
 * 前端专用，用于管理员仪表板
 */
export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalWordBooks: number;
  systemWordBooks: number;
  userWordBooks: number;
  totalWords: number;
  totalRecords: number;
}
