# AMAS物理文件重组计划

## 当前状态分析

**当前文件数**: 115个TypeScript文件
**目标文件数**: 30-40个文件
**减少比例**: 约65-74%

### 当前目录结构与文件数量

```
amas/ (115个文件)
├── adapters/           5个文件   ✓ 保留
├── cold-start/         2个文件   → 合并到 core/cold-start.ts
├── common/             7个文件   → 分散到 safety/ 和 utils/
├── config/             5个文件   ✓ 保留
├── core/               5个文件   → 合并到 core/loops.ts
├── decision/           6个文件   ⚠️ 删除（被adapters替代）
├── engine/            11个文件   → 合并到 core/engine.ts
├── evaluation/         5个文件   → 合并到 rewards/evaluators.ts
├── interfaces/         1个文件   ✓ 保留并扩展
├── learning/          12个文件   ⚠️ 删除（被adapters替代）
├── modeling/          13个文件   → 合并到 models/cognitive.ts
├── models/             4个文件   → 合并到 models/detectors.ts
├── monitoring/         5个文件   → 移到外层 (src/monitoring/)
├── optimization/       8个文件   → 合并到 config/optimizer.ts
├── perception/         1个文件   → 合并到 features/builder.ts
├── policies/           7个文件   → 精简到 policies/registry.ts
├── repositories/       3个文件   → 移到外层 (src/repositories/)
├── rewards/            2个文件   ✓ 保留并扩展
├── services/           1个文件   → 移到外层 (src/services/)
├── tracking/           1个文件   → 合并到 models/memory.ts
├── utils/              1个文件   ✓ 保留并扩展
├── versioning/         4个文件   → 合并到 config/versioning.ts
└── workers/            3个文件   ✓ 保留

传统文件:
├── engine.ts           兼容层    → 删除（使用core/index）
├── index.ts            总导出    ✓ 保留
└── types.ts            类型定义  ✓ 保留
```

## 目标结构（30-40个文件）

```
amas/
├── core/                  # 统一入口、在线循环、离线循环 (4个文件)
│   ├── index.ts           # 核心导出
│   ├── engine.ts          # 引擎整合 (合并11个engine文件)
│   ├── loops.ts           # 在线/离线循环 (合并core/的4个文件)
│   └── cold-start.ts      # 冷启动 (合并cold-start/2个文件)
│
├── interfaces/            # 四个核心接口 (2个文件)
│   ├── index.ts           # 接口定义
│   └── types.ts           # 接口相关类型
│
├── features/              # 特征构建 (2个文件)
│   ├── index.ts           # 导出
│   └── builder.ts         # 特征构建器 (合并perception/)
│
├── models/                # 认知模型、遗忘曲线、ACT-R记忆 (5个文件)
│   ├── index.ts           # 导出
│   ├── cognitive.ts       # 认知模型 (合并modeling/13个文件)
│   ├── detectors.ts       # 检测器 (合并models/4个文件)
│   ├── memory.ts          # 记忆追踪 (合并tracking/)
│   └── forgetting.ts      # 遗忘曲线 (从modeling/提取)
│
├── policies/              # 策略注册表、各种策略 (4个文件)
│   ├── index.ts           # 导出
│   ├── registry.ts        # 策略注册表
│   ├── implementations.ts # 策略实现 (合并policies/的4-5个实现文件)
│   └── examples.ts        # 使用示例 (保留)
│
├── rewards/               # 即时奖励、延迟奖励 (3个文件)
│   ├── index.ts           # 导出
│   ├── immediate.ts       # 即时奖励 (保留)
│   └── evaluators.ts      # 延迟奖励和评估器 (合并evaluation/5个文件)
│
├── safety/                # 安全护栏、熔断器 (3个文件)
│   ├── index.ts           # 导出
│   ├── circuit-breaker.ts # 熔断器 (从common/提取)
│   └── guardrails.ts      # 护栏 (从decision/提取)
│
├── config/                # 参数管理、特性开关 (6个文件)
│   ├── index.ts           # 导出
│   ├── action-space.ts    # 动作空间 (保留)
│   ├── feature-flags.ts   # 特性开关 (保留)
│   ├── user-params.ts     # 用户参数 (保留)
│   ├── optimizer.ts       # 优化器配置 (合并optimization/8个文件)
│   └── versioning.ts      # 版本管理 (合并versioning/4个文件)
│
├── adapters/              # 算法适配器 (保持5个文件)
│   ├── index.ts           # 导出
│   ├── linucb-adapter.ts  # LinUCB适配器 (保留)
│   ├── thompson-adapter.ts# Thompson适配器 (保留)
│   ├── ensemble-adapter.ts# 集成适配器 (保留)
│   └── examples.ts        # 使用示例 (保留)
│
├── workers/               # Worker处理 (保持3个文件)
│   ├── index.ts           # 导出
│   ├── pool.ts            # Worker池 (保留)
│   └── compute.worker.ts  # 计算Worker (保留)
│
├── utils/                 # 工具函数 (2个文件)
│   ├── index.ts           # 导出
│   └── helpers.ts         # 辅助函数 (合并common/的工具文件)
│
├── index.ts               # 总导出 (保留)
└── types.ts               # 全局类型 (保留)

总计: 37个文件 (符合30-40目标)
```

