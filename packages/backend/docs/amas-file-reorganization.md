# AMAS 文件重组实施文档

## 1. 执行概要

### 1.1 当前状态

- **总文件数**: 110个TypeScript文件
- **总代码行数**: 约36,519行
- **目录数量**: 24个子目录
- **主要问题**:
  - 文件过于分散，导致维护困难
  - 存在大量小文件（<200行）和示例代码
  - Native wrapper和原实现分离，导致代码重复
  - 某些目录职责不清晰（adapters、policies、models等）
  - Engine被拆分成10个文件，增加理解成本

### 1.2 重组目标

- **目标文件数**: 35-40个核心文件
- **减少比例**: 约64%（110 → 40）
- **保持功能**: 100%功能完整性
- **提升可维护性**: 简化导入路径，减少文件跳转

---

## 2. 当前目录结构分析

### 2.1 目录分布与文件统计

```
目录名称                  文件数    代码行数    目录大小    优先级
────────────────────────────────────────────────────────────────
learning/                  14       ~8,500      204KB      核心
modeling/                  13       ~5,700      144KB      核心
engine/                    11       ~4,800      120KB      核心
optimization/              6        ~3,300      100KB      重要
evaluation/                5        ~3,000      92KB       重要
decision/                  6        ~2,800      80KB       重要
common/                    7        ~2,500      76KB       工具
adapters/                  6        ~800        60KB       适配
config/                    5        ~1,400      56KB       配置
policies/                  8        ~1,200      48KB       策略
monitoring/                5        ~1,400      48KB       监控
workers/                   3        ~900        40KB       工具
core/                      ?        ~400        40KB       待查
cold-start/                2        ~600        24KB       功能
repositories/              3        ~400        32KB       持久化
models/                    4        ~400        32KB       模型
versioning/                4        ~300        32KB       版本
perception/                1        ~880        28KB       感知
services/                  1        ~500        20KB       服务
tracking/                  1        ~300        12KB       追踪
interfaces/                1        ~220        12KB       接口
utils/                     1        ~100        8KB        工具
rewards/                   2        ~200        20KB       奖励
根目录                     3        ~700        -          入口
```

### 2.2 文件类型分析

#### 核心算法文件（保留，可能合并）

```
learning/linucb.ts                    1022行   核心算法
learning/thompson-sampling.ts          827行   核心算法
learning/coldstart.ts                  991行   冷启动
evaluation/causal-inference.ts        1118行   因果推断
decision/ensemble.ts                   951行   集成学习
config/user-params.ts                  932行   用户参数
modeling/actr-memory.ts                758行   认知模型
perception/feature-builder.ts          884行   特征构建
optimization/bayesian-optimizer.ts     878行   贝叶斯优化
engine/engine-core.ts                  899行   引擎核心
```

#### Native Wrapper文件（合并候选）

```
learning/linucb-native-wrapper.ts          851行
learning/thompson-sampling-native.ts       742行
modeling/actr-memory-native.ts             908行
evaluation/causal-inference-native.ts      825行
learning/native-wrapper.ts                 502行   基类
common/smart-wrapper-base.ts               503行   智能封装基类
```

#### 工具和辅助文件（合并候选）

```
learning/math-utils.ts                     444行
common/matrix-utils.ts                     ~200行
learning/base-learner.ts                   ~150行
decision/mapper.ts                         ~180行
decision/guardrails.ts                     ~250行
decision/fallback.ts                       ~100行
```

#### 示例和文档文件（删除候选）

```
adapters/examples.ts                       301行   示例代码
policies/examples.ts                       127行   示例代码
policies/usage-examples.ts                 174行   使用示例
models/emotion-detector.example.ts         125行   示例代码
adapters/README.md                         -       文档
policies/README.md                         -       文档
```

#### 小型功能模块（合并候选）

```
adapters/linucb-adapter.ts                 ~120行
adapters/thompson-adapter.ts               ~100行
adapters/ensemble-adapter.ts               ~100行
monitoring/alert-config.ts                 ~80行
monitoring/alert-engine.ts                 ~200行
config/feature-flags.ts                    ~150行
config/action-space.ts                     ~180行
```

---

## 3. 重组方案详细设计

### 3.1 合并策略 - 按功能模块

#### 阶段 1：合并Native Wrapper（-5个文件）

**目标**: 将Native wrapper与原始实现合并，减少重复

```
合并前                                          合并后
────────────────────────────────────────────────────────────────
learning/linucb.ts (1022行)                →   learning/linucb.ts
learning/linucb-native-wrapper.ts (851行)       (~1400行，含native封装)

learning/thompson-sampling.ts (827行)       →   learning/thompson-sampling.ts
learning/thompson-sampling-native.ts (742行)    (~1200行，含native封装)

modeling/actr-memory.ts (758行)             →   modeling/actr-memory.ts
modeling/actr-memory-native.ts (908行)          (~1300行，含native封装)

evaluation/causal-inference.ts (1118行)     →   evaluation/causal-inference.ts
evaluation/causal-inference-native.ts (825行)   (~1500行，含native封装)

learning/native-wrapper.ts (502行)          →   common/wrappers.ts
common/smart-wrapper-base.ts (503行)            (~800行，通用封装工具)
```

**合并原则**:

- 使用条件导出：`if (nativeModule) { ... } else { ... }`
- 保持接口一致性
- Native实现作为可选优化

**预期收益**: -5个文件，代码复用提升

---

#### 阶段 2：合并Adapters模块（-4个文件）

**目标**: 将适配器模式统一管理

```
合并前                                    合并后
──────────────────────────────────────────────────────
adapters/linucb-adapter.ts (120行)    →   adapters/index.ts
adapters/thompson-adapter.ts (100行)       (~400行，含3个适配器)
adapters/ensemble-adapter.ts (100行)
adapters/index.ts (26行)
adapters/examples.ts (301行)               【删除】
adapters/README.md                         【删除】
```

**合并原则**:

- 3个适配器合并到一个文件
- 删除examples.ts和README.md
- 使用命名导出区分不同适配器

**预期收益**: -4个文件（删除2个，合并4→1）

---

#### 阶段 3：合并Decision模块（-2个文件）

**目标**: 决策相关功能聚合

```
合并前                                       合并后
───────────────────────────────────────────────────────────
decision/mapper.ts (180行)               →   decision/core.ts
decision/guardrails.ts (250行)                (~600行，决策工具集)
decision/fallback.ts (100行)
decision/multi-objective-decision.ts     →   decision/multi-objective.ts
                                              (重命名，保持独立)
decision/ensemble.ts (951行)             →   decision/ensemble.ts
                                              (保持独立，核心文件)
decision/explain.ts (442行)              →   decision/explain.ts
                                              (保持独立，功能完整)
```

**合并原则**:

- 工具函数合并到decision/core.ts
- 大型模块保持独立
- 清晰的功能边界

**预期收益**: -2个文件

---

#### 阶段 4：合并Config模块（-2个文件）

**目标**: 配置文件统一管理

```
合并前                                    合并后
──────────────────────────────────────────────────────
config/feature-flags.ts (150行)       →   config/runtime.ts
config/action-space.ts (180行)             (~400行，运行时配置)
config/reward-profiles.ts (200行)

config/user-params.ts (932行)         →   config/user-params.ts
                                           (保持独立，复杂度高)
config/index.ts (13行)                →   config/index.ts
                                           (更新导出)
```

**合并原则**:

- 运行时配置合并
- 复杂配置保持独立
- 保持配置的可读性

**预期收益**: -2个文件

---

#### 阶段 5：合并Engine模块（-6个文件）

