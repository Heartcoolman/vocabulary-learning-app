# Change: Unify Frontend Design System

## Why

前端代码库存在大量设计不一致问题：图标混用（Phosphor Icons 与 Emoji）、颜色不统一（blue vs indigo vs purple）、组件样式不规范（未使用设计系统 token）。这些问题影响用户体验一致性和代码可维护性。

## What Changes

### 1. 图标系统统一

- **BREAKING**: 移除所有 UI 中的 Emoji（包括 CMS/Markdown），替换为 Phosphor Icons
- 将所有直接 `@phosphor-icons/react` 导入迁移到集中式 `Icon.tsx`
- 统一图标权重为 **duotone**
- 补充缺失的图标导出（Timer, Hourglass, CloudSun, Flame 等）

### 2. 颜色系统统一

- **BREAKING**: **全局禁用** `indigo-*`，全部替换为 `blue-*`
- 统一主色调：`blue-500` 到 `blue-600` 渐变
- Purple 仅用于**学习相关功能**（mastery、flashcard、progress、achievement、study）
- 渐变规则：主操作 blue-to-blue，学习场景 blue-to-purple
- 统一 focus ring 颜色为 `blue-500`
- **Dark Mode 同步处理**：所有颜色替换必须同时更新 `dark:` 变体
- **WCAG AA 合规**：所有文本/背景对比度 ≥ 4.5:1

### 3. 组件样式统一

- 统一圆角：使用 `rounded-button`、`rounded-card` token
- **紧凑场景例外**：Table/Toolbar/Pagination/InputGroup 内允许 `rounded-md`
- 统一阴影（三级映射）：
  - Card → `shadow-soft`
  - Modal/Dropdown → `shadow-elevated`
  - Tooltip/Popover → `shadow-floating`
- 统一过渡：使用 `transition-all duration-g3-fast ease-g3`
- 统一卡片样式：`bg-white/80 backdrop-blur-sm`

### 4. 按钮样式统一

- **全部迁移**：所有原生 `<button>` 必须迁移到 `<Button>` 组件
- 主按钮使用渐变：`bg-gradient-to-br from-blue-500 to-blue-600`
- 统一 hover/active 状态：`active:scale-[0.98]`

## Confirmed Constraints (User Decisions)

| 决策点         | 选择                          |
| -------------- | ----------------------------- |
| Emoji 替换范围 | 全部替换（包括 CMS/Markdown） |
| 图标权重       | duotone                       |
| Indigo 策略    | 全局禁用                      |
| Purple 用途    | 扩展到学习相关功能            |
| 紧凑场景圆角   | 允许 rounded-md               |
| 阴影映射       | 三级映射                      |
| 渐变配对       | blue-to-blue + blue-to-purple |
| 迁移策略       | 水平分片（4 阶段）            |
| 按钮迁移       | 全部迁移                      |
| Dark Mode      | 同步处理                      |
| 对比度标准     | WCAG AA (4.5:1)               |
| 测试方案       | Playwright 截图               |

## Impact

### Affected Specs

- 新增: `frontend-design-system` (设计系统规范)

### Affected Code

- `packages/frontend/src/components/Icon.tsx` - 补充图标导出
- `packages/frontend/src/pages/admin/*.tsx` - 颜色和样式修复 (约 12 个文件)
- `packages/frontend/src/pages/*.tsx` - 颜色和样式修复 (约 15 个文件)
- `packages/frontend/src/components/*.tsx` - 组件样式修复 (约 20 个文件)

### Breaking Changes

- Emoji 在 UI 中将被移除，可能影响视觉识别
- indigo 色调将被替换，页面外观会有细微变化

### Risk Assessment

- 低风险：纯样式变更，不影响功能逻辑
- 需要 Playwright 视觉回归测试确认变更效果
- 需要 WCAG AA 对比度验证

## Migration Strategy

### Phase 1: Foundation (基础设施)

1. 更新 `Icon.tsx` 添加缺失图标（duotone 权重）
2. 验证 `tailwind.config.js` token 完整性
3. 确保 `Button.tsx` 支持所有必需变体

### Phase 2: Admin Pages (低风险)

1. 迁移 `src/pages/admin/*.tsx` (~12 文件)
2. 更新 admin 组件
3. Playwright 截图验证

### Phase 3: User Pages (核心)

1. 迁移 `src/pages/*.tsx` (~15 文件)
2. 更新共享组件
3. 完整视觉回归测试

### Phase 4: Cleanup (清理)

1. 移除遗留 token
2. 添加 ESLint 规则强制执行
3. 更新文档
