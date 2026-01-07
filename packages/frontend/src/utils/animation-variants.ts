import { Variants } from 'framer-motion';

// 基础过渡配置
export const transitions = {
  spring: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },
  springBouncy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 20,
  },
  easeOut: {
    type: 'tween' as const,
    ease: 'easeOut' as const,
    duration: 0.2,
  },
  easeInOut: {
    type: 'tween' as const,
    ease: 'easeInOut' as const,
    duration: 0.3,
  },
};

// 基础淡入淡出
export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.easeOut,
  },
  exit: {
    opacity: 0,
    transition: transitions.easeOut,
  },
};

// 向上滑动淡入
export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.easeOut,
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: transitions.easeOut,
  },
};

// 缩放淡入（用于 Modal 等）
export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// 勾选图标绘制动画
export const checkmarkVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    pathLength: 0,
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// Toast 列表动画
export const toastVariants: Variants = {
  hidden: { opacity: 0, x: 50, scale: 0.9 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.15 },
  },
};

// 输入框错误震动
export const shakeVariants: Variants = {
  idle: { x: 0 },
  error: {
    x: [0, -5, 5, -5, 5, 0],
    transition: { duration: 0.4 },
  },
};

// 容器子元素交错动画
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

// 按钮微交互
export const buttonInteractionVariants: Variants = {
  hover: { scale: 1.02, transition: { duration: 0.1 } },
  tap: { scale: 0.98, transition: { duration: 0.05 } },
};