**目标**: 引擎文件过度拆分，需要重新整合

```
合并前（11个文件）                           合并后（5个文件）
────────────────────────────────────────────────────────────────
engine/engine-core.ts (899行)            →   engine/core.ts
engine/engine-types.ts (~200行)               (~1100行，核心逻辑+类型)

engine/engine-learning.ts (~350行)       →   engine/managers.ts
engine/engine-modeling.ts (~300行)            (~1000行，4个管理器)
engine/engine-resilience.ts (~250行)
engine/engine-isolation.ts (578行)

engine/engine-persistence.ts (~300行)    →   engine/persistence.ts
engine/engine-reward-cache.ts (~200行)        (~500行，持久化+缓存)

engine/engine-decision-trace.ts (~150行) →   engine/utils.ts
engine/engine-feature-vector.ts (~200行)      (~350行，工具函数)

engine/index.ts (64行)                   →   engine/index.ts
                                              (更新导出)
```

**合并原则**:

- 核心逻辑与类型定义合并
- 管理器类聚合（Learning、Modeling、Resilience、Isolation）
- 持久化相关功能合并
- 工具函数统一管理

**预期收益**: -6个文件（11 → 5）

---

#### 阶段 6：合并Policies模块（-5个文件）

**目标**: 策略模块简化

```
合并前（8个文件）                            合并后（3个文件）
────────────────────────────────────────────────────────────────
policies/fatigue-based.ts (~200行)       →   policies/implementations.ts
policies/micro-session-policy.ts (~150行)     (~400行，2个策略实现)

policies/policy-registry.ts (~200行)     →   policies/registry.ts
policies/word-selector.interface.ts (~100行)  (~300行，注册+接口)

policies/index.ts (33行)                 →   policies/index.ts
                                              (更新导出)

policies/examples.ts (127行)                  【删除】
policies/usage-examples.ts (174行)            【删除】
policies/README.md                            【删除】
```

**合并原则**:

- 删除所有示例和文档文件
- 策略实现合并
- 注册器与接口合并

**预期收益**: -5个文件（8 → 3）

---

#### 阶段 7：合并Monitoring模块（-2个文件）

**目标**: 监控功能整合

```
合并前（5个文件）                            合并后（3个文件）
────────────────────────────────────────────────────────────────
monitoring/alert-config.ts (~80行)       →   monitoring/alerts.ts
monitoring/alert-engine.ts (~200行)           (~280行，告警系统)

monitoring/metrics-collector.ts (427行)  →   monitoring/metrics-collector.ts
                                              (保持独立，功能完整)

monitoring/monitoring-service.ts (~200行) →   monitoring/service.ts
                                              (重命名)

monitoring/index.ts (16行)               →   monitoring/index.ts
                                              (更新导出)
```

**预期收益**: -2个文件

---

#### 阶段 8：合并Models模块（-2个文件）

**目标**: 模型模块清理

```
合并前（4个文件）                            合并后（2个文件）
────────────────────────────────────────────────────────────────
models/emotion-detector.ts (~150行)      →   models/detectors.ts
models/flow-detector.ts (~150行)              (~300行，2个检测器)

models/emotion-detector.example.ts (125行)    【删除】

models/index.ts (6行)                    →   models/index.ts
                                              (更新导出)
```

**预期收益**: -2个文件（4 → 2）

---

#### 阶段 9：合并其他小模块（-4个文件）

**目标**: 清理零散模块

```
合并前                                       合并后
────────────────────────────────────────────────────────────
cold-start/global-stats.ts (~300行)      →   cold-start/index.ts
cold-start/new-user-initializer.ts (~300行)   (~600行，冷启动系统)

repositories/cached-repository.ts (~150行) →   repositories/index.ts
repositories/database-repository.ts (~200行)   (~400行，2个仓储)
repositories/index.ts (17行)

versioning/model-registry.ts (~100行)    →   versioning/index.ts
versioning/version-manager.ts (~100行)        (~300行，版本系统)
versioning/types.ts (~100行)
versioning/index.ts (13行)

rewards/immediate-reward.ts (~150行)     →   rewards/index.ts
rewards/index.ts (5行)                        (~150行，奖励系统)
```

**预期收益**: -4个文件

---

#### 阶段 10：清理顶层文件（保持不变）

```
保持不变的文件
────────────────────────────────────────────────
amas/engine.ts (34行)                        兼容层，保留
amas/index.ts (246行)                        主导出，保留
amas/types.ts (452行)                        核心类型，保留
```

---

### 3.2 重组后的目录结构

```
src/amas/
├── index.ts                          # 主导出文件（保留）
├── types.ts                          # 核心类型定义（保留）
├── engine.ts                         # 向后兼容层（保留）
│
├── adapters/
│   └── index.ts                      # 3个适配器统一（合并后）
│
├── cold-start/
│   └── index.ts                      # 冷启动系统（合并后）
│
├── common/
│   ├── circuit-breaker.ts            # 断路器（保留）
│   ├── matrix-utils.ts               # 矩阵工具（保留）
│   ├── smart-router.ts               # 智能路由（保留）
│   ├── telemetry.ts                  # 遥测（保留）
│   ├── type-validators.ts            # 类型验证（保留）
│   ├── wrappers.ts                   # 通用封装工具（新建，合并native-wrapper + smart-wrapper-base）
│   └── index.ts                      # 导出（更新）
│
├── config/
│   ├── runtime.ts                    # 运行时配置（新建，合并feature-flags + action-space + reward-profiles）
│   ├── user-params.ts                # 用户参数（保留）
│   └── index.ts                      # 导出（更新）
│
├── decision/
│   ├── core.ts                       # 决策工具集（新建，合并mapper + guardrails + fallback）
│   ├── ensemble.ts                   # 集成学习（保留）
│   ├── explain.ts                    # 解释器（保留）
│   └── multi-objective.ts            # 多目标决策（重命名）
│
├── engine/
│   ├── core.ts                       # 引擎核心（合并engine-core + engine-types）
│   ├── managers.ts                   # 管理器集合（合并4个manager）
│   ├── persistence.ts                # 持久化（合并persistence + reward-cache）
│   ├── utils.ts                      # 工具函数（合并decision-trace + feature-vector）
│   └── index.ts                      # 导出（更新）
│
├── evaluation/
│   ├── causal-inference.ts           # 因果推断（合并native版本）
│   ├── delayed-reward-aggregator.ts  # 延迟奖励（保留）
│   ├── word-mastery-evaluator.ts     # 单词掌握度（保留）
│   └── index.ts                      # 导出（更新）
│
├── interfaces/
│   └── index.ts                      # 接口定义（保留）
│
├── learning/
│   ├── base-learner.ts               # 基类（保留）
│   ├── coldstart.ts                  # 冷启动（保留）
│   ├── heuristic.ts                  # 启发式（保留）
│   ├── linucb.ts                     # LinUCB（合并native版本）
│   ├── linucb-async.ts               # 异步LinUCB（保留）
│   ├── math-utils.ts                 # 数学工具（保留）
│   ├── thompson-sampling.ts          # Thompson采样（合并native版本）
│   ├── thompson-explore-hook.ts      # 探索钩子（保留）
│   └── index.ts                      # 导出（更新）
│
├── modeling/
│   ├── actr-memory.ts                # ACT-R模型（合并native版本）
│   ├── attention-monitor.ts          # 注意力监控（保留）
│   ├── chronotype.ts                 # 生物钟类型（保留）
│   ├── cognitive-profiler.ts         # 认知画像（保留）
│   ├── fatigue-estimator.ts          # 疲劳评估（保留）
│   ├── fatigue-recovery.ts           # 疲劳恢复（保留）
│   ├── forgetting-curve.ts           # 遗忘曲线（保留）
│   ├── habit-recognizer.ts           # 习惯识别（保留）
│   ├── learning-style.ts             # 学习风格（保留）
│   ├── motivation-tracker.ts         # 动机追踪（保留）
│   ├── trend-analyzer.ts             # 趋势分析（保留）
│   └── index.ts                      # 导出（更新）
│
├── models/
│   ├── detectors.ts                  # 检测器集合（合并emotion + flow）
│   └── index.ts                      # 导出（更新）
│
├── monitoring/
│   ├── alerts.ts                     # 告警系统（合并config + engine）
│   ├── metrics-collector.ts          # 指标收集（保留）
│   ├── service.ts                    # 监控服务（重命名）
│   └── index.ts                      # 导出（更新）
│
├── optimization/
│   ├── bayesian-optimizer.ts         # 贝叶斯优化（保留）
│   ├── multi-objective-optimizer.ts  # 多目标优化（保留）
│   ├── llm-advisor/                  # LLM顾问（保持子目录）
│   │   ├── advisor.ts                # 主逻辑（重命名llm-weekly-advisor.ts）
│   │   ├── prompts.ts                # 提示模板（保留）
│   │   ├── stats-collector.ts        # 统计收集（保留）
│   │   ├── suggestion-parser.ts      # 建议解析（保留）
│   │   └── index.ts                  # 导出（更新）
│   └── index.ts                      # 导出（更新）
│
├── perception/
│   └── feature-builder.ts            # 特征构建（保留）
│
├── policies/
│   ├── implementations.ts            # 策略实现（合并2个策略）
│   ├── registry.ts                   # 注册器（合并registry + interface）
│   └── index.ts                      # 导出（更新）
│
├── repositories/
│   └── index.ts                      # 仓储集合（合并2个repository）
│
├── rewards/
│   └── index.ts                      # 奖励系统（合并immediate-reward）
│
├── services/
│   └── decision-recorder.service.ts  # 决策记录（保留）
│
├── tracking/
│   └── word-memory-tracker.ts        # 单词记忆追踪（保留）
│
├── utils/
│   └── state-converter.ts            # 状态转换（保留）
│
├── versioning/
│   └── index.ts                      # 版本系统（合并3个文件）
│
└── workers/
    ├── compute.worker.ts             # 计算Worker（保留）
    ├── pool.ts                       # 线程池（保留）
    └── index.ts                      # 导出（更新）
```

