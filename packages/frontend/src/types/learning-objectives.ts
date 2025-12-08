/**
 * Learning Objectives Types
 * 学习目标相关类型定义
 *
 * 注意: 核心类型已迁移到 @danci/shared
 * 此处只保留前端专用的类型
 */

// 从 @danci/shared 导入共享类型
import type { LearningObjectiveMode, LearningObjectives, PrimaryObjective } from '@danci/shared';

// 重新导出以保持向后兼容
export type { LearningObjectiveMode, LearningObjectives, PrimaryObjective };

export interface ModeSuggestion {
  mode: LearningObjectiveMode;
  reason: string;
  config: Partial<LearningObjectives>;
}

export interface ObjectiveSuggestions {
  currentMode: LearningObjectiveMode;
  suggestedModes: ModeSuggestion[];
}

export interface ObjectiveHistoryEntry {
  /** 时间戳（毫秒） - 统一使用number类型 */
  timestamp: number;
  reason: string;
  beforeMode: string;
  afterMode: string;
}
