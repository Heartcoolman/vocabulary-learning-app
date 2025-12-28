/**
 * Table 组件
 *
 * 功能丰富的表格组件，支持排序、分页、选择等功能
 */
import React, {
  forwardRef,
  memo,
  createContext,
  useContext,
  useCallback,
  HTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  ReactNode,
  KeyboardEvent,
} from 'react';
import { cn, Keys } from './utils';

/* ========================================
 * Table Selection Context
 * ======================================== */
export type SelectionMode = 'none' | 'single' | 'multiple';

interface TableSelectionContextValue {
  selectionMode: SelectionMode;
  selectedKeys: Set<string>;
  onSelectionChange: (keys: Set<string>) => void;
  toggleSelection: (key: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (key: string) => boolean;
  allKeys: string[];
}

const TableSelectionContext = createContext<TableSelectionContextValue | null>(null);

export function useTableSelection() {
  return useContext(TableSelectionContext);
}

/* ========================================
 * Table 根组件
 * ======================================== */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** 表格变体 */
  variant?: 'default' | 'striped' | 'bordered';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否固定表头 */
  stickyHeader?: boolean;
  /** 表格最大高度（用于滚动） */
  maxHeight?: string | number;
  /** 选择模式 */
  selectionMode?: SelectionMode;
  /** 选中的行 keys */
  selectedKeys?: Set<string> | string[];
  /** 选择变化回调 */
  onSelectionChange?: (keys: Set<string>) => void;
  /** 所有行的 keys（用于全选） */
  allKeys?: string[];
}

const tableSizeStyles = {
  sm: '[&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 text-sm',
  md: '[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 text-sm',
  lg: '[&_th]:px-5 [&_th]:py-4 [&_td]:px-5 [&_td]:py-4 text-base',
};

export const Table = memo(
  forwardRef<HTMLTableElement, TableProps>(
    (
      {
        variant = 'default',
        size = 'md',
        stickyHeader = false,
        maxHeight,
        selectionMode = 'none',
        selectedKeys: selectedKeysProp,
        onSelectionChange,
        allKeys = [],
        className,
        children,
        ...props
      },
      ref,
    ) => {
      // 处理 selectedKeys，支持 Set 或数组
      const selectedKeys =
        selectedKeysProp instanceof Set ? selectedKeysProp : new Set(selectedKeysProp || []);

      const toggleSelection = useCallback(
        (key: string) => {
          if (selectionMode === 'none') return;

          const newKeys = new Set(selectedKeys);
          if (selectionMode === 'single') {
            if (newKeys.has(key)) {
              newKeys.delete(key);
            } else {
              newKeys.clear();
              newKeys.add(key);
            }
          } else {
            if (newKeys.has(key)) {
              newKeys.delete(key);
            } else {
              newKeys.add(key);
            }
          }
          onSelectionChange?.(newKeys);
        },
        [selectionMode, selectedKeys, onSelectionChange],
      );

      const selectAll = useCallback(() => {
        if (selectionMode !== 'multiple') return;
        onSelectionChange?.(new Set(allKeys));
      }, [selectionMode, allKeys, onSelectionChange]);

      const clearSelection = useCallback(() => {
        onSelectionChange?.(new Set());
      }, [onSelectionChange]);

      const isSelected = useCallback(
        (key: string) => {
          return selectedKeys.has(key);
        },
        [selectedKeys],
      );

      const selectionContextValue: TableSelectionContextValue = {
        selectionMode,
        selectedKeys,
        onSelectionChange: onSelectionChange || (() => {}),
        toggleSelection,
        selectAll,
        clearSelection,
        isSelected,
        allKeys,
      };

      const tableElement = (
        <table
          ref={ref}
          className={cn(
            'w-full border-collapse',
            tableSizeStyles[size],
            // 变体样式
            variant === 'striped' &&
              '[&_tbody_tr:nth-child(even)]:bg-gray-50 dark:[&_tbody_tr:nth-child(even)]:bg-slate-800/50',
            variant === 'bordered' &&
              'border border-gray-200 dark:border-slate-700 [&_td]:border [&_td]:border-gray-200 dark:[&_td]:border-slate-700 [&_th]:border [&_th]:border-gray-200 dark:[&_th]:border-slate-700',
            // 固定表头
            stickyHeader &&
              '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-gray-50 dark:[&_thead_th]:bg-slate-800',
            className,
          )}
          {...props}
        >
          {children}
        </table>
      );

      const wrappedTable =
        selectionMode !== 'none' ? (
          <TableSelectionContext.Provider value={selectionContextValue}>
            {tableElement}
          </TableSelectionContext.Provider>
        ) : (
          tableElement
        );

      if (maxHeight) {
        return (
          <div
            className="overflow-auto rounded-card border border-gray-200 dark:border-slate-700"
            style={{
              maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
            }}
          >
            {wrappedTable}
          </div>
        );
      }

      return wrappedTable;
    },
  ),
);