---

### 3.3 文件数量对比

```
目录                合并前    合并后    减少    备注
────────────────────────────────────────────────────────
adapters            6         1         -5      合并+删除示例
cold-start          2         1         -1      合并
common              7         7         0       保持（增加wrappers.ts）
config              5         3         -2      合并运行时配置
decision            6         4         -2      合并工具
engine              11        5         -6      重新整合
evaluation          5         4         -1      合并native
interfaces          1         1         0       保持
learning            14        10        -4      合并native
modeling            13        12        -1      合并native
models              4         2         -2      合并+删除示例
monitoring          5         4         -1      合并告警
optimization        6         6         0       保持（含子目录）
perception          1         1         0       保持
policies            8         3         -5      合并+删除示例
repositories        3         1         -2      合并
rewards             2         1         -1      合并
services            1         1         0       保持
tracking            1         1         0       保持
utils               1         1         0       保持
versioning          4         1         -3      合并
workers             3         3         0       保持
根目录              3         3         0       保持（index/engine/types）
────────────────────────────────────────────────────────
总计                110       76        -34     减少约31%

进一步优化后（目标）：               40        减少约64%
```

---

## 4. 实施计划

### 4.1 分阶段执行策略

#### 第一阶段：准备和验证（1-2天）

**目标**: 确保重组前的代码质量和测试覆盖

```bash
# 1. 运行所有测试，建立基线
npm run test:unit
npm run test:integration
npm run test:performance

# 2. 代码覆盖率报告
npm run test:coverage

# 3. 创建测试快照
git tag amas-reorganization-baseline

# 4. 备份当前状态
git checkout -b amas-reorganization-backup
git checkout dev
git checkout -b feat/amas-reorganization
```

**验证检查点**:

- [ ] 所有测试通过
- [ ] 代码覆盖率 >80%
- [ ] 无ESLint错误
- [ ] 创建Git标签和分支

---

#### 第二阶段：低风险合并（2-3天）

**目标**: 从最安全的模块开始，建立信心

##### 2.1 合并示例和文档文件

```bash
# 删除示例文件（低风险）
rm src/amas/adapters/examples.ts
rm src/amas/adapters/README.md
rm src/amas/policies/examples.ts
rm src/amas/policies/usage-examples.ts
rm src/amas/policies/README.md
rm src/amas/models/emotion-detector.example.ts

# 运行测试
npm run test
```

**验证检查点**:

- [ ] 删除6个示例/文档文件
- [ ] 所有测试仍然通过
- [ ] 无导入错误
- [ ] 提交: `chore: remove example files and READMEs from AMAS modules`

##### 2.2 合并小型模块

```bash
# 合并cold-start
./scripts/merge-files.sh \
  src/amas/cold-start/global-stats.ts \
  src/amas/cold-start/new-user-initializer.ts \
  > src/amas/cold-start/index.ts.new

# 合并repositories
./scripts/merge-files.sh \
  src/amas/repositories/cached-repository.ts \
  src/amas/repositories/database-repository.ts \
  > src/amas/repositories/index.ts.new

# 合并models
./scripts/merge-files.sh \
  src/amas/models/emotion-detector.ts \
  src/amas/models/flow-detector.ts \
  > src/amas/models/detectors.ts

# 运行测试
npm run test
```

**验证检查点**:

- [ ] 合并3个模块
- [ ] 所有测试通过
- [ ] 更新相关导入
- [ ] 提交: `refactor: merge small AMAS modules (cold-start, repositories, models)`

---

#### 第三阶段：中等风险合并（3-4天）

**目标**: 合并适配器、策略、监控等模块

##### 3.1 合并Adapters模块

```javascript
// src/amas/adapters/index.ts
/**
 * AMAS 适配器统一导出
 * 将各种学习器适配到标准决策接口
 */

// ========== LinUCB 适配器 ==========
export class LinUCBAdapter implements IDecisionPolicy {
  // ... (linucb-adapter.ts 的内容)
}

// ========== Thompson Sampling 适配器 ==========
export class ThompsonAdapter implements IDecisionPolicy {
  // ... (thompson-adapter.ts 的内容)
}

// ========== Ensemble 适配器 ==========
export class EnsembleAdapter implements IDecisionPolicy {
  // ... (ensemble-adapter.ts 的内容)
}

// 统一导出
export * from './types';
```

**迁移脚本**:

```bash
# 创建合并脚本
cat > scripts/merge-adapters.sh << 'EOF'
#!/bin/bash
# 合并adapters模块

# 1. 创建新文件
cat > src/amas/adapters/index.ts.new << 'NEWFILE'
/**
 * AMAS 适配器统一导出
 */
import { LinUCB } from '../learning/linucb';
import { ThompsonSampling } from '../learning/thompson-sampling';
import { EnsembleLearningFramework } from '../decision/ensemble';
import { Action, UserState } from '../types';
import { IDecisionPolicy, DecisionContext, DecisionResult } from '../interfaces';
import { amasLogger } from '../../logger';

// LinUCB适配器内容
// ... 粘贴linucb-adapter.ts的类定义

// Thompson适配器内容
// ... 粘贴thompson-adapter.ts的类定义

// Ensemble适配器内容
// ... 粘贴ensemble-adapter.ts的类定义

NEWFILE

# 2. 验证语法
npx tsc --noEmit src/amas/adapters/index.ts.new

# 3. 如果成功，替换文件
mv src/amas/adapters/index.ts.new src/amas/adapters/index.ts

# 4. 删除旧文件
rm src/amas/adapters/linucb-adapter.ts
rm src/amas/adapters/thompson-adapter.ts
rm src/amas/adapters/ensemble-adapter.ts

# 5. 运行测试
npm run test -- --testPathPattern=adapters
EOF

chmod +x scripts/merge-adapters.sh
./scripts/merge-adapters.sh
```

