# AMAS Decision Layer - 决策层内部实现

> **重要说明**：本目录为 AMAS 决策层的**内部实现**，不应被外部服务直接引用。
>
> - **所属模块**：`adapters/` 的私有依赖
> - **访问权限**：仅限 `core/engine.ts` 和 `adapters/` 内部使用
> - **架构原则**：外部服务应通过 `adapters/` 提供的统一接口访问决策能力

## 目录结构

```
decision/
├── README.md                        # 本文档
├── ensemble.ts                      # 集成学习框架 (2078行)
├── explain.ts                       # 可解释性引擎 (443行)
├── guardrails.ts                    # 安全约束机制 (183行)
├── mapper.ts                        # 动作映射器 (173行)
├── fallback.ts                      # 降级策略 (302行)
└── multi-objective-decision.ts      # 多目标优化决策 (214行)
```

**总计**: 约 3,393 行代码

## 核心职责

### 1. **ensemble.ts** - 集成学习框架

- **功能**：多学习器集成决策
- **成员**：Thompson Sampling, LinUCB, ACT-R, Heuristic
- **策略**：加权投票 + 动态权重调整
- **使用者**：`adapters/ensemble-adapter.ts`, `core/engine.ts`

### 2. **explain.ts** - 可解释性引擎

- **功能**：生成决策解释和因素分析
- **输出**：
  - `generateExplanation()` - 简短解释
  - `generateDetailedExplanation()` - 详细因素分析
  - `generateEnhancedExplanation()` - 增强解释（含算法信息）
  - `generateSuggestion()` - 学习建议
- **使用者**：`core/engine.ts`, `amas/index.ts`

### 3. **guardrails.ts** - 安全约束机制

- **功能**：策略安全约束
- **保护类型**：
  - 疲劳度保护 (`applyFatigueProtection`)
  - 动机保护 (`applyMotivationProtection`)
  - 注意力保护 (`applyAttentionProtection`)
  - 趋势保护 (`applyTrendProtection`)
- **使用者**：`core/engine.ts`, `amas/index.ts`

### 4. **mapper.ts** - 动作映射器

- **功能**：Action ↔ StrategyParams 双向映射
- **关键函数**：
  - `mapActionToStrategy()` - 动作映射为策略（带平滑）
  - `mapStrategyToAction()` - 策略逆向映射为动作
  - `computeStrategyDelta()` - 策略变化幅度
- **使用者**：`core/engine.ts`, `amas/index.ts`

### 5. **fallback.ts** - 降级策略

- **功能**：异常/熔断时的安全降级
- **策略**：
  - `intelligentFallback()` - 智能降级（基于状态）
  - `safeFallback()` - 安全默认策略
- **使用者**：`core/engine.ts`

### 6. **multi-objective-decision.ts** - 多目标优化

- **功能**：基于学习目标的策略调整
- **指标**：短期效果、长期记忆、学习效率
- **使用者**：`core/engine.ts`

## 依赖关系分析

### 内部依赖（合理）

```
core/engine.ts
├── imports ensemble.ts
├── imports mapper.ts
├── imports guardrails.ts
├── imports explain.ts
├── imports fallback.ts
└── imports multi-objective-decision.ts

adapters/ensemble-adapter.ts
└── imports ensemble.ts
```

### 外部暴露（需要评估）

```
amas/index.ts (公共API)
├── exports mapper (4个函数)
├── exports guardrails (8个函数)
├── exports explain (4个函数)
└── exports ensemble (6个类型+类)
```

## 架构评估

### ✅ 合理的设计

1. **职责清晰**
   - `decision/` 专注决策层核心逻辑
   - `adapters/` 提供统一接口封装
   - 分层明确，各司其职

2. **内部依赖正确**
   - `core/engine.ts` 作为核心编排层，依赖 decision/ 合理
   - `adapters/` 复用 decision/ 避免重复实现

3. **实用工具暴露**
   - `mapper`, `guardrails`, `explain` 是通用工具
   - 可被多个模块复用（不仅限于 engine）

### ⚠️ 需要优化的点

1. **公共API过度暴露**
   - `amas/index.ts` 暴露了所有 decision/ 函数
   - 外部服务可能直接依赖 decision/ 而非 adapters/
   - **建议**：明确区分"内部工具"和"公共API"

2. **文档不足**
   - 缺少架构说明和使用指南
   - 外部开发者不清楚应该使用 adapters/ 还是 decision/
   - **建议**：添加 README.md 和使用示例

## 重构建议

### 方案 A：保持现状 + 文档化（推荐）

**优点**：

- 无需修改代码，零风险
- 通过文档明确架构边界
- 保留工具函数的灵活性

**实施步骤**：

1. ✅ 添加 `decision/README.md`（本文档）
2. ✅ 在 `adapters/README.md` 中说明依赖关系
3. 在 `amas/index.ts` 添加注释区分内部/公共API
4. 在服务层添加 lint 规则禁止直接导入 decision/

### 方案 B：创建 decision/internal.ts

**目标**：将 decision/ 标记为内部实现

```typescript
// decision/internal.ts
export * from './mapper';
export * from './guardrails';
export * from './explain';
export * from './fallback';
export * from './multi-objective-decision';

// 外部应通过 core/engine 或 adapters/ 访问
```

**优点**：显式标记为内部API
**缺点**：需要修改导入路径

### 方案 C：移动到 core/decision/

**目标**：将 decision/ 移入 core/ 作为私有子模块

```
core/
├── engine.ts
└── decision/       # 引擎内部决策模块
    ├── ensemble.ts
    ├── mapper.ts
    └── ...
```

**优点**：目录结构更清晰
**缺点**：大规模重构，影响现有导入

## 最终建议

### 🎯 采用方案 A：保持现状 + 文档化

**理由**：

1. **decision/ 设计合理**：职责清晰，不是冗余代码
2. **工具函数有价值**：mapper, guardrails, explain 是通用工具
3. **adapters/ 正确复用**：避免重复实现集成逻辑
4. **风险最小**：无需修改代码，仅完善文档

**具体行动**：

- ✅ 本 README.md 已创建
- ✅ adapters/README.md 已包含架构说明
- 🔲 在 amas/index.ts 添加注释区分API级别
- 🔲 在服务层使用 adapters/ 而非直接导入 decision/

## 使用示例

### ❌ 不推荐（直接使用 decision/）

```typescript
// services/learning.service.ts
import { mapActionToStrategy } from '../amas/decision/mapper';
import { applyGuardrails } from '../amas/decision/guardrails';
```

### ✅ 推荐（通过 adapters/ 或 core/）

```typescript
// services/learning.service.ts
import { EnsembleAdapter } from '../amas/adapters';
// 或
import { AMASEngine } from '../amas/core/engine';
```

### ✅ 工具函数可以公开使用

```typescript
// 如果确实需要直接使用工具函数（而非完整决策流程）
import { generateExplanation, applyGuardrails, mapActionToStrategy } from '../amas'; // 从 amas/index.ts 导出
```

## 相关文档

- [`adapters/README.md`](../adapters/README.md) - 适配器架构说明
- [`core/README.md`](../core/README.md) - 核心引擎文档
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - AMAS 整体架构

---

**维护者**: AMAS Team
**最后更新**: 2025-12-12
**版本**: 1.0.0
