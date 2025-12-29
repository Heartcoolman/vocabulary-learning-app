/**
 * Select 组件
 *
 * 选择器/下拉选择
 * 支持单选和多选模式
 */
import React, {
  forwardRef,
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  ReactNode,
  HTMLAttributes,
} from 'react';
import { CaretDown, Check, MagnifyingGlass, X } from '../Icon';
import { cn, generateId, Keys, Size } from './utils';

export interface SelectOption {
  /** 选项值 */
  value: string;
  /** 显示文本 */
  label: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 图标 */
  icon?: ReactNode;
  /** 分组标签（用于分组显示） */
  group?: string;
}

/* ========================================
 * 单选 Select 组件
 * ======================================== */
export interface SelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 选中的值 */
  value?: string;
  /** 默认值（非受控） */
  defaultValue?: string;
  /** 选项列表 */
  options: SelectOption[];
  /** 值变化回调 */
  onChange?: (value: string) => void;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 是否有错误 */
  error?: boolean;
  /** 错误消息 */
  errorMessage?: string;
  /** 标签 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否可搜索 */
  searchable?: boolean;
  /** 搜索无结果时显示的内容 */
  emptyContent?: ReactNode;
  /** 是否全宽 */
  fullWidth?: boolean;
}

const sizeStyles: Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl',
  { trigger: string; option: string; icon: number }
> = {
  xs: { trigger: 'h-6 px-1.5 text-xs', option: 'px-1.5 py-1 text-xs', icon: 12 },
  sm: { trigger: 'h-8 px-2 text-sm', option: 'px-2 py-1.5 text-sm', icon: 14 },
  md: { trigger: 'h-10 px-3 text-sm', option: 'px-3 py-2 text-sm', icon: 16 },
  lg: { trigger: 'h-12 px-4 text-base', option: 'px-4 py-2.5 text-base', icon: 18 },
  xl: { trigger: 'h-14 px-5 text-lg', option: 'px-5 py-3 text-lg', icon: 20 },
};