**验证检查点**:

- [ ] 适配器测试通过
- [ ] 导入路径更新完成
- [ ] 功能完全等价
- [ ] 提交: `refactor: consolidate AMAS adapters into single file`

##### 3.2 合并Policies模块

```bash
./scripts/merge-policies.sh
npm run test -- --testPathPattern=policies
```

**验证检查点**:

- [ ] 策略测试通过
- [ ] 注册器功能正常
- [ ] 提交: `refactor: merge AMAS policy implementations`

##### 3.3 合并Monitoring模块

```bash
./scripts/merge-monitoring.sh
npm run test -- --testPathPattern=monitoring
```

**验证检查点**:

- [ ] 监控测试通过
- [ ] 告警系统正常
- [ ] 提交: `refactor: consolidate AMAS monitoring modules`

##### 3.4 合并Config模块

```bash
./scripts/merge-config.sh
npm run test -- --testPathPattern=config
```

**验证检查点**:

- [ ] 配置测试通过
- [ ] 运行时配置加载正常
- [ ] 提交: `refactor: merge AMAS runtime configurations`

---

#### 第四阶段：高风险合并（4-5天）

**目标**: 合并核心模块（Engine、Learning、Native Wrappers）

##### 4.1 合并Native Wrappers（最复杂）

**策略**: 使用条件导出，保持接口兼容

```javascript
// src/amas/learning/linucb.ts (合并后)
/**
 * LinUCB - Linear Upper Confidence Bound
 * 支持Native加速（可选）
 */

// 尝试加载Native模块
let nativeLinUCB: any = null;
try {
  nativeLinUCB = require('../../../native/linucb.node');
} catch (error) {
  // Native模块不可用，使用JS实现
  nativeLinUCB = null;
}

export class LinUCB {
  private useNative: boolean;
  private nativeInstance: any;

  constructor(options: LinUCBOptions = {}) {
    this.useNative = options.useNative !== false && nativeLinUCB !== null;

    if (this.useNative) {
      this.nativeInstance = new nativeLinUCB.LinUCB(options);
      logger.info('LinUCB: Using native implementation');
    } else {
      // JS实现初始化
      logger.info('LinUCB: Using JavaScript implementation');
    }
  }

  selectAction(context: LinUCBContext): ActionSelection {
    if (this.useNative && this.nativeInstance) {
      return this.nativeInstance.selectAction(context);
    }

    // JS实现
    return this.selectActionJS(context);
  }

  private selectActionJS(context: LinUCBContext): ActionSelection {
    // 原始JS实现
  }

  update(
    action: Action,
    reward: number,
    context: LinUCBContext
  ): void {
    if (this.useNative && this.nativeInstance) {
      this.nativeInstance.update(action, reward, context);
      return;
    }

    // JS实现
    this.updateJS(action, reward, context);
  }

  private updateJS(...): void {
    // 原始JS实现
  }

  // ... 其他方法类似
}

// 工厂函数
export function createLinUCB(options: LinUCBOptions = {}): LinUCB {
  return new LinUCB(options);
}

// 便捷函数
export function createLinUCBNative(options: LinUCBOptions = {}): LinUCB {
  return new LinUCB({ ...options, useNative: true });
}

export function createLinUCBJS(options: LinUCBOptions = {}): LinUCB {
  return new LinUCB({ ...options, useNative: false });
}
```

**迁移脚本**:

```bash
# 创建Native合并脚本
cat > scripts/merge-native-wrappers.sh << 'EOF'
#!/bin/bash
set -e

echo "合并Native Wrappers..."

# 1. LinUCB
echo "处理 LinUCB..."
./scripts/merge-with-native.sh \
  src/amas/learning/linucb.ts \
  src/amas/learning/linucb-native-wrapper.ts \
  src/amas/learning/linucb.ts.new

# 2. Thompson Sampling
echo "处理 Thompson Sampling..."
./scripts/merge-with-native.sh \
  src/amas/learning/thompson-sampling.ts \
  src/amas/learning/thompson-sampling-native.ts \
  src/amas/learning/thompson-sampling.ts.new

# 3. ACT-R Memory
echo "处理 ACT-R Memory..."
./scripts/merge-with-native.sh \
  src/amas/modeling/actr-memory.ts \
  src/amas/modeling/actr-memory-native.ts \
  src/amas/modeling/actr-memory.ts.new

# 4. Causal Inference
echo "处理 Causal Inference..."
./scripts/merge-with-native.sh \
  src/amas/evaluation/causal-inference.ts \
  src/amas/evaluation/causal-inference-native.ts \
  src/amas/evaluation/causal-inference.ts.new

# 5. 验证所有文件
echo "验证TypeScript语法..."
npx tsc --noEmit

# 6. 运行相关测试
echo "运行测试..."
npm run test -- --testPathPattern="(linucb|thompson|actr|causal)"

# 7. 如果全部通过，替换文件
echo "替换文件..."
mv src/amas/learning/linucb.ts.new src/amas/learning/linucb.ts
mv src/amas/learning/thompson-sampling.ts.new src/amas/learning/thompson-sampling.ts
mv src/amas/modeling/actr-memory.ts.new src/amas/modeling/actr-memory.ts
mv src/amas/evaluation/causal-inference.ts.new src/amas/evaluation/causal-inference.ts

# 8. 删除旧的wrapper文件
echo "删除旧文件..."
rm src/amas/learning/linucb-native-wrapper.ts
rm src/amas/learning/thompson-sampling-native.ts
rm src/amas/modeling/actr-memory-native.ts
rm src/amas/evaluation/causal-inference-native.ts

# 9. 创建通用wrapper工具
echo "创建通用wrapper..."
cat > src/amas/common/wrappers.ts << 'WRAPPER'
/**
 * Native Wrapper 通用工具
 * 整合自 learning/native-wrapper.ts 和 common/smart-wrapper-base.ts
 */

export interface NativeWrapperOptions {
  useNative?: boolean;
  fallbackOnError?: boolean;
  performanceThreshold?: number;
}

export abstract class BaseNativeWrapper<T> {
  protected useNative: boolean;
  protected nativeInstance: any;

  constructor(options: NativeWrapperOptions = {}) {
    this.useNative = options.useNative !== false;
  }

  protected abstract createNativeInstance(): any;
  protected abstract createJSInstance(): T;
}

// ... 其他通用工具
WRAPPER

echo "完成！"
EOF

chmod +x scripts/merge-native-wrappers.sh
./scripts/merge-native-wrappers.sh
```

**验证检查点**:

- [ ] LinUCB测试通过（JS和Native）
- [ ] Thompson Sampling测试通过
- [ ] ACT-R Memory测试通过
- [ ] Causal Inference测试通过
- [ ] 性能基准测试对比（确保无回归）
- [ ] 提交: `refactor: merge native wrappers into core implementations`

##### 4.2 合并Engine模块

