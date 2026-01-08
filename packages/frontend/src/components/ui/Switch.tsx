/**
 * Switch 组件
 *
 * 开关切换
 */
import React, { forwardRef, memo, InputHTMLAttributes, useState } from 'react';
import { cn, generateId } from './utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** 是否选中（受控） */
  checked?: boolean;
  /** 默认选中状态（非受控） */
  defaultChecked?: boolean;
  /** 选中变化回调 */
  onCheckedChange?: (checked: boolean) => void;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 标签文本 */
  label?: string;
  /** 标签位置 */
  labelPlacement?: 'left' | 'right';
  /** 描述文本 */
  description?: string;
}

const sizeStyles = {
  sm: {
    track: 'w-8 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-4',
    thumbOffset: 'translate-x-0.5',
  },
  md: {
    track: 'w-11 h-6',
    thumb: 'w-5 h-5',
    translate: 'translate-x-5',
    thumbOffset: 'translate-x-0.5',
  },
  lg: {
    track: 'w-14 h-7',
    thumb: 'w-6 h-6',
    translate: 'translate-x-7',
    thumbOffset: 'translate-x-0.5',
  },
};

export const Switch = memo(
  forwardRef<HTMLInputElement, SwitchProps>(
    (
      {
        checked: controlledChecked,
        defaultChecked = false,
        onCheckedChange,
        size = 'md',
        label,
        labelPlacement = 'right',
        description,
        disabled = false,
        className,
        id: providedId,
        onChange,
        ...props
      },
      ref,
    ) => {
      const [internalChecked, setInternalChecked] = useState(defaultChecked);
      const isChecked = controlledChecked !== undefined ? controlledChecked : internalChecked;
      const [inputId] = useState(() => providedId || generateId('switch'));
      const descriptionId = description ? `${inputId}-description` : undefined;

      const { track, thumb, translate, thumbOffset } = sizeStyles[size];

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newChecked = e.target.checked;
        if (controlledChecked === undefined) {
          setInternalChecked(newChecked);
        }
        onCheckedChange?.(newChecked);
        onChange?.(e);
      };

      const handleClick = () => {
        if (disabled) return;
        const newChecked = !isChecked;
        if (controlledChecked === undefined) {
          setInternalChecked(newChecked);
        }
        onCheckedChange?.(newChecked);
      };

      const switchElement = (
        <span
          onClick={handleClick}
          className={cn(
            'relative inline-flex flex-shrink-0 cursor-pointer',
            'rounded-full p-0.5',
            'transition-colors duration-g3-fast ease-g3',
            'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
            isChecked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-slate-600',
            disabled && 'cursor-not-allowed opacity-50',
            track,
          )}
        >
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            id={inputId}
            checked={isChecked}
            disabled={disabled}
            onChange={handleChange}
            aria-checked={isChecked}
            aria-describedby={descriptionId}
            className="sr-only"
            {...props}
          />
          <span
            className={cn(
              'pointer-events-none inline-block rounded-full bg-white shadow-soft',
              'transform transition-transform duration-g3-fast ease-g3',
              thumb,
              isChecked ? translate : thumbOffset,
            )}
            aria-hidden="true"
          />
        </span>
      );

      if (!label && !description) {
        return switchElement;
      }

      return (
        <div className={cn('flex items-start gap-3', className)}>
          {labelPlacement === 'left' && label && (
            <div className="flex-1">
              <label
                htmlFor={inputId}
                className={cn(
                  'text-sm font-medium text-gray-900 dark:text-white',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {label}
              </label>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
          )}

          {switchElement}

          {labelPlacement === 'right' && label && (
            <div className="flex-1">
              <label
                htmlFor={inputId}
                className={cn(
                  'text-sm font-medium text-gray-900 dark:text-white',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {label}
              </label>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
      );
    },
  ),
);

Switch.displayName = 'Switch';
