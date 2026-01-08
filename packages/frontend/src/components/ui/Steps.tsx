/**
 * Steps 组件
 *
 * 步骤条组件，用于引导用户按照流程完成任务
 */
import React, {
  forwardRef,
  memo,
  createContext,
  useContext,
  HTMLAttributes,
  ReactNode,
  KeyboardEvent,
} from 'react';
import { cn, Keys } from './utils';

/* ========================================
 * Steps Context
 * ======================================== */
export type StepStatus = 'wait' | 'process' | 'finish' | 'error';

interface StepsContextValue {
  current: number;
  status: StepStatus;
  direction: 'horizontal' | 'vertical';
  size: 'sm' | 'md' | 'lg';
  clickable: boolean;
  onChange?: (step: number) => void;
}

const StepsContext = createContext<StepsContextValue>({
  current: 0,
  status: 'process',
  direction: 'horizontal',
  size: 'md',
  clickable: false,
});

function useStepsContext() {
  return useContext(StepsContext);
}

/* ========================================
 * Steps 根组件
 * ======================================== */
export interface StepsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 当前步骤（从 0 开始） */
  current?: number;
  /** 当前步骤状态 */
  status?: StepStatus;
  /** 排列方向 */
  direction?: 'horizontal' | 'vertical';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否可点击切换 */
  clickable?: boolean;
  /** 步骤变化回调 */
  onChange?: (step: number) => void;
  /** 是否显示进度条连接线 */
  progressDot?: boolean;
}

export const Steps = memo(
  forwardRef<HTMLDivElement, StepsProps>(
    (
      {
        current = 0,
        status = 'process',
        direction = 'horizontal',
        size = 'md',
        clickable = false,
        onChange,
        progressDot = false,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      const childArray = React.Children.toArray(children);

      return (
        <StepsContext.Provider value={{ current, status, direction, size, clickable, onChange }}>
          <div
            ref={ref}
            role="navigation"
            aria-label="步骤导航"
            className={cn(
              'flex',
              direction === 'vertical' ? 'flex-col' : 'flex-row items-start',
              className,
            )}
            {...props}
          >
            {React.Children.map(children, (child, index) => {
              if (!React.isValidElement(child)) return null;

              // 确定每个步骤的状态
              let stepStatus: StepStatus;
              if (index < current) {
                stepStatus = 'finish';
              } else if (index === current) {
                stepStatus = status;
              } else {
                stepStatus = 'wait';
              }

              return React.cloneElement(child as React.ReactElement<StepProps>, {
                stepNumber: index + 1,
                stepIndex: index,
                stepStatus,
                isLast: index === childArray.length - 1,
                progressDot,
              });
            })}
          </div>
        </StepsContext.Provider>
      );
    },
  ),
);

Steps.displayName = 'Steps';

/* ========================================
 * Step 组件 - 单个步骤
 * ======================================== */
export interface StepProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 步骤标题 */
  title: ReactNode;
  /** 步骤描述 */
  description?: ReactNode;
  /** 自定义图标 */
  icon?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 内部使用：步骤序号 */
  stepNumber?: number;
  /** 内部使用：步骤索引 */
  stepIndex?: number;
  /** 内部使用：步骤状态 */
  stepStatus?: StepStatus;
  /** 内部使用：是否最后一个 */
  isLast?: boolean;
  /** 内部使用：使用进度点 */
  progressDot?: boolean;
}

const sizeStyles: Record<
  'sm' | 'md' | 'lg',
  { icon: string; title: string; desc: string; dot: string }
> = {
  sm: {
    icon: 'w-6 h-6 text-xs',
    title: 'text-sm',
    desc: 'text-xs',
    dot: 'w-2 h-2',
  },
  md: {
    icon: 'w-8 h-8 text-sm',
    title: 'text-sm',
    desc: 'text-xs',
    dot: 'w-2.5 h-2.5',
  },
  lg: {
    icon: 'w-10 h-10 text-base',
    title: 'text-base',
    desc: 'text-sm',
    dot: 'w-3 h-3',
  },
};