```bash
# 1. 先合并类型和核心
./scripts/merge-engine-core.sh

# 2. 合并管理器
./scripts/merge-engine-managers.sh

# 3. 合并持久化
./scripts/merge-engine-persistence.sh

# 4. 合并工具
./scripts/merge-engine-utils.sh

# 5. 运行完整测试
npm run test -- --testPathPattern=engine
```

**验证检查点**:

- [ ] Engine核心测试通过
- [ ] 集成测试通过
- [ ] 性能测试无回归
- [ ] 提交: `refactor: consolidate AMAS engine into 5 core files`

---

#### 第五阶段：验证和优化（2-3天）

**目标**: 全面测试，性能对比，文档更新

##### 5.1 全面测试

```bash
# 1. 单元测试
npm run test:unit

# 2. 集成测试
npm run test:integration

# 3. 性能测试
npm run test:performance

# 4. 回归测试
npm run test:regression

# 5. 覆盖率检查
npm run test:coverage
```

**验证检查点**:

- [ ] 所有测试套件通过
- [ ] 代码覆盖率 ≥80%
- [ ] 性能指标在基线±5%以内
- [ ] 无内存泄漏

##### 5.2 性能对比

```bash
# 运行性能基准测试
node scripts/benchmark-comparison.js

# 对比重组前后的指标
# - 文件加载时间
# - 内存占用
# - 冷启动时间
# - 热路径响应时间
```

**预期指标**:

```
指标                    重组前      重组后      变化
────────────────────────────────────────────────
文件数量                110         40          -64%
总代码行数              36,519      ~35,000     -4%
主入口加载时间          ~250ms      ~180ms      -28%
内存占用                ~45MB       ~38MB       -16%
LinUCB选择时间          ~2.5ms      ~2.4ms      -4%
Thompson采样时间        ~1.8ms      ~1.7ms      -6%
```

##### 5.3 更新文档

````bash
# 1. 更新导入路径文档
cat > docs/amas-import-guide.md << 'EOF'
# AMAS 导入指南（重组后）

## 核心模块

```typescript
// 引擎
import { AMASEngine } from '@/amas';

// 学习器
import { LinUCB, ThompsonSampling } from '@/amas/learning';

// 决策
import { EnsembleLearningFramework } from '@/amas/decision';

// 适配器（统一入口）
import { LinUCBAdapter, ThompsonAdapter, EnsembleAdapter } from '@/amas/adapters';
````

## 配置

```typescript
// 运行时配置（新）
import { FeatureFlags, ActionSpace, RewardProfiles } from '@/amas/config/runtime';

// 用户参数
import { UserParamsManager } from '@/amas/config/user-params';
```

...
EOF

# 2. 更新架构图

# 3. 更新API文档

# 4. 更新迁移指南

````

**验证检查点**:
- [ ] 导入指南完成
- [ ] 架构图更新
- [ ] API文档更新
- [ ] 迁移指南完成

---

#### 第六阶段：清理和发布（1天）

**目标**: 最终清理，准备合并到主分支

##### 6.1 代码审查准备
```bash
# 1. 格式化所有代码
npm run format

# 2. 修复ESLint问题
npm run lint:fix

# 3. 生成变更日志
git log amas-reorganization-baseline..HEAD --oneline > REORGANIZATION_CHANGELOG.md

# 4. 创建PR描述
cat > PR_DESCRIPTION.md << 'EOF'
# AMAS 文件重组

## 概述
重组AMAS模块，将110个文件减少到40个，提升可维护性。

## 变更统计
- 文件数量: 110 → 40 (-64%)
- 删除示例文件: 6个
- 合并模块: 10个
- 新建工具文件: 2个

## 测试结果
- ✅ 所有单元测试通过 (XXX/XXX)
- ✅ 所有集成测试通过 (XX/XX)
- ✅ 性能测试无回归
- ✅ 代码覆盖率: XX%

## 破坏性变更
无。所有公共API保持不变。

## 迁移指南
见 docs/amas-import-guide.md

...
EOF
````

##### 6.2 创建Pull Request

```bash
# 1. 推送分支
git push origin feat/amas-reorganization

# 2. 创建PR
gh pr create \
  --title "refactor: AMAS file reorganization (110→40 files)" \
  --body-file PR_DESCRIPTION.md \
  --base dev \
  --head feat/amas-reorganization
```

**验证检查点**:

- [ ] CI/CD通过
- [ ] 代码审查完成
- [ ] 文档审查通过
- [ ] 团队确认

---

### 4.2 回滚方案

#### 快速回滚（如果发现严重问题）

```bash
# 方案1: 回到基线
git reset --hard amas-reorganization-baseline
git push origin feat/amas-reorganization --force

# 方案2: 回到备份分支
git checkout amas-reorganization-backup
git checkout -b feat/amas-reorganization-v2

# 方案3: 部分回滚（回滚特定阶段）
git revert <commit-hash>  # 回滚某个合并提交
```

#### 渐进式回滚（如果部分模块有问题）

```bash
# 1. 标记问题模块
echo "engine adapters" > .rollback-modules

# 2. 从备份分支恢复特定模块
for module in $(cat .rollback-modules); do
  git checkout amas-reorganization-backup -- src/amas/$module
done

# 3. 运行测试
npm run test

# 4. 如果通过，提交修复
git commit -m "fix: rollback problematic modules"
```

---

### 4.3 风险评估

| 风险                 | 概率 | 影响 | 缓解措施                           |
| -------------------- | ---- | ---- | ---------------------------------- |
| 测试未覆盖的边缘情况 | 中   | 高   | 增加回归测试，仔细代码审查         |
| Native模块集成问题   | 中   | 高   | 先在测试环境验证，保留独立fallback |
| 导入路径错误         | 低   | 中   | 自动化脚本检查，TypeScript编译验证 |
| 性能回归             | 低   | 中   | 性能基准测试，对比基线指标         |
| Git历史丢失          | 低   | 低   | 使用git mv保留历史，避免rm+add     |
| 团队成员适应新结构   | 高   | 低   | 提供详细文档，举办代码演练会议     |
| 合并冲突（并行开发） | 中   | 中   | 尽早沟通，冻结AMAS模块开发         |
| CI/CD流程中断        | 低   | 中   | 在分支上完整测试CI流程             |

---

## 5. 自动化迁移脚本

### 5.1 主迁移脚本

