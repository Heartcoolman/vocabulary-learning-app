/**
 * Radio 组件
 *
 * 单选框
 */
import React, {
  forwardRef,
  memo,
  InputHTMLAttributes,
  useState,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import { cn, generateId } from './utils';

/* ========================================
 * Radio Context
 * ======================================== */
interface RadioGroupContextValue {
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  size: 'sm' | 'md' | 'lg';
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroupContext() {
  return useContext(RadioGroupContext);
}

/* ========================================
 * Radio 组件
 * ======================================== */
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** 单选框的值 */
  value: string;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 标签文本 */
  label?: ReactNode;
  /** 描述文本 */
  description?: string;
}

const sizeStyles = {
  sm: {
    outer: 'w-4 h-4',
    inner: 'w-2 h-2',
    text: 'text-sm',
  },
  md: {
    outer: 'w-5 h-5',
    inner: 'w-2.5 h-2.5',
    text: 'text-sm',
  },
  lg: {
    outer: 'w-6 h-6',
    inner: 'w-3 h-3',
    text: 'text-base',
  },
};

export const Radio = memo(
  forwardRef<HTMLInputElement, RadioProps>(
    (
      {
        value,
        size: sizeProp,
        label,
        description,
        disabled: disabledProp,
        className,
        id: providedId,
        name: nameProp,
        checked: checkedProp,
        onChange: onChangeProp,
        ...props
      },
      ref,
    ) => {
      const group = useRadioGroupContext();
      const [inputId] = useState(() => providedId || generateId('radio'));
      const descriptionId = description ? `${inputId}-description` : undefined;

      const name = group?.name || nameProp;
      const size = sizeProp || group?.size || 'md';
      const disabled = disabledProp || group?.disabled || false;
      const checked = group ? group.value === value : checkedProp;

      const { outer, inner, text: textSize } = sizeStyles[size];

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (group) {
          group.onChange(value);
        }
        onChangeProp?.(e);
      };

      return (
        <div className={cn('flex items-start gap-2', className)}>
          <span
            className={cn(
              'relative inline-flex flex-shrink-0 items-center justify-center',
              'rounded-full border-2',
              'transition-all duration-g3-fast ease-g3',
              outer,
              // 状态样式
              checked ? 'border-blue-500' : 'border-gray-300 hover:border-gray-400',
              // 禁用样式
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              ref={ref}
              type="radio"
              id={inputId}
              name={name}
              value={value}
              checked={checked}
              disabled={disabled}
              onChange={handleChange}
              aria-describedby={descriptionId}
              className={cn(
                'absolute inset-0 cursor-pointer opacity-0',
                disabled && 'cursor-not-allowed',
              )}
              {...props}
            />
            {/* 内部圆点 */}
            <span
              className={cn(
                'rounded-full bg-blue-500',
                'transition-transform duration-g3-fast ease-g3',
                inner,
                checked ? 'scale-100' : 'scale-0',
              )}
              aria-hidden="true"
            />
          </span>

          {(label || description) && (
            <div className="min-w-0 flex-1">
              {label && (
                <label
                  htmlFor={inputId}
                  className={cn(
                    'cursor-pointer font-medium text-gray-900',
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
                  className={cn('mt-0.5 text-gray-500', size === 'lg' ? 'text-sm' : 'text-xs')}
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

Radio.displayName = 'Radio';

/* ========================================
 * RadioGroup 组件
 * ======================================== */
export interface RadioGroupProps {
  /** 组名称 */
  name?: string;
  /** 选中的值（受控） */
  value?: string;
  /** 默认选中的值（非受控） */
  defaultValue?: string;
  /** 值变化回调 */
  onChange?: (value: string) => void;
  /** 子元素 */
  children: ReactNode;
  /** 方向 */
  orientation?: 'horizontal' | 'vertical';
  /** 标签 */
  label?: string;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否禁用整组 */
  disabled?: boolean;
  /** 额外的 className */
  className?: string;
}

export const RadioGroup = memo(
  forwardRef<HTMLDivElement, RadioGroupProps>(
    (
      {
        name: nameProp,
        value: controlledValue,
        defaultValue = '',
        onChange,
        children,
        orientation = 'vertical',
        label,
        size = 'md',
        disabled = false,
        className,
      },
      ref,
    ) => {
      const [internalValue, setInternalValue] = useState(defaultValue);
      const [groupName] = useState(() => nameProp || generateId('radio-group'));
      const currentValue = controlledValue !== undefined ? controlledValue : internalValue;

      const handleChange = (value: string) => {
        if (controlledValue === undefined) {
          setInternalValue(value);
        }
        onChange?.(value);
      };

      return (
        <RadioGroupContext.Provider
          value={{
            name: groupName,
            value: currentValue,
            onChange: handleChange,
            disabled,
            size,
          }}
        >
          <div ref={ref} role="radiogroup" aria-label={label} className={className}>
            {label && <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>}
            <div
              className={cn(
                'flex gap-3',
                orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
              )}
            >
              {children}
            </div>
          </div>
        </RadioGroupContext.Provider>
      );
    },
  ),
);

RadioGroup.displayName = 'RadioGroup';