## 详细合并映射

### 1. core/ 目录整合 (11+5+2 → 4个文件)

#### core/engine.ts (合并11个engine文件)

```
合并:
- engine/engine-core.ts           → 核心引擎逻辑
- engine/engine-types.ts          → 类型定义
- engine/engine-feature-vector.ts → 特征向量
- engine/engine-decision-trace.ts → 决策追踪
- engine/engine-learning.ts       → 学习管理
- engine/engine-modeling.ts       → 建模管理
- engine/engine-persistence.ts    → 持久化
- engine/engine-resilience.ts     → 韧性管理
- engine/engine-isolation.ts      → 隔离管理
- engine/engine-reward-cache.ts   → 奖励缓存
- engine/index.ts                 → 导出

组织方式:
- 按功能分区域注释
- 使用 class AMASEngine 的私有方法组织
- 保持清晰的职责边界
```

#### core/loops.ts (合并5个core文件)

```
合并:
- core/online-loop.ts             → 在线循环
- core/online-loop.example.ts     → 示例 (注释掉或移到examples/)
- core/offline-loop.ts            → 离线循环
- core/offline-loop.example.ts    → 示例 (注释掉或移到examples/)
- core/index.ts                   → 导出

组织方式:
- class OnlineLoop
- class OfflineLoop
- 工厂函数
```

#### core/cold-start.ts (合并2个文件)

```
合并:
- cold-start/global-stats.ts      → 全局统计
- cold-start/new-user-initializer.ts → 新用户初始化

组织方式:
- class ColdStartManager
- 包含 GlobalStats 和 NewUserInitializer 逻辑
```

### 2. models/ 目录整合 (13+4+1+1 → 5个文件)

#### models/cognitive.ts (合并13个modeling文件)

```
合并:
- modeling/actr-memory.ts         → ACT-R记忆模型
- modeling/actr-memory-native.ts  → Native wrapper
- modeling/attention-monitor.ts   → 注意力监控
- modeling/chronotype.ts          → 生物钟类型
- modeling/cognitive-profiler.ts  → 认知画像
- modeling/fatigue-estimator.ts   → 疲劳估计
- modeling/fatigue-recovery.ts    → 疲劳恢复
- modeling/habit-recognizer.ts    → 习惯识别
- modeling/learning-style.ts      → 学习风格
- modeling/motivation-tracker.ts  → 动机追踪
- modeling/trend-analyzer.ts      → 趋势分析
- modeling/index.ts               → 导出
- (不包括 forgetting-curve.ts，单独提取)

组织方式:
- 按模块分组：记忆、注意力、疲劳、习惯、动机等
- 每个模块使用 export class
- 共享的辅助函数放在文件开头
```

#### models/forgetting.ts (单独提取)