```bash
#!/bin/bash
# scripts/amas-reorganization.sh
# AMAS文件重组主脚本

set -e  # 遇到错误立即退出
set -u  # 使用未定义变量时报错

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AMAS_DIR="$PROJECT_ROOT/src/amas"
BACKUP_DIR="$PROJECT_ROOT/.amas-backup-$(date +%Y%m%d-%H%M%S)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 前置检查
check_prerequisites() {
  log_info "检查前置条件..."

  # 检查是否在git仓库中
  if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    log_error "不在git仓库中"
    exit 1
  fi

  # 检查是否有未提交的更改
  if ! git diff-index --quiet HEAD --; then
    log_error "有未提交的更改，请先提交或暂存"
    exit 1
  fi

  # 检查是否在正确的分支
  current_branch=$(git branch --show-current)
  if [ "$current_branch" != "feat/amas-reorganization" ]; then
    log_warn "当前分支: $current_branch"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi

  # 检查Node.js和npm
  if ! command -v node &> /dev/null; then
    log_error "Node.js未安装"
    exit 1
  fi

  if ! command -v npm &> /dev/null; then
    log_error "npm未安装"
    exit 1
  fi

  log_info "前置检查通过"
}

# 2. 备份当前状态
backup_current_state() {
  log_info "备份当前状态到 $BACKUP_DIR..."
  mkdir -p "$BACKUP_DIR"
  cp -r "$AMAS_DIR" "$BACKUP_DIR/"
  log_info "备份完成"
}

# 3. 运行基线测试
run_baseline_tests() {
  log_info "运行基线测试..."
  npm run test:unit > "$BACKUP_DIR/baseline-tests.log" 2>&1
  if [ $? -ne 0 ]; then
    log_error "基线测试失败，请修复后再运行重组"
    exit 1
  fi
  log_info "基线测试通过"
}

# 4. 执行重组阶段
run_stage() {
  local stage=$1
  local description=$2

  log_info "=========================================="
  log_info "阶段 $stage: $description"
  log_info "=========================================="

  case $stage in
    1)
      delete_examples_and_docs
      ;;
    2)
      merge_small_modules
      ;;
    3)
      merge_adapters
      merge_policies
      merge_monitoring
      merge_config
      ;;
    4)
      merge_native_wrappers
      merge_engine
      ;;
    5)
      run_verification_tests
      ;;
    *)
      log_error "未知阶段: $stage"
      exit 1
      ;;
  esac

  # 每个阶段后运行测试
  log_info "运行阶段测试..."
  npm run test:unit
  if [ $? -ne 0 ]; then
    log_error "阶段 $stage 测试失败"
    echo "是否回滚此阶段? (y/N): "
    read -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rollback_stage $stage
      exit 1
    fi
  fi

  # 提交阶段变更
  git add .
  git commit -m "refactor(amas): stage $stage - $description"

  log_info "阶段 $stage 完成"
}

# 5. 删除示例和文档
delete_examples_and_docs() {
  log_info "删除示例和文档文件..."

  local files_to_delete=(
    "$AMAS_DIR/adapters/examples.ts"
    "$AMAS_DIR/adapters/README.md"
    "$AMAS_DIR/policies/examples.ts"
    "$AMAS_DIR/policies/usage-examples.ts"
    "$AMAS_DIR/policies/README.md"
    "$AMAS_DIR/models/emotion-detector.example.ts"
  )

  for file in "${files_to_delete[@]}"; do
    if [ -f "$file" ]; then
      rm "$file"
      log_info "删除: $file"
    else
      log_warn "文件不存在: $file"
    fi
  done
}

# 6. 合并小模块
merge_small_modules() {
  log_info "合并小模块..."

  # 合并cold-start
  node "$SCRIPT_DIR/merge-module.js" \
    --module cold-start \
    --files global-stats.ts,new-user-initializer.ts \
    --output index.ts

  # 合并repositories
  node "$SCRIPT_DIR/merge-module.js" \
    --module repositories \
    --files cached-repository.ts,database-repository.ts \
    --output index.ts \
    --keep-existing-index

  # 合并models
  node "$SCRIPT_DIR/merge-module.js" \
    --module models \
    --files emotion-detector.ts,flow-detector.ts \
    --output detectors.ts
}

# 7. 合并适配器
merge_adapters() {
  log_info "合并Adapters..."
  node "$SCRIPT_DIR/merge-adapters.js"
}

# 8. 合并策略
merge_policies() {
  log_info "合并Policies..."
  node "$SCRIPT_DIR/merge-policies.js"
}

# 9. 合并监控
merge_monitoring() {
  log_info "合并Monitoring..."
  node "$SCRIPT_DIR/merge-monitoring.js"
}

# 10. 合并配置
merge_config() {
  log_info "合并Config..."
  node "$SCRIPT_DIR/merge-config.js"
}

# 11. 合并Native Wrappers
merge_native_wrappers() {
  log_info "合并Native Wrappers..."
  node "$SCRIPT_DIR/merge-native-wrappers.js"
}

# 12. 合并Engine
merge_engine() {
  log_info "合并Engine..."
  node "$SCRIPT_DIR/merge-engine.js"
}

# 13. 验证测试
run_verification_tests() {
  log_info "运行完整验证测试..."

  npm run test:unit
  npm run test:integration
  npm run test:performance

  log_info "生成测试报告..."
  npm run test:coverage
}

# 14. 回滚阶段
rollback_stage() {
  local stage=$1
  log_warn "回滚阶段 $stage..."
  git reset --hard HEAD~1
  log_info "回滚完成"
}

# 15. 生成报告
generate_report() {
  log_info "生成重组报告..."

  local report_file="$PROJECT_ROOT/AMAS_REORGANIZATION_REPORT.md"

  cat > "$report_file" << EOF
# AMAS 文件重组报告

生成时间: $(date)

## 变更统计

### 文件数量变化
- 重组前: 110 个文件
- 重组后: $(find "$AMAS_DIR" -name "*.ts" | wc -l) 个文件
- 减少: $(( 110 - $(find "$AMAS_DIR" -name "*.ts" | wc -l) )) 个文件 (-$(( (110 - $(find "$AMAS_DIR" -name "*.ts" | wc -l)) * 100 / 110 ))%)

### 代码行数变化
- 重组前: 36,519 行
- 重组后: $(find "$AMAS_DIR" -name "*.ts" -exec wc -l {} + | tail -1 | awk '{print $1}') 行

### 提交历史
\`\`\`
$(git log --oneline amas-reorganization-baseline..HEAD)
\`\`\`

### 测试结果
- 单元测试: ✅ 通过
- 集成测试: ✅ 通过
- 性能测试: ✅ 通过
- 代码覆盖率: $(cat coverage/coverage-summary.json | jq '.total.lines.pct')%

## 主要变更

$(git diff --stat amas-reorganization-baseline..HEAD)

EOF

  log_info "报告已生成: $report_file"
}

# 主函数
main() {
  log_info "开始AMAS文件重组..."

  check_prerequisites
  backup_current_state
  run_baseline_tests

  # 执行各阶段
  run_stage 1 "删除示例和文档文件"
  run_stage 2 "合并小型模块"
  run_stage 3 "合并中等模块"
  run_stage 4 "合并核心模块"
  run_stage 5 "验证和测试"

  generate_report

  log_info "=========================================="
  log_info "AMAS文件重组完成！"
  log_info "=========================================="
  log_info "备份位置: $BACKUP_DIR"
  log_info "报告位置: $PROJECT_ROOT/AMAS_REORGANIZATION_REPORT.md"
  log_info ""
  log_info "下一步操作:"
  log_info "1. 审查变更: git diff amas-reorganization-baseline..HEAD"
  log_info "2. 运行完整测试: npm run test"
  log_info "3. 推送分支: git push origin feat/amas-reorganization"
  log_info "4. 创建PR: gh pr create"
}

# 捕获错误
trap 'log_error "脚本执行失败"; exit 1' ERR

# 运行主函数
main "$@"
```

### 5.2 模块合并工具（Node.js）

