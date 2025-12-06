# 更新日志

## [Unreleased] - 2024-12 项目改进

### 架构重构 ✅

#### Engine 模块化拆分
- **engine-persistence.ts** - 状态持久化模块 (133 行)
  - `saveState()` 方法
  - `loadOrCreateState()` 方法
  - `PersistenceManager` 接口

- **engine-decision-trace.ts** - 决策轨迹记录 (199 行)
  - `recordDecisionTrace()` 方法
  - `buildPipelineStages()` 方法
  - 失败降级支持

- **engine-reward-cache.ts** - 奖励配置缓存
  - TTL 管理
  - 缓存统计
  - 自动清理

- **engine-feature-vector.ts** - 特征向量构建
  - 22 维特征标签定义
  - 向量序列化/反序列化

#### Worker 池框架
- **workers/pool.ts** - Piscina 池配置
  - 任务类型: `linucb_select`, `linucb_update`, `bayesian_suggest`
  - 自动降级到同步模式

- **workers/compute.worker.ts** - 计算 Worker
  - 矩阵运算卸载
  - Cholesky 分解

- **linucb-async.ts** - LinUCB 异步版本
  - Worker 池集成
  - 小维度 (d<10) 自动使用同步

#### 前端 Hook 抽取
- **useDialogPauseTracking.ts** - 对话框暂停计时
  - 暂停时间追踪
  - 埋点集成
  - 27 个测试用例

- **useTestOptions.ts** - 测试选项生成
  - 选项随机化
  - 错误处理
  - 23 个测试用例

- **useAutoPlayPronunciation.ts** - 自动朗读控制
  - 播放延迟管理
  - 播放状态跟踪
  - 25 个测试用例

#### 路由配置外置
- App.tsx 从 429 行简化到 53 行
- 新增路由模块:
  - `routes/types.ts`
  - `routes/public.routes.tsx`
  - `routes/user.routes.tsx` (18 条路由)
  - `routes/admin.routes.tsx` (15 条路由)
  - `routes/about.routes.tsx` (5 条路由)

### 数据库优化 ✅

#### Redis 缓存防护
- **KEYS → SCAN 迁移** - 避免大 key 空间阻塞
- **穿透防护** - `getOrSet()` 空值缓存
- **击穿防护** - `getOrSetWithLock()` 分布式锁
- **雪崩防护** - `setWithJitter()` TTL ±10% 抖动
- 连接失败降级日志

#### 批量写入缓冲
- **answer-buffer.service.ts** - Redis Stream 缓冲
  - 阈值: 100 条或 5 秒
  - 批量写入数据库
  - 优雅关闭支持
  - 16 个测试用例

#### 索引优化评审
- 识别 3 个可删除的冗余索引
- 生成迁移脚本草稿 (待 DBA 审批)

#### TimescaleDB 评审
- 外键删除影响分析
- 建议生产前添加触发器约束

### 测试覆盖 ✅

#### 占位符测试清理
- 删除 108 个占位符测试文件
- 真实覆盖率基线建立

#### 新增测试
- engine-core 关键路径测试 (16 用例)
- LinUCB 边界测试 (66 用例)
- ThompsonSampling 边界测试
- ColdStartManager 边界测试
- Redis 缓存防护测试 (39 用例)
- 答题缓冲服务测试 (16 用例)
- 前端 Hook 测试 (75 用例)
- LinUCB 异步测试 (36 用例)

#### E2E 测试
- learning-flow.spec.ts - 完整学习流程
- amas-decision.spec.ts - AMAS 决策链路
- 共 54 个场景

#### 性能测试
- ColdStart 性能基准
- 矩阵运算性能
- 内存泄漏检测

### 测试统计

| 包 | 测试文件 | 测试用例 | 状态 |
|----|---------|---------|------|
| @danci/backend | 60 | 1245 | ✅ 100% |
| @danci/frontend | 41 | 741 | ✅ 100% |

### 性能指标

| 操作 | 阈值 | 实测 P99 |
|------|------|----------|
| ColdStart Select | < 5ms | 0.018ms |
| ColdStart Update | < 10ms | 0.015ms |
| Feature Build | < 2ms | 0.002ms |
| Matrix Multiply | < 1ms | 0.013ms |

### 已识别风险

| 风险 | 状态 | 备注 |
|------|------|------|
| Redis KEYS 阻塞 | ✅ 已修复 | 改用 SCAN |
| 占位符测试 | ✅ 已清理 | 删除 108 个文件 |
| TimescaleDB 外键 | ⚠️ 需评审 | 生产执行前确认 |
| 索引冗余 | ⚠️ 需审批 | 迁移脚本已准备 |

### 文件变更统计

- 新增文件: 25+
- 修改文件: 30+
- 删除文件: 108 (占位符测试)
- 总代码变更: ~8000 行
