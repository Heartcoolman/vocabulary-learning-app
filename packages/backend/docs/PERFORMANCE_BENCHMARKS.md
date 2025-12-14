# 性能基准测试报告

## 概述

本文档记录了单词学习平台 (danci) 后端系统的性能基准测试结果、测试方法和性能优化建议。

**测试日期**: 2025-12-12
**测试环境**: Development
**测试工具**: Vitest, Autocannon, Supertest

---

## 目录

1. [性能目标](#性能目标)
2. [测试方法](#测试方法)
3. [核心指标](#核心指标)
4. [AMAS 性能基准](#amas-性能基准)
5. [服务层性能基准](#服务层性能基准)
6. [API 性能基准](#api-性能基准)
7. [数据库查询性能](#数据库查询性能)
8. [缓存性能](#缓存性能)
9. [内存使用分析](#内存使用分析)
10. [并发性能](#并发性能)
11. [性能瓶颈分析](#性能瓶颈分析)
12. [优化建议](#优化建议)
13. [回归测试](#回归测试)

---

## 性能目标

### 整体性能目标

| 组件                 | 指标       | 目标值  | P95     | P99     |
| -------------------- | ---------- | ------- | ------- | ------- |
| **AMAS Online Loop** | 端到端延迟 | < 50ms  | < 80ms  | < 100ms |
| **API 响应时间**     | 平均响应   | < 200ms | < 300ms | < 500ms |
| **数据库查询**       | 单条查询   | < 10ms  | < 20ms  | < 30ms  |
| **缓存操作**         | Get/Set    | < 5ms   | < 10ms  | < 15ms  |
| **EventBus**         | 事件发布   | < 5ms   | < 8ms   | < 10ms  |

### 关键服务性能目标

| 服务                     | 方法               | 目标 (Avg) |
| ------------------------ | ------------------ | ---------- |
| **LearningStateService** | `getWordState()`   | < 10ms     |
| **UserProfileService**   | `getUserProfile()` | < 50ms     |
| **WordSelectionService** | `selectWords()`    | < 100ms    |

---

## 测试方法

### 测试工具

1. **Vitest**: 单元和集成测试框架
2. **Autocannon**: HTTP 负载测试工具
3. **Supertest**: HTTP API 测试
4. **自定义性能工具**: `tests/helpers/performance-utils.ts`

### 测试类型

#### 1. 微基准测试 (Micro-benchmarks)

- 测试单个函数或方法的执行时间
- 迭代次数: 500-1000 次
- 统计指标: Avg, P50, P95, P99, Min, Max, StdDev

#### 2. 端到端测试 (E2E Benchmarks)

- 测试完整请求-响应周期
- 包含数据库、缓存、网络开销
- 模拟真实用户场景

#### 3. 负载测试 (Load Testing)

- 使用 Autocannon 进行高并发测试
- 测试持续负载下的性能表现
- 监控吞吐量和错误率

#### 4. 内存泄漏检测

- 重复执行操作 1000+ 次
- 监控堆内存增长
- 阈值: < 10-20MB 增长

### 性能指标说明

- **Avg (平均值)**: 所有测量的平均值
- **P50 (中位数)**: 50% 的请求在此时间内完成
- **P95**: 95% 的请求在此时间内完成
- **P99**: 99% 的请求在此时间内完成
- **Min/Max**: 最小和最大响应时间
- **StdDev (标准差)**: 数据分散程度

---

## 核心指标

### 性能阈值定义

```typescript
// AMAS 组件阈值
const AMAS_THRESHOLDS = {
  'online-loop.process': { avg: 50, p95: 80, p99: 100 }, // 最关键
  'online-loop.feature-build': { avg: 5, p95: 10, p99: 15 },
  'online-loop.decision': { avg: 20, p95: 30, p99: 40 },
  'offline-loop.update': { avg: 200, p95: 300, p99: 500 },
  'linucb.select': { avg: 10, p95: 15, p99: 20 },
};

// 服务层阈值
const SERVICE_THRESHOLDS = {
  'learning-state.getWordState': { avg: 10, p95: 15, p99: 20 },
  'user-profile.getUserProfile': { avg: 50, p95: 80, p99: 100 },
  'event-bus.publish': { avg: 5, p95: 8, p99: 10 },
  'cache.get': { avg: 2, p95: 5, p99: 10 },
};

// API 阈值
const API_THRESHOLDS = {
  'api.learning-state.get': { avg: 100, p95: 150, p99: 200 },
  'api.sessions.answer': { avg: 150, p95: 200, p99: 300 },
  'api.words.select': { avg: 200, p95: 300, p99: 500 },
};
```

---

## AMAS 性能基准

### Online Loop 性能

**测试文件**: `tests/performance/amas-benchmarks.test.ts`

#### 完整周期性能

| 指标     | 目标    | 实测值 | 状态   |
| -------- | ------- | ------ | ------ |
| 平均时间 | < 50ms  | TBD    | 待测试 |
| P95      | < 80ms  | TBD    | 待测试 |
| P99      | < 100ms | TBD    | 待测试 |

#### 子组件分解

```
Online Loop 总时长 = Feature Build + Cognitive Update + Decision + Reward
目标: 5ms + 10ms + 20ms + 5ms = 40ms (留10ms余量)
```

| 组件              | 目标 (Avg) | 实测 | 占比 |
| ----------------- | ---------- | ---- | ---- |
| Feature Builder   | < 5ms      | TBD  | ~10% |
| Cognitive Update  | < 10ms     | TBD  | ~20% |
| Decision Policy   | < 20ms     | TBD  | ~40% |
| Reward Evaluation | < 5ms      | TBD  | ~10% |
| 其他开销          | < 10ms     | TBD  | ~20% |

### LinUCB Adapter 性能

| 操作             | 目标 (Avg) | 实测 | 备注           |
| ---------------- | ---------- | ---- | -------------- |
| `selectAction()` | < 10ms     | TBD  | 矩阵运算 O(d²) |
| `update()`       | < 15ms     | TBD  | Rank-1 更新    |

### Offline Loop 性能

| 指标         | 目标 (Avg) | 实测 | 备注         |
| ------------ | ---------- | ---- | ------------ |
| Model Update | < 200ms    | TBD  | 批量数据处理 |

### AMAS 并发性能

**测试场景**: 50个并发用户,每用户10个请求

| 指标           | 目标        | 实测 |
| -------------- | ----------- | ---- |
| 平均每请求时间 | < 50ms      | TBD  |
| 总吞吐量       | > 500 req/s | TBD  |

---

## 服务层性能基准

### CacheService 性能

**测试文件**: `tests/performance/service-benchmarks.test.ts`

| 操作             | 目标 (Avg) | 实测 | 备注       |
| ---------------- | ---------- | ---- | ---------- |
| `get()`          | < 2ms      | TBD  | Redis 读取 |
| `set()`          | < 5ms      | TBD  | Redis 写入 |
| 批量操作 (100条) | < 500ms    | TBD  | 并发写入   |

### EventBus 性能

| 操作           | 目标 (Avg) | 实测 | 备注     |
| -------------- | ---------- | ---- | -------- |
| `publish()`    | < 5ms      | TBD  | 单订阅者 |
| 多订阅者 (5个) | < 10ms     | TBD  | 100事件  |

### LearningStateService 性能

| 方法                   | 目标 (Avg) | 实测 | 备注         |
| ---------------------- | ---------- | ---- | ------------ |
| `getWordState()`       | < 10ms     | TBD  | 单词状态查询 |
| `batchGetWordStates()` | < 50ms     | TBD  | 批量查询     |
| `updateWordState()`    | < 20ms     | TBD  | 状态更新     |

---

## API 性能基准

### 关键 API 端点

**测试文件**: `tests/performance/api-benchmarks.test.ts`

#### 核心学习 API

| 端点                                          | 方法 | 目标 (Avg) | P95     | P99     | 实测 |
| --------------------------------------------- | ---- | ---------- | ------- | ------- | ---- |
| `/api/v1/learning-state/:userId`              | GET  | < 100ms    | < 150ms | < 200ms | TBD  |
| `/api/v1/sessions/:sessionId/answers`         | POST | < 150ms    | < 200ms | < 300ms | TBD  |
| `/api/v1/realtime/sessions/:sessionId/stream` | GET  | < 50ms     | < 100ms | < 150ms | TBD  |
| `/api/v1/words/select`                        | POST | < 200ms    | < 300ms | < 500ms | TBD  |

#### 用户认证 API

| 端点                | 方法 | 目标 (Avg) | 实测 |
| ------------------- | ---- | ---------- | ---- |
| `/api/auth/login`   | POST | < 200ms    | TBD  |
| `/api/user/profile` | GET  | < 100ms    | TBD  |

### 负载测试结果

#### Health Check 负载测试

**配置**: 50并发连接, 10秒持续

| 指标     | 目标        | 实测 |
| -------- | ----------- | ---- |
| 总请求数 | > 1000      | TBD  |
| 平均延迟 | < 100ms     | TBD  |
| P99 延迟 | < 200ms     | TBD  |
| 吞吐量   | > 100 req/s | TBD  |
| 错误率   | 0%          | TBD  |

#### 持续负载测试

**配置**: 100并发连接, 30秒持续

| 指标     | 目标        | 实测 |
| -------- | ----------- | ---- |
| 平均延迟 | < 150ms     | TBD  |
| P99 延迟 | < 300ms     | TBD  |
| 吞吐量   | > 100 req/s | TBD  |

---

## 数据库查询性能

### 查询类型分析

| 查询类型          | 目标 (Avg) | 实测 | 使用场景               |
| ----------------- | ---------- | ---- | ---------------------- |
| 单条记录查询      | < 10ms     | TBD  | `findUnique()`         |
| 批量查询 (< 50条) | < 50ms     | TBD  | `findMany()`           |
| 复杂联表查询      | < 150ms    | TBD  | 多表 JOIN              |
| 聚合查询          | < 200ms    | TBD  | `groupBy()`, `count()` |

### 查询优化建议

1. **索引优化**
   - 为常用查询字段添加索引
   - 复合索引优化多字段查询
   - 定期分析慢查询日志

2. **查询优化**
   - 使用 `select` 只查询需要的字段
   - 批量查询替代 N+1 查询
   - 使用 `include` 预加载关联数据

3. **数据库配置**
   - 连接池大小优化
   - 查询超时设置
   - 事务隔离级别

---

## 缓存性能

### 缓存命中率分析

**目标命中率**: > 70%

| 场景     | 命中率 | Cache Hit 时间 | Cache Miss 时间 | 速度提升 |
| -------- | ------ | -------------- | --------------- | -------- |
| 用户配置 | TBD    | TBD            | TBD             | TBD      |
| 单词状态 | TBD    | TBD            | TBD             | TBD      |
| 学习数据 | TBD    | TBD            | TBD             | TBD      |

### 缓存策略

1. **热点数据缓存**
   - 用户个人资料 (TTL: 1小时)
   - 单词基础信息 (TTL: 24小时)
   - 学习状态 (TTL: 30分钟)

2. **缓存更新策略**
   - Write-Through: 写入同时更新缓存
   - Cache-Aside: 读取时检查缓存
   - 主动失效: 数据变更时清除相关缓存

3. **缓存键设计**
   ```typescript
   // 示例缓存键格式
   `user:${userId}:profile``word:${wordId}:state:${userId}``session:${sessionId}:data`;
   ```

---

## 内存使用分析

### 内存基线

| 指标       | 值     |
| ---------- | ------ |
| Heap Used  | TBD MB |
| Heap Total | TBD MB |
| RSS        | TBD MB |
| External   | TBD MB |

### 内存泄漏检测

**测试方法**: 重复执行操作 1000 次,监控内存增长

| 组件             | 迭代次数 | 允许增长 | 实测增长 | 状态   |
| ---------------- | -------- | -------- | -------- | ------ |
| Cache 操作       | 1000     | < 10 MB  | TBD      | 待测试 |
| EventBus         | 1000     | < 10 MB  | TBD      | 待测试 |
| AMAS Online Loop | 1000     | < 15 MB  | TBD      | 待测试 |
| LinUCB 操作      | 1000     | < 10 MB  | TBD      | 待测试 |

### 内存优化建议

1. **对象池化**
   - 重用大型对象 (如矩阵、缓冲区)
   - 避免频繁创建临时对象

2. **定期清理**
   - 清理过期缓存
   - 释放未使用的连接
   - 定期触发 GC (如适用)

3. **监控告警**
   - 内存使用超过阈值告警
   - 内存增长趋势监控

---

## 并发性能

### 并发缓存读取

**测试配置**: 500 个并发请求

| 指标   | 目标        | 实测 |
| ------ | ----------- | ---- |
| 总耗时 | < 1000ms    | TBD  |
| 吞吐量 | > 100 req/s | TBD  |
| 成功率 | 100%        | TBD  |

### 并发事件发布

**测试配置**: 500 个并发事件

| 指标   | 目标           | 实测 |
| ------ | -------------- | ---- |
| 总耗时 | < 2000ms       | TBD  |
| 吞吐量 | > 100 events/s | TBD  |

### 并发 AMAS 处理

**测试配置**: 50 个并发用户,每用户 10 个请求

| 指标       | 目标        | 实测 |
| ---------- | ----------- | ---- |
| 平均每请求 | < 50ms      | TBD  |
| 吞吐量     | > 500 req/s | TBD  |

---

## 性能瓶颈分析

### 已识别的瓶颈

#### 1. AMAS Decision Policy

- **问题**: LinUCB 矩阵运算 O(d²) 可能成为瓶颈
- **影响**: Online Loop 总延迟的 ~40%
- **优化方向**:
  - 使用 SIMD 优化矩阵运算
  - 预计算常用矩阵
  - 考虑使用 Native 模块

#### 2. 数据库连接池

- **问题**: 高并发下连接池耗尽
- **影响**: 请求排队等待
- **优化方向**:
  - 增加连接池大小
  - 实现连接复用
  - 添加连接超时和重试机制

#### 3. 缓存未命中

- **问题**: 冷启动或缓存过期导致性能下降
- **影响**: 响应时间增加 10-20 倍
- **优化方向**:
  - 缓存预热
  - 延长热点数据 TTL
  - 实现缓存分级

#### 4. 事件处理阻塞

- **问题**: 同步事件处理阻塞主流程
- **影响**: 端到端延迟增加
- **优化方向**:
  - 异步事件处理
  - 事件队列批处理
  - 事件优先级管理

---

## 优化建议

### 短期优化 (1-2 周)

1. **缓存优化**
   - [ ] 实现缓存预热机制
   - [ ] 优化缓存键设计
   - [ ] 添加缓存监控

2. **数据库优化**
   - [ ] 添加缺失的索引
   - [ ] 优化 N+1 查询
   - [ ] 调整连接池配置

3. **代码优化**
   - [ ] 减少不必要的对象创建
   - [ ] 优化热路径代码
   - [ ] 添加性能日志

### 中期优化 (1-2 月)

1. **架构优化**
   - [ ] 实现分布式缓存
   - [ ] 添加读写分离
   - [ ] 实现异步事件处理

2. **AMAS 优化**
   - [ ] 优化 LinUCB 矩阵运算
   - [ ] 实现模型缓存
   - [ ] 添加模型预加载

3. **监控优化**
   - [ ] 添加实时性能监控
   - [ ] 实现性能告警
   - [ ] 建立性能基线

### 长期优化 (3-6 月)

1. **基础设施**
   - [ ] 考虑使用 Redis Cluster
   - [ ] 实现数据库分片
   - [ ] 添加 CDN 支持

2. **高级优化**
   - [ ] 使用 Native 模块加速计算
   - [ ] 实现智能缓存预测
   - [ ] 添加自适应负载均衡

3. **可观测性**
   - [ ] 集成 APM 工具
   - [ ] 实现分布式追踪
   - [ ] 建立性能仪表板

---

## 回归测试

### 性能回归检测

**目标**: 确保性能不会随时间退化

#### CI/CD 集成

```bash
# 在 CI 中运行性能测试
npm run test:performance

# 比较与基线的差异
npm run test:performance:compare
```

#### 回归阈值

- **允许退化**: < 10%
- **警告退化**: 10-20%
- **阻止合并**: > 20%

#### 监控指标

- 关键 API P95 响应时间
- AMAS Online Loop P99 延迟
- 数据库查询平均时间
- 缓存命中率
- 内存使用趋势

---

## 运行测试

### 本地运行

```bash
# 运行所有性能测试
npm run test:performance

# 运行特定测试套件
npm run test:performance -- amas-benchmarks
npm run test:performance -- service-benchmarks
npm run test:performance -- api-benchmarks

# 详细输出
npm run test:performance -- --reporter=verbose
```

### 生产环境测试

```bash
# 使用生产配置
NODE_ENV=production npm run test:performance

# 对真实 API 进行负载测试
API_BASE_URL=https://api.example.com npm run test:performance
```

### 性能分析

```bash
# 使用 Clinic.js 进行性能分析 (可选)
clinic doctor -- npm run dev
clinic flame -- npm run dev
clinic bubbleprof -- npm run dev
```

---

## 附录

### 测试文件清单

```
tests/
├── helpers/
│   └── performance-utils.ts          # 性能测试工具类
└── performance/
    ├── amas-benchmarks.test.ts       # AMAS 性能测试
    ├── service-benchmarks.test.ts    # 服务层性能测试
    ├── api-benchmarks.test.ts        # API 性能测试
    └── amas-engine.perf.test.ts      # 已有的 AMAS 引擎测试
```

### 相关资源

- [Vitest 文档](https://vitest.dev/)
- [Autocannon 文档](https://github.com/mcollina/autocannon)
- [Node.js 性能最佳实践](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Prisma 性能优化](https://www.prisma.io/docs/guides/performance-and-optimization)

### 贡献者

- 性能测试框架设计与实现
- 基准测试套件开发
- 文档编写

---

**最后更新**: 2025-12-12
**版本**: 1.0.0
**维护者**: Backend Team
