# 性能测试指南

本目录包含后端系统的性能基准测试套件。

## 测试套件

### 1. AMAS 性能测试

**文件**: `amas-benchmarks.test.ts`

测试 AMAS (Adaptive Multi-Armed Strategy) 核心组件性能:

- Online Loop 完整周期 (目标: <50ms)
- Feature Builder (目标: <5ms)
- LinUCB Adapter (目标: <10ms)
- Offline Loop (目标: <200ms)
- 内存泄漏检测
- 并发性能

### 2. 服务层性能测试

**文件**: `service-benchmarks.test.ts`

测试核心服务方法性能:

- CacheService (目标: get <2ms, set <5ms)
- EventBus (目标: publish <5ms)
- LearningStateService (目标: getWordState <10ms)
- UserProfileService (目标: getUserProfile <50ms)
- 并发操作性能
- 内存使用监控

### 3. API 性能测试

**文件**: `api-benchmarks.test.ts`

测试 HTTP API 端点性能:

- 关键 API 响应时间 (P50, P95, P99)
- 负载测试 (使用 autocannon)
- 数据库查询性能模拟
- 缓存命中率分析
- 错误处理性能

### 4. AMAS 引擎测试 (已有)

**文件**: `amas-engine.perf.test.ts`

测试 AMAS 引擎低层组件。

## 运行测试

### 运行所有性能测试

```bash
npm run test:performance
```

### 运行特定测试文件

```bash
# AMAS 性能测试
npm run test:performance -- amas-benchmarks

# 服务层性能测试
npm run test:performance -- service-benchmarks

# API 性能测试
npm run test:performance -- api-benchmarks
```

### 详细输出模式

```bash
npm run test:performance -- --reporter=verbose
```

### 运行单个测试套件

```bash
# 只运行 AMAS Online Loop 测试
npm run test:performance -- -t "Online Loop"

# 只运行缓存性能测试
npm run test:performance -- -t "CacheService"
```

## 性能阈值

### AMAS 组件

| 组件            | 平均值 | P95    | P99    |
| --------------- | ------ | ------ | ------ |
| Online Loop     | <50ms  | <80ms  | <100ms |
| Feature Builder | <5ms   | <10ms  | <15ms  |
| Decision Policy | <20ms  | <30ms  | <40ms  |
| LinUCB Select   | <10ms  | <15ms  | <20ms  |
| Offline Loop    | <200ms | <300ms | <500ms |

### 服务层

| 服务方法                     | 平均值 | P95   | P99    |
| ---------------------------- | ------ | ----- | ------ |
| Cache.get()                  | <2ms   | <5ms  | <10ms  |
| Cache.set()                  | <5ms   | <10ms | <15ms  |
| EventBus.publish()           | <5ms   | <8ms  | <10ms  |
| LearningState.getWordState() | <10ms  | <15ms | <20ms  |
| UserProfile.getUserProfile() | <50ms  | <80ms | <100ms |

### API 端点

| 端点                                     | 平均值 | P95    | P99    |
| ---------------------------------------- | ------ | ------ | ------ |
| GET /learning-state/:userId              | <100ms | <150ms | <200ms |
| POST /sessions/:sessionId/answers        | <150ms | <200ms | <300ms |
| GET /realtime/sessions/:sessionId/stream | <50ms  | <100ms | <150ms |
| POST /words/select                       | <200ms | <300ms | <500ms |

## 测试环境要求

### 最小配置

- Node.js >= 18
- 可用内存 >= 2GB
- 相对空闲的 CPU

### 推荐配置

- 独立测试环境
- 数据库服务运行中
- Redis 服务运行中
- 无其他负载干扰

### API 测试额外要求

- 后端服务需要运行在 `http://localhost:3000`
- 或设置环境变量 `API_BASE_URL`

```bash
# 启动后端服务
npm run dev

# 在另一个终端运行 API 性能测试
npm run test:performance -- api-benchmarks
```

## 性能工具

### performance-utils.ts

提供统一的性能测试工具:

```typescript
import {
  PerformanceMeasure,
  StatisticsCalculator,
  PerformanceValidator,
  MemoryMonitor,
  ConcurrencyTester,
} from '../helpers/performance-utils';

// 测量同步函数
const { result, duration } = PerformanceMeasure.measureSync(() => {
  return someFunction();
});

// 测量异步函数
const { result, duration } = await PerformanceMeasure.measureAsync(async () => {
  return await someAsyncFunction();
});

// 批量测量
const durations = await PerformanceMeasure.measureMultipleAsync(
  () => asyncFunction(),
  100, // 迭代次数
);

// 计算统计数据
const stats = StatisticsCalculator.calculateStats(durations);
console.log(`Avg: ${stats.avg.toFixed(3)}ms`);
console.log(`P95: ${stats.p95.toFixed(3)}ms`);

// 验证性能阈值
const result = PerformanceValidator.validate(stats, {
  name: 'My Operation',
  avgThreshold: 50,
  p95Threshold: 80,
});

if (!result.passed) {
  console.error(`Performance test failed: ${result.failureReason}`);
}

// 内存监控
const before = MemoryMonitor.snapshot();
// ... 执行操作 ...
const after = MemoryMonitor.snapshot();
const diff = MemoryMonitor.diff(before, after);
console.log(`Memory growth: ${diff.heapUsed.toFixed(2)} MB`);

// 内存泄漏检测
const { leaked, growth } = await MemoryMonitor.detectLeak(
  async () => someOperation(),
  1000, // 迭代次数
  10, // 最大允许增长 (MB)
);
```

