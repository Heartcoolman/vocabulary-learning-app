# AMAS 仓储模式重构 - 文档导航

欢迎！本索引帮助您快速找到所需的文档。

---

## 📚 文档概览

我们为 AMAS 仓储模式重构准备了 **4 份文档**，满足不同阅读需求：

| 文档                  | 适合人群           | 阅读时间    | 用途               |
| --------------------- | ------------------ | ----------- | ------------------ |
| 🎴 [快速参考卡](#1)   | 所有人             | **2 分钟**  | 快速查找关键信息   |
| 📋 [执行摘要](#2)     | 管理者、技术负责人 | **10 分钟** | 了解概况和决策要点 |
| 📊 [耦合分析报告](#3) | 技术负责人、架构师 | **20 分钟** | 深入理解问题和影响 |
| 📖 [完整重构方案](#4) | 开发工程师         | **60 分钟** | 详细实施指南       |

---

## <a name="1"></a>🎴 1. 快速参考卡

**文件**: [`AMAS_REPOSITORY_QUICK_REFERENCE.md`](./AMAS_REPOSITORY_QUICK_REFERENCE.md)

**适合人群**: 所有人

**内容摘要**:

- 核心问题（1 段）
- 解决方案（1 段）
- 成本收益表格
- 迁移步骤（6 步）
- 验收标准
- 常用命令

**何时使用**:

- ✅ 需要快速回顾关键信息
- ✅ 查找常用命令
- ✅ 向他人简要介绍项目
- ✅ 检查验收标准

**快速跳转**:

```bash
# 打开快速参考
cat AMAS_REPOSITORY_QUICK_REFERENCE.md
```

---

## <a name="2"></a>📋 2. 执行摘要

**文件**: [`AMAS_REPOSITORY_REFACTORING_SUMMARY.md`](./AMAS_REPOSITORY_REFACTORING_SUMMARY.md)

**适合人群**: 管理者、技术负责人、产品经理

**内容摘要**:

- 问题诊断（统计数据 + 受影响文件）
- 解决方案架构图
- 成本收益分析（量化）
- 6 阶段迁移计划
- 代码示例（重构前后对比）
- 风险与缓解措施
- 验收标准

**何时使用**:

- ✅ 向管理层汇报
- ✅ 制定项目计划
- ✅ 评估投资回报
- ✅ 团队启动会议

**关键数字**:

- 36 处 Prisma 调用
- 7 个耦合文件
- 146 工时（~18 工作日）
- 测试速度提升 90%
- ROI 57%，回本 7.6 个月

**快速跳转**:

```bash
# 打开执行摘要
less AMAS_REPOSITORY_REFACTORING_SUMMARY.md
```

---

## <a name="3"></a>📊 3. 耦合分析报告

**文件**: [`AMAS_PRISMA_COUPLING_ANALYSIS.md`](./AMAS_PRISMA_COUPLING_ANALYSIS.md)

**适合人群**: 技术负责人、架构师、高级工程师

**内容摘要**:

- **第 1-2 节**: 整体统计与可视化
- **第 3-4 节**: 7 个文件的详细分析（逐文件）
- **第 5-6 节**: 按操作类型和表分类
- **第 7 节**: 重构优先级矩阵
- **第 8-9 节**: 测试与性能分析
- **第 10-11 节**: 风险评估与 ROI 分析
- **第 12 节**: 执行建议与监控

**何时使用**:

- ✅ 深入理解耦合问题
- ✅ 制定技术方案
- ✅ 评审架构设计
- ✅ 分析性能影响
- ✅ 评估技术风险

**关键洞察**:

- word-memory-tracker.ts：10 次调用（最严重）
- stats-collector.ts：11 次调用（最多）
- 读操作占 72.2%（缓存优化潜力大）
- 批量查询可提升 85% 性能

**可视化图表**:

- 按文件分布柱状图
- 影响 vs 频率矩阵
- 性能提升对比表

**快速跳转**:

```bash
# 打开分析报告
less AMAS_PRISMA_COUPLING_ANALYSIS.md

# 跳转到特定章节
less +/word-memory-tracker AMAS_PRISMA_COUPLING_ANALYSIS.md  # 文件分析
less +/优先级矩阵 AMAS_PRISMA_COUPLING_ANALYSIS.md           # 优先级
less +/ROI AMAS_PRISMA_COUPLING_ANALYSIS.md                 # ROI 分析
```

---

## <a name="4"></a>📖 4. 完整重构方案

**文件**: [`AMAS_REPOSITORY_PATTERN_REFACTORING.md`](./AMAS_REPOSITORY_PATTERN_REFACTORING.md)

**适合人群**: 开发工程师、实施团队

**内容摘要** (200+ 页):

- **第 1 节**: 当前状态统计分析
- **第 2 节**: 完整仓储模式设计
  - 6 个仓储接口定义（含详细文档）
  - Prisma 实现类（含完整代码）
  - 内存 Mock 实现（用于测试）
  - 缓存装饰器设计
  - 依赖注入配置
- **第 3 节**: 重构成本与收益分析
- **第 4 节**: 分阶段迁移计划（6 阶段）
- **第 5 节**: 重构前后代码对比（3 个详细示例）
- **第 6 节**: 监控与运维指南
- **第 7 节**: 最佳实践与反模式
- **附录**: 快速参考、检查清单、命令速查

**何时使用**:

- ✅ 开始实施重构
- ✅ 编写仓储实现代码
- ✅ 编写单元测试
- ✅ 解决技术问题
- ✅ 查找代码示例
- ✅ 学习最佳实践

**关键章节**:

- **2.2 节**: 仓储接口定义（复制粘贴即可使用）
- **2.3 节**: Prisma 实现类（完整可运行代码）
- **2.3.2 节**: 内存 Mock 实现（测试专用）
- **5 节**: 代码对比示例（学习参考）
- **7 节**: 最佳实践（避免踩坑）

**代码示例**:

- 6 个仓储接口（TypeScript）
- 6 个 Prisma 实现类
- 6 个内存 Mock 类
- 3 个缓存装饰器
- 工厂模式配置
- 测试代码示例

**快速跳转**:

```bash
# 打开完整方案
less AMAS_REPOSITORY_PATTERN_REFACTORING.md

# 跳转到特定章节
less +/IWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md  # 接口定义
less +/PrismaWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md  # 实现类
less +/InMemoryWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md  # Mock
less +/CachedWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md  # 缓存
less +/重构前后代码对比 AMAS_REPOSITORY_PATTERN_REFACTORING.md  # 代码对比
less +/最佳实践 AMAS_REPOSITORY_PATTERN_REFACTORING.md  # 最佳实践
```

---

## 🗺️ 阅读路线图

### 路线 1: 决策者（10 分钟）

```
1️⃣ 快速参考卡 (2分钟)
   ↓
2️⃣ 执行摘要 - 问题诊断 (3分钟)
   ↓
3️⃣ 执行摘要 - 成本收益 (3分钟)
   ↓
4️⃣ 执行摘要 - 迁移计划 (2分钟)
   ↓
✅ 决策：是否启动项目
```

### 路线 2: 技术负责人（30 分钟）

```
1️⃣ 执行摘要 - 完整阅读 (10分钟)
   ↓
2️⃣ 耦合分析 - 整体统计 (5分钟)
   ↓
3️⃣ 耦合分析 - 文件详细分析 (10分钟)
   ↓
4️⃣ 耦合分析 - 风险与 ROI (5分钟)
   ↓
✅ 输出：技术方案评审意见
```

### 路线 3: 开发工程师（90 分钟）

```
1️⃣ 执行摘要 - 快速了解 (10分钟)
   ↓
2️⃣ 完整方案 - 仓储接口设计 (20分钟)
   ↓
3️⃣ 完整方案 - 实现类设计 (20分钟)
   ↓
4️⃣ 完整方案 - 代码对比示例 (15分钟)
   ↓
5️⃣ 完整方案 - 最佳实践 (15分钟)
   ↓
6️⃣ 快速参考 - 常用命令 (5分钟)
   ↓
✅ 输出：开始编码实施
```

### 路线 4: 新团队成员（60 分钟）

```
1️⃣ 快速参考卡 (5分钟)
   ↓
2️⃣ 执行摘要 - 问题与方案 (15分钟)
   ↓
3️⃣ 耦合分析 - 文件分析 (20分钟)
   ↓
4️⃣ 完整方案 - 代码示例 (15分钟)
   ↓
5️⃣ 快速参考 - 验收标准 (5分钟)
   ↓
✅ 输出：理解项目背景和目标
```

---

## 🔍 按需查找

### 查找接口定义

```bash
# 查看所有仓储接口
grep -A 20 "export interface I.*Repository" AMAS_REPOSITORY_PATTERN_REFACTORING.md
```

### 查找实现代码

```bash
# 查看 Prisma 实现
less +/PrismaWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md

# 查看内存实现
less +/InMemoryWordReviewTraceRepository AMAS_REPOSITORY_PATTERN_REFACTORING.md
```

### 查找特定文件的分析

```bash
# word-memory-tracker 分析
less +/word-memory-tracker AMAS_PRISMA_COUPLING_ANALYSIS.md

# llm-weekly-advisor 分析
less +/llm-weekly-advisor AMAS_PRISMA_COUPLING_ANALYSIS.md
```

### 查找成本收益数据

```bash
# ROI 分析
less +/ROI AMAS_PRISMA_COUPLING_ANALYSIS.md

# 成本分解
less +/成本分解 AMAS_REPOSITORY_REFACTORING_SUMMARY.md
```

### 查找迁移计划

```bash
# 6 阶段计划
less +/分阶段迁移计划 AMAS_REPOSITORY_PATTERN_REFACTORING.md

# 检查清单
less +/检查清单 AMAS_REPOSITORY_PATTERN_REFACTORING.md
```

---

## 📊 统计数据速查

### 当前状态

```
Prisma 调用次数: 36
耦合文件数量: 7
最严重文件: word-memory-tracker.ts (10次)
Raw SQL 查询: 1 次
```

### 重构成本

```
总工时: 146 小时
工作日: ~18 天
风险等级: 中等（可控）
```

### 预期收益

```
测试速度: ⬆️ 90% (3s → 0.3s)
Mock 代码: ⬇️ 80% (50行 → 10行)
测试覆盖率: ⬆️ +25%
查询性能: ⬆️ 3-5倍
ROI: 57%
回本周期: 7.6 个月
```

### 文件优先级

```
P0 (立即): word-memory-tracker, word-mastery-evaluator
P1 (近期): stats-collector, llm-weekly-advisor, global-stats
P2 (后期): cognitive, engine
```

---

## 🚀 快速开始

### 第一步：了解问题

```bash
# 打开执行摘要，阅读"问题诊断"部分
less AMAS_REPOSITORY_REFACTORING_SUMMARY.md
```

### 第二步：查看方案

```bash
# 打开执行摘要，阅读"解决方案"部分
less +/解决方案 AMAS_REPOSITORY_REFACTORING_SUMMARY.md
```

### 第三步：评估成本

```bash
# 打开耦合分析，查看 ROI
less +/ROI AMAS_PRISMA_COUPLING_ANALYSIS.md
```

### 第四步：制定计划

```bash
# 打开完整方案，查看迁移计划
less +/迁移计划 AMAS_REPOSITORY_PATTERN_REFACTORING.md
```

### 第五步：开始实施

```bash
# 打开完整方案，查看接口定义
less +/仓储接口定义 AMAS_REPOSITORY_PATTERN_REFACTORING.md
```

---

## 🛠️ 常用命令

### 统计当前耦合

```bash
# 统计 Prisma 调用数
grep -r "prisma\." src/amas --exclude-dir=repositories | wc -l

# 按文件统计
grep -r "prisma\." src/amas --exclude-dir=repositories | cut -d: -f1 | sort | uniq -c | sort -rn
```

### 运行测试

```bash
# 运行 AMAS 测试
npm test -- --grep "AMAS"

# 查看覆盖率
npm run test:coverage

# 性能测试
npm run test:perf
```

### 验收检查

```bash
# 检查 Prisma 调用清零
grep -r "prisma\." src/amas --exclude-dir=repositories
# 期望：0 个结果

# 检查类型错误
npm run type-check

# 检查 ESLint
npm run lint
```

---

## 📞 获取帮助

### 技术问题

- 查看 [完整重构方案 - 第 6 节：监控与运维](./AMAS_REPOSITORY_PATTERN_REFACTORING.md#6-监控与运维指南)
- 查看 [完整方案 - 第 7 节：最佳实践与反模式](./AMAS_REPOSITORY_PATTERN_REFACTORING.md#7-最佳实践与反模式)

### 实施问题

- 查看 [完整方案 - 第 4 节：迁移计划](./AMAS_REPOSITORY_PATTERN_REFACTORING.md#4-分阶段迁移计划)
- 查看 [快速参考 - 验收标准](./AMAS_REPOSITORY_QUICK_REFERENCE.md#验收标准)

### 代码示例

- 查看 [完整方案 - 第 5 节：代码对比](./AMAS_REPOSITORY_PATTERN_REFACTORING.md#5-重构前后代码对比)
- 查看 [完整方案 - 第 2 节：实现类](./AMAS_REPOSITORY_PATTERN_REFACTORING.md#23-实现类设计)

---

## 📝 文档维护

### 版本历史

| 版本 | 日期       | 变更内容 | 作者      |
| ---- | ---------- | -------- | --------- |
| 1.0  | 2025-01-XX | 初始版本 | AMAS 团队 |

### 更新计划

- **重构启动后**: 更新进度和实际成本
- **阶段 1 完成**: 更新 P0 文件迁移结果
- **阶段 2 完成**: 更新 P1 文件迁移结果
- **全量上线后**: 更新最终收益数据

---

## 🎯 核心信息

**项目名称**: AMAS 仓储模式重构

**项目目标**: 解耦 Prisma 依赖，提升可测试性和可维护性

**项目规模**: 36 处调用，7 个文件，146 工时

**预期收益**: 测试速度 ⬆️90%，性能 ⬆️3-5倍，ROI 57%

**项目状态**: ⏳ 待启动

**负责团队**: AMAS 团队

**联系方式**: [待补充]

---

**最后更新**: 2025-01-XX
**文档版本**: 1.0
