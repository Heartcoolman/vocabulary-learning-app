/**
 * Input 组件
 *
 * 支持多种类型：text, password, search, email, number
 * 支持前后缀图标/内容
 * 支持错误状态和帮助文本
 */
import React, { forwardRef, memo, InputHTMLAttributes, ReactNode, useState } from 'react';
import { Eye, MagnifyingGlass } from '../Icon';
import { cn, Size, generateId } from './utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** 输入框类型 */
  type?: 'text' | 'password' | 'search' | 'email' | 'number' | 'tel' | 'url';
  /** 输入框尺寸 */
  size?: Size;
  /** 前缀图标或内容 */
  prefix?: ReactNode;
  /** 后缀图标或内容 */
  suffix?: ReactNode;
  /** 是否有错误 */
  error?: boolean;
  /** 错误消息 */
  errorMessage?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 标签文本 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否全宽 */
  fullWidth?: boolean;
}

const sizeStyles: Record<Size, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
  xl: 'px-4 py-3 text-lg',
};

const iconContainerSizeStyles: Record<Size, string> = {
  xs: 'px-1.5',
  sm: 'px-2',
  md: 'px-2.5',
  lg: 'px-3',
  xl: 'px-3.5',
};

export const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(
    (
      {
        type = 'text',
        size = 'md',
        prefix,
        suffix,
        error = false,
        errorMessage,
        helperText,
        label,
        required = false,
        fullWidth = false,
        disabled,
        className,
        id: providedId,
        ...props
      },
      ref,
    ) => {
      const [showPassword, setShowPassword] = useState(false);
      const [inputId] = useState(() => providedId || generateId('input'));
      const errorId = `${inputId}-error`;
      const helperId = `${inputId}-helper`;

      const isPassword = type === 'password';
      const isSearch = type === 'search';
      const inputType = isPassword && showPassword ? 'text' : type;

      // 搜索类型自动添加放大镜图标
      const actualPrefix = isSearch && !prefix ? <MagnifyingGlass size={16} /> : prefix;
      // 密码类型自动添加切换按钮
      const actualSuffix =
        isPassword && !suffix ? (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            tabIndex={-1}
          >
            <Eye size={16} weight={showPassword ? 'fill' : 'regular'} />
          </button>
        ) : (
          suffix
        );

      return (
        <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
          {label && (
            <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
              {label}
              {required && <span className="ml-1 text-red-500">*</span>}
            </label>
          )}

          <div
            className={cn(
              'relative flex items-center',
              'rounded-input border bg-white',
              'transition-all duration-g3-fast ease-g3',
              // 边框颜色
              error
                ? 'border-red-300 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100'
                : 'border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 hover:border-gray-300',
              // 禁用状态
              disabled && 'cursor-not-allowed bg-gray-50 opacity-60',
              fullWidth && 'w-full',
            )}
          >
            {actualPrefix && (
              <span
                className={cn('flex items-center text-gray-400', iconContainerSizeStyles[size])}
              >
                {actualPrefix}
              </span>
            )}

            <input
              ref={ref}
              id={inputId}
              type={inputType}
              disabled={disabled}
              aria-invalid={error}
              aria-describedby={
                [error && errorMessage ? errorId : null, helperText ? helperId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              required={required}
              className={cn(
                'flex-1 bg-transparent outline-none',
                'placeholder:text-gray-400',
                'disabled:cursor-not-allowed',
                sizeStyles[size],
                actualPrefix ? 'pl-0' : undefined,
                actualSuffix ? 'pr-0' : undefined,
                className,
              )}
              {...props}
            />

            {actualSuffix && (
              <span
                className={cn('flex items-center text-gray-400', iconContainerSizeStyles[size])}
              >
                {actualSuffix}
              </span>
            )}
          </div>

          {error && errorMessage && (
            <p id={errorId} className="text-xs text-red-500" role="alert">
              {errorMessage}
            </p>
          )}

          {helperText && !error && (
            <p id={helperId} className="text-xs text-gray-500">
              {helperText}
            </p>
          )}
        </div>
      );
    },
  ),
);

Input.displayName = 'Input';