```
提取:
- modeling/forgetting-curve.ts    → 遗忘曲线 (重要模型，单独文件)

理由:
- 遗忘曲线是核心算法
- 被多处引用
- 保持独立便于维护和测试
```

#### models/detectors.ts (合并4个models文件)

```
合并:
- models/emotion-detector.ts      → 情绪检测
- models/emotion-detector.example.ts → 示例
- models/flow-detector.ts         → 心流检测
- models/index.ts                 → 导出

组织方式:
- class EmotionDetector
- class FlowDetector
- 工厂函数
```

#### models/memory.ts (合并tracking文件)

```
合并:
- tracking/word-memory-tracker.ts → 单词记忆追踪

理由:
- 记忆追踪属于认知模型范畴
- 与 ACT-R 记忆模型紧密相关
```

### 3. rewards/ 目录整合 (2+5 → 3个文件)

#### rewards/evaluators.ts (合并5个evaluation文件)

```
合并:
- evaluation/causal-inference.ts        → 因果推断
- evaluation/causal-inference-native.ts → Native wrapper
- evaluation/delayed-reward-aggregator.ts → 延迟奖励聚合
- evaluation/word-mastery-evaluator.ts  → 单词掌握度评估
- evaluation/index.ts                   → 导出

组织方式:
- class CausalInference
- class DelayedRewardAggregator
- class WordMasteryEvaluator
- 工厂函数
```

### 4. policies/ 目录整合 (7 → 4个文件)

#### policies/implementations.ts (合并实现文件)

```
合并:
- policies/fatigue-based.ts       → 疲劳策略
- policies/micro-session-policy.ts → 微学习策略
- policies/word-selector.interface.ts → 选词接口 (移到interfaces/)
- (其他策略实现如果有)

组织方式:
- 每个策略一个 export class
- 实现 IWordSelector 接口
```

### 5. config/ 目录整合 (5+8+4 → 6个文件)

#### config/optimizer.ts (合并8个optimization文件)

```
合并:
- optimization/bayesian-optimizer.ts          → 贝叶斯优化
- optimization/multi-objective-optimizer.ts   → 多目标优化
- optimization/llm-advisor/llm-weekly-advisor.ts → LLM顾问
- optimization/llm-advisor/stats-collector.ts → 统计收集
- optimization/llm-advisor/prompts.ts         → 提示词
- optimization/llm-advisor/suggestion-parser.ts → 建议解析
- optimization/llm-advisor/index.ts           → 导出
- optimization/index.ts                       → 导出

组织方式:
- class BayesianOptimizer
- class MultiObjectiveOptimizer
- namespace LLMAdvisor { ... }
```

#### config/versioning.ts (合并4个versioning文件)

```
合并:
- versioning/model-registry.ts    → 模型注册表
- versioning/types.ts             → 类型定义
- versioning/version-manager.ts   → 版本管理器
- versioning/index.ts             → 导出

组织方式:
- class ModelRegistry
- class VersionManager
- 相关类型定义
```

### 6. safety/ 目录创建 (从common/和decision/提取 → 3个文件)

#### safety/circuit-breaker.ts

```
提取:
- common/circuit-breaker.ts       → 熔断器

理由:
- 安全相关功能应独立
- 便于安全审计
```

#### safety/guardrails.ts

```
提取:
- decision/guardrails.ts          → 安全护栏

理由:
- 护栏是安全机制
- 与熔断器配合使用
```

### 7. features/ 目录创建 (从perception/提取 → 2个文件)

#### features/builder.ts

```
提取:
- perception/feature-builder.ts   → 特征构建器

理由:
- 特征构建是独立功能
- 符合目标结构的 features/ 定位
```

### 8. utils/ 目录整合 (从common/提取 → 2个文件)

#### utils/helpers.ts

