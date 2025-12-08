/**
 * Grid 组件
 *
 * 响应式网格布局系统
 */
import React, { forwardRef, memo, HTMLAttributes, ReactNode, CSSProperties } from 'react';
import { cn } from './utils';

/* ========================================
 * Grid - 网格容器组件
 * ======================================== */
export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** 列数 */
  columns?: number | 'auto-fill' | 'auto-fit' | ResponsiveValue<number>;
  /** 行数 */
  rows?: number;
  /** 间距 */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 列间距 */
  columnGap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 行间距 */
  rowGap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 自动填充列的最小宽度 */
  minChildWidth?: number | string;
  /** 模板列（覆盖 columns） */
  templateColumns?: string;
  /** 模板行 */
  templateRows?: string;
  /** 模板区域 */
  templateAreas?: string;
  /** 自动行大小 */
  autoRows?: string;
  /** 自动列大小 */
  autoColumns?: string;
  /** 自动排列方向 */
  autoFlow?: 'row' | 'column' | 'dense' | 'row dense' | 'column dense';
  /** 主轴对齐（justify-items） */
  justifyItems?: 'start' | 'end' | 'center' | 'stretch';
  /** 交叉轴对齐（align-items） */
  alignItems?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  /** 内容主轴对齐（justify-content） */
  justifyContent?: 'start' | 'end' | 'center' | 'stretch' | 'between' | 'around' | 'evenly';
  /** 内容交叉轴对齐（align-content） */
  alignContent?: 'start' | 'end' | 'center' | 'stretch' | 'between' | 'around' | 'evenly';
  /** 是否为内联网格 */
  inline?: boolean;
  /** 子元素 */
  children?: ReactNode;
}

/** 响应式值类型 */
export interface ResponsiveValue<T> {
  base?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}

const gapStyles: Record<string, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-12',
};

const columnGapStyles: Record<string, string> = {
  none: 'gap-x-0',
  xs: 'gap-x-1',
  sm: 'gap-x-2',
  md: 'gap-x-4',
  lg: 'gap-x-6',
  xl: 'gap-x-8',
  '2xl': 'gap-x-12',
};

const rowGapStyles: Record<string, string> = {
  none: 'gap-y-0',
  xs: 'gap-y-1',
  sm: 'gap-y-2',
  md: 'gap-y-4',
  lg: 'gap-y-6',
  xl: 'gap-y-8',
  '2xl': 'gap-y-12',
};

const justifyItemsStyles: Record<string, string> = {
  start: 'justify-items-start',
  end: 'justify-items-end',
  center: 'justify-items-center',
  stretch: 'justify-items-stretch',
};

