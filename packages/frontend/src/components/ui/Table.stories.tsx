import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableEmpty,
} from './Table';
import { Button } from './Button';
import { Input } from './Input';
import { Checkbox } from './Checkbox';
import { Trash, Pencil } from '@phosphor-icons/react';

/**
 * # Table 表格组件
 *
 * 表格用于展示结构化数据，支持排序、选择等功能。
 *
 * ## 特性
 * - 支持多种变体：default, striped, bordered
 * - 支持多种尺寸：sm, md, lg
 * - 支持固定表头和最大高度滚动
 * - 支持可排序列
 * - 支持可选择行
 * - 支持空状态展示
 *
 * ## 组件构成
 * - Table: 表格容器
 * - TableHeader: 表头区域
 * - TableBody: 表体区域
 * - TableRow: 表格行
 * - TableHead: 表头单元格 (th)
 * - TableCell: 表格单元格 (td)
 * - TableCaption: 表格标题
 * - TableEmpty: 空状态行
 *
 * ## 使用方式
 * ```tsx
 * import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
 *
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>姓名</TableHead>
 *       <TableHead>邮箱</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>张三</TableCell>
 *       <TableCell>zhangsan@example.com</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */
const meta: Meta<typeof Table> = {
  title: 'UI/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '表格组件，用于展示结构化数据。',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'striped', 'bordered'],
      description: '表格变体样式',
      table: {
        type: { summary: "'default' | 'striped' | 'bordered'" },
        defaultValue: { summary: 'default' },
      },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: '表格尺寸',
      table: {
        type: { summary: "'sm' | 'md' | 'lg'" },
        defaultValue: { summary: 'md' },
      },
    },
    stickyHeader: {
      control: 'boolean',
      description: '是否固定表头',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    maxHeight: {
      control: 'text',
      description: '表格最大高度（用于滚动）',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 示例数据
const sampleData = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: '管理员', status: '活跃' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: '编辑', status: '活跃' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: '用户', status: '禁用' },
  { id: 4, name: '赵六', email: 'zhaoliu@example.com', role: '编辑', status: '活跃' },
  { id: 5, name: '钱七', email: 'qianqi@example.com', role: '用户', status: '待审核' },
];

/* ========================================
 * 默认状态
 * ======================================== */

/**
 * 默认表格状态
 */
export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>姓名</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
          <TableHead>状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sampleData.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.email}</TableCell>
            <TableCell>{item.role}</TableCell>
            <TableCell>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  item.status === '活跃'
                    ? 'bg-green-100 text-green-700'
                    : item.status === '禁用'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {item.status}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

/* ========================================
 * 变体展示
 * ======================================== */

/**
 * 展示所有表格变体
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Default</h3>
        <Table variant="default">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 3).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Striped (斑马纹)</h3>
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 3).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Bordered (带边框)</h3>
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 3).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '表格支持三种变体：default（默认）、striped（斑马纹）、bordered（带边框）。',
      },
    },
  },
};

/* ========================================
 * 尺寸展示
 * ======================================== */

/**
 * 展示所有尺寸
 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Small (sm)</h3>
        <Table size="sm">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 2).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Medium (md)</h3>
        <Table size="md">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 2).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-500">Large (lg)</h3>
        <Table size="lg">
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.slice(0, 2).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '表格支持三种尺寸：sm（小）、md（中）、lg（大）。',
      },
    },
  },
};

/* ========================================
 * 固定表头和滚动
 * ======================================== */

/**
 * 固定表头
 */
export const StickyHeader: Story = {
  render: () => {
    const manyData = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `用户 ${i + 1}`,
      email: `user${i + 1}@example.com`,
      role: ['管理员', '编辑', '用户'][i % 3],
    }));

    return (
      <Table stickyHeader maxHeight={300}>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {manyData.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.id}</TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell>{item.role}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '设置 stickyHeader 和 maxHeight 可以实现固定表头和内容滚动。',
      },
    },
  },
};

/* ========================================
 * 带标题
 * ======================================== */

/**
 * 带表格标题
 */
export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>用户列表 - 共 {sampleData.length} 条记录</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>姓名</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sampleData.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.email}</TableCell>
            <TableCell>{item.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

/* ========================================
 * 空状态
 * ======================================== */

/**
 * 空状态
 */
export const EmptyState: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>姓名</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty colSpan={4} message="暂无用户数据" />
      </TableBody>
    </Table>
  ),
  parameters: {
    docs: {
      description: {
        story: '使用 TableEmpty 组件展示空状态。',
      },
    },
  },
};

