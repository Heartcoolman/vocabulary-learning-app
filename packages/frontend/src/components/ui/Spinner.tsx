/**
 * Spinner 组件
 *
 * 加载指示器
 */
import React, { forwardRef, memo, HTMLAttributes } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { cn, Size } from './utils';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** 尺寸 */
  size?: Size;
  /** 颜色 */
  color?: 'primary' | 'secondary' | 'white' | 'current';
  /** 加载文本 */
  label?: string;
  /** 是否显示文本 */
  showLabel?: boolean;
}

const sizeStyles: Record<Size, { icon: number; text: string }> = {
  xs: { icon: 14, text: 'text-xs' },
  sm: { icon: 18, text: 'text-sm' },
  md: { icon: 24, text: 'text-sm' },
  lg: { icon: 32, text: 'text-base' },
  xl: { icon: 40, text: 'text-lg' },
};

const colorStyles: Record<string, string> = {
  primary: 'text-blue-500',
  secondary: 'text-gray-500 dark:text-gray-400',
  white: 'text-white',
  current: 'text-current',
};

export const Spinner = memo(
  forwardRef<HTMLDivElement, SpinnerProps>(
    (
      {
        size = 'md',
        color = 'primary',
        label = '加载中...',
        showLabel = false,
        className,
        ...props
      },
      ref,
    ) => {
      const { icon: iconSize, text: textSize } = sizeStyles[size];

      return (
        <div
          ref={ref}
          role="status"
          aria-label={label}
          className={cn('inline-flex items-center gap-2', colorStyles[color], className)}
          {...props}
        >
          <CircleNotch size={iconSize} weight="bold" className="animate-spin" aria-hidden="true" />
          {showLabel && <span className={textSize}>{label}</span>}
          <span className="sr-only">{label}</span>
        </div>
      );
    },
  ),
);

Spinner.displayName = 'Spinner';

/* ========================================
 * 全屏加载组件
 * ======================================== */
export interface FullPageSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** 加载文本 */
  label?: string;
  /** 是否显示文本 */
  showLabel?: boolean;
  /** 是否显示背景遮罩 */
  overlay?: boolean;
}

export const FullPageSpinner = memo(
  forwardRef<HTMLDivElement, FullPageSpinnerProps>(
    ({ label = '加载中...', showLabel = true, overlay = true, className, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(
            'fixed inset-0 z-50',
            'flex flex-col items-center justify-center gap-3',
            overlay && 'bg-white/80 backdrop-blur-sm dark:bg-slate-900/80',
            className,
          )}
          {...props}
        >
          <Spinner size="lg" />
          {showLabel && <p className="font-medium text-gray-600 dark:text-gray-300">{label}</p>}
        </div>
      );
    },
  ),
);

FullPageSpinner.displayName = 'FullPageSpinner';

/* ========================================
 * 内联加载组件
 * ======================================== */
export interface InlineSpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** 尺寸 */
  size?: 'sm' | 'md';
}

export const InlineSpinner = memo(
  forwardRef<HTMLSpanElement, InlineSpinnerProps>(({ size = 'sm', className, ...props }, ref) => {
    const iconSize = size === 'sm' ? 12 : 14;

    return (
      <span
        ref={ref}
        role="status"
        aria-label="加载中"
        className={cn('inline-flex items-center', className)}
        {...props}
      >
        <CircleNotch
          size={iconSize}
          weight="bold"
          className="animate-spin text-current"
          aria-hidden="true"
        />
        <span className="sr-only">加载中</span>
      </span>
    );
  }),
);

InlineSpinner.displayName = 'InlineSpinner';
