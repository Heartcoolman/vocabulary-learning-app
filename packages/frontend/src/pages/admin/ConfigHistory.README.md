# 配置历史页面 (ConfigHistoryPage)

## 概述

配置历史页面用于显示所有算法配置的修改记录，帮助管理员追踪配置变更历史，了解谁在什么时候修改了什么配置。

## 功能特性

### 1. 历史记录展示

- 显示所有配置修改记录
- 按时间倒序排列（最新的在前）
- 每条记录包含：
  - 修改人
  - 修改时间
  - 修改原因
  - 变更字段列表
  - 详细的修改前后对比

### 2. 筛选功能

- **搜索筛选**：按修改人或修改原因搜索
- **时间筛选**：
  - 全部：显示所有记录
  - 今天：显示最近24小时的记录
  - 本周：显示最近7天的记录
  - 本月：显示最近30天的记录

### 3. 详细对比

- 点击"展开详情"查看完整的变更内容
- 使用颜色区分修改前后的值：
  - 红色背景：修改前的值
  - 绿色背景：修改后的值
- 支持复杂对象的格式化显示（JSON）

### 4. 统计信息

- 显示总记录数
- 显示筛选后的记录数

## 使用方法

### 访问页面

1. 以管理员身份登录
2. 进入管理后台
3. 点击左侧菜单的"配置历史"

### 搜索记录

1. 在搜索框中输入关键词
2. 系统会实时过滤匹配的记录
3. 支持搜索修改人和修改原因

### 按时间筛选

1. 点击时间筛选按钮（全部/今天/本周/本月）
2. 系统会显示对应时间范围内的记录

### 查看详情

1. 找到要查看的记录
2. 点击"展开详情"按钮
3. 查看每个变更字段的详细对比
4. 点击"收起详情"隐藏详细内容

## 技术实现

### 组件结构

```
ConfigHistoryPage (主组件)
├── 页面标题
├── 筛选工具栏
│   ├── 搜索框
│   ├── 时间筛选按钮
│   └── 统计信息
└── 历史记录列表
    └── HistoryRecordCard (记录卡片)
        ├── 头部信息（修改人、时间）
        ├── 修改原因
        ├── 变更字段摘要
        └── 详细变更内容（可展开）
```

### 数据流

```typescript
// 1. 加载历史记录
AlgorithmConfigService.getConfigHistory() -> ConfigHistory[]

// 2. 应用筛选
applyFilters() -> filteredHistory

// 3. 渲染列表
filteredHistory.map(record => <HistoryRecordCard />)
```

### 关键函数

#### `loadHistory()`

从 AlgorithmConfigService 加载配置历史记录。

#### `applyFilters()`

根据搜索词和时间筛选条件过滤记录。

#### `getChangedFields()`

对比 previousValue 和 newValue，提取变更的字段。

#### `formatDate()`

格式化时间戳为可读的日期时间字符串。

#### `formatValue()`

格式化值为字符串，支持对象的 JSON 格式化。

## 数据模型

### ConfigHistory

```typescript
interface ConfigHistory {
  id: string; // 记录ID
  configId: string; // 配置ID
  changedBy: string; // 修改人
  changeReason?: string; // 修改原因
  previousValue: Partial<AlgorithmConfig>; // 修改前的值
  newValue: Partial<AlgorithmConfig>; // 修改后的值
  timestamp: number; // 修改时间戳
}
```

## UI 设计

### 颜色方案

- 主色调：蓝色 (#3b82f6)
- 修改前：红色背景 (#fee2e2)
- 修改后：绿色背景 (#dcfce7)
- 文字：灰色系

### 图标使用

- Clock：页面标题、时间显示
- MagnifyingGlass：搜索框
- ArrowCounterClockwise：修改人图标

### 响应式设计

- 移动端：单列布局
- 桌面端：双列对比布局（修改前/修改后）

## 路由配置

- **路径**：`/admin/config-history`
- **组件**：`ConfigHistoryPage`
- **权限**：需要管理员权限

## 依赖服务

- `AlgorithmConfigService`：提供配置历史数据
- `Icon`：提供图标组件

## 注意事项

1. **数据持久化**：当前使用内存存储，刷新页面后历史记录会丢失。需要后续实现 API 接口和数据库存储。

2. **性能考虑**：如果历史记录数量很大，建议添加分页或虚拟滚动。

3. **权限控制**：只有管理员可以访问此页面。

## 后续优化

1. **实现 API 接口**：将历史记录持久化到数据库
2. **添加分页**：处理大量历史记录
3. **添加导出功能**：导出为 CSV 或 Excel
4. **添加更多筛选条件**：按配置项类型、按变更幅度等
5. **优化移动端体验**：改进小屏幕上的显示

## 相关文件

- `src/pages/admin/ConfigHistoryPage.tsx` - 主组件
- `src/services/algorithms/AlgorithmConfigService.ts` - 配置服务
- `src/types/models.ts` - 数据模型定义
- `src/pages/admin/AdminLayout.tsx` - 管理后台布局
- `src/App.tsx` - 路由配置

## 需求追溯

- **Requirements 10.10**：显示所有配置修改记录（修改时间、修改人、修改前后的值、修改原因），支持按时间筛选

## 测试

参见 `ConfigHistoryPage.test.md` 了解详细的测试场景和验证清单。
