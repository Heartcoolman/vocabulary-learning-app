# Proposal: Fix Audit Missing Features

## Summary

补全Danci全功能审计中发现的缺失功能。本提案聚焦于P1级别的15个缺失功能，这些功能有前端入口但完全缺乏后端实现。

## Motivation

### Problem Statement

2025-01-25全功能审计发现15个P1缺失功能：

**认证与用户相关 (2)**

1. **邮件发送服务** - 密码重置依赖但完全未实现
2. **个人资料头像上传** - UI存在但后端无实现

**语义搜索相关 (4)** 3. **语义搜索页面UI** - 后端存在但前端页面缺失 4. **聚类学习集成** - 有cluster数据但未与学习流程整合5. **易混淆词分页** - 后端返回全量数据无分页支持 6. **相似词组件** - 后端有但前端组件缺失

**管理后台相关 (5)** 7. **实验结果导出** - A/B测试结果无法导出8. **配置历史Diff视图** - 只有列表无对比功能 9. **周报自动调度** - 手动生成无定时任务 10. **系统健康趋势预测** - 只显示当前状态无预测 11. **审计日志导出** - 日志无法批量导出

**后端服务相关 (4)** 12. **嵌入后台Worker** - embedding_worker.rs存在但未启用13. **聚类后台Worker** - clustering.rs存在但未启用14. **AMAS重大变化API** - changes端点返回空15. **分群分类服务** - segment_classifier.rs缺失

### Impact

- **功能完整性**: 前端有入口但点击无响应，用户体验差
- **管理效率**: 管理员缺少导出和分析工具
- **系统利用率**: 已开发的后端组件未被使用

## Proposed Solution

### Phase 1: 核心服务补全

- 实现邮件服务provider
- 启用embedding和clustering workers

### Phase 2: 语义搜索UI

- 创建语义搜索页面
- 集成相似词和聚类组件

### Phase 3: 管理后台增强

- 实现导出功能（实验结果、审计日志）
- 添加配置Diff视图

### Phase 4: 分群与调度

- 实现segment_classifier服务
- 添加周报定时任务

## Scope

### In Scope

- 15个P1缺失功能的完整实现
- 相关API端点和前端组件
- 单元测试和集成测试

### Out of Scope

- P0问题（已在fix-audit-critical-issues中处理）
- P2/P3级别问题
- 现有功能的重构

## Dependencies

- fix-audit-critical-issues提案（邮件服务基础设施）
- PostgreSQL pgvector扩展（语义搜索）

## Risks

| Risk               | Mitigation               |
| ------------------ | ------------------------ |
| Worker启用影响性能 | 配置可控的并发和批次大小 |
| 语义搜索数据量大   | 实现分页和缓存           |
| 导出功能内存占用   | 流式处理，限制单次导出量 |

## Success Criteria

1. 所有15个缺失功能可正常使用
2. 前端所有入口都有对应的后端响应
3. Worker正常运行且可监控
4. 导出功能支持合理大小的数据集

---

## Constraints (Zero-Decision Implementation Spec)

### C1. 邮件服务 (Email Service)

| 约束ID | 约束       | 值                                                                    |
| ------ | ---------- | --------------------------------------------------------------------- |
| E1     | 提供商     | SMTP                                                                  |
| E2     | 重试策略   | 指数退避, max=3, backoff=1s→2s→4s                                     |
| E3     | 发送模式   | 异步后台任务                                                          |
| E4     | 速率限制   | 60s/user + 10/min/IP                                                  |
| E5     | 发送超时   | 10s                                                                   |
| E6     | 模板存储   | 数据库 (email_templates表)                                            |
| E7     | 发件人配置 | 环境变量必填 (EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) |

**PBT属性**:

- `INVARIANT[E-TOKEN-UNIQUE]`: 密码重置token单次有效，消费后立即失效
- `INVARIANT[E-TOKEN-TTL]`: token有效期24h，过期后必须拒绝
- `INVARIANT[E-RATE-LIMIT]`: 同一用户60s内第二次请求返回429

### C2. 头像上传 (Avatar Upload)

| 约束ID | 约束         | 值                               |
| ------ | ------------ | -------------------------------- |
| A1     | 存储后端     | PostgreSQL BLOB (user_avatars表) |
| A2     | 文件大小限制 | 5MB                              |
| A3     | 允许格式     | JPEG, PNG, WebP (MIME校验)       |
| A4     | 图片处理     | 压缩 + 裁剪为正方形 + 移除EXIF   |
| A5     | 目标尺寸     | 256x256                          |
| A6     | 旧头像处理   | 覆盖删除                         |

**PBT属性**:

- `INVARIANT[A-SIZE]`: 上传文件 > 5MB 必须返回413
- `INVARIANT[A-FORMAT]`: 非允许MIME类型返回415
- `INVARIANT[A-DIMENSION]`: 处理后图片尺寸恒为256x256
- `INVARIANT[A-CONSISTENCY]`: 数据库avatar_id非空 ⟺ BLOB数据存在

### C3. 语义搜索 (Semantic Search)

