# AMAS 策略层和遗忘曲线重构 (T1a.3 & T1a.4)

## 概述

本次重构完成了两个核心任务：

1. **T1a.3**: 统一遗忘曲线实现，添加接口封装
2. **T1a.4**: 创建策略注册表

## T1a.3: 遗忘曲线适配器

### 文件位置

`packages/backend/src/amas/modeling/forgetting-curve.ts`

### 实现内容

在保留原有函数式接口的基础上，新增了 `ForgettingCurveAdapter` 类，提供面向对象的访问方式。

#### 现有函数（保留不变）

```typescript
// 计算遗忘因子
export function calculateForgettingFactor(trace: MemoryTrace): number;

// 更新半衰期
export function updateHalfLife(
  currentHalfLife: number,
  wasCorrect: boolean,
  responseTime: number,
  cogConfig?: CognitiveConfig,
): HalfLifeUpdate;

// 计算最优复习间隔
export function computeOptimalInterval(halfLife: number, target: number): number;

// 估计保持率
export function estimateRetention(halfLife: number, daysElapsed: number): number;

// 批量计算
export function batchCalculateForgettingFactors(traces: MemoryTrace[]): Map<string, number>;
```

#### 新增适配器类

```typescript
export class ForgettingCurveAdapter {
  // 计算记忆保持率
  calculateRetention(trace: MemoryTrace): number;

  // 预测下次复习时间
  predictNextReview(halfLife: number, targetRetention?: number): number;

  // 更新半衰期
  updateHalfLife(
    currentHalfLife: number,
    wasCorrect: boolean,
    responseTime: number,
    cogConfig?: CognitiveConfig,
  ): HalfLifeUpdate;

  // 估计保持率
  estimateRetention(halfLife: number, daysElapsed: number): number;

  // 批量计算保持率
  batchCalculateRetention(traces: MemoryTrace[]): Map<string, number>;
}
```

### 使用示例

```typescript
import { ForgettingCurveAdapter, MemoryTrace } from '@/amas';

const adapter = new ForgettingCurveAdapter();

// 计算保持率
const trace: MemoryTrace = {
  wordId: 'word-001',
  lastReviewTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2天前
  reviewCount: 3,
  averageAccuracy: 0.8,
  personalHalfLife: 5.0,
};

const retention = adapter.calculateRetention(trace);
console.log('记忆保持率:', retention); // 0.6703

// 预测下次复习
const nextReview = adapter.predictNextReview(5.0, 0.8);
console.log('建议复习间隔:', nextReview, '天'); // 1.12 天
```

## T1a.4: 策略注册表

### 文件位置

`packages/backend/src/amas/policies/`

### 核心文件

1. **policy-registry.ts** - 策略注册表实现
2. **fatigue-based.ts** - 基于疲劳度的示例策略
3. **examples.ts** - 使用示例
4. **index.ts** - 模块导出

### 接口定义

```typescript
export interface ISimpleDecisionPolicy {
  getName(): string;
  getVersion(): string;
  decide(state: UserState, context?: Record<string, unknown>): StrategyParams;
  getDescription(): string;
}

export class PolicyRegistry {
  register(name: string, factory: () => ISimpleDecisionPolicy): void;
  get(name: string): ISimpleDecisionPolicy;
  has(name: string): boolean;
  list(): string[];
  unregister(name: string): boolean;
  clear(): void;
  size(): number;
}
```

### 使用示例

#### 1. 注册和使用内置策略

```typescript
import { policyRegistry, createFatigueBasedPolicy } from '@/amas';

// 注册策略
policyRegistry.register('fatigue', createFatigueBasedPolicy);

// 获取策略
const policy = policyRegistry.get('fatigue');

// 使用策略
const userState: UserState = {
  A: 0.5, // 注意力
  F: 0.8, // 疲劳度
  M: -0.2, // 动机
  C: { mem: 0.6, speed: 0.5, stability: 0.7 },
  conf: 0.7,
  ts: Date.now(),
};

const strategy = policy.decide(userState);
console.log('策略输出:', strategy);
// {
//   batch_size: 8,
//   difficulty: 'mid',
//   hint_level: 1,
//   interval_scale: 1.0,
//   new_ratio: 0.2
// }
```

#### 2. 创建自定义策略

