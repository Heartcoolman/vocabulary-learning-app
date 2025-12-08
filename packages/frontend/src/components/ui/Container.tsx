/**
 * Container 组件
 *
 * 响应式容器组件，用于限制内容宽度并居中显示
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** 最大宽度 */
  maxWidth?:
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | '7xl'
    | 'full'
    | 'prose'
    | 'screen';
  /** 是否居中 */
  centered?: boolean;
  /** 水平内边距 */
  paddingX?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** 垂直内边距 */
  paddingY?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** 是否流式布局（去除最大宽度限制，但保留内边距） */
  fluid?: boolean;
  /** 子元素 */
  children?: ReactNode;
}

const maxWidthStyles: Record<string, string> = {
  xs: 'max-w-xs', // 320px
  sm: 'max-w-sm', // 384px
  md: 'max-w-md', // 448px
  lg: 'max-w-lg', // 512px
  xl: 'max-w-xl', // 576px
  '2xl': 'max-w-2xl', // 672px
  '3xl': 'max-w-3xl', // 768px
  '4xl': 'max-w-4xl', // 896px
  '5xl': 'max-w-5xl', // 1024px
  '6xl': 'max-w-6xl', // 1152px
  '7xl': 'max-w-7xl', // 1280px
  full: 'max-w-full',
  prose: 'max-w-prose', // 65ch
  screen: 'max-w-screen-xl', // 1280px (适合大多数场景)
};

const paddingXStyles: Record<string, string> = {
  none: 'px-0',
  sm: 'px-4',
  md: 'px-6',
  lg: 'px-8',
  xl: 'px-12',
};

const paddingYStyles: Record<string, string> = {
  none: 'py-0',
  sm: 'py-4',
  md: 'py-6',
  lg: 'py-8',
  xl: 'py-12',
};