| 约束ID | 约束         | 值                                        |
| ------ | ------------ | ----------------------------------------- |
| S1     | 分页模型     | page/pageSize                             |
| S2     | 默认页大小   | 20                                        |
| S3     | 最大结果数   | 100                                       |
| S4     | 缓存TTL      | 5min (Redis key: `semantic:{query_hash}`) |
| S5     | 最小查询长度 | 2字符                                     |
| S6     | 速率限制     | 20次/分钟/用户                            |

**PBT属性**:

- `INVARIANT[S-PAGINATION]`: ∀page: len(results) ≤ pageSize ∧ page≥1
- `INVARIANT[S-ORDER]`: 结果按相似度降序，distance[i] ≤ distance[i+1]
- `INVARIANT[S-NO-DUP]`: 分页结果集无重复，∩(Page_i, Page_j) = ∅
- `INVARIANT[S-QUERY-LEN]`: 查询长度<2返回400

### C4. 聚类服务 (Clustering)

| 约束ID | 约束       | 值                                    |
| ------ | ---------- | ------------------------------------- |
| C1     | 聚类算法   | HDBSCAN                               |
| C2     | 最小簇大小 | 3                                     |
| C3     | 重聚类频率 | 每周一03:00 UTC + 手动触发API         |
| C4     | 簇命名策略 | 启发式 - 选取距质心最近的词作为代表词 |
| C5     | 更新策略   | 全量替换 (删除旧簇→插入新簇)          |

**PBT属性**:

- `INVARIANT[C-MIN-SIZE]`: ∀cluster: len(cluster.words) ≥ 3
- `INVARIANT[C-EXHAUSTIVE]`: 有embedding的词必属于某个簇或标记为噪声
- `INVARIANT[C-DETERMINISTIC]`: 相同embedding输入→相同簇分配

### C5. Worker配置

| 约束ID | 约束              | 值                                        |
| ------ | ----------------- | ----------------------------------------- |
| W1     | Embedding批次大小 | 50                                        |
| W2     | API并发请求数     | 3                                         |
| W3     | 错误重试次数      | 3                                         |
| W4     | 重试退避策略      | 指数退避 1s→2s→4s                         |
| W5     | 健康检查间隔      | 60s                                       |
| W6     | 领导者选举        | 数据库锁 (worker_locks表, lease_ttl=5min) |

**PBT属性**:

- `INVARIANT[W-IDEMPOTENT]`: 重复处理同一词不产生重复embedding记录
- `INVARIANT[W-LEADER]`: 任意时刻同类型worker最多1个持有锁
- `INVARIANT[W-HEALTH]`: last_heartbeat间隔 ≤ 60s (正常运行时)

### C6. 导出功能 (Export)

| 约束ID | 约束         | 值                           |
| ------ | ------------ | ---------------------------- |
| X1     | 默认格式     | CSV                          |
| X2     | CSV编码      | UTF-8 BOM (0xEF 0xBB 0xBF)   |
| X3     | 最大导出行数 | 50,000                       |
| X4     | 超限处理     | 返回422 Unprocessable Entity |
| X5     | 导出模式     | 同步流式 (chunked transfer)  |
| X6     | 时间戳时区   | UTC (ISO 8601格式)           |

**PBT属性**:

- `INVARIANT[X-LIMIT]`: 请求行数>50000返回422
- `INVARIANT[X-ROUNDTRIP]`: parse(export(data)) == data (字段完整性)
- `INVARIANT[X-BOM]`: CSV文件前3字节 == [0xEF, 0xBB, 0xBF]

### C7. 分群分类 (Segment Classifier)

| 约束ID | 约束         | 值                                        |
| ------ | ------------ | ----------------------------------------- |
| G1     | 新用户定义   | 注册<7天 AND 学习次数<5                   |
| G2     | 活跃用户定义 | 7天内学习天数≥3                           |
| G3     | 流失风险定义 | 连续7天未学习 (last_activity > 7days ago) |
| G4     | 回归用户定义 | >30天未学习后最近7天有活动                |
| G5     | 优先级顺序   | new > at_risk > returning > active        |

**PBT属性**:

- `INVARIANT[G-EXCLUSIVE]`: ∀user: count(matching_segments) == 1 (互斥)
- `INVARIANT[G-EXHAUSTIVE]`: ∀user: segment ∈ {new, active, at_risk, returning}
- `INVARIANT[G-DETERMINISTIC]`: 相同用户状态→相同分类结果

### C8. 周报调度 (Weekly Report)

| 约束ID | 约束     | 值                                 |
| ------ | -------- | ---------------------------------- |
| R1     | 生成时间 | 周一 02:00 UTC (cron: `0 2 * * 1`) |
| R2     | 通知方式 | 站内通知 (admin_notifications表)   |
| R3     | 失败处理 | 重试3次(间隔5min)后告警            |
| R4     | 幂等防护 | 基于week_key检查 (格式: YYYY-Www)  |

**PBT属性**:

- `INVARIANT[R-WEEKLY]`: 连续两次生成的week_key不同
- `INVARIANT[R-IDEMPOTENT]`: 同一week_key只生成一份报告
- `INVARIANT[R-SCHEDULE]`: 生成时间在UTC周一00:00-06:00范围内
