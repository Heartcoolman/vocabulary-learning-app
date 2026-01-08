/**
 * 图标颜色常量
 *
 * 统一管理 Phosphor Icons 使用的颜色值，与 Tailwind CSS 配色保持一致。
 * 这些常量用于 <Icon color={...} /> 的 color 属性。
 *
 * @see docs/ui-design-system.md
 */

/**
 * 主题色 - Primary Colors
 * 用于主要操作、链接、强调元素
 */
export const iconColors = {
  // 主色调 Blue
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // 最常用
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // 中性色 Gray
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db', // 用于禁用状态
    400: '#9ca3af',
    500: '#6b7280', // 次要图标
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },

  // 语义色 - Semantic Colors
  success: {
    light: '#dcfce7',
    default: '#22c55e', // green-500
    dark: '#16a34a',
  },

  error: {
    light: '#fee2e2',
    default: '#ef4444', // red-500
    dark: '#dc2626',
  },

  warning: {
    light: '#fef3c7',
    default: '#f59e0b', // amber-500 - 常用于星形评分
    dark: '#d97706',
  },

  info: {
    light: '#dbeafe',
    default: '#3b82f6', // blue-500
    dark: '#2563eb',
  },

  // 状态标签色 - Status Colors
  purple: {
    light: '#f3e8ff',
    default: '#a855f7', // purple-500
    dark: '#9333ea',
  },

  violet: {
    light: '#ede9fe',
    default: '#8b5cf6', // violet-500 - 用于时钟/时间相关
    dark: '#7c3aed',
  },

  cyan: {
    light: '#cffafe',
    default: '#06b6d4', // cyan-500
    dark: '#0891b2',
  },

  // 特殊用途
  white: '#ffffff',
  black: '#000000',
} as const;

/**
 * 常用图标颜色快捷方式
 * 用于最常见的场景
 */
export const IconColor = {
  // 主操作图标
  primary: iconColors.blue[500],
  primaryDark: iconColors.blue[600],

  // 次要/信息图标
  secondary: iconColors.gray[500],
  muted: iconColors.gray[400],
  disabled: iconColors.gray[300],

  // 成功状态
  success: iconColors.success.default,

  // 错误/危险
  danger: iconColors.error.default,

  // 警告/星形评分
  warning: iconColors.warning.default,
  star: iconColors.warning.default, // 用于星形评分
  starEmpty: iconColors.gray[300], // 空星

  // 时间相关
  time: iconColors.violet.default,

  // 目标/目的
  target: iconColors.blue[500],

  // 掌握度相关
  mastered: iconColors.warning.default,
  unmastered: iconColors.gray[300],

  // 白色（用于深色背景按钮内）
  white: iconColors.white,
} as const;

/**
 * 徽章类别颜色
 * 用于 BadgeCelebration, BadgeDetailModal 等
 */
export const badgeCategoryColors = {
  bronze: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-400 dark:border-amber-600',
    text: 'text-amber-900 dark:text-amber-400',
    icon: '#d97706', // amber-600
  },
  silver: {
    bg: 'bg-gray-100 dark:bg-slate-700',
    border: 'border-gray-400 dark:border-slate-500',
    text: 'text-gray-900 dark:text-gray-300',
    icon: '#6b7280', // gray-500
  },
  gold: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    border: 'border-yellow-400 dark:border-yellow-600',
    text: 'text-yellow-900 dark:text-yellow-400',
    icon: '#ca8a04', // yellow-600
  },
  platinum: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    border: 'border-cyan-400 dark:border-cyan-600',
    text: 'text-cyan-900 dark:text-cyan-400',
    icon: '#0891b2', // cyan-600
  },
  diamond: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    border: 'border-purple-400 dark:border-purple-600',
    text: 'text-purple-900 dark:text-purple-400',
    icon: '#9333ea', // purple-600
  },
  master: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-400 dark:border-blue-600',
    text: 'text-blue-900 dark:text-blue-400',
    icon: '#3b82f6', // blue-500
  },
} as const;

/**
 * 彩带/庆祝动画颜色
 * 用于徽章解锁庆祝效果
 */
export const confettiColors = [
  iconColors.warning.default, // amber-500
  iconColors.blue[500],
  iconColors.success.default,
  iconColors.purple.default,
  iconColors.error.default,
] as const;

/**
 * 图表颜色
 * 用于 LineChart, MemoryTraceChart 等图表组件
 */
export const chartColors = {
  primary: iconColors.blue[500],
  secondary: iconColors.purple.default,
  success: iconColors.success.default,
  error: iconColors.error.default,
  warning: iconColors.warning.default,
  info: iconColors.cyan.default,

  // 图表轴线、网格 (light mode)
  axis: '#e5e7eb', // gray-200
  grid: '#e5e7eb', // gray-200
  label: '#9ca3af', // gray-400
  text: '#1f2937', // gray-800

  // Dark mode variants
  axisDark: '#334155', // slate-700
  gridDark: '#334155', // slate-700
  labelDark: '#64748b', // slate-500
  textDark: '#e2e8f0', // slate-200
  backgroundDark: '#1e293b', // slate-800

  // 用户状态指标
  attention: iconColors.blue[500],
  motivation: iconColors.success.default,
  memory: iconColors.purple.default,
  speed: iconColors.warning.default,
  stability: iconColors.cyan.default,
  fatigue: iconColors.error.default,
} as const;

export type IconColorKey = keyof typeof IconColor;
export type BadgeCategoryKey = keyof typeof badgeCategoryColors;