## 解读测试结果

### 性能统计指标

- **Avg (平均值)**: 所有测量的平均时间
- **P50 (中位数)**: 50% 的请求在此时间内完成
- **P95**: 95% 的请求在此时间内完成 (常用 SLA 指标)
- **P99**: 99% 的请求在此时间内完成 (极端情况)
- **Min/Max**: 最佳和最差情况
- **StdDev (标准差)**: 性能波动程度,越小越稳定

### 示例输出

```
✓ CacheService.get()
  Count: 500, Avg: 1.234ms, P50: 1.100ms, P95: 2.500ms,
  P99: 3.200ms, Min: 0.800ms, Max: 5.100ms, StdDev: 0.650ms
```

### 判断标准

- **通过**: Avg, P95, P99 都在阈值内
- **警告**: P95 或 P99 超过阈值,但 Avg 正常
- **失败**: Avg 或 P95 明显超过阈值

## 负载测试

### 使用 Autocannon

```bash
# 基本负载测试
npx autocannon -c 50 -d 10 http://localhost:3000/health

# 持续负载测试
npx autocannon -c 100 -d 30 http://localhost:3000/api/v1/...

# 自定义配置
npx autocannon \
  --connections 100 \
  --duration 60 \
  --pipelining 1 \
  --timeout 30 \
  http://localhost:3000/api/endpoint
```

### 参数说明

- `-c, --connections`: 并发连接数
- `-d, --duration`: 测试持续时间 (秒)
- `-p, --pipelining`: 管道请求数
- `-t, --timeout`: 请求超时 (秒)

## 性能分析

### 使用 Clinic.js (可选)

```bash
# 安装
npm install -g clinic

# Doctor - 性能诊断
clinic doctor -- npm run dev

# Flame - 火焰图
clinic flame -- npm run dev

# Bubbleprof - 异步性能
clinic bubbleprof -- npm run dev
```

### Node.js 内置分析

```bash
# 生成 CPU profile
node --prof src/index.js

# 分析 profile
node --prof-process isolate-*.log > processed.txt
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
- name: Run Performance Tests
  run: npm run test:performance

- name: Check Performance Regression
  run: |
    npm run test:performance -- --reporter=json > perf-results.json
    node scripts/check-performance-regression.js
```

### 性能回归检测

阈值:

- **允许退化**: <10% (警告)
- **阻止合并**: >20% (失败)

## 最佳实践

1. **隔离测试环境**: 避免其他进程干扰
2. **预热系统**: 运行几次预热后再测量
3. **多次测量**: 至少 100-500 次迭代
4. **监控资源**: 同时监控 CPU、内存、I/O
5. **记录基线**: 保存初始性能数据用于对比
6. **定期运行**: 每周或每次重大变更后运行
7. **分析趋势**: 关注性能变化趋势,不只是绝对值

## 故障排查

### 性能测试失败

1. **检查系统资源**

   ```bash
   top
   htop
   free -h
   ```

2. **检查依赖服务**
   - 数据库是否运行
   - Redis 是否运行
   - 网络连接是否正常

3. **查看日志**

   ```bash
   tail -f logs/app.log
   ```

4. **减少迭代次数**
   - 临时降低测试迭代次数诊断问题

### 性能不达标

1. **定位瓶颈**
   - 使用 Clinic.js 或 Chrome DevTools
   - 查看最慢的操作

2. **检查数据库**
   - 查询是否有索引
   - 是否存在 N+1 查询

3. **检查缓存**
   - 缓存命中率是否正常
   - TTL 设置是否合理

4. **检查并发**
   - 是否存在锁竞争
   - 连接池是否够用

## 相关文档

- [性能基准报告](../../docs/PERFORMANCE_BENCHMARKS.md)
- [Vitest 文档](https://vitest.dev/)
- [Autocannon 文档](https://github.com/mcollina/autocannon)
- [Node.js 性能指南](https://nodejs.org/en/docs/guides/simple-profiling/)

## 贡献

如果要添加新的性能测试:

1. 使用 `performance-utils.ts` 中的工具
2. 定义明确的性能阈值
3. 包含足够的迭代次数 (100+)
4. 添加内存泄漏检测
5. 更新文档说明

## 问题反馈

如有性能测试相关问题,请提交 Issue 并包含:

- 测试输出日志
- 系统环境信息
- 运行的具体命令
