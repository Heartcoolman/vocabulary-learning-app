/**
 * Textarea 组件
 *
 * 多行文本输入框
 * 支持自动调整高度、字数统计、错误状态等
 */
import React, {
  forwardRef,
  memo,
  TextareaHTMLAttributes,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { cn, generateId, Size } from './utils';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** 尺寸 */
  size?: Size;
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
  /** 是否自动调整高度 */
  autoResize?: boolean;
  /** 最小行数（autoResize 时生效） */
  minRows?: number;
  /** 最大行数（autoResize 时生效） */
  maxRows?: number;
  /** 是否显示字数统计 */
  showCount?: boolean;
  /** 最大字数限制 */
  maxLength?: number;
  /** resize 方向 */
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

const sizeStyles: Record<Size, { padding: string; fontSize: string; lineHeight: string }> = {
  xs: { padding: 'px-2 py-1', fontSize: 'text-xs', lineHeight: 'leading-4' },
  sm: { padding: 'px-2.5 py-1.5', fontSize: 'text-sm', lineHeight: 'leading-5' },
  md: { padding: 'px-3 py-2', fontSize: 'text-sm', lineHeight: 'leading-5' },
  lg: { padding: 'px-4 py-2.5', fontSize: 'text-base', lineHeight: 'leading-6' },
  xl: { padding: 'px-4 py-3', fontSize: 'text-lg', lineHeight: 'leading-7' },
};

const resizeStyles: Record<string, string> = {
  none: 'resize-none',
  vertical: 'resize-y',
  horizontal: 'resize-x',
  both: 'resize',
};

export const Textarea = memo(
  forwardRef<HTMLTextAreaElement, TextareaProps>(
    (
      {
        size = 'md',
        error = false,
        errorMessage,
        helperText,
        label,
        required = false,
        fullWidth = false,
        autoResize = false,
        minRows = 3,
        maxRows = 10,
        showCount = false,
        maxLength,
        resize = 'vertical',
        disabled,
        className,
        id: providedId,
        value,
        defaultValue,
        onChange,
        ...props
      },
      ref,
    ) => {
      const [inputId] = useState(() => providedId || generateId('textarea'));
      const [internalValue, setInternalValue] = useState<string>((defaultValue as string) || '');
      const textareaRef = useRef<HTMLTextAreaElement | null>(null);
      const errorId = `${inputId}-error`;
      const helperId = `${inputId}-helper`;
      const countId = `${inputId}-count`;

      // 处理受控/非受控
      const currentValue = value !== undefined ? String(value) : internalValue;
      const charCount = currentValue.length;

      const { padding, fontSize, lineHeight } = sizeStyles[size];

      // 合并 ref
      const setRefs = useCallback(
        (node: HTMLTextAreaElement | null) => {
          textareaRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        },
        [ref],
      );

      // 自动调整高度
      const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea || !autoResize) return;

        // 重置高度以获取正确的 scrollHeight
        textarea.style.height = 'auto';

        // 计算行高
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeightValue = parseFloat(computedStyle.lineHeight);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const borderTop = parseFloat(computedStyle.borderTopWidth);
        const borderBottom = parseFloat(computedStyle.borderBottomWidth);

        const minHeight =
          lineHeightValue * minRows + paddingTop + paddingBottom + borderTop + borderBottom;
        const maxHeight =
          lineHeightValue * maxRows + paddingTop + paddingBottom + borderTop + borderBottom;

        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

        textarea.style.height = `${newHeight}px`;
      }, [autoResize, minRows, maxRows]);

      // 初始调整高度
      useEffect(() => {
        adjustHeight();
      }, [adjustHeight, currentValue]);

      // 处理变化
      const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;

        // 如果设置了 maxLength，在这里限制
        if (maxLength && newValue.length > maxLength) {
          return;
        }

        if (value === undefined) {
          setInternalValue(newValue);
        }
        onChange?.(e);
        adjustHeight();
      };

      // 构建 aria-describedby
      const describedBy =
        [
          error && errorMessage ? errorId : null,
          helperText && !error ? helperId : null,
          showCount ? countId : null,
        ]
          .filter(Boolean)
          .join(' ') || undefined;

      return (
        <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
          {label && (
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              {label}
              {required && <span className="ml-1 text-red-500">*</span>}
            </label>
          )}

          <div className="relative">
            <textarea
              ref={setRefs}
              id={inputId}
              value={currentValue}
              disabled={disabled}
              onChange={handleChange}
              aria-invalid={error}
              aria-describedby={describedBy}
              required={required}
              maxLength={maxLength}
              rows={autoResize ? undefined : minRows}
              className={cn(
                'w-full rounded-input border bg-white dark:bg-slate-800 dark:text-white',
                'transition-all duration-g3-fast ease-g3',
                'placeholder:text-gray-400 dark:placeholder:text-slate-500',
                'focus:outline-none',
                // 边框颜色
                error
                  ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-red-500/50 dark:focus:ring-red-900/30'
                  : 'border-gray-200 hover:border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:hover:border-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/30',
                // 禁用状态
                disabled && 'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-slate-700',
                // 尺寸
                padding,
                fontSize,
                lineHeight,
                // resize 方向
                autoResize ? 'resize-none overflow-hidden' : resizeStyles[resize],
                className,
              )}
              {...props}
            />
          </div>

          {/* 底部信息栏 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              {error && errorMessage && (
                <p id={errorId} className="text-xs text-red-500" role="alert">
                  {errorMessage}
                </p>
              )}

              {helperText && !error && (
                <p id={helperId} className="text-xs text-gray-500 dark:text-slate-400">
                  {helperText}
                </p>
              )}
            </div>

            {showCount && (
              <p
                id={countId}
                className={cn(
                  'flex-shrink-0 text-xs text-gray-400 dark:text-slate-500',
                  !!maxLength && charCount >= maxLength && 'text-red-500',
                )}
              >
                {charCount}
                {maxLength && ` / ${maxLength}`}
              </p>
            )}
          </div>
        </div>
      );
    },
  ),
);

Textarea.displayName = 'Textarea';