```
合并:
- common/matrix-utils.ts          → 矩阵工具
- common/smart-router.ts          → 智能路由
- common/smart-wrapper-base.ts    → 包装器基类
- common/telemetry.ts             → 遥测
- common/type-validators.ts       → 类型验证
- common/index.ts                 → 导出
- utils/state-converter.ts        → 状态转换
- learning/math-utils.ts          → 数学工具

组织方式:
- 按功能分组：矩阵、验证、转换、遥测等
- 纯函数为主
```

### 9. 删除的目录和文件

#### decision/ 目录 (6个文件全部删除或合并)

```
- decision/ensemble.ts            → 移到 adapters/ensemble-adapter.ts
- decision/explain.ts             → 移到 adapters/ensemble-adapter.ts (解释功能)
- decision/fallback.ts            → 移到 adapters/ensemble-adapter.ts (降级逻辑)
- decision/mapper.ts              → 移到 adapters/ (动作映射)
- decision/multi-objective-decision.ts → 移到 config/optimizer.ts
- decision/guardrails.ts          → 移到 safety/guardrails.ts

理由:
- 决策功能已被 adapters/ 的接口层替代
- IDecisionPolicy 是新的标准接口
- 旧的 decision/ 模块是遗留代码
```

#### learning/ 目录 (12个文件大部分删除)

```
保留：
- learning/base-learner.ts        → 基础接口 (可能需要)

删除或合并：
- learning/linucb.ts              → 被 adapters/linucb-adapter.ts 替代
- learning/linucb-async.ts        → 被 adapters/linucb-adapter.ts 替代
- learning/linucb-native-wrapper.ts → 被 adapters/linucb-adapter.ts 替代
- learning/thompson-sampling.ts   → 被 adapters/thompson-adapter.ts 替代
- learning/thompson-sampling-native.ts → 被 adapters/thompson-adapter.ts 替代
- learning/thompson-explore-hook.ts → 移到 adapters/thompson-adapter.ts
- learning/native-wrapper.ts      → 移到 adapters/
- learning/coldstart.ts           → 移到 core/cold-start.ts
- learning/heuristic.ts           → 移到 adapters/ (如果仍需要)
- learning/math-utils.ts          → 移到 utils/helpers.ts

理由:
- 学习算法已通过适配器模式重构
- adapters/ 是新的标准实现
- 避免重复代码
```

#### 移到外层的目录

##### monitoring/ → src/monitoring/

```
理由：
- 监控是跨模块的通用功能
- 不应该嵌套在 amas/ 内
- src/monitoring/learning-metrics.ts 已存在
```

##### repositories/ → src/repositories/

```
理由：
- 仓储模式是通用数据访问层
- 不应该嵌套在 amas/ 内
- 可能被其他模块使用
```

##### services/ → src/services/

```
理由：
- decision-recorder.service.ts 是服务层
- 应与其他服务平级
```

### 10. 保留的目录 (无需重组)