const statusStyles: Record<StepStatus, { icon: string; connector: string }> = {
  wait: {
    icon: 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-600',
    connector: 'bg-gray-200 dark:bg-slate-700',
  },
  process: {
    icon: 'bg-blue-500 text-white border-blue-500',
    connector: 'bg-gray-200 dark:bg-slate-700',
  },
  finish: {
    icon: 'bg-blue-500 text-white border-blue-500',
    connector: 'bg-blue-500',
  },
  error: {
    icon: 'bg-red-500 text-white border-red-500',
    connector: 'bg-gray-200 dark:bg-slate-700',
  },
};

export const Step = memo(
  forwardRef<HTMLDivElement, StepProps>(
    (
      {
        title,
        description,
        icon,
        disabled = false,
        stepNumber = 1,
        stepIndex = 0,
        stepStatus = 'wait',
        isLast = false,
        progressDot = false,
        className,
        onClick,
        onKeyDown,
        ...props
      },
      ref,
    ) => {
      const { direction, size, clickable, onChange } = useStepsContext();
      const styles = sizeStyles[size];
      const statusStyle = statusStyles[stepStatus];

      const isClickable = clickable && !disabled;

      const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isClickable) {
          onChange?.(stepIndex);
        }
        onClick?.(e);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (isClickable && (e.key === Keys.Enter || e.key === Keys.Space)) {
          e.preventDefault();
          onChange?.(stepIndex);
        }
        onKeyDown?.(e);
      };

      // 图标内容
      const iconContent =
        icon ||
        (stepStatus === 'finish' ? (
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
        ) : stepStatus === 'error' ? (
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
          </svg>
        ) : (
          stepNumber
        ));

      return (
        <div
          ref={ref}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          aria-current={stepStatus === 'process' ? 'step' : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex',
            direction === 'vertical' ? 'flex-row' : 'flex-col items-center',
            !isLast && (direction === 'vertical' ? 'pb-6' : 'flex-1'),
            isClickable && 'cursor-pointer',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
          {...props}
        >
          {/* 图标/数字 */}
          <div className="flex flex-shrink-0 items-center">
            {progressDot ? (
              <span
                className={cn(
                  'rounded-full border-2',
                  styles.dot,
                  stepStatus === 'wait' &&
                    'border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-800',
                  stepStatus === 'process' && 'border-blue-500 bg-blue-500',
                  stepStatus === 'finish' && 'border-blue-500 bg-blue-500',
                  stepStatus === 'error' && 'border-red-500 bg-red-500',
                )}
              />
            ) : (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full border-2 font-medium',
                  'transition-all duration-g3-fast',
                  styles.icon,
                  statusStyle.icon,
                )}
              >
                {iconContent}
              </span>
            )}

            {/* 水平方向连接线 */}
            {!isLast && direction === 'horizontal' && (
              <div
                className={cn(
                  'mx-3 h-0.5 min-w-[24px] flex-1',
                  stepStatus === 'finish' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-slate-700',
                )}
              />
            )}
          </div>

          {/* 内容区域 */}
          <div className={cn(direction === 'vertical' ? 'ml-3 flex-1' : 'mt-2 text-center')}>
            <div
              className={cn(
                'font-medium',
                styles.title,
                stepStatus === 'wait' && 'text-gray-500 dark:text-gray-400',
                stepStatus === 'process' && 'text-gray-900 dark:text-white',
                stepStatus === 'finish' && 'text-gray-900 dark:text-white',
                stepStatus === 'error' && 'text-red-600 dark:text-red-400',
              )}
            >
              {title}
            </div>
            {description && (
              <div className={cn('mt-0.5 text-gray-500 dark:text-gray-400', styles.desc)}>
                {description}
              </div>
            )}

            {/* 垂直方向连接线 */}
            {!isLast && direction === 'vertical' && (
              <div
                className={cn(
                  'absolute bottom-0 left-4 top-10 w-0.5 -translate-x-1/2',
                  stepStatus === 'finish' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-slate-700',
                )}
              />
            )}
          </div>
        </div>
      );
    },
  ),
);

Step.displayName = 'Step';

/* ========================================
 * Stepper 别名导出
 * ======================================== */
export const Stepper = Steps;
export const StepperItem = Step;
