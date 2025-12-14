# AMAS 核心接口与适配器

本文档说明 AMAS（自适应多维度感知学习算法）的核心接口定义和适配器实现。

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   核心接口层                         │
│  (interfaces/index.ts)                              │
│                                                     │
│  • IFeatureBuilder    - 特征构建接口                 │
│  • IDecisionPolicy    - 决策策略接口                 │
│  • IRewardEvaluator   - 奖励评估接口                 │
│  • IWordSelector      - 选词策略接口                 │
└─────────────────────────────────────────────────────┘
                          ↑
                          │ 实现
                          │
┌─────────────────────────────────────────────────────┐
│                   适配器层                           │
│  (adapters/)                                        │
│                                                     │
│  • LinUCBAdapter      - LinUCB 算法适配器            │
│  • ThompsonAdapter    - Thompson Sampling 适配器     │
│  • EnsembleAdapter    - 集成学习框架适配器            │
└─────────────────────────────────────────────────────┘
                          ↑
                          │ 复用
                          │
┌─────────────────────────────────────────────────────┐
│                 现有学习算法                          │
│  (learning/, decision/)                             │
│                                                     │
│  • LinUCB             - 线性上置信界算法              │
│  • ThompsonSampling   - Thompson 采样算法            │
│  • EnsembleLearning   - 集成学习框架                 │
└─────────────────────────────────────────────────────┘
```

## 核心接口

### 1. IDecisionPolicy（决策策略接口）

决策策略负责选择最优学习策略参数（Action），包含：

- `interval_scale`: 间隔缩放因子
- `new_ratio`: 新词比例
- `difficulty`: 难度等级
- `batch_size`: 批量大小
- `hint_level`: 提示级别

**关键方法：**

```typescript
interface IDecisionPolicy {
  selectAction(
    state: UserState,
    actions: Action[],
    features: number[],
    context: DecisionContext,
  ): DecisionResult;

  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void;
}
```

**设计原则：**

- 对齐现有 Action/StrategyParams 结构
- 支持上下文感知决策
- 提供决策解释和置信度

### 2. IFeatureBuilder（特征构建接口）

特征构建器负责从原始事件和历史记录构建标准化特征向量。

**关键方法：**

```typescript
interface IFeatureBuilder {
  buildFromEvent(event: RawEvent, userState: UserState, userId: string): number[];

  buildFromHistory(events: RawEvent[], userState: UserState, userId: string): number[];
}
```

### 3. IRewardEvaluator（奖励评估接口）

奖励评估器负责计算即时奖励值，指导策略学习。

**关键方法：**

```typescript
interface IRewardEvaluator {
  computeImmediate(event: RawEvent, state: UserState, previousState?: UserState): RewardDetails;
}
```

### 4. IWordSelector（选词策略接口）

选词策略负责基于策略参数选择具体单词。

**关键方法：**

```typescript
interface IWordSelector {
  selectWords(context: WordSelectionContext): Promise<SelectedWord[]>;
}
```

**职责分离：**

- 决策层（IDecisionPolicy）输出策略参数
- 选词层（IWordSelector）基于参数选择具体单词
- 两层解耦，各司其职

## 适配器实现

### 1. LinUCBAdapter

将现有的 LinUCB 算法适配到统一决策接口。

**特点：**

- 基于上下文的动态策略选择
- 自然的探索-利用平衡（UCB）
- 适合稳定期利用

**使用示例：**

```typescript
const policy = new LinUCBAdapter({
  alpha: 0.5, // 探索系数
  lambda: 1.0, // 正则化系数
  dimension: 22, // 特征维度
});

const result = policy.selectAction(state, actions, features, context);
policy.updateModel(result.action, reward, features, context);
```

### 2. ThompsonAdapter

将现有的 Thompson Sampling 算法适配到统一决策接口。

**特点：**

- 自然的探索-利用平衡（概率匹配）
- 冷启动友好（先验分布引导）
- 计算高效（O(|A|) 时间复杂度）

**使用示例：**

```typescript
const policy = new ThompsonAdapter({
  priorAlpha: 1.0,
  priorBeta: 1.0,
  enableSoftUpdate: false,
});

const result = policy.selectAction(state, actions, features, context);
policy.updateModel(result.action, reward, features, context);
```

### 3. EnsembleAdapter

将现有的集成学习框架适配到统一决策接口。

**特点：**

- 冷启动阶段由 ColdStartManager 主导
- 成熟阶段多学习器加权投票
- 动态权重根据表现自适应调整

**使用示例：**

```typescript
const policy = new EnsembleAdapter();

const result = policy.selectAction(state, actions, features, context);
policy.updateModel(result.action, reward, features, context);

