# AMAS Decision Pipeline 迁移文档

## 一、功能概述

AMAS Decision Pipeline 是一个异步决策轨迹记录系统，用于捕获和分析 AMAS（Adaptive Multi-Algorithm System）的决策过程。

### 核心功能

- **异步记录**：决策轨迹异步写入数据库，不阻塞主业务流程
- **流水线追踪**：记录感知/建模/学习/决策/评估/优化六个阶段的详细信息
- **可观测性**：Prometheus 格式指标，支持监控和告警
- **特性开关**：通过环境变量控制数据源（虚拟/真实）和读写权限
- **降级机制**：队列满时触发背压控制，超时后丢弃数据并告警

### 架构组件

| 组件                    | 说明                           |
| ----------------------- | ------------------------------ |
| DecisionRecorderService | 异步队列 + 批量写入 + 重试机制 |
| RealAboutService        | 基于 Prisma 的数据查询服务     |
| AmasMetrics             | Prometheus 指标收集器          |
| FeatureFlags            | 特性开关配置                   |
| About Routes            | 统计与监控 API                 |

---

## 二、前置条件检查

### 2.1 数据库版本

确认 PostgreSQL 版本 >= 12

```bash
psql --version
```

### 2.2 依赖包版本

检查 `package.json` 中的关键依赖：

```json
{
  "@prisma/client": "^5.22.0",
  "@paralleldrive/cuid2": "^2.2.2"
}
```

### 2.3 现有数据备份

**⚠️ 迁移前务必备份数据库**

```bash
pg_dump -h localhost -U your_user -d your_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## 三、迁移步骤（分阶段部署）

### Phase 1: 数据库 Schema 变更

#### 3.1 运行迁移

```bash
cd backend
npx prisma migrate deploy
```

#### 3.2 验证表结构

```sql
-- 检查 DecisionRecord 表
\d "DecisionRecord"

-- 检查 PipelineStage 表
\d "PipelineStage"

-- 验证索引
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('DecisionRecord', 'PipelineStage');
```

预期索引：

- `DecisionRecord_answerRecordId_idx`
- `DecisionRecord_sessionId_idx`
- `DecisionRecord_timestamp_idx`
- `PipelineStage_decisionRecordId_idx`

---

### Phase 2: 代码部署（虚拟数据源）

#### 3.3 部署代码

```bash
git pull origin dev
npm install
npm run build
```

#### 3.4 启动服务（虚拟数据源）

```bash
# 使用默认配置（虚拟数据源，写入禁用）
npm run dev
```

#### 3.5 验证基础功能

运行测试脚本：

```bash
chmod +x test-amas-decision-pipeline.sh
./test-amas-decision-pipeline.sh
```

预期输出：

```
✓ 健康状态 (HTTP 200)
✓ 特性开关 (HTTP 200) - aboutDataSource: "virtual"
✓ JSON格式指标 (HTTP 200)
✓ Prometheus格式指标 (HTTP 200)
✓ 概览统计 (HTTP 200) - source: "virtual"
```

---

### Phase 3: 启用真实数据源（只读）

#### 3.6 切换到真实数据源

```bash
# 停止服务
pkill -f "npm run dev"

# 启动真实数据源（只读模式）
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
npm run dev
```

#### 3.7 验证读取功能

```bash
# 检查特性开关
curl http://localhost:3000/api/about/feature-flags | jq

# 检查数据源
curl http://localhost:3000/api/about/stats/overview | jq '.source'
# 预期输出: "real"
```

#### 3.8 观察 24-48 小时

监控关键指标：

- 响应时间是否正常
- 错误率是否异常
- 数据库连接池使用情况

---

### Phase 4: 启用写入（灰度）

#### 3.9 开启决策写入

```bash
# 停止服务
pkill -f "npm run dev"

# 启动写入模式（灰度阶段）
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
AMAS_REAL_DATA_WRITE_ENABLED=true \
npm run dev
```

#### 3.10 验证写入功能

触发一次决策流程（通过实际业务操作），然后查询：

```bash
# 查询近期决策
curl http://localhost:3000/api/about/stats/recent-decisions | jq

