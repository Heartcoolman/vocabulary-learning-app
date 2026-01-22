/**
 * G3 动画系统 - 工具函数和常量
 * 基于 HyperOS/MIUI 的自然触感设计理念
 *
 * 使用方式:
 * - CSS方案: 使用 Tailwind 类如 animate-g3-fade-in, ease-g3, duration-g3-normal
 * - Framer Motion方案: 使用本文件导出的 spring 配置和 variants
 */

import type { Transition, Variants } from 'framer-motion';

/* ========================================
 * 类型定义
 * ======================================== */

/** Cubic Bezier 缓动函数类型 (4个控制点) */
export type CubicBezier = [number, number, number, number];

/* ========================================
 * G3 弹簧物理配置 (Framer Motion)
 * 用于复杂交互动画，如徽章庆祝、拖拽等
 * 参数已调优以与 CSS duration token 对齐
 * ======================================== */

/**
 * 标准 G3 弹簧配置 - 平衡的自然感
 * 阻尼比≈0.81，收敛约 240ms
 * 适用于大多数组件动画
 */
export const g3SpringStandard: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 1,
  restDelta: 0.01,
  restSpeed: 0.01,
};

/**
 * 快速 G3 弹簧配置 - 响应迅速
 * 收敛约 180ms
 * 适用于按钮、小型组件的交互反馈
 */
export const g3SpringSnappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 35,
  mass: 0.8,
  restDelta: 0.01,
  restSpeed: 0.01,
};

/**
 * 柔和 G3 弹簧配置 - 优雅缓慢
 * 收敛约 320ms
 * 适用于模态框、页面过渡等大型组件
 */
export const g3SpringGentle: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
  mass: 1.1,
  restDelta: 0.01,
  restSpeed: 0.01,
};

/**
 * 弹性 G3 弹簧配置 - 带有适度过冲
 * 阻尼比≈0.57，收敛约 400ms
 * 适用于庆祝动画、强调效果
 */
export const g3SpringBouncy: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 18,
  mass: 1,
  restDelta: 0.01,
  restSpeed: 0.01,
};

/* ========================================
 * G3 时长常量 (毫秒)
 * 与 CSS 变量 --g3-duration-* 保持同步
 * ======================================== */

export const G3_DURATION = {
  /** 瞬时反馈：按钮点击、图标切换 */
  instant: 120,
  /** 快速过渡：悬停状态、小组件 */
  fast: 180,
  /** 标准动画：淡入淡出、状态变化 */
  normal: 240,
  /** 强调动画：卡片展开、进度条 */
  slow: 320,
  /** 大型过渡：模态框、页面切换 */
  slower: 480,
} as const;

/* ========================================
 * G3 缓动函数 (Cubic Bezier)
 * 用于需要精确控制的 tween 动画
 * ======================================== */

export const G3_EASING: Record<string, CubicBezier> = {
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
};

/* ========================================
 * Framer Motion Variants 预设
 * 用于声明式动画定义
 * ======================================== */

/**
 * 淡入变体 - 通用组件入场
 */
export const fadeInVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 4,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringStandard,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * 向上滑入变体 - 卡片、列表项
 */
export const slideUpVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 24,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringGentle,
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * 缩放入场变体 - 模态框、弹窗
 */
export const scaleInVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.92,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: g3SpringStandard,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * 模态框背景变体
 */
export const backdropVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: G3_DURATION.normal / 1000,
      ease: G3_EASING.standard,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * 列表项错开入场变体
 * 使用 staggerChildren 控制子元素延迟
 */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: g3SpringStandard,
  },
};

/**
 * 庆祝动画变体 - 徽章、成就
 */
export const celebrationVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.5,
    rotate: -10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: g3SpringBouncy,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: G3_DURATION.normal / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/* ========================================
 * 工具函数
 * ======================================== */

/**
 * 生成错开延迟的 transition 配置
 * @param index 元素索引
 * @param baseDelay 基础延迟（秒）
 * @param stagger 错开间隔（秒）
 */
export function getStaggeredTransition(index: number, baseDelay = 0.1, stagger = 0.05): Transition {
  return {
    ...g3SpringStandard,
    delay: baseDelay + index * stagger,
  };
}

/**
 * 创建自定义弹簧配置
 * @param stiffness 刚度 (100-500)
 * @param damping 阻尼 (10-50)
 * @param mass 质量 (0.5-2)
 */
export function createG3Spring(stiffness: number, damping: number, mass = 1): Transition {
  return {
    type: 'spring',
    stiffness,
    damping,
    mass,
  };
}

/**
 * 创建 tween 动画配置（基于时长和缓动）
 * @param duration 时长（毫秒），默认 240ms
 * @param easing Cubic Bezier 缓动函数
 */
export function createG3Tween(
  duration: number = G3_DURATION.normal,
  easing: CubicBezier = G3_EASING.standard,
): Transition {
  return {
    type: 'tween',
    duration: duration / 1000, // 转换为秒
    ease: easing,
  };
}

/* ========================================
 * 质感增强动画预设
 * 用于骨架屏、微光效果等
 * ======================================== */

/** 骨架屏闪烁动画时长（毫秒） */
export const SHIMMER_DURATION = 1500;

/** 柔和脉冲动画时长（毫秒） */
export const PULSE_SOFT_DURATION = 2000;

/**
 * 骨架屏动画配置（Framer Motion）
 */
export const shimmerVariants: Variants = {
  initial: {
    x: '-100%',
  },
  animate: {
    x: '100%',
    transition: {
      duration: SHIMMER_DURATION / 1000,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

/**
 * 柔和脉冲动画配置
 */
export const pulseSoftVariants: Variants = {
  initial: {
    opacity: 0.6,
  },
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: PULSE_SOFT_DURATION / 1000,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

/* ========================================
 * 补充迁移变体 (从 animation-variants.ts 合并)
 * ======================================== */

/**
 * 勾选图标绘制动画
 * 用于 Checkbox 或操作成功反馈
 */
export const checkmarkVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      duration: G3_DURATION.normal / 1000,
      ease: G3_EASING.standard,
    },
  },
  exit: {
    pathLength: 0,
    opacity: 0,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * Toast 通知入场动画
 * 右侧滑入 + 弹性
 */
export const toastVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 24,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: g3SpringSnappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.exit,
    },
  },
};

/**
 * 错误震动反馈
 */
export const shakeVariants: Variants = {
  idle: { x: 0 },
  error: {
    x: [0, -4, 4, -4, 4, 0],
    transition: {
      duration: 0.4,
      ease: G3_EASING.standard,
    },
  },
};

/**
 * 按钮微交互变体
 * 用于 wrap 按钮内容的 motion.div
 */
export const buttonInteractionVariants: Variants = {
  hover: {
    scale: 1.02,
    transition: {
      duration: G3_DURATION.fast / 1000,
      ease: G3_EASING.standard,
    },
  },
  tap: {
    scale: 0.96,
    transition: {
      duration: G3_DURATION.instant / 1000,
      ease: G3_EASING.standard,
    },
  },
};
