/**
 * Badge 组件
 *
 * 徽章标签，用于状态指示和数量展示
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Size, Variant } from './utils';

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
    solid: 'bg-gray-100 text-gray-700',
    outline: 'border-gray-300 text-gray-700',
  },
  primary: {
    solid: 'bg-blue-100 text-blue-700',
    outline: 'border-blue-300 text-blue-700',
  },
  secondary: {
    solid: 'bg-gray-100 text-gray-600',
    outline: 'border-gray-300 text-gray-600',
  },
  ghost: {
    solid: 'bg-transparent text-gray-600',
    outline: 'border-transparent text-gray-600',
  },
  danger: {
    solid: 'bg-red-100 text-red-700',
    outline: 'border-red-300 text-red-700',
  },
  success: {
    solid: 'bg-green-100 text-green-700',
    outline: 'border-green-300 text-green-700',
  },
  warning: {
    solid: 'bg-amber-100 text-amber-700',
    outline: 'border-amber-300 text-amber-700',
  },
  info: {
    solid: 'bg-blue-100 text-blue-700',
    outline: 'border-blue-300 text-blue-700',
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
  default: 'bg-gray-400',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
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
