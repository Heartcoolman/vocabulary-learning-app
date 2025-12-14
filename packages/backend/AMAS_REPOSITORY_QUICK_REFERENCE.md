# AMAS 仓储重构 - 快速参考卡

## 🎯 核心问题

```
❌ 当前状态：35+ 处 Prisma 直接调用
❌ 7 个文件严重耦合
❌ 测试困难（需要复杂的 Mock）
❌ 无法扩展（缓存、多数据源）
```

## ✅ 解决方案

**仓储模式 (Repository Pattern)**

- 接口与实现分离
- 依赖注入
- 装饰器组合
- 内存 Mock 测试

## 📊 成本收益

| 项目           | 数据                      |
| -------------- | ------------------------- |
| **重构工时**   | 146小时 (~18工作日)       |
| **测试速度**   | ⬆️ 提升 90% (3s → 0.3s)   |
| **Mock 代码**  | ⬇️ 减少 80% (50行 → 10行) |
| **测试覆盖率** | ⬆️ 提升潜力 +25%          |

## 🗂️ 需要实现的仓储

### P0 优先级（第一周）

- ✅ `IWordReviewTraceRepository` - 复习轨迹
- ✅ `IWordMasteryRepository` - 单词掌握度

### P1 优先级（第二周）

- ⏳ `IGlobalStatsRepository` - 全局统计
- ⏳ `ILLMSuggestionRepository` - LLM 建议
- ⏳ `IUserBehaviorStatsRepository` - 用户行为统计

### P2 优先级（第三周）

- ⏳ `IUserRewardRepository` - 奖励配置

## 📝 代码对比

### 重构前 ❌

```typescript
class WordMemoryTracker {
  async recordReview(...) {
    await prisma.wordReviewTrace.create(...);
  }
}

// 测试：需要 Mock Prisma（50+ 行）
```

### 重构后 ✅

```typescript
class WordMemoryTracker {
  constructor(private repo: IWordReviewTraceRepository) {}

  async recordReview(...) {
    await this.repo.recordReview(...);
  }
}

// 测试：使用内存仓储（10 行）
const repo = new InMemoryWordReviewTraceRepository();
const tracker = new WordMemoryTracker(repo);
```

## 🚀 迁移步骤

```
1️⃣ 设计（2天）      → 接口 + Mock 实现
2️⃣ 核心仓储（4天）   → P0 实现 + 测试
3️⃣ 业务迁移1（2天）  → 核心逻辑迁移
4️⃣ 统计仓储（3天）   → P1 实现
5️⃣ 业务迁移2（2天）  → 统计逻辑迁移
6️⃣ 优化部署（3天）   → 清零 + 灰度
```

## ✅ 验收标准

```bash
# 1. Prisma 调用清零
grep -r "prisma\." src/amas --exclude-dir=repositories
# 期望：0 个结果

# 2. 测试通过
npm test -- --grep "Repository"
# 期望：100% 通过

# 3. 覆盖率达标
npm run test:coverage
# 期望：≥ 80%

# 4. 性能无回归
npm run test:perf
# 期望：延迟 ≤ 110% 基准
```

## 🎨 装饰器组合示例

```typescript
const repo = new MetricsRepository( // 4️⃣ 监控
  new CachedRepository( // 3️⃣ 缓存
    new LoggingRepository( // 2️⃣ 日志
      new PrismaRepository(), // 1️⃣ 数据访问
    ),
  ),
);
```

## 🔍 快速命令

```bash
# 统计 Prisma 使用
grep -r "prisma\." src/amas --exclude-dir=repositories | wc -l

# 运行测试
npm test -- --grep "AMAS"

# 查看覆盖率
npm run test:coverage

# 类型检查
npm run type-check

# 性能测试
npm run test:perf
```

## 📚 文档导航

- 📖 [完整重构方案](./AMAS_REPOSITORY_PATTERN_REFACTORING.md) - 详细设计和实现
- 📋 [执行摘要](./AMAS_REPOSITORY_REFACTORING_SUMMARY.md) - 快速概览
- 🎴 本卡片 - 快速参考

## ⚠️ 关键风险

| 风险         | 缓解措施            |
| ------------ | ------------------- |
| 数据迁移错误 | 充分测试 + 灰度发布 |
| 性能回归     | 基准测试 + 监控对比 |
| 接口设计不足 | 设计评审 + 预留扩展 |

## 🎯 关键里程碑

| 天数   | 里程碑       | 验收                   |
| ------ | ------------ | ---------------------- |
| Day 2  | 设计完成     | ✅ 接口评审通过        |
| Day 6  | P0 仓储完成  | ✅ 测试 + 无性能回归   |
| Day 10 | 核心迁移完成 | ✅ Prisma 调用减少 70% |
| Day 16 | Prisma 清零  | ✅ 0 个直接调用        |
| Day 18 | 全量上线     | ✅ 灰度完成            |

## 💡 最佳实践

✅ **接口优先**：先定义接口，再实现
✅ **依赖注入**：通过构造函数注入仓储
✅ **装饰器组合**：灵活添加缓存、日志等
✅ **仓储纯粹**：只做数据访问，不含业务逻辑
✅ **批量优化**：提供批量查询接口

❌ **避免反模式**：

- ❌ 仓储中不要有业务逻辑
- ❌ 不要使用通用仓储（如 `Repository<T>`）
- ❌ 仓储之间不要直接依赖
- ❌ 不要在基础仓储中混入缓存

## 🔗 相关资源

- Martin Fowler - Repository Pattern
- SOLID 原则
- 依赖注入模式
- 装饰器模式

---

**最后更新：** 2025-01-XX
**版本：** 1.0