```typescript
import { ISimpleDecisionPolicy, policyRegistry } from '@/amas';
import { StrategyParams, UserState } from '@/amas/types';

class CustomPolicy implements ISimpleDecisionPolicy {
  getName() {
    return 'CustomPolicy';
  }
  getVersion() {
    return '1.0.0';
  }
  getDescription() {
    return '自定义策略';
  }

  decide(state: UserState): StrategyParams {
    // 自定义决策逻辑
    return {
      batch_size: 10,
      difficulty: state.C.mem > 0.7 ? 'hard' : 'mid',
      hint_level: state.F > 0.7 ? 2 : 0,
      interval_scale: 1.0,
      new_ratio: 0.3,
    };
  }
}

// 注册自定义策略
policyRegistry.register('custom', () => new CustomPolicy());
```

#### 3. 策略管理

```typescript
// 列出所有策略
const policies = policyRegistry.list();
console.log('已注册策略:', policies); // ['fatigue', 'custom']

// 检查策略是否存在
if (policyRegistry.has('fatigue')) {
  const policy = policyRegistry.get('fatigue');
  // 使用策略...
}

// 取消注册
policyRegistry.unregister('custom');

// 获取策略数量
const count = policyRegistry.size();
```

## 内置策略：FatigueBasedPolicy

### 策略说明

基于用户疲劳度的自适应策略，根据疲劳状态动态调整学习参数。

### 决策逻辑

1. **计算压力指数**

   ```
   stressIndex = fatigue * 0.5 + (1 - attention) * 0.3 + (1 - (motivation + 1) / 2) * 0.2
   ```

2. **根据压力调整参数**
   - **高压力 (stressIndex > 0.7)**: 轻松模式
     - batch_size: 5
     - difficulty: easy
     - hint_level: 2
     - interval_scale: 0.8
     - new_ratio: 0.1

   - **中等压力 (0.4 < stressIndex <= 0.7)**: 平衡模式
     - batch_size: 8
     - difficulty: mid
     - hint_level: 1
     - interval_scale: 1.0
     - new_ratio: 0.2

   - **低压力 (stressIndex <= 0.4)**: 挑战模式
     - batch_size: 12
     - difficulty: mid/hard (根据记忆力)
     - hint_level: 0
     - interval_scale: 1.2
     - new_ratio: 0.2/0.3 (根据速度)

## 测试验证

运行测试脚本验证功能：

```bash
cd packages/backend
npx ts-node src/amas/__tests__/t1a3-t1a4-validation.ts
```

测试覆盖：

- ✅ 策略注册和查询
- ✅ 策略决策功能
- ✅ 遗忘曲线保持率计算
- ✅ 复习间隔预测
- ✅ 半衰期更新
- ✅ 批量保持率计算

## 架构优势

### 遗忘曲线适配器

1. 保持向后兼容：现有函数式接口不变
2. 提供面向对象接口：便于策略类使用
3. 统一命名：方法名更符合业务语义（calculateRetention vs calculateForgettingFactor）

### 策略注册表

1. 插件化架构：支持动态注册策略
2. 类型安全：完整的 TypeScript 类型定义
3. 易于扩展：实现 ISimpleDecisionPolicy 即可添加新策略
4. 全局单例：通过 policyRegistry 统一管理

## 与现有系统集成

### 遗忘曲线

- 现有代码继续使用函数式接口：无影响
- 新代码可以选择使用适配器类：更好的封装

### 决策策略

- 与 interfaces/index.ts 中的 IDecisionPolicy 解耦
- ISimpleDecisionPolicy 专注于状态到策略的映射
- 不涉及模型更新，更轻量级

## 后续扩展

### 可添加的策略类型

1. **MotivationBasedPolicy** - 基于动机的策略
2. **PerformanceBasedPolicy** - 基于表现的策略
3. **TimeBasedPolicy** - 基于时间的策略
4. **HybridPolicy** - 混合策略

### 策略组合

可以实现策略组合器，支持多策略加权融合：

```typescript
class EnsemblePolicyStrategy implements ISimpleDecisionPolicy {
  constructor(private policies: Array<{ policy: ISimpleDecisionPolicy; weight: number }>) {}

  decide(state: UserState): StrategyParams {
    // 加权融合多个策略的输出
  }
}
```

## 总结

✅ T1a.3 完成：遗忘曲线适配器已实现并通过测试
✅ T1a.4 完成：策略注册表已实现并提供示例策略
✅ 文档完善：提供详细的使用示例和测试脚本
✅ 类型安全：完整的 TypeScript 类型定义
✅ 向后兼容：不影响现有代码