Table.displayName = 'Table';

/* ========================================
 * TableHeader 组件
 * ======================================== */
export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableHeader = memo(
  forwardRef<HTMLTableSectionElement, TableHeaderProps>(
    ({ className, children, ...props }, ref) => {
      return (
        <thead ref={ref} className={cn('bg-gray-50 dark:bg-slate-800', className)} {...props}>
          {children}
        </thead>
      );
    },
  ),
);

TableHeader.displayName = 'TableHeader';

/* ========================================
 * TableBody 组件
 * ======================================== */
export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = memo(
  forwardRef<HTMLTableSectionElement, TableBodyProps>(({ className, children, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={cn('divide-y divide-gray-100 dark:divide-slate-700', className)}
        {...props}
      >
        {children}
      </tbody>
    );
  }),
);

TableBody.displayName = 'TableBody';

/* ========================================
 * TableRow 组件
 * ======================================== */
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** 行唯一标识（用于选择功能） */
  rowKey?: string;
  /** 是否可点击 */
  clickable?: boolean;
  /** 是否选中（受控模式） */
  selected?: boolean;
}

export const TableRow = memo(
  forwardRef<HTMLTableRowElement, TableRowProps>(
    (
      {
        rowKey,
        clickable = false,
        selected: selectedProp,
        className,
        children,
        onClick,
        onKeyDown,
        ...props
      },
      ref,
    ) => {
      const selectionCtx = useTableSelection();

      // 使用 context 的选择状态或者 prop
      const isSelected =
        rowKey && selectionCtx ? selectionCtx.isSelected(rowKey) : selectedProp || false;

      const isSelectable = rowKey && selectionCtx && selectionCtx.selectionMode !== 'none';

      const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
        if (isSelectable && rowKey) {
          selectionCtx?.toggleSelection(rowKey);
        }
        onClick?.(e);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (isSelectable && rowKey) {
          if (e.key === Keys.Enter || e.key === Keys.Space) {
            e.preventDefault();
            selectionCtx?.toggleSelection(rowKey);
          }
        }
        onKeyDown?.(e);
      };

      return (
        <tr
          ref={ref}
          role={isSelectable ? 'row' : undefined}
          aria-selected={isSelectable ? isSelected : undefined}
          tabIndex={isSelectable ? 0 : undefined}
          className={cn(
            'transition-colors duration-g3-instant',
            (clickable || isSelectable) &&
              'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50',
            isSelected &&
              'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/40',
            className,
          )}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          {...props}
        >
          {children}
        </tr>
      );
    },
  ),
);

TableRow.displayName = 'TableRow';

/* ========================================
 * TableHead 组件 (th)
 * ======================================== */
export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** 是否可排序 */
  sortable?: boolean;
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc' | null;
  /** 排序点击回调 */
  onSort?: () => void;
}

export const TableHead = memo(
  forwardRef<HTMLTableCellElement, TableHeadProps>(
    ({ sortable = false, sortDirection, onSort, className, children, ...props }, ref) => {
      return (
        <th
          ref={ref}
          scope="col"
          onClick={sortable ? onSort : undefined}
          className={cn(
            'text-left font-semibold text-gray-900 dark:text-white',
            'border-b border-gray-200 dark:border-slate-700',
            sortable && 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-slate-700',
            className,
          )}
          aria-sort={
            sortDirection === 'asc'
              ? 'ascending'
              : sortDirection === 'desc'
                ? 'descending'
                : undefined
          }
          {...props}
        >
          <div className="flex items-center gap-1">
            {children}
            {sortable && (
              <span className="inline-flex flex-col text-gray-400 dark:text-gray-500">
                <svg
                  className={cn('-mb-0.5 h-2 w-2', sortDirection === 'asc' && 'text-blue-500')}
                  viewBox="0 0 8 4"
                  fill="currentColor"
                >
                  <path d="M4 0L8 4H0L4 0Z" />
                </svg>
                <svg
                  className={cn('-mt-0.5 h-2 w-2', sortDirection === 'desc' && 'text-blue-500')}
                  viewBox="0 0 8 4"
                  fill="currentColor"
                >
                  <path d="M4 4L0 0H8L4 4Z" />
                </svg>
              </span>
            )}
          </div>
        </th>
      );
    },
  ),
);