- **adapters/** (5个文件) - 新的接口实现，结构清晰
- **workers/** (3个文件) - Worker池管理，独立模块
- **interfaces/** (1个文件) - 核心接口定义，需要扩展
- **config/** (5个文件) - 配置管理，但需要合并optimization和versioning

## 文件映射速查表

| 原路径                              | 新路径                       | 操作           |
| ----------------------------------- | ---------------------------- | -------------- |
| **core & engine**                   |                              |                |
| core/online-loop.ts                 | core/loops.ts                | 合并           |
| core/offline-loop.ts                | core/loops.ts                | 合并           |
| core/\*.example.ts                  | (删除或注释)                 | 清理           |
| engine/\*.ts (11个)                 | core/engine.ts               | 合并           |
| cold-start/\*.ts (2个)              | core/cold-start.ts           | 合并           |
| **models & modeling**               |                              |                |
| modeling/\*.ts (13个)               | models/cognitive.ts          | 合并           |
| modeling/forgetting-curve.ts        | models/forgetting.ts         | 单独提取       |
| models/\*.ts (4个)                  | models/detectors.ts          | 合并           |
| tracking/\*.ts                      | models/memory.ts             | 移动           |
| **rewards & evaluation**            |                              |                |
| rewards/\*.ts                       | rewards/\*.ts                | 保留           |
| evaluation/\*.ts (5个)              | rewards/evaluators.ts        | 合并           |
| **policies**                        |                              |                |
| policies/policy-registry.ts         | policies/registry.ts         | 重命名         |
| policies/fatigue-based.ts           | policies/implementations.ts  | 合并           |
| policies/micro-session-policy.ts    | policies/implementations.ts  | 合并           |
| policies/word-selector.interface.ts | interfaces/index.ts          | 移动           |
| policies/examples.ts                | policies/examples.ts         | 保留           |
| policies/usage-examples.ts          | (删除或合并到examples.ts)    | 清理           |
| **config & optimization**           |                              |                |
| config/\*.ts (5个)                  | config/\*.ts                 | 保留           |
| optimization/\*.ts (8个)            | config/optimizer.ts          | 合并           |
| versioning/\*.ts (4个)              | config/versioning.ts         | 合并           |
| **safety**                          |                              |                |
| common/circuit-breaker.ts           | safety/circuit-breaker.ts    | 移动           |
| decision/guardrails.ts              | safety/guardrails.ts         | 移动           |
| **features**                        |                              |                |
| perception/feature-builder.ts       | features/builder.ts          | 移动           |
| **utils**                           |                              |                |
| common/\*.ts (除circuit-breaker)    | utils/helpers.ts             | 合并           |
| utils/state-converter.ts            | utils/helpers.ts             | 合并           |
| learning/math-utils.ts              | utils/helpers.ts             | 合并           |
| **adapters**                        |                              |                |
| adapters/\*.ts                      | adapters/\*.ts               | 保留           |
| decision/ensemble.ts                | adapters/ensemble-adapter.ts | 合并到现有     |
| decision/explain.ts                 | adapters/ensemble-adapter.ts | 合并           |
| decision/mapper.ts                  | adapters/index.ts            | 工具函数       |
| **workers**                         |                              |                |
| workers/\*.ts                       | workers/\*.ts                | 保留           |
| **移到外层**                        |                              |                |
| monitoring/\*.ts                    | src/monitoring/              | 移动           |
| repositories/\*.ts                  | src/repositories/            | 移动           |
| services/\*.ts                      | src/services/                | 移动           |
| **删除/废弃**                       |                              |                |
| engine.ts (根目录)                  | (删除)                       | 兼容层不再需要 |
| learning/\*.ts (大部分)             | (删除)                       | 被adapters替代 |
| decision/\*.ts (除guardrails)       | (删除或合并)                 | 被adapters替代 |

## 执行步骤

### 阶段1: 准备工作

1. 创建备份分支: `git checkout -b backup/before-amas-reorganization`
2. 在dev分支创建新的工作分支: `git checkout dev && git checkout -b feat/amas-file-reorganization`
3. 记录所有外部引用: `grep -r "from.*amas" packages/backend/src --exclude-dir=amas > /tmp/amas_imports.txt`

### 阶段2: 移动目录到外层 (先处理，避免后续混淆)

1. 移动 monitoring/ → src/monitoring/
2. 移动 repositories/ → src/repositories/
3. 移动 services/ → src/services/
4. 更新这些文件的导入路径

### 阶段3: 创建新的目录结构

1. 创建 safety/ 目录
2. 创建 features/ 目录

### 阶段4: 按依赖顺序合并文件

1. **第一优先级** (被广泛依赖的基础模块):
   - interfaces/ - 扩展接口定义
   - utils/ - 合并工具函数
   - types.ts - 更新类型定义

2. **第二优先级** (核心模型):
   - models/forgetting.ts - 遗忘曲线
   - models/cognitive.ts - 认知模型
   - models/detectors.ts - 检测器
   - models/memory.ts - 记忆追踪

3. **第三优先级** (配置和安全):
   - config/optimizer.ts - 优化器配置
   - config/versioning.ts - 版本管理
   - safety/circuit-breaker.ts - 熔断器
   - safety/guardrails.ts - 护栏

4. **第四优先级** (功能模块):
   - features/builder.ts - 特征构建
   - rewards/evaluators.ts - 奖励评估器
   - policies/implementations.ts - 策略实现

5. **第五优先级** (核心引擎):
   - core/cold-start.ts - 冷启动
   - core/loops.ts - 循环
   - core/engine.ts - 引擎整合

6. **第六优先级** (适配器增强):
   - 将decision/的功能合并到adapters/

### 阶段5: 删除旧文件

1. 删除 learning/ 目录 (除了必要的接口文件)
2. 删除 decision/ 目录
3. 删除 engine/ 目录 (已合并)
4. 删除 evaluation/ 目录 (已合并)
5. 删除 modeling/ 目录 (已合并)
6. 删除 old-models/ 目录 (已合并)
7. 删除 perception/ 目录 (已移动)
8. 删除 cold-start/ 目录 (已合并)
9. 删除 engine.ts (兼容层)
10. 删除 common/ 目录 (已分散)
11. 删除 optimization/ 目录 (已合并)
12. 删除 versioning/ 目录 (已合并)
13. 删除 tracking/ 目录 (已合并)

### 阶段6: 更新导入路径

1. 更新 amas/index.ts 的导出
2. 更新各子模块的 index.ts
3. 使用工具批量更新外部引用:
   ```bash
   # 示例: 更新对modeling/的引用
   find packages/backend/src -name "*.ts" -not -path "*/amas/*" -exec sed -i "s|from '\.\.*/amas/modeling/|from '../amas/models/cognitive'|g" {} \;
   ```

### 阶段7: 测试验证

1. TypeScript编译: `npm run build`
2. 运行单元测试: `npm test`
3. 运行集成测试
4. 检查导入路径: `npm run lint`

### 阶段8: 文档化

1. 创建迁移文档 (本文档)
2. 更新 README.md
3. 更新各模块的文档注释
4. 创建迁移指南给其他开发者

## 风险评估与缓解

### 高风险项

1. **导入路径更新遗漏**
   - 缓解: 使用自动化脚本 + 编译检查
   - 回滚: Git备份分支

2. **合并文件时逻辑错误**
   - 缓解: 逐步合并 + 每步测试
   - 回滚: Git提交历史

3. **循环依赖问题**
   - 缓解: 按依赖顺序处理
   - 检测: 使用 madge 工具

### 中风险项

1. **类型定义冲突**
   - 缓解: 使用命名空间隔离
   - 检测: TypeScript编译器

2. **测试失败**
   - 缓解: 逐步测试
   - 回滚: Git bisect

### 低风险项

1. **文档更新不及时**
   - 缓解: 在合并PR前完成文档
   - 影响: 不阻塞功能

## 预期收益

### 代码组织

- 文件数量减少 65-74%
- 目录结构更清晰
- 职责划分更明确

### 开发效率

- 更容易找到相关代码
- 减少文件切换次数
- 降低认知负担

### 维护性

- 减少重复代码
- 统一接口标准
- 便于后续扩展

### 可测试性

- 减少测试文件数量
- 更容易mock依赖
- 提高测试覆盖率

## 后续优化

1. **进一步合并适配器和策略**
   - 如果适配器和策略模式统一后，可能再合并

2. **优化导出结构**
   - 考虑使用桶文件(barrel files)模式
   - 简化外部引用

3. **文档完善**
   - 为每个合并后的大文件添加详细注释
   - 创建架构图

4. **性能优化**
   - 检查循环依赖
   - 优化import路径

## 验收标准

1. ✅ 文件数量: 115个 → 30-40个
2. ✅ TypeScript编译无错误
3. ✅ 所有测试通过
4. ✅ 无循环依赖
5. ✅ 文档完整
6. ✅ 代码审查通过
7. ✅ 外部引用正确更新

## 参考资料

- [计划完成报告](./PLAN_COMPLETION_REPORT.md) - 当前重构状态
- [接口层文档](./src/amas/interfaces/README.md) - 新的接口标准
- [适配器文档](./src/amas/adapters/README.md) - 适配器模式说明