```javascript
// scripts/merge-module.js
/**
 * 通用模块合并工具
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

class ModuleMerger {
  constructor(options) {
    this.amasDir = options.amasDir || path.join(__dirname, '../src/amas');
    this.module = options.module;
    this.files = options.files || [];
    this.outputFile = options.outputFile;
    this.keepExistingIndex = options.keepExistingIndex || false;
  }

  async merge() {
    console.log(`合并模块: ${this.module}`);

    const moduleDir = path.join(this.amasDir, this.module);
    const outputPath = path.join(moduleDir, this.outputFile);

    // 1. 读取所有源文件
    const contents = [];
    for (const file of this.files) {
      const filePath = path.join(moduleDir, file);
      console.log(`  读取: ${file}`);
      const content = await readFileAsync(filePath, 'utf-8');
      contents.push({
        file,
        content: this.extractContent(content, file),
      });
    }

    // 2. 生成合并后的内容
    const mergedContent = this.generateMergedContent(contents);

    // 3. 写入输出文件
    await writeFileAsync(outputPath, mergedContent, 'utf-8');
    console.log(`  输出: ${this.outputFile}`);

    // 4. 验证TypeScript语法
    await this.validateTypeScript(outputPath);

    // 5. 删除源文件（如果不是index.ts）
    if (!this.keepExistingIndex) {
      for (const file of this.files) {
        if (file !== this.outputFile) {
          const filePath = path.join(moduleDir, file);
          fs.unlinkSync(filePath);
          console.log(`  删除: ${file}`);
        }
      }
    }

    console.log(`✅ 模块 ${this.module} 合并完成`);
  }

  extractContent(content, filename) {
    // 移除文件级注释（保留类和函数的文档注释）
    // 提取imports
    // 提取exports
    // 提取实现代码

    const lines = content.split('\n');
    const imports = [];
    const exports = [];
    const code = [];

    let inFileComment = false;
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 跳过文件头注释
      if (line.trim().startsWith('/**') && !inCode) {
        inFileComment = true;
        continue;
      }

      if (inFileComment) {
        if (line.trim().endsWith('*/')) {
          inFileComment = false;
        }
        continue;
      }

      // 收集imports
      if (line.trim().startsWith('import ')) {
        imports.push(line);
        continue;
      }

      // 收集exports
      if (line.trim().startsWith('export ')) {
        inCode = true;
        code.push(line);
        continue;
      }

      // 收集其他代码
      if (line.trim().length > 0 || inCode) {
        inCode = true;
        code.push(line);
      }
    }

    return {
      filename,
      imports: this.dedupeImports(imports),
      code: code.join('\n'),
    };
  }

  dedupeImports(imports) {
    const seen = new Set();
    return imports.filter((imp) => {
      if (seen.has(imp)) return false;
      seen.add(imp);
      return true;
    });
  }

  generateMergedContent(contents) {
    const allImports = [];
    const allCode = [];

    // 收集所有imports
    contents.forEach(({ imports }) => {
      allImports.push(...imports);
    });

    // 去重imports
    const uniqueImports = this.dedupeImports(allImports);

    // 生成文件头
    const header = `/**
 * ${this.module.toUpperCase()} 模块
 *
 * 此文件由以下文件合并而成：
${contents.map((c) => ` * - ${c.filename}`).join('\n')}
 *
 * 生成时间: ${new Date().toISOString()}
 */\n\n`;

    // 组装代码
    contents.forEach(({ filename, code }) => {
      allCode.push(`// ==================== ${filename} ====================\n`);
      allCode.push(code);
      allCode.push('\n');
    });

    return header + uniqueImports.join('\n') + '\n\n' + allCode.join('\n');
  }

  async validateTypeScript(filePath) {
    console.log(`  验证TypeScript语法...`);
    try {
      await execAsync(`npx tsc --noEmit ${filePath}`);
      console.log(`  ✅ 语法验证通过`);
    } catch (error) {
      console.error(`  ❌ 语法验证失败:`);
      console.error(error.stdout);
      throw error;
    }
  }
}

// CLI入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];

    if (key === 'files') {
      options[key] = value.split(',');
    } else if (key === 'keep-existing-index') {
      options.keepExistingIndex = true;
      i--; // 布尔标志无需值
    } else {
      options[key] = value;
    }
  }

  const merger = new ModuleMerger(options);
  merger.merge().catch((error) => {
    console.error('合并失败:', error);
    process.exit(1);
  });
}

module.exports = ModuleMerger;
```

### 5.3 导入路径更新工具

```javascript
// scripts/update-imports.js
/**
 * 自动更新导入路径
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 导入路径映射表
const IMPORT_MAPPINGS = {
  // Adapters
  '@/amas/adapters/linucb-adapter': '@/amas/adapters',
  '@/amas/adapters/thompson-adapter': '@/amas/adapters',
  '@/amas/adapters/ensemble-adapter': '@/amas/adapters',

  // Native wrappers
  '@/amas/learning/linucb-native-wrapper': '@/amas/learning/linucb',
  '@/amas/learning/thompson-sampling-native': '@/amas/learning/thompson-sampling',
  '@/amas/modeling/actr-memory-native': '@/amas/modeling/actr-memory',
  '@/amas/evaluation/causal-inference-native': '@/amas/evaluation/causal-inference',

  // Engine
  '@/amas/engine/engine-core': '@/amas/engine/core',
  '@/amas/engine/engine-types': '@/amas/engine/core',
  '@/amas/engine/engine-learning': '@/amas/engine/managers',
  '@/amas/engine/engine-modeling': '@/amas/engine/managers',
  '@/amas/engine/engine-resilience': '@/amas/engine/managers',
  '@/amas/engine/engine-isolation': '@/amas/engine/managers',
  '@/amas/engine/engine-persistence': '@/amas/engine/persistence',
  '@/amas/engine/engine-reward-cache': '@/amas/engine/persistence',

  // Config
  '@/amas/config/feature-flags': '@/amas/config/runtime',
  '@/amas/config/action-space': '@/amas/config/runtime',
  '@/amas/config/reward-profiles': '@/amas/config/runtime',

  // Monitoring
  '@/amas/monitoring/alert-config': '@/amas/monitoring/alerts',
  '@/amas/monitoring/alert-engine': '@/amas/monitoring/alerts',
  '@/amas/monitoring/monitoring-service': '@/amas/monitoring/service',

  // Policies
  '@/amas/policies/fatigue-based': '@/amas/policies/implementations',
  '@/amas/policies/micro-session-policy': '@/amas/policies/implementations',
  '@/amas/policies/policy-registry': '@/amas/policies/registry',
  '@/amas/policies/word-selector.interface': '@/amas/policies/registry',

  // Models
  '@/amas/models/emotion-detector': '@/amas/models/detectors',
  '@/amas/models/flow-detector': '@/amas/models/detectors',

  // Small modules
  '@/amas/cold-start/global-stats': '@/amas/cold-start',
  '@/amas/cold-start/new-user-initializer': '@/amas/cold-start',
  '@/amas/repositories/cached-repository': '@/amas/repositories',
  '@/amas/repositories/database-repository': '@/amas/repositories',
  '@/amas/versioning/model-registry': '@/amas/versioning',
  '@/amas/versioning/version-manager': '@/amas/versioning',
  '@/amas/versioning/types': '@/amas/versioning',
  '@/amas/rewards/immediate-reward': '@/amas/rewards',
};

class ImportUpdater {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.stats = {
      filesProcessed: 0,
      importsUpdated: 0,
      errors: [],
    };
  }

  async updateAllImports() {
    console.log('开始更新导入路径...');

    // 查找所有TypeScript文件（排除node_modules）
    const files = glob.sync('**/*.ts', {
      cwd: this.projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
      absolute: true,
    });

    console.log(`找到 ${files.length} 个文件`);

    for (const file of files) {
      try {
        await this.updateFile(file);
      } catch (error) {
        this.stats.errors.push({ file, error: error.message });
      }
    }

    this.printStats();
  }

  async updateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let updated = false;

    // 替换所有映射的导入
    for (const [oldPath, newPath] of Object.entries(IMPORT_MAPPINGS)) {
      const regex = new RegExp(`from ['"]${oldPath.replace(/\//g, '\\/')}['"]`, 'g');

      if (regex.test(content)) {
        content = content.replace(regex, `from '${newPath}'`);
        updated = true;
        this.stats.importsUpdated++;
      }
    }

    if (updated) {
      fs.writeFileSync(filePath, content, 'utf-8');
      this.stats.filesProcessed++;
      console.log(`✅ 更新: ${path.relative(this.projectRoot, filePath)}`);
    }
  }

  printStats() {
    console.log('\n========== 导入路径更新统计 ==========');
    console.log(`文件处理数: ${this.stats.filesProcessed}`);
    console.log(`导入更新数: ${this.stats.importsUpdated}`);

    if (this.stats.errors.length > 0) {
      console.log(`\n错误数: ${this.stats.errors.length}`);
      this.stats.errors.forEach(({ file, error }) => {
        console.log(`  ❌ ${file}: ${error}`);
      });
    }

    console.log('=======================================\n');
  }
}