TableHead.displayName = 'TableHead';

/* ========================================
 * TableCell 组件 (td)
 * ======================================== */
export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = memo(
  forwardRef<HTMLTableCellElement, TableCellProps>(({ className, children, ...props }, ref) => {
    return (
      <td ref={ref} className={cn('text-gray-700 dark:text-gray-300', className)} {...props}>
        {children}
      </td>
    );
  }),
);

TableCell.displayName = 'TableCell';

/* ========================================
 * TableCaption 组件
 * ======================================== */
export interface TableCaptionProps extends HTMLAttributes<HTMLTableCaptionElement> {}

export const TableCaption = memo(
  forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
    ({ className, children, ...props }, ref) => {
      return (
        <caption
          ref={ref}
          className={cn('mt-4 text-sm text-gray-500 dark:text-gray-400', className)}
          {...props}
        >
          {children}
        </caption>
      );
    },
  ),
);

TableCaption.displayName = 'TableCaption';

/* ========================================
 * TableEmpty 组件
 * ======================================== */
export interface TableEmptyProps extends HTMLAttributes<HTMLTableRowElement> {
  /** 列数（用于 colspan） */
  colSpan: number;
  /** 空状态图标 */
  icon?: ReactNode;
  /** 空状态文本 */
  message?: string;
}

export const TableEmpty = memo(
  forwardRef<HTMLTableRowElement, TableEmptyProps>(
    ({ colSpan, icon, message = '暂无数据', className, children, ...props }, ref) => {
      return (
        <tr ref={ref} className={className} {...props}>
          <td colSpan={colSpan} className="py-12 text-center">
            {children || (
              <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                {icon}
                <span className="text-sm">{message}</span>
              </div>
            )}
          </td>
        </tr>
      );
    },
  ),
);

TableEmpty.displayName = 'TableEmpty';

/* ========================================
 * TableCheckbox 组件 - 选择框
 * ======================================== */
export interface TableCheckboxProps extends Omit<HTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** 行的 key（用于行选择）*/
  rowKey?: string;
  /** 是否为表头全选框 */
  isHeader?: boolean;
  /** 受控选中状态 */
  checked?: boolean;
  /** 选中状态变化回调 */
  onChange?: (checked: boolean) => void;
}

export const TableCheckbox = memo(
  forwardRef<HTMLInputElement, TableCheckboxProps>(
    ({ rowKey, isHeader = false, checked: checkedProp, onChange, className, ...props }, ref) => {
      const selectionCtx = useTableSelection();

      // 计算选中状态
      let isChecked = checkedProp ?? false;
      let isIndeterminate = false;

      if (selectionCtx) {
        if (isHeader) {
          const { selectedKeys, allKeys } = selectionCtx;
          isChecked = allKeys.length > 0 && selectedKeys.size === allKeys.length;
          isIndeterminate = selectedKeys.size > 0 && selectedKeys.size < allKeys.length;
        } else if (rowKey) {
          isChecked = selectionCtx.isSelected(rowKey);
        }
      }

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newChecked = e.target.checked;

        if (selectionCtx) {
          if (isHeader) {
            if (newChecked) {
              selectionCtx.selectAll();
            } else {
              selectionCtx.clearSelection();
            }
          } else if (rowKey) {
            selectionCtx.toggleSelection(rowKey);
          }
        }

        onChange?.(newChecked);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === Keys.Enter) {
          e.preventDefault();
          (e.target as HTMLInputElement).click();
        }
      };

      return (
        <input
          ref={ref}
          type="checkbox"
          checked={isChecked}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-checked={isIndeterminate ? 'mixed' : isChecked}
          className={cn(
            'h-4 w-4 rounded border-gray-300 dark:border-slate-600',
            'text-blue-600 focus:ring-2 focus:ring-blue-500',
            'cursor-pointer transition-colors duration-g3-instant',
            className,
          )}
          {...props}
          // 设置 indeterminate 状态
          {...(isIndeterminate && { 'data-indeterminate': true })}
        />
      );
    },
  ),
);

TableCheckbox.displayName = 'TableCheckbox';
