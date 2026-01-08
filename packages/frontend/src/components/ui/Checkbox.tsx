/**
 * Checkbox 组件
 *
 * 复选框
 */
import React, { forwardRef, memo, InputHTMLAttributes, useState, ReactNode } from 'react';
import { Check, Minus } from '../Icon';
import { cn, generateId } from './utils';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type'
> {
  /** 是否选中（受控） */
  checked?: boolean;
  /** 默认选中状态（非受控） */
  defaultChecked?: boolean;
  /** 选中变化回调 */
  onCheckedChange?: (checked: boolean) => void;
  /** 不确定状态（用于全选） */
  indeterminate?: boolean;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 标签文本 */
  label?: ReactNode;
  /** 描述文本 */
  description?: string;
  /** 是否有错误 */
  error?: boolean;
}

const sizeStyles = {
  xs: {
    box: 'w-3.5 h-3.5',
    icon: 8,
    text: 'text-xs',
  },
  sm: {
    box: 'w-4 h-4',
    icon: 10,
    text: 'text-sm',
  },
  md: {
    box: 'w-5 h-5',
    icon: 12,
    text: 'text-sm',
  },
  lg: {
    box: 'w-6 h-6',
    icon: 14,
    text: 'text-base',
  },
  xl: {
    box: 'w-7 h-7',
    icon: 16,
    text: 'text-lg',
  },
};

export const Checkbox = memo(
  forwardRef<HTMLInputElement, CheckboxProps>(
    (
      {
        checked: controlledChecked,
        defaultChecked = false,
        onCheckedChange,
        indeterminate = false,
        size = 'md',
        label,
        description,
        error = false,
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
      const [inputId] = useState(() => providedId || generateId('checkbox'));
      const descriptionId = description ? `${inputId}-description` : undefined;

      const { box, icon: iconSize, text: textSize } = sizeStyles[size];

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newChecked = e.target.checked;
        if (controlledChecked === undefined) {
          setInternalChecked(newChecked);
        }
        onCheckedChange?.(newChecked);
        onChange?.(e);
      };

      const showCheck = isChecked && !indeterminate;
      const showIndeterminate = indeterminate;

      return (
        <div className={cn('flex items-start gap-2', className)}>
          <span
            className={cn(
              'relative inline-flex flex-shrink-0 items-center justify-center',
              'rounded border-2',
              'transition-all duration-g3-fast ease-g3',
              box,
              // 状态样式
              isChecked || indeterminate
                ? 'border-blue-500 bg-blue-500'
                : error
                  ? 'border-red-300 bg-white dark:bg-slate-800'
                  : 'border-gray-300 bg-white hover:border-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500',
              // 禁用样式
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              ref={ref}
              type="checkbox"
              id={inputId}
              checked={isChecked}
              disabled={disabled}
              onChange={handleChange}
              aria-describedby={descriptionId}
              aria-invalid={error}
              className={cn(
                'absolute inset-0 cursor-pointer opacity-0',
                disabled && 'cursor-not-allowed',
              )}
              {...props}
            />
            {showCheck && (
              <Check size={iconSize} weight="bold" className="text-white" aria-hidden="true" />
            )}
            {showIndeterminate && (
              <Minus size={iconSize} weight="bold" className="text-white" aria-hidden="true" />
            )}
          </span>

          {(label || description) && (
            <div className="min-w-0 flex-1">
              {label && (
                <label
                  htmlFor={inputId}
                  className={cn(
                    'cursor-pointer font-medium text-gray-900 dark:text-white',
                    textSize,
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {label}
                </label>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className={cn(
                    'mt-0.5 text-gray-500 dark:text-gray-400',
                    size === 'lg' ? 'text-sm' : 'text-xs',
                  )}
                >
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

Checkbox.displayName = 'Checkbox';

/* ========================================
 * CheckboxGroup 组件
 * ======================================== */
export interface CheckboxGroupProps {
  /** 选中的值数组 */
  value?: string[];
  /** 默认选中的值（非受控） */
  defaultValue?: string[];
  /** 值变化回调 */
  onChange?: (values: string[]) => void;
  /** 子元素 */
  children: ReactNode;
  /** 方向 */
  orientation?: 'horizontal' | 'vertical';
  /** 标签 */
  label?: string;
  /** 是否禁用整组 */
  disabled?: boolean;
  /** 额外的 className */
  className?: string;
}

export const CheckboxGroup = memo(
  forwardRef<HTMLDivElement, CheckboxGroupProps>(
    (
      {
        value: controlledValue,
        defaultValue = [],
        onChange,
        children,
        orientation = 'vertical',
        label,
        disabled = false,
        className,
      },
      ref,
    ) => {
      const [internalValue, setInternalValue] = useState<string[]>(defaultValue);
      const currentValue = controlledValue !== undefined ? controlledValue : internalValue;

      const handleChange = (itemValue: string, checked: boolean) => {
        const newValue = checked
          ? [...currentValue, itemValue]
          : currentValue.filter((v) => v !== itemValue);

        if (controlledValue === undefined) {
          setInternalValue(newValue);
        }
        onChange?.(newValue);
      };

      return (
        <div ref={ref} role="group" aria-label={label} className={className}>
          {label && (
            <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              {label}
            </span>
          )}
          <div
            className={cn(
              'flex gap-3',
              orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
            )}
          >
            {React.Children.map(children, (child) => {
              if (!React.isValidElement(child)) return child;

              const itemValue = child.props.value as string;
              return React.cloneElement(child as React.ReactElement<CheckboxProps>, {
                checked: currentValue.includes(itemValue),
                onCheckedChange: (checked: boolean) => handleChange(itemValue, checked),
                disabled: disabled || child.props.disabled,
              });
            })}
          </div>
        </div>
      );
    },
  ),
);

CheckboxGroup.displayName = 'CheckboxGroup';