# 查询流水线快照
curl http://localhost:3000/api/about/pipeline/snapshot | jq
```

#### 3.11 监控写入指标

```bash
# 查看 Prometheus 指标
curl http://localhost:3000/api/about/metrics/prometheus | grep amas_

# 关键指标：
# - amas_write_success_total（成功写入数）
# - amas_write_failure_total（失败写入数）
# - amas_queue_size（队列大小）
# - amas_queue_backpressure_total（背压触发次数）
# - amas_queue_backpressure_timeout_total（背压超时次数）
```

---

## 四、环境变量配置

### 4.1 特性开关

| 变量                           | 值                 | 说明             |
| ------------------------------ | ------------------ | ---------------- |
| `AMAS_ABOUT_DATA_SOURCE`       | `virtual` / `real` | 数据源选择       |
| `AMAS_REAL_DATA_READ_ENABLED`  | `true` / `false`   | 真实数据读取权限 |
| `AMAS_REAL_DATA_WRITE_ENABLED` | `true` / `false`   | 决策记录写入权限 |

### 4.2 推荐部署流程

```bash
# 阶段 1: 虚拟数据源（默认，无需配置）
npm run dev

# 阶段 2: 真实数据源 + 只读
AMAS_ABOUT_DATA_SOURCE=real AMAS_REAL_DATA_READ_ENABLED=true npm run dev

# 阶段 3: 真实数据源 + 读写
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
AMAS_REAL_DATA_WRITE_ENABLED=true \
npm run dev
```

### 4.3 生产环境配置

在 `.env` 或系统环境变量中设置：

```bash
# .env.production
AMAS_ABOUT_DATA_SOURCE=real
AMAS_REAL_DATA_READ_ENABLED=true
AMAS_REAL_DATA_WRITE_ENABLED=true
```

---

## 五、监控要点

### 5.1 关键指标

| 指标名                                          | 类型      | 说明         | 告警阈值     |
| ----------------------------------------------- | --------- | ------------ | ------------ |
| `amas_write_success_total`                      | Counter   | 写入成功次数 | -            |
| `amas_write_failure_total`                      | Counter   | 写入失败次数 | > 10/min     |
| `amas_write_duration_ms`                        | Histogram | 写入耗时分布 | p99 > 5000ms |
| `amas_queue_size`                               | Gauge     | 队列长度     | > 800        |
| `amas_queue_backpressure_total`                 | Counter   | 背压触发次数 | > 5/min      |
| `amas_queue_backpressure_timeout_total`         | Counter   | 背压超时次数 | > 0          |
| `amas_error_total{type="backpressure_timeout"}` | Counter   | 超时丢弃次数 | > 0          |

### 5.2 健康检查

```bash
# 健康状态
curl http://localhost:3000/api/about/health

# 预期输出
{
  "status": "healthy",
  "dataSource": "real",
  "writeEnabled": true,
  "readEnabled": true
}
```

### 5.3 日志监控

关键日志模式：

```bash
# 背压超时告警
grep "Backpressure timeout" backend.log

# 写入失败
grep "Failed to persist decision" backend.log

# 队列刷新
grep "DecisionRecorder.*flush" backend.log
```

---

## 六、回滚步骤

### 6.1 紧急回滚（关闭写入）

如果发现严重问题（如数据库压力过大、写入失败率高）：

```bash
# 停止服务
pkill -f "npm run dev"

# 回滚到只读模式
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
AMAS_REAL_DATA_WRITE_ENABLED=false \
npm run dev
```

### 6.2 完全回滚（切换到虚拟数据源）

```bash
# 停止服务
pkill -f "npm run dev"

# 使用默认配置（虚拟数据源）
npm run dev
```

### 6.3 回滚数据库 Schema（慎用）

**⚠️ 仅在确认不再需要 Decision Pipeline 功能时执行**

```bash
# 查看迁移历史
npx prisma migrate status

# 回滚到指定版本
npx prisma migrate resolve --rolled-back 20251130031432_add_decision_pipeline_tables

