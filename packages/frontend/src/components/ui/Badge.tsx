/**
 * Badge 组件
 *
 * 徽章标签，用于状态指示和数量展示
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Variant } from './utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 变体 */
  variant?: Variant | 'default';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否圆形（用于数字） */
  rounded?: boolean;
  /** 是否有边框 */
  outlined?: boolean;
  /** 左侧图标 */
  icon?: ReactNode;
  /** 是否有脉冲动画（用于状态指示） */
  pulse?: boolean;
}

const variantStyles: Record<Variant | 'default', { solid: string; outline: string }> = {
  default: {
    solid: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200',
    outline: 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200',
  },
  primary: {
    solid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    outline: 'border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300',
  },
  secondary: {
    solid: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300',
    outline: 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300',
  },
  ghost: {
    solid: 'bg-transparent text-gray-600 dark:text-gray-400',
    outline: 'border-transparent text-gray-600 dark:text-gray-400',
  },
  danger: {
    solid: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    outline: 'border-red-300 dark:border-red-600 text-red-700 dark:text-red-300',
  },
  success: {
    solid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    outline: 'border-green-300 dark:border-green-600 text-green-700 dark:text-green-300',
  },
  warning: {
    solid: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    outline: 'border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300',
  },
  info: {
    solid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    outline: 'border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300',
  },
};

const sizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

const roundedSizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-4 h-4 text-[10px]',
  md: 'w-5 h-5 text-xs',
  lg: 'w-6 h-6 text-sm',
};

export const Badge = memo(
  forwardRef<HTMLSpanElement, BadgeProps>(
    (
      {
        variant = 'default',
        size = 'md',
        rounded = false,
        outlined = false,
        icon,
        pulse = false,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const styles = variantStyles[variant];

      return (
        <span
          ref={ref}
          className={cn(
            'inline-flex items-center justify-center gap-1 font-medium',
            'transition-colors duration-g3-fast',
            // 形状
            rounded ? 'rounded-full' : 'rounded-badge',
            // 边框
            outlined && 'border',
            // 变体
            outlined ? styles.outline : styles.solid,
            // 尺寸
            rounded ? roundedSizeStyles[size] : sizeStyles[size],
            // 脉冲动画
            pulse && 'animate-pulse-soft',
            className,
          )}
          {...props}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </span>
      );
    },
  ),
);

Badge.displayName = 'Badge';

/* ========================================
 * BadgeDot - 状态指示点
 * ======================================== */
export interface BadgeDotProps extends HTMLAttributes<HTMLSpanElement> {
  /** 颜色变体 */
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** 是否有脉冲动画 */
  pulse?: boolean;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
}

const dotColorStyles: Record<'default' | 'success' | 'warning' | 'danger' | 'info', string> = {
  default: 'bg-gray-400 dark:bg-gray-500',
  success: 'bg-green-500 dark:bg-green-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  danger: 'bg-red-500 dark:bg-red-400',
  info: 'bg-blue-500 dark:bg-blue-400',
};

const dotSizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export const BadgeDot = memo(
  forwardRef<HTMLSpanElement, BadgeDotProps>(
    ({ variant = 'default', pulse = false, size = 'md', className, ...props }, ref) => {
      return (
        <span
          ref={ref}
          className={cn(
            'inline-block rounded-full',
            dotColorStyles[variant],
            dotSizeStyles[size],
            pulse && 'animate-pulse-soft',
            className,
          )}
          aria-hidden="true"
          {...props}
        />
      );
    },
  ),
);

BadgeDot.displayName = 'BadgeDot';
