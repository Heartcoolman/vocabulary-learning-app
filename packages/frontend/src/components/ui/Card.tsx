/**
 * Card 组件
 *
 * 基础卡片容器，支持多种变体和交互效果
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type CardVariant = 'elevated' | 'outlined' | 'filled' | 'glass';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 卡片变体 */
  variant?: CardVariant;
  /** 是否可点击（带悬浮效果） */
  clickable?: boolean;
  /** 是否选中状态 */
  selected?: boolean;
  /** 内边距大小 */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, string> = {
  elevated: `
    bg-white border border-gray-100/50
    shadow-soft
  `,
  outlined: `
    bg-white border border-gray-200
  `,
  filled: `
    bg-gray-50 border border-transparent
  `,
  glass: `
    bg-white/80 backdrop-blur-sm
    border border-white/40
    shadow-elevated
  `,
};

const paddingStyles: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(
    (
      {
        variant = 'elevated',
        clickable = false,
        selected = false,
        padding = 'md',
        className,
        children,
        ...props
      },
      ref,
    ) => {
      return (
        <div
          ref={ref}
          className={cn(
            // 基础样式
            'rounded-card',
            'transition-all duration-g3-normal ease-g3',
            // 变体样式
            variantStyles[variant],
            // 内边距
            paddingStyles[padding],
            // 可点击效果
            clickable &&
              'cursor-pointer hover:-translate-y-1 hover:shadow-elevated active:translate-y-0',
            // 选中状态
            selected && 'ring-2 ring-blue-500 ring-offset-2',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Card.displayName = 'Card';

/* ========================================
 * Card 子组件
 * ======================================== */

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 标题 */
  title?: ReactNode;
  /** 副标题 */
  subtitle?: ReactNode;
  /** 右侧操作区 */
  action?: ReactNode;
}

export const CardHeader = memo(
  forwardRef<HTMLDivElement, CardHeaderProps>(
    ({ title, subtitle, action, className, children, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn('flex items-start justify-between gap-4', className)}
          {...props}
        >
          <div className="min-w-0 flex-1">
            {title && <h3 className="truncate text-lg font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            {children}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      );
    },
  ),
);

CardHeader.displayName = 'CardHeader';

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export const CardContent = memo(
  forwardRef<HTMLDivElement, CardContentProps>(({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('', className)} {...props}>
        {children}
      </div>
    );
  }),
);

CardContent.displayName = 'CardContent';

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否显示分割线 */
  divider?: boolean;
}

export const CardFooter = memo(
  forwardRef<HTMLDivElement, CardFooterProps>(
    ({ divider = false, className, children, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center justify-end gap-2',
            divider && 'mt-4 border-t border-gray-100 pt-4',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

CardFooter.displayName = 'CardFooter';