# 删除表（需手动执行 SQL）
psql -U your_user -d your_db <<EOF
DROP TABLE IF EXISTS "PipelineStage" CASCADE;
DROP TABLE IF EXISTS "DecisionRecord" CASCADE;
EOF
```

### 6.4 恢复备份数据

```bash
# 从备份恢复
psql -U your_user -d your_db < backup_YYYYMMDD_HHMMSS.sql
```

---

## 七、故障排查

### 7.1 服务无法启动

**症状**: 启动时报错 `Cannot find module`

**排查**:

```bash
# 检查依赖
npm install

# 检查 TypeScript 编译
npm run build

# 查看详细错误
npm run dev 2>&1 | tee debug.log
```

### 7.2 数据库连接失败

**症状**: 日志显示 `Prisma connection failed`

**排查**:

```bash
# 检查数据库连接
npx prisma db pull

# 检查环境变量
echo $DATABASE_URL

# 测试连接
psql $DATABASE_URL -c "SELECT 1"
```

### 7.3 队列积压

**症状**: `amas_queue_size` 持续升高

**原因**: 写入速度 < 决策产生速度

**解决**:

```bash
# 临时关闭写入
AMAS_REAL_DATA_WRITE_ENABLED=false npm run dev

# 检查数据库性能
# 分析慢查询
# 增加批处理大小（需修改代码）
```

### 7.4 背压超时频繁

**症状**: `amas_queue_backpressure_timeout_total` 增长

**原因**: 队列长期满载，5秒内无法释放

**解决**:

1. 检查数据库写入性能
2. 增加队列容量（修改 `MAX_QUEUE_SIZE`）
3. 优化批处理逻辑
4. 考虑水平扩展

### 7.5 指标数据不准确

**症状**: Prometheus 指标与实际不符

**排查**:

```bash
# 检查指标端点
curl http://localhost:3000/api/about/metrics/prometheus

# 验证计数器
# 确认 updateQueueSize() 在 flush 后被调用
# 检查 finally 块中的指标更新
```

---

## 八、性能调优

### 8.1 批处理配置

修改 [decision-recorder.service.ts](backend/src/amas/services/decision-recorder.service.ts:60-64):

```typescript
const MAX_QUEUE_SIZE = 1000; // 队列容量
const MAX_BATCH_SIZE = 20; // 批处理大小
const QUEUE_FLUSH_INTERVAL_MS = 1000; // 刷新间隔
const BACKPRESSURE_TIMEOUT_MS = 5000; // 超时时间
```

### 8.2 数据库索引优化

```sql
-- 如果查询 timestamp 范围较多，考虑添加 BRIN 索引
CREATE INDEX decision_record_timestamp_brin_idx
ON "DecisionRecord" USING BRIN (timestamp);

-- 如果需要按 sessionId 聚合分析
CREATE INDEX decision_record_session_timestamp_idx
ON "DecisionRecord" ("sessionId", "timestamp" DESC);
```

### 8.3 连接池调优

修改 Prisma 连接配置：

```bash
# DATABASE_URL 中添加连接池参数
DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public&connection_limit=20&pool_timeout=10"
```

---

## 九、常见问题 FAQ

**Q: 数据源切换是否需要重启服务？**
A: 是的，环境变量在进程启动时读取，修改后需重启。

**Q: 虚拟数据源的数据会保存吗？**
A: 不会，虚拟数据源仅生成模拟数据，不涉及数据库。

**Q: 可以同时启用虚拟和真实数据源吗？**
A: 不可以，`AMAS_ABOUT_DATA_SOURCE` 只能选择其中一个。

**Q: 如何清空已记录的决策数据？**
A: 执行 `DELETE FROM "DecisionRecord";`（会级联删除 PipelineStage）

**Q: 背压机制会丢失数据吗？**
A: 仅在队列满且超时 5 秒后才丢弃新数据，并记录告警日志和指标。

---

## 十、联系方式

如遇到文档未覆盖的问题，请：

1. 查看 [backend/src/amas/services/decision-recorder.service.ts](backend/src/amas/services/decision-recorder.service.ts) 的代码注释
2. 检查 [backend/test-amas-decision-pipeline.sh](backend/test-amas-decision-pipeline.sh) 测试脚本
3. 查看 Prometheus 指标端点 `/api/about/metrics/prometheus`