/**
 * 自定义空状态
 */
export const CustomEmptyState: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>姓名</TableHead>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty colSpan={3}>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <span className="text-3xl">📭</span>
            </div>
            <p className="text-gray-500">没有找到匹配的数据</p>
            <Button size="sm">添加新用户</Button>
          </div>
        </TableEmpty>
      </TableBody>
    </Table>
  ),
};

/* ========================================
 * 可点击行
 * ======================================== */

/**
 * 可点击行
 */
export const ClickableRows: Story = {
  render: function Render() {
    const [selected, setSelected] = useState<number | null>(null);

    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.map((item) => (
              <TableRow
                key={item.id}
                clickable
                selected={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {selected && (
          <p className="mt-4 text-sm text-gray-600">
            选中：{sampleData.find((d) => d.id === selected)?.name}
          </p>
        )}
      </>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '设置 TableRow 的 clickable 属性可使行可点击，selected 属性显示选中状态。',
      },
    },
  },
};

/* ========================================
 * 可排序表格
 * ======================================== */

/**
 * 可排序表格
 */
export const Sortable: Story = {
  render: function Render() {
    const [sortConfig, setSortConfig] = useState<{
      key: string;
      direction: 'asc' | 'desc';
    } | null>(null);

    const sortedData = useMemo(() => {
      if (!sortConfig) return sampleData;
      return [...sampleData].sort((a, b) => {
        const aValue = a[sortConfig.key as keyof typeof a];
        const bValue = b[sortConfig.key as keyof typeof b];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }, [sortConfig]);

    const handleSort = (key: string) => {
      setSortConfig((current) => {
        if (current?.key === key) {
          if (current.direction === 'asc') {
            return { key, direction: 'desc' };
          }
          return null;
        }
        return { key, direction: 'asc' };
      });
    };

    const getSortDirection = (key: string) => {
      if (sortConfig?.key === key) {
        return sortConfig.direction;
      }
      return null;
    };

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              sortable
              sortDirection={getSortDirection('name')}
              onSort={() => handleSort('name')}
            >
              姓名
            </TableHead>
            <TableHead
              sortable
              sortDirection={getSortDirection('email')}
              onSort={() => handleSort('email')}
            >
              邮箱
            </TableHead>
            <TableHead
              sortable
              sortDirection={getSortDirection('role')}
              onSort={() => handleSort('role')}
            >
              角色
            </TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell>{item.role}</TableCell>
              <TableCell>{item.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '设置 TableHead 的 sortable 属性可启用排序功能。',
      },
    },
  },
};

/* ========================================
 * 带操作列
 * ======================================== */

/**
 * 带操作列
 */
export const WithActions: Story = {
  render: function Render() {
    const [data, setData] = useState(sampleData);

    const handleDelete = (id: number) => {
      setData(data.filter((item) => item.id !== id));
    };

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="xs" iconOnly>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      iconOnly
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash size={14} className="text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmpty colSpan={4} message="所有数据已删除" />
          )}
        </TableBody>
      </Table>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '表格可以包含操作按钮列。',
      },
    },
  },
};

/* ========================================
 * 可选择表格
 * ======================================== */

/**
 * 可选择表格（带复选框）
 */