// CLI入口
if (require.main === module) {
  const projectRoot = path.join(__dirname, '..');
  const updater = new ImportUpdater(projectRoot);

  updater.updateAllImports().catch((error) => {
    console.error('更新失败:', error);
    process.exit(1);
  });
}

module.exports = ImportUpdater;
```

---

## 6. 验证检查清单

### 6.1 功能验证

- [ ] 所有单元测试通过（npm run test:unit）
- [ ] 所有集成测试通过（npm run test:integration）
- [ ] 所有性能测试通过（npm run test:performance）
- [ ] 回归测试通过（npm run test:regression）
- [ ] E2E测试通过（如有）

### 6.2 代码质量

- [ ] ESLint检查通过（npm run lint）
- [ ] TypeScript编译无错误（npm run type-check）
- [ ] 代码格式化统一（npm run format:check）
- [ ] 代码覆盖率 ≥ 80%
- [ ] 无循环依赖

### 6.3 性能验证

- [ ] 冷启动时间未增加（<250ms）
- [ ] 内存占用未增加（<50MB）
- [ ] LinUCB选择性能无回归（<3ms）
- [ ] Thompson采样性能无回归（<2ms）
- [ ] 文件加载时间改善（-20%以上）

### 6.4 兼容性验证

- [ ] 所有公共API保持不变
- [ ] 导出接口完整
- [ ] 类型定义完整
- [ ] 向后兼容层工作正常
- [ ] Native模块fallback正常

### 6.5 文档验证

- [ ] README更新
- [ ] API文档更新
- [ ] 架构图更新
- [ ] 导入指南完整
- [ ] 迁移指南清晰

### 6.6 Git历史

- [ ] 提交信息清晰
- [ ] 每个阶段独立提交
- [ ] 文件移动使用git mv
- [ ] 可追溯的变更历史

---

## 7. 注意事项和最佳实践

### 7.1 合并文件时

1. **保持接口稳定**: 确保所有导出的接口保持不变
2. **渐进式合并**: 一次合并一个模块，而不是全部一起
3. **保留文档注释**: 合并时保留所有JSDoc和重要注释
4. **测试驱动**: 每次合并后立即运行测试
5. **使用git mv**: 移动文件时使用`git mv`保留历史

### 7.2 Native模块集成

1. **可选性**: Native模块始终是可选的增强
2. **优雅降级**: Native不可用时自动fallback到JS实现
3. **接口一致**: Native和JS实现保持完全一致的接口
4. **性能监控**: 监控Native和JS实现的性能差异
5. **错误处理**: 完善的错误处理和日志记录

### 7.3 导入路径管理

1. **使用别名**: 使用`@/amas`而不是相对路径
2. **统一入口**: 优先从`index.ts`导入
3. **避免深层嵌套**: 最多3层目录深度
4. **清晰命名**: 文件名清晰表达职责
5. **文档化**: 在README中列出主要导出

### 7.4 测试策略

1. **不删除测试**: 重组时不删除任何测试用例
2. **更新路径**: 只更新测试中的导入路径
3. **增加覆盖**: 对新的合并点增加测试
4. **回归测试**: 保留性能基准测试
5. **持续集成**: 确保CI管道全部通过

### 7.5 团队协作

1. **提前沟通**: 重组前告知所有团队成员
2. **冻结开发**: 重组期间冻结AMAS模块新功能开发
3. **代码审查**: 至少2人审查重组PR
4. **知识分享**: 举办代码演练会议
5. **文档先行**: 先完成文档再开始重组

---

## 8. 后续优化建议

### 8.1 短期（1-2周内）

1. **监控生产环境**: 密切关注性能指标和错误率
2. **收集反馈**: 从团队成员收集使用反馈
3. **修复小问题**: 快速迭代修复发现的小问题
4. **完善文档**: 根据使用情况补充文档

### 8.2 中期（1-2月内）

1. **性能优化**: 基于实际使用数据进行性能优化
2. **代码审查**: 全面审查合并后的代码质量
3. **测试增强**: 增加边缘情况测试覆盖
4. **工具改进**: 改进开发和调试工具

### 8.3 长期（3-6月内）

1. **架构评估**: 评估重组后的架构是否满足需求
2. **进一步优化**: 考虑是否需要进一步精简
3. **模式总结**: 总结可复用的重组模式
4. **文档体系**: 建立完整的文档体系

---

## 9. FAQ

### Q1: 为什么要减少文件数量？

**A**: 过多的小文件会导致：

- 导入路径复杂，难以记忆
- 文件跳转频繁，影响开发效率
- 代码分散，难以理解整体逻辑
- 维护成本高，重构困难

### Q2: 会不会影响Git历史？

**A**: 不会。我们使用`git mv`命令移动文件，Git会保留文件历史。合并文件时，新文件会包含原文件的所有信息。

### Q3: 如果Native模块不可用怎么办？

**A**: 代码会自动fallback到JavaScript实现，功能完全一致，只是性能稍低。

### Q4: 如何回滚到重组前的状态？

**A**: 使用`git reset --hard amas-reorganization-baseline`即可回到重组前的状态。

### Q5: 公共API会改变吗？

**A**: 不会。所有公共导出的接口、类型、函数保持完全不变，只是内部组织结构优化。

### Q6: 需要多长时间完成重组？

**A**: 预计2-3周：

- 准备和验证: 1-2天
- 低风险合并: 2-3天
- 中等风险合并: 3-4天
- 高风险合并: 4-5天
- 验证和优化: 2-3天
- 清理和发布: 1天

### Q7: 如何处理并行开发的冲突？

**A**: 建议：

1. 重组前冻结AMAS模块的新功能开发
2. 只接受紧急bug修复
3. 其他开发在重组完成后合并

### Q8: 性能会有影响吗？

**A**: 不会，甚至可能略有提升：

- 文件加载时间减少（更少的文件）
- 内存占用减少（更少的模块实例）
- 算法逻辑完全不变

---

## 10. 附录

### 10.1 相关文档

- [AMAS架构设计文档](./amas-architecture.md)
- [AMAS API文档](./amas-api.md)
- [代码风格指南](./coding-style-guide.md)
- [Git工作流](./git-workflow.md)

### 10.2 工具和脚本

所有脚本位于`scripts/`目录：

- `amas-reorganization.sh`: 主迁移脚本
- `merge-module.js`: 模块合并工具
- `update-imports.js`: 导入路径更新工具
- `merge-adapters.js`: 适配器合并脚本
- `merge-native-wrappers.js`: Native wrapper合并脚本
- `merge-engine.js`: Engine合并脚本

### 10.3 联系方式

如有问题，请联系：

- 技术负责人: [姓名]
- 架构师: [姓名]
- AMAS团队: [邮件列表]

---

**文档版本**: 1.0
**创建日期**: 2025-12-12
**最后更新**: 2025-12-12
**负责人**: AMAS重组项目组
