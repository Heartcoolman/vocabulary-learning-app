/**
 * UI 组件库统一导出
 *
 * 提供 40+ 基础 UI 组件，支持 TypeScript、React.memo 优化和无障碍访问
 *
 * 组件分类：
 * - 反馈组件：Modal, Toast, Alert, Tooltip, Popover, Progress, Spinner, Skeleton
 * - 布局组件：Card, Divider, Stack, Flex, Grid, Container, Box, Section
 * - 表单组件：Button, Input, Textarea, Select, Checkbox, Radio, Switch
 * - 数据展示：Table, List, Badge, Tag, Avatar, Pagination, Empty, Stat
 * - 导航组件：Dropdown, Tabs, Breadcrumb, Steps, Menu
 */

// 工具函数
export { cn, generateId, Keys } from './utils';
export type { Size, Variant, Direction, Placement } from './utils';

/* ========================================
 * 反馈组件 Feedback Components
 * ======================================== */

// Modal 模态框
export { Modal, ConfirmModal, AlertModal } from './Modal';

// Toast 轻提示
export { ToastProvider, useToast } from './Toast';

// Alert 警告提示
export { Alert, AlertBanner } from './Alert';
export type { AlertProps, AlertBannerProps, AlertVariant } from './Alert';

// Tooltip 提示框
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

// Popover 弹出提示框
export { Popover } from './Popover';
export type { PopoverProps } from './Popover';

// Progress 进度条
export { Progress, CircularProgress } from './Progress';
export type { ProgressProps, CircularProgressProps } from './Progress';

// Spinner 加载指示器
export { Spinner, FullPageSpinner, InlineSpinner } from './Spinner';
export type { SpinnerProps, FullPageSpinnerProps, InlineSpinnerProps } from './Spinner';

// Skeleton 骨架屏
export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonButton, SkeletonCard } from './Skeleton';
export type {
  SkeletonProps,
  SkeletonTextProps,
  SkeletonAvatarProps,
  SkeletonButtonProps,
  SkeletonCardProps,
} from './Skeleton';

// JsonHighlight JSON语法高亮
export { JsonHighlight } from './JsonHighlight';

// OfflineIndicator 离线提示
export { OfflineIndicator } from './OfflineIndicator';
export type { OfflineIndicatorProps } from './OfflineIndicator';

/* ========================================
 * 布局组件 Layout Components
 * ======================================== */

// Card 卡片
export { Card, CardHeader, CardContent, CardFooter } from './Card';
export type {
  CardProps,
  CardHeaderProps,
  CardContentProps,
  CardFooterProps,
  CardVariant,
} from './Card';

// Divider 分隔线
export { Divider } from './Divider';
export type { DividerProps } from './Divider';

// Stack / Flex 堆叠布局
export { Stack, HStack, VStack, Flex, Spacer, Center } from './Stack';
export type {
  StackProps,
  HStackProps,
  VStackProps,
  FlexProps,
  SpacerProps,
  CenterProps,
} from './Stack';

// Grid 网格布局
export { Grid, GridItem, SimpleGrid } from './Grid';
export type { GridProps, GridItemProps, SimpleGridProps, ResponsiveValue } from './Grid';

// Container 容器
export { Container, Box, Section, AspectRatio } from './Container';
export type { ContainerProps, BoxProps, SectionProps, AspectRatioProps } from './Container';

/* ========================================
 * 表单组件 Form Components
 * ======================================== */

// Button 按钮
export { Button, buttonVariants } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

// Input 输入框
export { Input } from './Input';
export type { InputProps } from './Input';

// Textarea 多行文本输入框
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

// Select 选择器
export { Select, MultiSelect } from './Select';
export type { SelectProps, SelectOption, MultiSelectProps } from './Select';

// Checkbox 复选框
export { Checkbox, CheckboxGroup } from './Checkbox';
export type { CheckboxProps, CheckboxGroupProps } from './Checkbox';

// Radio 单选框
export { Radio, RadioGroup } from './Radio';
export type { RadioProps, RadioGroupProps } from './Radio';

// Switch 开关
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

/* ========================================
 * 数据展示组件 Data Display Components
 * ======================================== */

// Table 表格
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableEmpty,
  TableCheckbox,
  useTableSelection,
} from './Table';
export type {
  TableProps,
  TableHeaderProps,
  TableBodyProps,
  TableRowProps,
  TableHeadProps,
  TableCellProps,
  TableCaptionProps,
  TableEmptyProps,
  TableCheckboxProps,
  SelectionMode,
} from './Table';

// List 列表
export { List, ListItem, ListItemButton, ListSubheader, ListDivider } from './List';
export type {
  ListProps,
  ListItemProps,
  ListItemButtonProps,
  ListSubheaderProps,
  ListDividerProps,
} from './List';

// Badge 徽章
export { Badge, BadgeDot } from './Badge';
export type { BadgeProps, BadgeDotProps } from './Badge';

// Tag 标签
export { Tag, TagGroup, SelectableTag } from './Tag';
export type { TagProps, TagGroupProps, SelectableTagProps } from './Tag';

// Avatar 头像
export { Avatar, AvatarGroup } from './Avatar';
export type { AvatarProps, AvatarGroupProps } from './Avatar';

// Empty 空状态
export { Empty, EmptySimple } from './Empty';
export type { EmptyProps, EmptySimpleProps } from './Empty';

// Stat 统计
export { Stat, StatCard, StatGroup, MiniStat } from './Stat';
export type { StatProps, StatCardProps, StatGroupProps, MiniStatProps } from './Stat';

/* ========================================
 * 导航组件 Navigation Components
 * ======================================== */

// Tabs 标签页
export { Tabs, TabsList, Tab, TabsPanel } from './Tabs';
export type { TabsProps, TabsListProps, TabProps, TabsPanelProps } from './Tabs';

// Dropdown 下拉菜单
export { Dropdown } from './Dropdown';
export type { DropdownProps, DropdownItem } from './Dropdown';

// Breadcrumb 面包屑
export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbEllipsis,
  BreadcrumbSeparator,
} from './Breadcrumb';
export type {
  BreadcrumbProps,
  BreadcrumbItemProps,
  BreadcrumbLinkProps,
  BreadcrumbEllipsisProps,
  BreadcrumbSeparatorProps,
} from './Breadcrumb';

// Pagination 分页
export { Pagination, SimplePagination } from './Pagination';
export type { PaginationProps, SimplePaginationProps } from './Pagination';

// Steps 步骤条
export { Steps, Step, Stepper, StepperItem } from './Steps';
export type { StepsProps, StepProps, StepStatus } from './Steps';

// Menu 菜单
export { Menu, MenuItem, SubMenu, MenuGroup, MenuDivider } from './Menu';
export type {
  MenuProps,
  MenuItemProps,
  SubMenuProps,
  MenuGroupProps,
  MenuDividerProps,
} from './Menu';
