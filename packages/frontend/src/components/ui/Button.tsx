/**
 * Button 组件
 *
 * 支持多种变体：primary, secondary, ghost, danger
 * 支持多种尺寸：xs, sm, md, lg, xl
 * 支持加载状态和禁用状态
 */
import React, { forwardRef, memo, ButtonHTMLAttributes, ReactNode } from 'react';
import { CircleNotch } from '../Icon';
import { cn, Size } from './utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮变体 */
  variant?: ButtonVariant;
  /** 按钮尺寸 */
  size?: Size;
  /** 加载状态 */
  loading?: boolean;
  /** 左侧图标 */
  leftIcon?: ReactNode;
  /** 右侧图标 */
  rightIcon?: ReactNode;
  /** 是否全宽 */
  fullWidth?: boolean;
  /** 是否只显示图标（圆形按钮） */
  iconOnly?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-br from-blue-500 to-blue-600 text-white
    hover:from-blue-600 hover:to-blue-700
    focus-visible:ring-blue-500
    shadow-button-rest hover:shadow-button-hover active:shadow-button-active
  `,
  secondary: `
    bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200
    hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300 dark:hover:border-slate-500
    focus-visible:ring-gray-400
    shadow-soft hover:shadow-elevated
  `,
  outline: `
    bg-transparent border-2 border-blue-500 text-blue-600 dark:text-blue-400
    hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-600 hover:text-blue-700 dark:hover:text-blue-300
    focus-visible:ring-blue-500
  `,
  ghost: `
    bg-transparent text-gray-600 dark:text-gray-300
    hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white
    focus-visible:ring-gray-400
  `,
  danger: `
    bg-gradient-to-br from-red-500 to-red-600 text-white
    hover:from-red-600 hover:to-red-700
    focus-visible:ring-red-500
    shadow-button-rest hover:shadow-button-hover
  `,
  success: `
    bg-gradient-to-br from-green-500 to-green-600 text-white
    hover:from-green-600 hover:to-green-700
    focus-visible:ring-green-500
    shadow-button-rest hover:shadow-button-hover
  `,
  warning: `
    bg-gradient-to-br from-amber-500 to-amber-600 text-white
    hover:from-amber-600 hover:to-amber-700
    focus-visible:ring-amber-500
    shadow-button-rest hover:shadow-button-hover
  `,
};

const sizeStyles: Record<Size, string> = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
  xl: 'px-6 py-3 text-lg gap-2.5',
};

const iconOnlySizeStyles: Record<Size, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-14 h-14',
};

const iconSizeMap: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
};

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(
    (
      {
        variant = 'primary',
        size = 'md',
        loading = false,
        leftIcon,
        rightIcon,
        fullWidth = false,
        iconOnly = false,
        disabled,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const isDisabled = disabled || loading;
      const iconSize = iconSizeMap[size];

      return (
        <button
          ref={ref}
          disabled={isDisabled}
          className={cn(
            // 基础样式
            'inline-flex items-center justify-center font-medium',
            'rounded-button',
            'transition-all duration-g3-fast ease-g3',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            'active:scale-[0.98]',
            // 禁用状态
            isDisabled && 'cursor-not-allowed opacity-50',
            // 变体样式
            variantStyles[variant],
            // 尺寸样式
            iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size],
            // 全宽
            fullWidth && 'w-full',
            className,
          )}
          {...props}
        >
          {loading ? (
            <CircleNotch size={iconSize} className="animate-spin" weight="bold" />
          ) : (
            leftIcon
          )}
          {!iconOnly && children}
          {!loading && rightIcon}
        </button>
      );
    },
  ),
);

Button.displayName = 'Button';
