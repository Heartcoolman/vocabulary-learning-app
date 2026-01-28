/**
 * AMAS 设置状态管理
 *
 * 管理自适应学习系统的用户可配置参数：
 * - 难度范围 (C10: 0.1-1.0, 步长 0.1, min≤max)
 * - 调整速度
 * - 疲劳灵敏度 (C9: 低=0.15, 中=0.25, 高=0.35)
 * - 提醒方式
 *
 * 遵循 C11: 本地存储，不跨设备同步
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants/storageKeys';

/** 疲劳灵敏度级别 */
export type FatigueSensitivity = 'low' | 'medium' | 'high';

/** 疲劳灵敏度对应 EAR 阈值 (C9) */
export const FATIGUE_SENSITIVITY_THRESHOLDS: Record<FatigueSensitivity, number> = {
  low: 0.15,
  medium: 0.25,
  high: 0.35,
};

/** 疲劳提醒方式 */
export type FatigueAlertMode = 'modal' | 'statusbar';

/** 难度调整速度 */
export type DifficultyAdjustSpeed = 'conservative' | 'normal' | 'aggressive';

/** 难度范围配置 */
export interface DifficultyRange {
  min: number;
  max: number;
}

/** AMAS 设置状态 */
interface AmasSettingsState {
  // 难度范围 (C10)
  difficultyRange: DifficultyRange;
  // 难度调整速度
  adjustSpeed: DifficultyAdjustSpeed;
  // 疲劳灵敏度 (C9)
  fatigueSensitivity: FatigueSensitivity;
  // 疲劳提醒方式
  fatigueAlertMode: FatigueAlertMode;

  // Actions
  setDifficultyRange: (range: Partial<DifficultyRange>) => void;
  setAdjustSpeed: (speed: DifficultyAdjustSpeed) => void;
  setFatigueSensitivity: (sensitivity: FatigueSensitivity) => void;
  setFatigueAlertMode: (mode: FatigueAlertMode) => void;
  reset: () => void;
}

/** 默认值 (C10) */
const DEFAULT_DIFFICULTY_RANGE: DifficultyRange = {
  min: 0.3,
  max: 0.8,
};

const DEFAULT_STATE = {
  difficultyRange: DEFAULT_DIFFICULTY_RANGE,
  adjustSpeed: 'normal' as DifficultyAdjustSpeed,
  fatigueSensitivity: 'medium' as FatigueSensitivity,
  fatigueAlertMode: 'modal' as FatigueAlertMode,
};

export const useAmasSettingsStore = create<AmasSettingsState>()(
  devtools(
    persist(
      (set) => ({
        ...DEFAULT_STATE,

        setDifficultyRange: (range) =>
          set(
            (state) => {
              const newMin = range.min ?? state.difficultyRange.min;
              const newMax = range.max ?? state.difficultyRange.max;
              // C10: 确保 min <= max，范围在 [0.1, 1.0]
              const clampedMin = Math.max(0.1, Math.min(1.0, newMin));
              const clampedMax = Math.max(0.1, Math.min(1.0, newMax));
              return {
                difficultyRange: {
                  min: Math.min(clampedMin, clampedMax),
                  max: Math.max(clampedMin, clampedMax),
                },
              };
            },
            false,
            'setDifficultyRange',
          ),

        setAdjustSpeed: (adjustSpeed) => set({ adjustSpeed }, false, 'setAdjustSpeed'),

        setFatigueSensitivity: (fatigueSensitivity) =>
          set({ fatigueSensitivity }, false, 'setFatigueSensitivity'),

        setFatigueAlertMode: (fatigueAlertMode) =>
          set({ fatigueAlertMode }, false, 'setFatigueAlertMode'),

        reset: () => set(DEFAULT_STATE, false, 'reset'),
      }),
      {
        name: STORAGE_KEYS.AMAS_SETTINGS_STORAGE,
      },
    ),
    { name: 'AmasSettings' },
  ),
);

/** 获取当前疲劳检测 EAR 阈值 */
export function getFatigueThreshold(sensitivity: FatigueSensitivity): number {
  return FATIGUE_SENSITIVITY_THRESHOLDS[sensitivity];
}

/** 获取难度标签 (C10) */
export function getDifficultyLabel(value: number): string {
  if (value <= 0.3) return '简单';
  if (value <= 0.6) return '适中';
  return '困难';
}
