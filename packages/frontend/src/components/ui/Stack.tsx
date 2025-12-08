/**
 * Stack / Flex 组件
 *
 * 灵活的布局组件，支持水平和垂直排列
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn, Direction } from './utils';

/* ========================================
 * Stack - 堆叠布局组件
 * ======================================== */
export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** 方向 */
  direction?: Direction | 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** 间距 */
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 主轴对齐方式 */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  /** 交叉轴对齐方式 */
  align?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  /** 是否换行 */
  wrap?: boolean | 'reverse';
  /** 是否为内联元素 */
  inline?: boolean;
  /** 分隔线（在子元素之间渲染） */
  divider?: ReactNode;
  /** 子元素 */
  children?: ReactNode;
}

const directionMap: Record<string, string> = {
  horizontal: 'flex-row',
  vertical: 'flex-col',
  row: 'flex-row',
  column: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'column-reverse': 'flex-col-reverse',
};

const spacingStyles: Record<string, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-12',
};

const justifyStyles: Record<string, string> = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

const alignStyles: Record<string, string> = {
  start: 'items-start',
  end: 'items-end',
  center: 'items-center',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const wrapStyles: Record<string, string> = {
  true: 'flex-wrap',
  false: 'flex-nowrap',
  reverse: 'flex-wrap-reverse',
};

export const Stack = memo(
  forwardRef<HTMLDivElement, StackProps>(
    (
      {
        direction = 'column',
        spacing = 'md',
        justify = 'start',
        align = 'stretch',
        wrap = false,
        inline = false,
        divider,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      // 如果有 divider，需要在子元素之间插入
      const childrenWithDivider = divider
        ? React.Children.toArray(children).reduce<ReactNode[]>((acc, child, index, arr) => {
            acc.push(child);
            if (index < arr.length - 1) {
              acc.push(
                <div key={`divider-${index}`} className="flex-shrink-0" aria-hidden="true">
                  {divider}
                </div>,
              );
            }
            return acc;
          }, [])
        : children;

      return (
        <div
          ref={ref}
          className={cn(
            inline ? 'inline-flex' : 'flex',
            directionMap[direction],
            spacingStyles[spacing],
            justifyStyles[justify],
            alignStyles[align],
            wrapStyles[String(wrap)],
            className,
          )}
          {...props}
        >
          {childrenWithDivider}
        </div>
      );
    },
  ),
);

Stack.displayName = 'Stack';

/* ========================================
 * HStack - 水平堆叠组件
 * ======================================== */
export interface HStackProps extends Omit<StackProps, 'direction'> {}

export const HStack = memo(
  forwardRef<HTMLDivElement, HStackProps>((props, ref) => {
    return <Stack ref={ref} direction="horizontal" {...props} />;
  }),
);

HStack.displayName = 'HStack';

/* ========================================
 * VStack - 垂直堆叠组件
 * ======================================== */
export interface VStackProps extends Omit<StackProps, 'direction'> {}

export const VStack = memo(
  forwardRef<HTMLDivElement, VStackProps>((props, ref) => {
    return <Stack ref={ref} direction="vertical" {...props} />;
  }),
);

VStack.displayName = 'VStack';

/* ========================================
 * Flex - 灵活布局组件（Stack 的别名，带更多灵活性）
 * ======================================== */
export interface FlexProps extends HTMLAttributes<HTMLDivElement> {
  /** flex 方向 */
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** 主轴对齐 */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  /** 交叉轴对齐 */
  align?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  /** 换行 */
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  /** 间距 */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  /** 是否为内联 flex */
  inline?: boolean;
  /** flex 属性 */
  flex?: 'none' | 'auto' | '1' | 'initial';
  /** 子元素 */
  children?: ReactNode;
}

const flexWrapStyles: Record<string, string> = {
  nowrap: 'flex-nowrap',
  wrap: 'flex-wrap',
  'wrap-reverse': 'flex-wrap-reverse',
};

const flexStyles: Record<string, string> = {
  none: 'flex-none',
  auto: 'flex-auto',
  '1': 'flex-1',
  initial: 'flex-initial',
};

export const Flex = memo(
  forwardRef<HTMLDivElement, FlexProps>(
    (
      {
        direction = 'row',
        justify = 'start',
        align = 'stretch',
        wrap = 'nowrap',
        gap = 'none',
        inline = false,
        flex,
        className,
        style,
        children,
        ...props
      },
      ref,
    ) => {
      const gapClass = typeof gap === 'string' ? spacingStyles[gap] : undefined;
      const gapStyle = typeof gap === 'number' ? { gap: `${gap}px` } : undefined;

      return (
        <div
          ref={ref}
          className={cn(
            inline ? 'inline-flex' : 'flex',
            directionMap[direction],
            justifyStyles[justify],
            alignStyles[align],
            flexWrapStyles[wrap],
            gapClass,
            flex && flexStyles[flex],
            className,
          )}
          style={{ ...gapStyle, ...style }}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Flex.displayName = 'Flex';

/* ========================================
 * Spacer - 弹性空间占位组件
 * ======================================== */
export interface SpacerProps extends HTMLAttributes<HTMLDivElement> {
  /** 固定尺寸（覆盖弹性行为） */
  size?: number | string;
}

export const Spacer = memo(
  forwardRef<HTMLDivElement, SpacerProps>(({ size, className, style, ...props }, ref) => {
    const sizeStyle = size
      ? {
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: typeof size === 'number' ? `${size}px` : size,
        }
      : { flex: '1 1 0%' };

    return (
      <div
        ref={ref}
        className={cn('self-stretch', className)}
        style={{ ...sizeStyle, ...style }}
        aria-hidden="true"
        {...props}
      />
    );
  }),
);

Spacer.displayName = 'Spacer';

/* ========================================
 * Center - 居中布局组件
 * ======================================== */
export interface CenterProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否为内联元素 */
  inline?: boolean;
  /** 子元素 */
  children?: ReactNode;
}

export const Center = memo(
  forwardRef<HTMLDivElement, CenterProps>(
    ({ inline = false, className, children, ...props }, ref) => {
      return (
        <div
          ref={ref}
          className={cn(inline ? 'inline-flex' : 'flex', 'items-center justify-center', className)}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Center.displayName = 'Center';