export const Container = memo(
  forwardRef<HTMLDivElement, ContainerProps>(
    (
      {
        maxWidth = '7xl',
        centered = true,
        paddingX = 'md',
        paddingY = 'none',
        fluid = false,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      return (
        <div
          ref={ref}
          className={cn(
            'w-full',
            !fluid && maxWidthStyles[maxWidth],
            centered && 'mx-auto',
            paddingXStyles[paddingX],
            paddingYStyles[paddingY],
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Container.displayName = 'Container';

/* ========================================
 * Box - 基础盒模型组件
 * ======================================== */
export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  /** 显示类型 */
  display?: 'block' | 'inline' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'none';
  /** 内边距 */
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 水平内边距 */
  paddingX?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 垂直内边距 */
  paddingY?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 外边距 */
  margin?: 'none' | 'auto' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 水平外边距 */
  marginX?: 'none' | 'auto' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 垂直外边距 */
  marginY?: 'none' | 'auto' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 边框圆角 */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** 阴影 */
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 背景色 */
  bg?: 'white' | 'gray-50' | 'gray-100' | 'transparent';
  /** 边框 */
  border?: boolean;
  /** 宽度 */
  width?: 'auto' | 'full' | 'screen' | 'fit' | 'min' | 'max';
  /** 高度 */
  height?: 'auto' | 'full' | 'screen' | 'fit' | 'min' | 'max';
  /** 子元素 */
  children?: ReactNode;
}

const displayStyles: Record<string, string> = {
  block: 'block',
  inline: 'inline',
  'inline-block': 'inline-block',
  flex: 'flex',
  'inline-flex': 'inline-flex',
  grid: 'grid',
  none: 'hidden',
};

const paddingStyles: Record<string, string> = {
  none: 'p-0',
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
  '2xl': 'p-12',
};

const boxPaddingXStyles: Record<string, string> = {
  none: 'px-0',
  xs: 'px-1',
  sm: 'px-2',
  md: 'px-4',
  lg: 'px-6',
  xl: 'px-8',
  '2xl': 'px-12',
};

const boxPaddingYStyles: Record<string, string> = {
  none: 'py-0',
  xs: 'py-1',
  sm: 'py-2',
  md: 'py-4',
  lg: 'py-6',
  xl: 'py-8',
  '2xl': 'py-12',
};

const marginStyles: Record<string, string> = {
  none: 'm-0',
  auto: 'm-auto',
  xs: 'm-1',
  sm: 'm-2',
  md: 'm-4',
  lg: 'm-6',
  xl: 'm-8',
  '2xl': 'm-12',
};

const marginXStyles: Record<string, string> = {
  none: 'mx-0',
  auto: 'mx-auto',
  xs: 'mx-1',
  sm: 'mx-2',
  md: 'mx-4',
  lg: 'mx-6',
  xl: 'mx-8',
  '2xl': 'mx-12',
};

const marginYStyles: Record<string, string> = {
  none: 'my-0',
  auto: 'my-auto',
  xs: 'my-1',
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
  xl: 'my-8',
  '2xl': 'my-12',
};

const roundedStyles: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

const shadowStyles: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  '2xl': 'shadow-2xl',
};

const bgStyles: Record<string, string> = {
  white: 'bg-white',
  'gray-50': 'bg-gray-50',
  'gray-100': 'bg-gray-100',
  transparent: 'bg-transparent',
};

const widthStyles: Record<string, string> = {
  auto: 'w-auto',
  full: 'w-full',
  screen: 'w-screen',
  fit: 'w-fit',
  min: 'w-min',
  max: 'w-max',
};

const heightStyles: Record<string, string> = {
  auto: 'h-auto',
  full: 'h-full',
  screen: 'h-screen',
  fit: 'h-fit',
  min: 'h-min',
  max: 'h-max',
};

export const Box = memo(
  forwardRef<HTMLDivElement, BoxProps>(
    (
      {
        display,
        padding,
        paddingX,
        paddingY,
        margin,
        marginX,
        marginY,
        rounded,
        shadow,
        bg,
        border,
        width,
        height,
        className,
        children,
        ...props
      },
      ref,
    ) => {
      return (
        <div
          ref={ref}
          className={cn(
            display && displayStyles[display],
            padding && paddingStyles[padding],
            paddingX && boxPaddingXStyles[paddingX],
            paddingY && boxPaddingYStyles[paddingY],
            margin && marginStyles[margin],
            marginX && marginXStyles[marginX],
            marginY && marginYStyles[marginY],
            rounded && roundedStyles[rounded],
            shadow && shadowStyles[shadow],
            bg && bgStyles[bg],
            border && 'border border-gray-200',
            width && widthStyles[width],
            height && heightStyles[height],
            className,
          )}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Box.displayName = 'Box';

/* ========================================
 * Section - 页面区块组件
 * ======================================== */
export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** 背景色 */
  bg?: 'white' | 'gray' | 'transparent';
  /** 垂直内边距大小 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 是否全宽（不使用容器） */
  fullWidth?: boolean;
  /** 容器最大宽度 */
  containerWidth?: ContainerProps['maxWidth'];
  /** 子元素 */
  children?: ReactNode;
}

const sectionBgStyles: Record<string, string> = {
  white: 'bg-white',
  gray: 'bg-gray-50',
  transparent: '',
};

const sectionSizeStyles: Record<string, string> = {
  sm: 'py-8',
  md: 'py-12',
  lg: 'py-16',
  xl: 'py-24',
};

export const Section = memo(
  forwardRef<HTMLElement, SectionProps>(
    (
      {
        bg = 'transparent',
        size = 'md',
        fullWidth = false,
        containerWidth = '7xl',
        className,
        children,
        ...props
      },
      ref,
    ) => {
      return (
        <section
          ref={ref}
          className={cn(sectionBgStyles[bg], sectionSizeStyles[size], className)}
          {...props}
        >
          {fullWidth ? children : <Container maxWidth={containerWidth}>{children}</Container>}
        </section>
      );
    },
  ),
);

Section.displayName = 'Section';

/* ========================================
 * AspectRatio - 固定宽高比容器
 * ======================================== */
export interface AspectRatioProps extends HTMLAttributes<HTMLDivElement> {
  /** 宽高比 */
  ratio?: number | '1/1' | '4/3' | '16/9' | '21/9' | '3/4' | '9/16';
  /** 子元素 */
  children?: ReactNode;
}

const ratioStyles: Record<string, string> = {
  '1/1': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '16/9': 'aspect-video',
  '21/9': 'aspect-[21/9]',
  '3/4': 'aspect-[3/4]',
  '9/16': 'aspect-[9/16]',
};

export const AspectRatio = memo(
  forwardRef<HTMLDivElement, AspectRatioProps>(
    ({ ratio = '16/9', className, style, children, ...props }, ref) => {
      const ratioClass = typeof ratio === 'string' ? ratioStyles[ratio] : undefined;
      const ratioStyle = typeof ratio === 'number' ? { aspectRatio: ratio } : undefined;

      return (
        <div
          ref={ref}
          className={cn('relative w-full overflow-hidden', ratioClass, className)}
          style={{ ...ratioStyle, ...style }}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

AspectRatio.displayName = 'AspectRatio';