export const Select = memo(
  forwardRef<HTMLDivElement, SelectProps>(
    (
      {
        value: controlledValue,
        defaultValue = '',
        options,
        onChange,
        placeholder = '请选择',
        disabled = false,
        size = 'md',
        error = false,
        errorMessage,
        label,
        required = false,
        searchable = false,
        emptyContent = '无匹配选项',
        fullWidth = false,
        className,
        id: providedId,
        ...props
      },
      ref,
    ) => {
      const [isOpen, setIsOpen] = useState(false);
      const [internalValue, setInternalValue] = useState(defaultValue);
      const [searchQuery, setSearchQuery] = useState('');
      const [activeIndex, setActiveIndex] = useState(-1);

      const triggerRef = useRef<HTMLButtonElement>(null);
      const listRef = useRef<HTMLDivElement>(null);
      const searchInputRef = useRef<HTMLInputElement>(null);
      const focusTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

      useEffect(
        () => () => {
          if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        },
        [],
      );

      const [selectId] = useState(() => providedId || generateId('select'));
      const listboxId = `${selectId}-listbox`;
      const errorId = `${selectId}-error`;

      const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
      const selectedOption = options.find((opt) => opt.value === currentValue);
      const { trigger, option: optionStyle, icon: iconSize } = sizeStyles[size];

      // 过滤选项
      const filteredOptions =
        searchable && searchQuery
          ? options.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
          : options;

      const enabledOptions = filteredOptions.filter((opt) => !opt.disabled);

      const handleOpen = useCallback(
        (open: boolean) => {
          if (disabled) return;
          setIsOpen(open);
          if (open) {
            setSearchQuery('');
            setActiveIndex(-1);
            focusTimeoutRef.current = setTimeout(() => {
              searchInputRef.current?.focus();
            }, 0);
          }
        },
        [disabled],
      );

      const handleSelect = useCallback(
        (option: SelectOption) => {
          if (option.disabled) return;
          if (controlledValue === undefined) {
            setInternalValue(option.value);
          }
          onChange?.(option.value);
          handleOpen(false);
          triggerRef.current?.focus();
        },
        [controlledValue, onChange, handleOpen],
      );

      // 点击外部关闭
      useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as Node;
          if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
            handleOpen(false);
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [isOpen, handleOpen]);

      // 键盘导航
      const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
          if (!isOpen) {
            if (
              event.key === Keys.Enter ||
              event.key === Keys.Space ||
              event.key === Keys.ArrowDown
            ) {
              event.preventDefault();
              handleOpen(true);
            }
            return;
          }

          switch (event.key) {
            case Keys.Escape:
              event.preventDefault();
              handleOpen(false);
              triggerRef.current?.focus();
              break;
            case Keys.ArrowDown:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev + 1;
                return next >= enabledOptions.length ? 0 : next;
              });
              break;
            case Keys.ArrowUp:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev - 1;
                return next < 0 ? enabledOptions.length - 1 : next;
              });
              break;
            case Keys.Enter:
              event.preventDefault();
              if (activeIndex >= 0 && activeIndex < enabledOptions.length) {
                handleSelect(enabledOptions[activeIndex]);
              }
              break;
            case Keys.Home:
              event.preventDefault();
              setActiveIndex(0);
              break;
            case Keys.End:
              event.preventDefault();
              setActiveIndex(enabledOptions.length - 1);
              break;
          }
        },
        [isOpen, handleOpen, activeIndex, enabledOptions, handleSelect],
      );

      return (
        <div ref={ref} className={cn('relative', fullWidth && 'w-full', className)} {...props}>
          {label && (
            <label
              htmlFor={selectId}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {label}
              {required && <span className="ml-1 text-red-500">*</span>}
            </label>
          )}

          {/* Trigger */}
          <button
            ref={triggerRef}
            type="button"
            id={selectId}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-invalid={error}
            aria-describedby={error && errorMessage ? errorId : undefined}
            disabled={disabled}
            onClick={() => handleOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex w-full items-center justify-between gap-2',
              'rounded-input border bg-white dark:bg-slate-800',
              'transition-all duration-g3-fast ease-g3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              trigger,
              error
                ? 'border-red-300 focus-visible:ring-red-500'
                : 'border-gray-200 hover:border-gray-300 focus-visible:ring-blue-500 dark:border-slate-600 dark:hover:border-slate-500',
              disabled && 'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-slate-700',
            )}
          >
            <span
              className={cn(
                'flex-1 truncate text-left',
                !selectedOption && 'text-gray-400 dark:text-gray-500',
              )}
            >
              {selectedOption ? (
                <span className="flex items-center gap-2">
                  {selectedOption.icon}
                  {selectedOption.label}
                </span>
              ) : (
                placeholder
              )}
            </span>
            <CaretDown
              size={iconSize}
              className={cn(
                'text-gray-400 transition-transform duration-g3-fast dark:text-gray-500',
                isOpen && 'rotate-180',
              )}
            />
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div
              ref={listRef}
              className={cn(
                'absolute z-50 mt-1 w-full',
                'rounded-card border border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-800',
                'py-1 shadow-elevated',
                'animate-g3-fade-in',
              )}
            >
              {/* Search Input */}
              {searchable && (
                <div className="px-2 pb-2">
                  <div className="relative">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setActiveIndex(-1);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="搜索..."
                      className={cn(
                        'w-full py-1.5 pl-8 pr-3',
                        'rounded-badge border border-gray-200 bg-gray-50 text-sm dark:border-slate-600 dark:bg-slate-700',
                        'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100',
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Options List */}
              <div
                id={listboxId}
                role="listbox"
                aria-label={label || placeholder}
                className="max-h-60 overflow-auto"
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {emptyContent}
                  </div>
                ) : (
                  filteredOptions.map((option, index) => {
                    const isSelected = option.value === currentValue;
                    const enabledIndex = enabledOptions.findIndex((o) => o.value === option.value);
                    const isActive = enabledIndex === activeIndex;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={option.disabled}
                        onClick={() => handleSelect(option)}
                        onMouseEnter={() => !option.disabled && setActiveIndex(enabledIndex)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          'transition-colors duration-g3-instant',
                          optionStyle,
                          option.disabled
                            ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700',
                          isActive && !option.disabled && 'bg-gray-50 dark:bg-slate-700',
                          isSelected && 'font-medium text-blue-600',
                        )}
                      >
                        {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                        <span className="flex-1 truncate text-left">{option.label}</span>
                        {isSelected && (
                          <Check
                            size={iconSize}
                            weight="bold"
                            className="flex-shrink-0 text-blue-500"
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && errorMessage && (
            <p id={errorId} className="mt-1 text-xs text-red-500" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      );
    },
  ),
);

Select.displayName = 'Select';

/* ========================================
 * 多选 MultiSelect 组件
 * ======================================== */
export interface MultiSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 选中的值数组 */
  value?: string[];
  /** 默认值（非受控） */
  defaultValue?: string[];
  /** 选项列表 */
  options: SelectOption[];
  /** 值变化回调 */
  onChange?: (values: string[]) => void;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 是否有错误 */
  error?: boolean;
  /** 错误消息 */
  errorMessage?: string;
  /** 标签 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否可搜索 */
  searchable?: boolean;
  /** 搜索无结果时显示的内容 */
  emptyContent?: ReactNode;
  /** 是否全宽 */
  fullWidth?: boolean;
  /** 最大显示标签数 */
  maxTagCount?: number;
  /** 最大可选数量 */
  maxCount?: number;
}

const multiSelectSizeStyles: Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl',
  {
    trigger: string;
    option: string;
    icon: number;
    tag: string;
    tagClose: number;
  }
> = {
  xs: {
    trigger: 'min-h-[24px] px-1.5 py-0.5 text-xs',
    option: 'px-1.5 py-1 text-xs',
    icon: 12,
    tag: 'px-1 py-0 text-xs',
    tagClose: 10,
  },
  sm: {
    trigger: 'min-h-[32px] px-2 py-1 text-sm',
    option: 'px-2 py-1.5 text-sm',
    icon: 14,
    tag: 'px-1.5 py-0.5 text-xs',
    tagClose: 12,
  },
  md: {
    trigger: 'min-h-[40px] px-3 py-1.5 text-sm',
    option: 'px-3 py-2 text-sm',
    icon: 16,
    tag: 'px-2 py-0.5 text-xs',
    tagClose: 14,
  },
  lg: {
    trigger: 'min-h-[48px] px-4 py-2 text-base',
    option: 'px-4 py-2.5 text-base',
    icon: 18,
    tag: 'px-2.5 py-1 text-sm',
    tagClose: 16,
  },
  xl: {
    trigger: 'min-h-[56px] px-5 py-2.5 text-lg',
    option: 'px-5 py-3 text-lg',
    icon: 20,
    tag: 'px-3 py-1 text-sm',
    tagClose: 18,
  },
};

export const MultiSelect = memo(
  forwardRef<HTMLDivElement, MultiSelectProps>(
    (
      {
        value: controlledValue,
        defaultValue = [],
        options,
        onChange,
        placeholder = '请选择',
        disabled = false,
        size = 'md',
        error = false,
        errorMessage,
        label,
        required = false,
        searchable = false,
        emptyContent = '无匹配选项',
        fullWidth = false,
        maxTagCount = 3,
        maxCount,
        className,
        id: providedId,
        ...props
      },
      ref,
    ) => {
      const [isOpen, setIsOpen] = useState(false);
      const [internalValue, setInternalValue] = useState<string[]>(defaultValue);
      const [searchQuery, setSearchQuery] = useState('');
      const [activeIndex, setActiveIndex] = useState(-1);

      const triggerRef = useRef<HTMLDivElement>(null);
      const listRef = useRef<HTMLDivElement>(null);
      const searchInputRef = useRef<HTMLInputElement>(null);
      const focusTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

      useEffect(
        () => () => {
          if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        },
        [],
      );

      const [selectId] = useState(() => providedId || generateId('multi-select'));
      const listboxId = `${selectId}-listbox`;
      const errorId = `${selectId}-error`;

      const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
      const selectedOptions = options.filter((opt) => currentValue.includes(opt.value));
      const {
        trigger,
        option: optionStyle,
        icon: iconSize,
        tag,
        tagClose,
      } = multiSelectSizeStyles[size];

      // 过滤选项
      const filteredOptions =
        searchable && searchQuery
          ? options.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
          : options;

      const enabledOptions = filteredOptions.filter((opt) => !opt.disabled);

      const handleOpen = useCallback(
        (open: boolean) => {
          if (disabled) return;
          setIsOpen(open);
          if (open) {
            setSearchQuery('');
            setActiveIndex(-1);
            focusTimeoutRef.current = setTimeout(() => {
              searchInputRef.current?.focus();
            }, 0);
          }
        },
        [disabled],
      );

      const handleToggle = useCallback(
        (option: SelectOption) => {
          if (option.disabled) return;

          const isSelected = currentValue.includes(option.value);
          let newValue: string[];

          if (isSelected) {
            newValue = currentValue.filter((v) => v !== option.value);
          } else {
            // 检查最大选择数量
            if (maxCount && currentValue.length >= maxCount) {
              return;
            }
            newValue = [...currentValue, option.value];
          }

          if (controlledValue === undefined) {
            setInternalValue(newValue);
          }
          onChange?.(newValue);
        },
        [controlledValue, currentValue, onChange, maxCount],
      );

      const handleRemove = useCallback(
        (value: string, e: React.MouseEvent) => {
          e.stopPropagation();
          const newValue = currentValue.filter((v) => v !== value);
          if (controlledValue === undefined) {
            setInternalValue(newValue);
          }
          onChange?.(newValue);
        },
        [controlledValue, currentValue, onChange],
      );

      const handleClear = useCallback(
        (e: React.MouseEvent) => {
          e.stopPropagation();
          if (controlledValue === undefined) {
            setInternalValue([]);
          }
          onChange?.([]);
        },
        [controlledValue, onChange],
      );

      // 点击外部关闭
      useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as Node;
          if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
            handleOpen(false);
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, [isOpen, handleOpen]);

      // 键盘导航
      const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
          if (!isOpen) {
            if (
              event.key === Keys.Enter ||
              event.key === Keys.Space ||
              event.key === Keys.ArrowDown
            ) {
              event.preventDefault();
              handleOpen(true);
            }
            return;
          }

          switch (event.key) {
            case Keys.Escape:
              event.preventDefault();
              handleOpen(false);
              break;
            case Keys.ArrowDown:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev + 1;
                return next >= enabledOptions.length ? 0 : next;
              });
              break;
            case Keys.ArrowUp:
              event.preventDefault();
              setActiveIndex((prev) => {
                const next = prev - 1;
                return next < 0 ? enabledOptions.length - 1 : next;
              });
              break;
            case Keys.Enter:
            case Keys.Space:
              if (!searchable || event.key === Keys.Enter) {
                event.preventDefault();
                if (activeIndex >= 0 && activeIndex < enabledOptions.length) {
                  handleToggle(enabledOptions[activeIndex]);
                }
              }
              break;
            case Keys.Home:
              event.preventDefault();
              setActiveIndex(0);
              break;
            case Keys.End:
              event.preventDefault();
              setActiveIndex(enabledOptions.length - 1);
              break;
          }
        },
        [isOpen, handleOpen, activeIndex, enabledOptions, handleToggle, searchable],
      );

      // 显示的标签
      const visibleTags = selectedOptions.slice(0, maxTagCount);
      const hiddenCount = selectedOptions.length - maxTagCount;

      return (
        <div ref={ref} className={cn('relative', fullWidth && 'w-full', className)} {...props}>
          {label && (
            <label
              htmlFor={selectId}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {label}
              {required && <span className="ml-1 text-red-500">*</span>}
            </label>
          )}

          {/* Trigger */}
          <div
            ref={triggerRef}
            id={selectId}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-invalid={error}
            aria-describedby={error && errorMessage ? errorId : undefined}
            onClick={() => handleOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex w-full flex-wrap items-center gap-1.5',
              'cursor-pointer rounded-input border bg-white',
              'transition-all duration-g3-fast ease-g3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              trigger,
              error
                ? 'border-red-300 focus-visible:ring-red-500'
                : 'border-gray-200 hover:border-gray-300 focus-visible:ring-blue-500 dark:border-slate-600 dark:hover:border-slate-500',
              disabled && 'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-slate-700',
            )}
          >
            {selectedOptions.length === 0 ? (
              <span className="flex-1 text-gray-400 dark:text-gray-500">{placeholder}</span>
            ) : (
              <>
                {visibleTags.map((option) => (
                  <span
                    key={option.value}
                    className={cn(
                      'inline-flex items-center gap-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
                      tag,
                    )}
                  >
                    {option.icon}
                    <span className="max-w-[100px] truncate">{option.label}</span>
                    <button
                      type="button"
                      onClick={(e) => handleRemove(option.value, e)}
                      className="hover:text-blue-900 focus:outline-none"
                      aria-label={`移除 ${option.label}`}
                    >
                      <X size={tagClose} />
                    </button>
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className={cn('text-gray-500 dark:text-gray-400', tag)}>
                    +{hiddenCount}
                  </span>
                )}
                <span className="flex-1" />
              </>
            )}

            <div className="flex items-center gap-1">
              {currentValue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300"
                  aria-label="清除所有选中项"
                >
                  <X size={iconSize} />
                </button>
              )}
              <CaretDown
                size={iconSize}
                className={cn(
                  'text-gray-400 transition-transform duration-g3-fast dark:text-gray-500',
                  isOpen && 'rotate-180',
                )}
              />
            </div>
          </div>

          {/* Dropdown */}
          {isOpen && (
            <div
              ref={listRef}
              className={cn(
                'absolute z-50 mt-1 w-full',
                'rounded-card border border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-800',
                'py-1 shadow-elevated',
                'animate-g3-fade-in',
              )}
            >
              {/* Search Input */}
              {searchable && (
                <div className="px-2 pb-2">
                  <div className="relative">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setActiveIndex(-1);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="搜索..."
                      className={cn(
                        'w-full py-1.5 pl-8 pr-3',
                        'rounded-badge border border-gray-200 bg-gray-50 text-sm dark:border-slate-600 dark:bg-slate-700',
                        'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100',
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Options List */}
              <div
                id={listboxId}
                role="listbox"
                aria-label={label || placeholder}
                aria-multiselectable="true"
                className="max-h-60 overflow-auto"
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {emptyContent}
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const isSelected = currentValue.includes(option.value);
                    const enabledIndex = enabledOptions.findIndex((o) => o.value === option.value);
                    const isActive = enabledIndex === activeIndex;
                    const isDisabledByMax =
                      !isSelected && !!maxCount && currentValue.length >= maxCount;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={option.disabled || isDisabledByMax}
                        onClick={() => handleToggle(option)}
                        onMouseEnter={() =>
                          !option.disabled && !isDisabledByMax && setActiveIndex(enabledIndex)
                        }
                        className={cn(
                          'flex w-full items-center gap-2',
                          'transition-colors duration-g3-instant',
                          optionStyle,
                          option.disabled || isDisabledByMax
                            ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700',
                          isActive &&
                            !option.disabled &&
                            !isDisabledByMax &&
                            'bg-gray-50 dark:bg-slate-700',
                          isSelected && 'font-medium text-blue-600',
                        )}
                      >
                        {/* Checkbox indicator */}
                        <span
                          className={cn(
                            'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors',
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300 dark:border-slate-500',
                          )}
                        >
                          {isSelected && <Check size={12} weight="bold" className="text-white" />}
                        </span>
                        {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                        <span className="flex-1 truncate text-left">{option.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && errorMessage && (
            <p id={errorId} className="mt-1 text-xs text-red-500" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      );
    },
  ),
);

MultiSelect.displayName = 'MultiSelect';
