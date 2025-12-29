/**
 * Progress 组件
 *
 * 进度条展示
 */
import React, { forwardRef, memo, HTMLAttributes } from 'react';
import { cn } from './utils';
import { useTheme } from '../../contexts/ThemeContext';
import { IconColor, chartColors } from '../../utils/iconColors';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 进度值 (0-100) */
  value: number;
  /** 最大值 */
  max?: number;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 颜色变体 */
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** 是否显示百分比文本 */
  showLabel?: boolean;
  /** 自定义标签格式化 */
  formatLabel?: (value: number, max: number) => string;
  /** 是否有条纹效果 */
  striped?: boolean;
  /** 是否有动画效果 */
  animated?: boolean;
  /** 是否为不确定状态 */
  indeterminate?: boolean;
}

const sizeStyles = {
  xs: 'h-1',
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

const variantStyles = {
  primary: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-cyan-500',
};

const variantBgStyles = {
  primary: 'bg-blue-100 dark:bg-blue-900/30',
  success: 'bg-green-100 dark:bg-green-900/30',
  warning: 'bg-amber-100 dark:bg-amber-900/30',
  danger: 'bg-red-100 dark:bg-red-900/30',
  info: 'bg-cyan-100 dark:bg-cyan-900/30',
};

export const Progress = memo(
  forwardRef<HTMLDivElement, ProgressProps>(
    (
      {
        value,
        max = 100,
        size = 'md',
        variant = 'primary',
        showLabel = false,
        formatLabel,
        striped = false,
        animated = false,
        indeterminate = false,
        className,
        ...props
      },
      ref,
    ) => {
      const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
      const label = formatLabel ? formatLabel(value, max) : `${Math.round(percentage)}%`;

      return (
        <div ref={ref} className={cn('w-full', className)} {...props}>
          {showLabel && !indeterminate && (
            <div className="mb-1 flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">进度</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
            </div>
          )}

          <div
            className={cn(
              'w-full overflow-hidden rounded-full',
              variantBgStyles[variant],
              sizeStyles[size],
            )}
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={indeterminate ? '加载中' : label}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-g3-slow ease-g3',
                variantStyles[variant],
                // 条纹效果
                striped && 'bg-stripes',
                // 动画效果
                animated && striped && 'animate-stripes',
                // 不确定状态
                indeterminate && 'animate-indeterminate w-1/3',
              )}
              style={indeterminate ? undefined : { width: `${percentage}%` }}
            />
          </div>
        </div>
      );
    },
  ),
);

Progress.displayName = 'Progress';

/* ========================================
 * CircularProgress - 环形进度条
 * ======================================== */
export interface CircularProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 进度值 (0-100) */
  value: number;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 线条粗细 */
  strokeWidth?: number;
  /** 颜色变体 */
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  /** 是否显示百分比文本 */
  showLabel?: boolean;
  /** 是否为不确定状态 */
  indeterminate?: boolean;
}

const circularSizes = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
};

const circularTextSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-xl',
};

const circularColors = {
  primary: IconColor.primary,
  success: IconColor.success,
  warning: IconColor.warning,
  danger: IconColor.danger,
};

export const CircularProgress = memo(
  forwardRef<HTMLDivElement, CircularProgressProps>(
    (
      {
        value,
        size = 'md',
        strokeWidth = 4,
        variant = 'primary',
        showLabel = true,
        indeterminate = false,
        className,
        ...props
      },
      ref,
    ) => {
      const { theme } = useTheme();
      const isDark = theme === 'dark';
      const ringBgColor = isDark ? chartColors.gridDark : chartColors.grid;

      const dimension = circularSizes[size];
      const radius = (dimension - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      const percentage = Math.min(Math.max(value, 0), 100);
      const offset = circumference - (percentage / 100) * circumference;

      return (
        <div
          ref={ref}
          className={cn('relative inline-flex items-center justify-center', className)}
          style={{ width: dimension, height: dimension }}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={100}
          {...props}
        >
          <svg width={dimension} height={dimension} className={cn(indeterminate && 'animate-spin')}>
            {/* 背景圆环 */}
            <circle
              cx={dimension / 2}
              cy={dimension / 2}
              r={radius}
              fill="none"
              stroke={ringBgColor}
              strokeWidth={strokeWidth}
            />
            {/* 进度圆环 */}
            <circle
              cx={dimension / 2}
              cy={dimension / 2}
              r={radius}
              fill="none"
              stroke={circularColors[variant]}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={indeterminate ? circumference * 0.75 : offset}
              className="transition-all duration-g3-slow ease-g3"
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          </svg>

          {showLabel && !indeterminate && (
            <span
              className={cn(
                'absolute font-semibold text-gray-900 dark:text-white',
                circularTextSizes[size],
              )}
            >
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      );
    },
  ),
);

CircularProgress.displayName = 'CircularProgress';
