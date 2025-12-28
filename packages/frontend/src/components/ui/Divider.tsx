/**
 * Divider 组件
 *
 * 分隔线，用于分隔内容区域
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Direction } from './utils';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  /** 方向 */
  orientation?: Direction;
  /** 变体 */
  variant?: 'solid' | 'dashed' | 'dotted';
  /** 颜色 */
  color?: 'default' | 'light' | 'dark';
  /** 间距大小 */
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 子内容（文字分隔线） */
  children?: ReactNode;
  /** 文字位置 */
  labelPosition?: 'left' | 'center' | 'right';
}

const variantStyles: Record<string, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
};

const colorStyles: Record<string, string> = {
  default: 'border-gray-200 dark:border-slate-700',
  light: 'border-gray-100 dark:border-slate-800',
  dark: 'border-gray-300 dark:border-slate-600',
};

const spacingStyles: Record<string, { horizontal: string; vertical: string }> = {
  none: { horizontal: 'my-0', vertical: 'mx-0' },
  xs: { horizontal: 'my-1', vertical: 'mx-1' },
  sm: { horizontal: 'my-2', vertical: 'mx-2' },
  md: { horizontal: 'my-4', vertical: 'mx-4' },
  lg: { horizontal: 'my-6', vertical: 'mx-6' },
  xl: { horizontal: 'my-8', vertical: 'mx-8' },
};

const labelPositionStyles: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

export const Divider = memo(
  forwardRef<HTMLDivElement, DividerProps>(
    (
      {
        orientation = 'horizontal',
        variant = 'solid',
        color = 'default',
        spacing = 'md',
        children,
        labelPosition = 'center',
        className,
        ...props
      },
      ref,
    ) => {
      const isHorizontal = orientation === 'horizontal';
      const spacingClass = isHorizontal
        ? spacingStyles[spacing].horizontal
        : spacingStyles[spacing].vertical;

      // 无子内容时的简单分隔线
      if (!children) {
        return (
          <div
            ref={ref}
            role="separator"
            aria-orientation={orientation}
            className={cn(
              isHorizontal ? 'w-full border-t' : 'h-full self-stretch border-l',
              variantStyles[variant],
              colorStyles[color],
              spacingClass,
              className,
            )}
            {...props}
          />
        );
      }

      // 带文字的分隔线
      if (isHorizontal) {
        return (
          <div
            ref={ref}
            role="separator"
            aria-orientation={orientation}
            className={cn(
              'flex w-full items-center',
              spacingClass,
              labelPositionStyles[labelPosition],
              className,
            )}
            {...props}
          >
            {labelPosition !== 'left' && (
              <div
                className={cn(
                  'flex-1 border-t',
                  variantStyles[variant],
                  colorStyles[color],
                  labelPosition === 'center' ? 'mr-3' : '',
                )}
              />
            )}
            <span className="flex-shrink-0 px-2 text-sm text-gray-500 dark:text-gray-400">
              {children}
            </span>
            {labelPosition !== 'right' && (
              <div
                className={cn(
                  'flex-1 border-t',
                  variantStyles[variant],
                  colorStyles[color],
                  labelPosition === 'center' ? 'ml-3' : '',
                )}
              />
            )}
          </div>
        );
      }

      // 垂直带文字的分隔线
      return (
        <div
          ref={ref}
          role="separator"
          aria-orientation={orientation}
          className={cn('flex h-full flex-col items-center', spacingClass, className)}
          {...props}
        >
          <div className={cn('flex-1 border-l', variantStyles[variant], colorStyles[color])} />
          <span className="writing-mode-vertical flex-shrink-0 py-2 text-sm text-gray-500 dark:text-gray-400">
            {children}
          </span>
          <div className={cn('flex-1 border-l', variantStyles[variant], colorStyles[color])} />
        </div>
      );
    },
  ),
);

Divider.displayName = 'Divider';
