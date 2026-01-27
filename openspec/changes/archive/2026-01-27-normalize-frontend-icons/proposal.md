# Proposal: normalize-frontend-icons

## Why

前端 434 处图标使用了非规范权重（bold/fill/regular），导致视觉风格不一致。需要统一为 duotone 权重，同时保护具有语义含义的例外场景。

## Summary

通过 IconContext.Provider 集中管理默认图标权重为 duotone，删除所有非例外的显式 weight 属性，并添加 ESLint 规则防止回退。

## Problem Statement

1. **图标权重不一致**：317 处 `bold`、112 处 `fill`、5 处 `regular`，共 434 处不合规（跨 120+ 文件）
2. **无集中管控机制**：缺乏默认权重设定，每个图标依赖开发者手动指定
3. **无回退防护**：缺乏自动化规则阻止新代码引入非规范权重

## Scope

### In Scope

- 添加 `IconContext.Provider` 至 App 根级别，设置默认 `weight="duotone"`
- 删除所有非例外图标的显式 `weight` 属性（含冗余的 `weight="duotone"`）
- 保留例外类别的现有 weight 属性不变
- 添加自定义 ESLint 规则防止回退

### Out of Scope

- 测试文件中的 emoji mock（规范允许）
- Console log 中的 emoji（规范允许）
- 新增图标或改变图标语义
- 图标尺寸调整

## Resolved Constraints

### C1: 实现方式

使用 `IconContext.Provider` 在 `App.tsx` 根级别设置 `{ weight: "duotone" }` 为默认值。

### C2: 例外类别（保留现有 weight）

| 类别           | 图标组件                                           | 允许的 weight       | 说明                                          |
| -------------- | -------------------------------------------------- | ------------------- | --------------------------------------------- |
| 星级评分       | Star                                               | fill/regular (条件) | `weight={score < level ? "fill" : "regular"}` |
| 加载动画       | CircleNotch                                        | bold                | 旋转加载指示器，需粗线条                      |
| 密码可见性     | Eye                                                | fill/regular (条件) | 切换显示/隐藏密码                             |
| Tab/Nav 激活态 | 任意图标                                           | fill/regular (条件) | `weight={isActive ? "fill" : "regular"}`      |
| 徽章等级       | Star, 任意图标                                     | fill/regular (条件) | 等级填充指示                                  |
| 主题切换       | Sun, Moon                                          | fill                | 激活状态使用 fill                             |
| 状态指示       | CheckCircle, Warning, XCircle, WarningCircle, Info | fill/bold           | 保留语义强调                                  |

### C3: 冗余属性清理

删除所有已存在的 `weight="duotone"` 属性（225 处），由 IconContext 默认值覆盖。

### C4: 回退防护

添加自定义 ESLint 规则：在非白名单文件/组件中使用 `weight` 属性时报错。

## Actual Scope (Verified)

| 权重                      | 数量 | 文件数 |
| ------------------------- | ---- | ------ |
| `bold`                    | 317  | 93     |
| `fill`                    | 112  | 54     |
| `regular`                 | 5    | 4      |
| `duotone`（冗余，需删除） | 225  | 77     |

## Risk Assessment

- **中等风险**（由低风险上调）：影响范围 5x 于初始估计
- **视觉变化**：duotone 使用透明度双色层，较 bold/fill 更柔和；小尺寸图标（12-16px）需关注可见性
- **暗色模式**：duotone 的 20% 透明度次层在深色背景上可能可见性不足，需验证
- **测试影响**：snapshot 测试可能需要更新

## PBT Properties

### P1: IconContext 传播 [Invariant]

App 根级必须包含唯一的 `IconContext.Provider`，`value.weight === "duotone"`。

- 边界：Provider 缺失 / weight 非 duotone / 嵌套覆盖
- 伪造策略：渲染无 Provider 的测试 App，断言默认图标渲染为 regular（库默认）而非 duotone

### P2: 非例外图标无 weight 属性 [Bounds]

所有非例外类别的图标组件 JSX 不包含 `weight` 属性。

- 边界：spread props 传入 weight / 动态 weight 表达式
- 伪造策略：AST 扫描所有 JSX，排除例外组件后断言无 weight 属性

### P3: 例外图标保留 weight [Invariant Preservation]

例外类别图标必须保留其语义 weight 属性。

- 边界：CircleNotch 无 bold / Star 评分无条件 fill / 状态图标无 fill|bold
- 伪造策略：生成例外组件列表，断言迁移前后 weight 属性和条件表达式不变

### P4: 冗余 duotone 消除 [Idempotency]

迁移后代码中不存在 `weight="duotone"` 字面量；二次执行迁移无 diff。

- 伪造策略：插入 `weight="duotone"` / `weight={'duotone'}` 变体，验证均被移除

### P5: 导入路径完整性 [Invariant]

除 `Icon.tsx` 外，无文件直接从 `@phosphor-icons/react` 导入。

- 伪造策略：扫描所有 .tsx 的 ImportDeclaration，排除 Icon.tsx 后断言无 phosphor 直接导入

### P6: ESLint 规则有效性 [Monotonicity]

规则在非例外图标使用任何 weight 属性时报错，在例外图标使用允许的 weight 时不报错。

- 伪造策略：生成覆盖所有有效/无效组合的代码片段，断言报错数量精确匹配

## Success Criteria

1. `IconContext.Provider` 存在于 App 根级，`weight: "duotone"`
2. 非例外图标无显式 `weight` 属性
3. 例外图标保留语义 weight
4. 无 `weight="duotone"` 冗余属性
5. ESLint 规则通过且无误报
6. 现有测试全部通过
7. 暗色模式下图标可见性验证通过

## Related Specs

- `openspec/specs/frontend-design-system/spec.md` - Unified Icon System