const alignItemsStyles: Record<string, string> = {
  start: 'items-start',
  end: 'items-end',
  center: 'items-center',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyContentStyles: Record<string, string> = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  stretch: 'justify-stretch',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

const alignContentStyles: Record<string, string> = {
  start: 'content-start',
  end: 'content-end',
  center: 'content-center',
  stretch: 'content-stretch',
  between: 'content-between',
  around: 'content-around',
  evenly: 'content-evenly',
};

const autoFlowStyles: Record<string, string> = {
  row: 'grid-flow-row',
  column: 'grid-flow-col',
  dense: 'grid-flow-dense',
  'row dense': 'grid-flow-row-dense',
  'column dense': 'grid-flow-col-dense',
};

// 响应式列数类名
const responsiveColumnClasses: Record<string, Record<number, string>> = {
  base: {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
    9: 'grid-cols-9',
    10: 'grid-cols-10',
    11: 'grid-cols-11',
    12: 'grid-cols-12',
  },
  sm: {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
    5: 'sm:grid-cols-5',
    6: 'sm:grid-cols-6',
    7: 'sm:grid-cols-7',
    8: 'sm:grid-cols-8',
    9: 'sm:grid-cols-9',
    10: 'sm:grid-cols-10',
    11: 'sm:grid-cols-11',
    12: 'sm:grid-cols-12',
  },
  md: {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
    6: 'md:grid-cols-6',
    7: 'md:grid-cols-7',
    8: 'md:grid-cols-8',
    9: 'md:grid-cols-9',
    10: 'md:grid-cols-10',
    11: 'md:grid-cols-11',
    12: 'md:grid-cols-12',
  },
  lg: {
    1: 'lg:grid-cols-1',
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
    6: 'lg:grid-cols-6',
    7: 'lg:grid-cols-7',
    8: 'lg:grid-cols-8',
    9: 'lg:grid-cols-9',
    10: 'lg:grid-cols-10',
    11: 'lg:grid-cols-11',
    12: 'lg:grid-cols-12',
  },
  xl: {
    1: 'xl:grid-cols-1',
    2: 'xl:grid-cols-2',
    3: 'xl:grid-cols-3',
    4: 'xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    6: 'xl:grid-cols-6',
    7: 'xl:grid-cols-7',
    8: 'xl:grid-cols-8',
    9: 'xl:grid-cols-9',
    10: 'xl:grid-cols-10',
    11: 'xl:grid-cols-11',
    12: 'xl:grid-cols-12',
  },
  '2xl': {
    1: '2xl:grid-cols-1',
    2: '2xl:grid-cols-2',
    3: '2xl:grid-cols-3',
    4: '2xl:grid-cols-4',
    5: '2xl:grid-cols-5',
    6: '2xl:grid-cols-6',
    7: '2xl:grid-cols-7',
    8: '2xl:grid-cols-8',
    9: '2xl:grid-cols-9',
    10: '2xl:grid-cols-10',
    11: '2xl:grid-cols-11',
    12: '2xl:grid-cols-12',
  },
};

function getResponsiveColumnClasses(columns: number | ResponsiveValue<number>): string {
  if (typeof columns === 'number') {
    return responsiveColumnClasses.base[columns] || '';
  }

  return Object.entries(columns)
    .map(([breakpoint, cols]) => {
      const classes = responsiveColumnClasses[breakpoint];
      return classes?.[cols as number] || '';
    })
    .filter(Boolean)
    .join(' ');
}

export const Grid = memo(
  forwardRef<HTMLDivElement, GridProps>(
    (
      {
        columns,
        rows,
        gap = 'md',
        columnGap,
        rowGap,
        minChildWidth,
        templateColumns,
        templateRows,
        templateAreas,
        autoRows,
        autoColumns,
        autoFlow,
        justifyItems,
        alignItems,
        justifyContent,
        alignContent,
        inline = false,
        className,
        style,
        children,
        ...props
      },
      ref,
    ) => {
      // 构建 grid-template-columns 样式
      let gridTemplateColumns = templateColumns;
      if (!gridTemplateColumns) {
        if (minChildWidth) {
          const minWidth = typeof minChildWidth === 'number' ? `${minChildWidth}px` : minChildWidth;
          gridTemplateColumns = `repeat(auto-fit, minmax(${minWidth}, 1fr))`;
        } else if (columns === 'auto-fill' || columns === 'auto-fit') {
          gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        }
      }

      // 获取响应式列数类名
      const columnsClass =
        typeof columns === 'number' || (typeof columns === 'object' && columns !== null)
          ? getResponsiveColumnClasses(columns as number | ResponsiveValue<number>)
          : '';

      const gridStyle: CSSProperties = {
        ...style,
        ...(gridTemplateColumns && { gridTemplateColumns }),
        ...(templateRows && { gridTemplateRows: templateRows }),
        ...(templateAreas && { gridTemplateAreas: templateAreas }),
        ...(autoRows && { gridAutoRows: autoRows }),
        ...(autoColumns && { gridAutoColumns: autoColumns }),
        ...(rows && { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }),
      };

      return (
        <div
          ref={ref}
          className={cn(
            inline ? 'inline-grid' : 'grid',
            columnsClass,
            !columnGap && !rowGap && gapStyles[gap],
            columnGap && columnGapStyles[columnGap],
            rowGap && rowGapStyles[rowGap],
            autoFlow && autoFlowStyles[autoFlow],
            justifyItems && justifyItemsStyles[justifyItems],
            alignItems && alignItemsStyles[alignItems],
            justifyContent && justifyContentStyles[justifyContent],
            alignContent && alignContentStyles[alignContent],
            className,
          )}
          style={gridStyle}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

Grid.displayName = 'Grid';

/* ========================================
 * GridItem - 网格项组件
 * ======================================== */
export interface GridItemProps extends HTMLAttributes<HTMLDivElement> {
  /** 列跨度 */
  colSpan?: number | 'auto' | 'full';
  /** 行跨度 */
  rowSpan?: number;
  /** 列起始位置 */
  colStart?: number;
  /** 列结束位置 */
  colEnd?: number;
  /** 行起始位置 */
  rowStart?: number;
  /** 行结束位置 */
  rowEnd?: number;
  /** 网格区域名称 */
  area?: string;
  /** 单元格内主轴对齐（justify-self） */
  justifySelf?: 'start' | 'end' | 'center' | 'stretch' | 'auto';
  /** 单元格内交叉轴对齐（align-self） */
  alignSelf?: 'start' | 'end' | 'center' | 'stretch' | 'auto' | 'baseline';
  /** 子元素 */
  children?: ReactNode;
}

const colSpanStyles: Record<string, string> = {
  auto: 'col-auto',
  full: 'col-span-full',
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

const rowSpanStyles: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4',
  5: 'row-span-5',
  6: 'row-span-6',
};

const justifySelfStyles: Record<string, string> = {
  start: 'justify-self-start',
  end: 'justify-self-end',
  center: 'justify-self-center',
  stretch: 'justify-self-stretch',
  auto: 'justify-self-auto',
};

const alignSelfStyles: Record<string, string> = {
  start: 'self-start',
  end: 'self-end',
  center: 'self-center',
  stretch: 'self-stretch',
  auto: 'self-auto',
  baseline: 'self-baseline',
};

export const GridItem = memo(
  forwardRef<HTMLDivElement, GridItemProps>(
    (
      {
        colSpan,
        rowSpan,
        colStart,
        colEnd,
        rowStart,
        rowEnd,
        area,
        justifySelf,
        alignSelf,
        className,
        style,
        children,
        ...props
      },
      ref,
    ) => {
      const itemStyle: CSSProperties = {
        ...style,
        ...(colStart && { gridColumnStart: colStart }),
        ...(colEnd && { gridColumnEnd: colEnd }),
        ...(rowStart && { gridRowStart: rowStart }),
        ...(rowEnd && { gridRowEnd: rowEnd }),
        ...(area && { gridArea: area }),
      };

      return (
        <div
          ref={ref}
          className={cn(
            colSpan ? colSpanStyles[String(colSpan)] : undefined,
            rowSpan ? rowSpanStyles[rowSpan] : undefined,
            justifySelf ? justifySelfStyles[justifySelf] : undefined,
            alignSelf ? alignSelfStyles[alignSelf] : undefined,
            className,
          )}
          style={itemStyle}
          {...props}
        >
          {children}
        </div>
      );
    },
  ),
);

GridItem.displayName = 'GridItem';

/* ========================================
 * SimpleGrid - 简单等宽网格
 * ======================================== */
export interface SimpleGridProps extends Omit<GridProps, 'columns'> {
  /** 列数（响应式） */
  columns?: number | ResponsiveValue<number>;
  /** 子元素最小宽度（自动计算列数） */
  minChildWidth?: number | string;
}

export const SimpleGrid = memo(
  forwardRef<HTMLDivElement, SimpleGridProps>(({ columns = 1, minChildWidth, ...props }, ref) => {
    return (
      <Grid
        ref={ref}
        columns={minChildWidth ? undefined : columns}
        minChildWidth={minChildWidth}
        {...props}
      />
    );
  }),
);

SimpleGrid.displayName = 'SimpleGrid';