// 查看集成状态
console.log('阶段:', policy.getPhase());
console.log('权重:', policy.getWeights());
console.log('进度:', policy.getColdStartProgress());
```

## 使用示例

详细的使用示例请参见：

- `adapters/examples.ts` - 完整的使用示例代码

运行示例：

```bash
ts-node packages/backend/src/amas/adapters/examples.ts
```

## 类型兼容性

所有适配器都实现了 `IDecisionPolicy` 接口，因此可以互换使用：

```typescript
// 声明为接口类型
const policy: IDecisionPolicy = new LinUCBAdapter();

// 或切换为其他实现
const policy: IDecisionPolicy = new ThompsonAdapter();
const policy: IDecisionPolicy = new EnsembleAdapter();

// 使用方式完全一致
const result = policy.selectAction(state, actions, features, context);
policy.updateModel(action, reward, features, context);
```

## 扩展性

要添加新的决策策略，只需：

1. 实现 `IDecisionPolicy` 接口
2. 实现 `selectAction` 和 `updateModel` 方法
3. 可选：实现便捷方法（如 `reset()`, `getUpdateCount()` 等）

示例：

```typescript
class MyCustomAdapter implements IDecisionPolicy {
  selectAction(state, actions, features, context): DecisionResult {
    // 实现决策逻辑
    return {
      action: selectedAction,
      confidence: 0.8,
      explanation: '自定义策略',
    };
  }

  updateModel(action, reward, features, context): void {
    // 实现更新逻辑
  }

  getName(): string {
    return 'MyCustomAdapter';
  }

  getVersion(): string {
    return '1.0.0';
  }
}
```

## 设计目标

1. **职责分离**：决策与选词解耦
2. **接口统一**：所有策略遵循相同接口
3. **复用现有**：适配器模式复用现有算法
4. **易于扩展**：新策略只需实现接口
5. **类型安全**：完整的 TypeScript 类型定义

## 下一步

- [ ] 实现 IFeatureBuilder 的具体适配器
- [ ] 实现 IRewardEvaluator 的具体适配器
- [ ] 实现 IWordSelector 的具体实现
- [ ] 添加单元测试
- [ ] 添加集成测试
- [ ] 完善文档和示例

## decision/ 目录说明

`decision/` 是 adapters/ 的**内部依赖**，提供决策层的核心实现：

### 依赖关系

```
adapters/ (适配器层)
    ↓ 依赖
decision/ (决策层内部实现)
    ├── ensemble.ts      - 集成学习框架
    ├── mapper.ts        - 动作映射
    ├── guardrails.ts    - 安全约束
    ├── explain.ts       - 可解释性
    └── ...
```

### 为什么不删除 decision/?

1. **避免重复实现**
   - `EnsembleAdapter` 复用 `decision/ensemble.ts` 的集成逻辑
   - 无需重新实现多学习器投票和权重更新

2. **通用工具函数**
   - `mapper.ts`: Action ↔ StrategyParams 映射
   - `guardrails.ts`: 安全约束应用
   - `explain.ts`: 决策解释生成
   - 这些工具可被多个模块复用

3. **核心引擎依赖**
   - `core/engine.ts` 需要直接访问决策工具
   - adapters/ 是可选的抽象层，不应成为必经之路

### 访问原则

- ✅ **adapters/ 内部**：可以导入 decision/
- ✅ **core/engine.ts**：可以导入 decision/
- ⚠️ **服务层**：应优先使用 adapters/ 或 AMASEngine
- ❌ **前端/API层**：不应直接导入 decision/

详见：[decision/README.md](../decision/README.md)

## 相关文件

```
packages/backend/src/amas/
├── interfaces/
│   └── index.ts              # 核心接口定义
├── adapters/
│   ├── index.ts              # 适配器统一导出
│   ├── linucb-adapter.ts     # LinUCB 适配器
│   ├── thompson-adapter.ts   # Thompson 适配器
│   ├── ensemble-adapter.ts   # Ensemble 适配器
│   ├── examples.ts           # 使用示例
│   └── README.md             # 本文档
├── learning/
│   ├── linucb.ts             # LinUCB 算法实现
│   ├── thompson-sampling.ts  # Thompson Sampling 实现
│   └── ...
└── decision/                 # 决策层内部实现（adapters的私有依赖）
    ├── README.md             # 决策层架构说明
    ├── ensemble.ts           # 集成学习框架
    ├── mapper.ts             # 动作映射器
    ├── guardrails.ts         # 安全约束
    ├── explain.ts            # 可解释性引擎
    ├── fallback.ts           # 降级策略
    └── multi-objective-decision.ts  # 多目标优化
```
