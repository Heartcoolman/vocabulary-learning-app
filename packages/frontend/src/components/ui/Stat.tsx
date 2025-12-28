/**
 * Stat 组件
 *
 * 数据统计展示组件
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Size } from './utils';

/* ========================================
 * Stat 组件
 * ======================================== */
export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** 统计标签/名称 */
  label: ReactNode;
  /** 统计数值 */
  value: ReactNode;
  /** 变化值（正负数） */
  change?: number;
  /** 变化类型 */
  changeType?: 'increase' | 'decrease' | 'neutral';
  /** 变化后缀文字 */
  changeSuffix?: string;
  /** 前置图标 */
  icon?: ReactNode;
  /** 帮助文字 */
  helpText?: ReactNode;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 布局方向 */
  direction?: 'horizontal' | 'vertical';
}

const sizeStyles: Record<
  'sm' | 'md' | 'lg',
  { label: string; value: string; change: string; icon: string }
> = {
  sm: {
    label: 'text-xs',
    value: 'text-xl font-semibold',
    change: 'text-xs',
    icon: 'w-8 h-8',
  },
  md: {
    label: 'text-sm',
    value: 'text-2xl font-bold',
    change: 'text-sm',
    icon: 'w-10 h-10',
  },
  lg: {
    label: 'text-sm',
    value: 'text-4xl font-bold',
    change: 'text-sm',
    icon: 'w-12 h-12',
  },
};

export const Stat = memo(
  forwardRef<HTMLDivElement, StatProps>(
    (
      {
        label,
        value,
        change,
        changeType,
        changeSuffix,
        icon,
        helpText,
        size = 'md',
        direction = 'vertical',
        className,
        ...props
      },
      ref,
    ) => {
      const styles = sizeStyles[size];

      // 自动判断变化类型
      const resolvedChangeType =
        changeType ??
        (change === undefined
          ? undefined
          : change > 0
            ? 'increase'
            : change < 0
              ? 'decrease'
              : 'neutral');

      const changeColorStyles = {
        increase: 'text-green-600 dark:text-green-400',
        decrease: 'text-red-600 dark:text-red-400',
        neutral: 'text-gray-500 dark:text-gray-400',
      };

      const changePrefix = {
        increase: '+',
        decrease: '',
        neutral: '',
      };

      return (
        <div
          ref={ref}
          className={cn(
            'flex',
            direction === 'horizontal' ? 'flex-row items-center gap-4' : 'flex-col gap-1',
            className,
          )}
          {...props}
        >
          {icon && direction === 'horizontal' && (
            <div
              className={cn(
                'flex items-center justify-center rounded-button bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
                styles.icon,
              )}
            >
              {icon}
            </div>
          )}

          <div className="flex flex-col">
            <dt className={cn('text-gray-500 dark:text-slate-400', styles.label)}>{label}</dt>

            <dd className={cn('tracking-tight text-gray-900 dark:text-white', styles.value)}>
              <span className="flex items-baseline gap-2">
                {value}
                {change !== undefined && resolvedChangeType && (
                  <span
                    className={cn(
                      'inline-flex items-center',
                      styles.change,
                      changeColorStyles[resolvedChangeType],
                    )}
                  >
                    {resolvedChangeType === 'increase' && (
                      <svg className="mr-0.5 h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M6 3L10 7H2L6 3Z" />
                      </svg>
                    )}
                    {resolvedChangeType === 'decrease' && (
                      <svg className="mr-0.5 h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M6 9L2 5H10L6 9Z" />
                      </svg>
                    )}
                    {changePrefix[resolvedChangeType]}
                    {Math.abs(change)}
                    {changeSuffix && <span className="ml-0.5">{changeSuffix}</span>}
                  </span>
                )}
              </span>
            </dd>

            {helpText && (
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{helpText}</p>
            )}
          </div>
        </div>
      );
    },
  ),
);

Stat.displayName = 'Stat';

/* ========================================
 * StatCard 组件 - 带卡片样式的统计
 * ======================================== */
export interface StatCardProps extends StatProps {
  /** 是否有边框 */
  bordered?: boolean;
  /** 是否有阴影 */
  shadow?: boolean;
}

export const StatCard = memo(
  forwardRef<HTMLDivElement, StatCardProps>(
    ({ bordered = true, shadow = false, className, ...props }, ref) => {
      return (
        <div
          className={cn(
            'rounded-button bg-white p-4 dark:bg-slate-800',
            bordered && 'border border-gray-200 dark:border-slate-700',
            shadow && 'shadow-soft',
            className,
          )}
        >
          <Stat ref={ref} {...props} />
        </div>
      );
    },
  ),
);

StatCard.displayName = 'StatCard';

/* ========================================
 * StatGroup 组件 - 统计组
 * ======================================== */
export interface StatGroupProps extends HTMLAttributes<HTMLDListElement> {
  /** 列数 */
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  /** 是否有分割线 */
  divider?: boolean;
  /** 间距 */
  spacing?: 'sm' | 'md' | 'lg';
}

const columnStyles: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const spacingStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-4',
  md: 'gap-6',
  lg: 'gap-8',
};

export const StatGroup = memo(
  forwardRef<HTMLDListElement, StatGroupProps>(
    ({ columns = 3, divider = false, spacing = 'md', className, children, ...props }, ref) => {
      return (
        <dl
          ref={ref}
          className={cn(
            'grid',
            columnStyles[columns],
            spacingStyles[spacing],
            divider &&
              '[&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-gray-200 [&>*:not(:last-child)]:pr-6 dark:[&>*:not(:last-child)]:border-slate-700',
            className,
          )}
          {...props}
        >
          {children}
        </dl>
      );
    },
  ),
);

StatGroup.displayName = 'StatGroup';

/* ========================================
 * MiniStat 组件 - 迷你统计
 * ======================================== */
export interface MiniStatProps extends HTMLAttributes<HTMLDivElement> {
  /** 标签 */
  label: ReactNode;
  /** 数值 */
  value: ReactNode;
  /** 变化指示 */
  trend?: 'up' | 'down' | 'neutral';
}

export const MiniStat = memo(
  forwardRef<HTMLDivElement, MiniStatProps>(({ label, value, trend, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex items-center gap-2', className)} {...props}>
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
        {trend && (
          <span
            className={cn(
              'text-xs',
              trend === 'up' && 'text-green-500 dark:text-green-400',
              trend === 'down' && 'text-red-500 dark:text-red-400',
              trend === 'neutral' && 'text-gray-400 dark:text-gray-500',
            )}
          >
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trend === 'neutral' && '→'}
          </span>
        )}
      </div>
    );
  }),
);

MiniStat.displayName = 'MiniStat';