export const Selectable: Story = {
  render: function Render() {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const isAllSelected = selectedIds.length === sampleData.length;
    const isSomeSelected = selectedIds.length > 0 && !isAllSelected;

    const toggleAll = () => {
      if (isAllSelected) {
        setSelectedIds([]);
      } else {
        setSelectedIds(sampleData.map((d) => d.id));
      }
    };

    const toggleOne = (id: number) => {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    return (
      <div className="flex flex-col gap-4">
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-4 rounded-button bg-blue-50 p-3">
            <span className="text-sm text-blue-700">已选择 {selectedIds.length} 项</span>
            <Button variant="danger" size="sm">
              批量删除
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={toggleAll}
                  aria-label="选择全部"
                />
              </TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleData.map((item) => (
              <TableRow key={item.id} selected={selectedIds.includes(item.id)}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleOne(item.id)}
                    aria-label={`选择 ${item.name}`}
                  />
                </TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '结合 Checkbox 组件实现可选择的表格。',
      },
    },
  },
};

/* ========================================
 * 综合示例
 * ======================================== */

/**
 * 综合示例 - 数据表格
 */
export const FullFeatured: Story = {
  render: function Render() {
    const [data, setData] = useState(sampleData);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [sortConfig, setSortConfig] = useState<{
      key: string;
      direction: 'asc' | 'desc';
    } | null>(null);

    // 过滤数据
    const filteredData = useMemo(() => {
      if (!search) return data;
      return data.filter(
        (item) =>
          item.name.includes(search) || item.email.includes(search) || item.role.includes(search),
      );
    }, [data, search]);

    // 排序数据
    const sortedData = useMemo(() => {
      if (!sortConfig) return filteredData;
      return [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key as keyof typeof a];
        const bValue = b[sortConfig.key as keyof typeof b];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }, [filteredData, sortConfig]);

    const handleSort = (key: string) => {
      setSortConfig((current) => {
        if (current?.key === key) {
          if (current.direction === 'asc') {
            return { key, direction: 'desc' };
          }
          return null;
        }
        return { key, direction: 'asc' };
      });
    };

    const getSortDirection = (key: string) => {
      if (sortConfig?.key === key) return sortConfig.direction;
      return null;
    };

    const isAllSelected = sortedData.length > 0 && selectedIds.length === sortedData.length;
    const isSomeSelected = selectedIds.length > 0 && !isAllSelected;

    const toggleAll = () => {
      if (isAllSelected) {
        setSelectedIds([]);
      } else {
        setSelectedIds(sortedData.map((d) => d.id));
      }
    };

    const toggleOne = (id: number) => {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    const handleDelete = () => {
      setData(data.filter((item) => !selectedIds.includes(item.id)));
      setSelectedIds([]);
    };

    return (
      <div className="flex w-full max-w-4xl flex-col gap-4">
        {/* 工具栏 */}
        <div className="flex items-center justify-between">
          <Input
            type="search"
            placeholder="搜索用户..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button variant="danger" size="sm" onClick={handleDelete}>
                删除选中 ({selectedIds.length})
              </Button>
            )}
            <Button size="sm">添加用户</Button>
          </div>
        </div>

        {/* 表格 */}
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={toggleAll}
                  aria-label="选择全部"
                />
              </TableHead>
              <TableHead
                sortable
                sortDirection={getSortDirection('name')}
                onSort={() => handleSort('name')}
              >
                姓名
              </TableHead>
              <TableHead
                sortable
                sortDirection={getSortDirection('email')}
                onSort={() => handleSort('email')}
              >
                邮箱
              </TableHead>
              <TableHead
                sortable
                sortDirection={getSortDirection('role')}
                onSort={() => handleSort('role')}
              >
                角色
              </TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((item) => (
                <TableRow key={item.id} selected={selectedIds.includes(item.id)}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleOne(item.id)}
                      aria-label={`选择 ${item.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{item.role}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        item.status === '活跃'
                          ? 'bg-green-100 text-green-700'
                          : item.status === '禁用'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="xs" iconOnly aria-label="编辑">
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="xs" iconOnly aria-label="删除">
                        <Trash size={14} className="text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmpty colSpan={6} message={search ? '没有找到匹配的结果' : '暂无数据'} />
            )}
          </TableBody>
        </Table>

        {/* 底部信息 */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            共 {data.length} 条记录
            {search && `，筛选出 ${sortedData.length} 条`}
          </span>
          <span>{selectedIds.length > 0 && `已选择 ${selectedIds.length} 条`}</span>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '综合示例，展示搜索、排序、选择、删除等完整功能。',
      },
    },
  },
};

/**
 * 响应式表格
 */
export const ResponsiveTable: Story = {
  render: () => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>更新时间</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sampleData.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.id}</TableCell>
              <TableCell className="whitespace-nowrap">{item.name}</TableCell>
              <TableCell className="whitespace-nowrap">{item.email}</TableCell>
              <TableCell>{item.role}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell className="whitespace-nowrap">2024-01-01</TableCell>
              <TableCell className="whitespace-nowrap">2024-01-15</TableCell>
              <TableCell>
                <Button variant="ghost" size="xs">
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '使用 overflow-x-auto 包裹表格实现响应式滚动。',
      },
    },
  },
};
