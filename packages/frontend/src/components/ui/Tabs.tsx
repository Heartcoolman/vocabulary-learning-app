/**
 * Tabs 组件
 *
 * 标签页切换
 */
import React, {
  forwardRef,
  memo,
  useState,
  useCallback,
  createContext,
  useContext,
  HTMLAttributes,
  ReactNode,
  KeyboardEvent,
} from 'react';
import { cn, generateId, Keys } from './utils';

/* ========================================
 * Tabs Context
 * ======================================== */
interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  variant: 'line' | 'pills' | 'enclosed';
  size: 'sm' | 'md' | 'lg';
  orientation: 'horizontal' | 'vertical';
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs compound components must be used within a Tabs component');
  }
  return context;
}

/* ========================================
 * Tabs 根组件
 * ======================================== */
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 当前选中的 tab */
  value?: string;
  /** 默认选中的 tab（非受控） */
  defaultValue?: string;
  /** 选中变化回调 */
  onChange?: (value: string) => void;
  /** 样式变体 */
  variant?: 'line' | 'pills' | 'enclosed';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 方向 */
  orientation?: 'horizontal' | 'vertical';
}

export const Tabs = memo(
  forwardRef<HTMLDivElement, TabsProps>(
    (
      {
        value: controlledValue,
        defaultValue = '',
        onChange,
        variant = 'line',
        size = 'md',
        orientation = 'horizontal',
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const [internalValue, setInternalValue] = useState(defaultValue);
      const value = controlledValue !== undefined ? controlledValue : internalValue;

      const handleChange = useCallback(
        (newValue: string) => {
          if (controlledValue === undefined) {
            setInternalValue(newValue);
          }
          onChange?.(newValue);
        },
        [controlledValue, onChange],
      );

      return (
        <TabsContext.Provider value={{ value, onChange: handleChange, variant, size, orientation }}>
          <div
            ref={ref}
            className={cn(orientation === 'vertical' ? 'flex gap-4' : 'flex flex-col', className)}
            {...props}
          >
            {children}
          </div>
        </TabsContext.Provider>
      );
    },
  ),
);

Tabs.displayName = 'Tabs';

/* ========================================
 * TabsList 组件
 * ======================================== */
export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {}

export const TabsList = memo(
  forwardRef<HTMLDivElement, TabsListProps>(({ className, children, ...props }, ref) => {
    const { variant, orientation } = useTabsContext();

    const variantStyles = {
      line:
        orientation === 'horizontal'
          ? 'border-b border-gray-200 gap-0'
          : 'border-r border-gray-200 gap-0',
      pills: 'bg-gray-100 rounded-button p-1 gap-1',
      enclosed: 'border-b border-gray-200 gap-0',
    };

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation={orientation}
        className={cn(
          'flex',
          orientation === 'vertical' ? 'flex-col' : 'flex-row',
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }),
);

TabsList.displayName = 'TabsList';

/* ========================================
 * Tab 组件
 * ======================================== */
export interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  /** Tab 唯一标识 */
  value: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 图标 */
  icon?: ReactNode;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Tab = memo(
  forwardRef<HTMLButtonElement, TabProps>(
    ({ value: tabValue, disabled = false, icon, className, children, ...props }, ref) => {
      const { value, onChange, variant, size, orientation } = useTabsContext();
      const isSelected = value === tabValue;
      const [tabId] = useState(() => generateId('tab'));
      const panelId = `${tabId}-panel`;

      const handleClick = () => {
        if (!disabled) {
          onChange(tabValue);
        }
      };

      const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
          '[role="tab"]:not([disabled])',
        );
        if (!tabs) return;

        const tabsArray = Array.from(tabs);
        const currentIndex = tabsArray.indexOf(event.currentTarget);

        let nextIndex = -1;
        const isHorizontal = orientation === 'horizontal';

        switch (event.key) {
          case isHorizontal ? Keys.ArrowRight : Keys.ArrowDown:
            nextIndex = currentIndex + 1 >= tabsArray.length ? 0 : currentIndex + 1;
            break;
          case isHorizontal ? Keys.ArrowLeft : Keys.ArrowUp:
            nextIndex = currentIndex - 1 < 0 ? tabsArray.length - 1 : currentIndex - 1;
            break;
          case Keys.Home:
            nextIndex = 0;
            break;
          case Keys.End:
            nextIndex = tabsArray.length - 1;
            break;
        }

        if (nextIndex !== -1) {
          event.preventDefault();
          tabsArray[nextIndex].focus();
          tabsArray[nextIndex].click();
        }
      };

      const baseStyles = cn(
        'inline-flex items-center gap-2 font-medium',
        'transition-all duration-g3-fast ease-g3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-50',
        sizeStyles[size],
      );

      const variantStyles: Record<string, string> = {
        line: cn(
          'relative',
          orientation === 'horizontal' ? '-mb-px border-b-2' : '-mr-px border-r-2',
          isSelected
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
        ),
        pills: cn(
          'rounded-button',
          isSelected ? 'bg-white text-gray-900 shadow-soft' : 'text-gray-500 hover:text-gray-700',
        ),
        enclosed: cn(
          'border border-transparent rounded-t-lg',
          orientation === 'horizontal' ? '-mb-px' : '-mr-px rounded-t-none rounded-l-lg',
          isSelected
            ? 'border-gray-200 border-b-white bg-white text-gray-900'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
        ),
      };

      return (
        <button
          ref={ref}
          type="button"
          role="tab"
          id={tabId}
          aria-selected={isSelected}
          aria-controls={panelId}
          tabIndex={isSelected ? 0 : -1}
          disabled={disabled}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(baseStyles, variantStyles[variant], className)}
          {...props}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </button>
      );
    },
  ),
);

Tab.displayName = 'Tab';

/* ========================================
 * TabsPanel 组件
 * ======================================== */
export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** 对应的 Tab value */
  value: string;
}

export const TabsPanel = memo(
  forwardRef<HTMLDivElement, TabsPanelProps>(
    ({ value: panelValue, className, children, ...props }, ref) => {
      const { value } = useTabsContext();
      const isSelected = value === panelValue;

      if (!isSelected) return null;

      return (
        <div
          ref={ref}
          role="tabpanel"
          tabIndex={0}
          className={cn('flex-1 focus:outline-none', className)}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

TabsPanel.displayName = 'TabsPanel';
