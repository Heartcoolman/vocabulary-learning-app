# Week 3 Production Deployment Checklist

**部署版本**: Week 3 - AMAS Monitoring System
**目标日期**: 2025-12-03
**部署负责人**: [填写]

---

## 📋 部署前检查 (Pre-Deployment)

### 1. 代码质量验证

- [ ] ✅ 所有测试通过 (13/13 alert tests passing)
- [ ] ✅ Code review完成（2个HIGH优先级问题已修复）
- [ ] ✅ 无已知的P0/P1 bugs
- [ ] ✅ TypeScript编译无错误
- [ ] ✅ ESLint检查通过

**验证命令**:
```bash
cd backend
npm run test          # 运行所有测试
npm run typecheck     # TypeScript类型检查
npm run lint          # ESLint检查
```

---

### 2. 数据库准备

- [ ] ✅ 数据库迁移文件已创建 (`20251203071615_add_decision_insights`)
- [ ] ⏸️ 迁移已在staging环境验证
- [ ] ⏸️ 生产数据库备份已完成
- [ ] ⏸️ Rollback脚本已准备

**迁移命令**:
```bash
# Staging环境
cd backend
npx prisma migrate deploy

# 验证迁移
psql $DATABASE_URL -c "\d decision_insights"
```

**Rollback脚本** (`rollback_decision_insights.sql`):
```sql
DROP TABLE IF EXISTS "decision_insights";
```

---

### 3. 环境变量配置

- [ ] ⏸️ 生产环境变量已配置
- [ ] ⏸️ Webhook URLs已设置（可选）
- [ ] ⏸️ 监控采样率已配置

**必需的环境变量**:
```bash
# 数据库
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# 可选：Alert Webhooks
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx  # 通用webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx  # Slack专用

# 可选：监控配置
WORKER_LEADER=true                    # 启用监控（仅leader节点）
METRICS_COLLECTION_INTERVAL=30000     # 30秒
```

---

### 4. 依赖检查

- [ ] ⏸️ Node.js版本 >= 18.x
- [ ] ⏸️ PostgreSQL版本 >= 14.x （推荐TimescaleDB）
- [ ] ⏸️ Redis版本 >= 6.x （如使用Redis缓存）
- [ ] ⏸️ npm packages已更新

**验证命令**:
```bash
node --version        # 应为 v18.x 或更高
psql --version        # 应为 14.x 或更高
npm outdated          # 检查过期依赖
```

---

##  部署步骤 (Deployment)

### Step 1: 代码部署

```bash
# 1. 切换到部署分支
git checkout main
git pull origin main

# 2. 安装依赖
cd backend
npm ci  # 使用ci确保clean install

# 3. 构建（如有）
npm run build

# 4. 重启服务
pm2 reload danci-backend
# 或
systemctl restart danci-backend
```

**时间估计**: 5-10分钟

---

### Step 2: 数据库迁移

```bash
# 1. 备份当前数据库
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 执行迁移
cd backend
npx prisma migrate deploy

# 3. 验证迁移
psql $DATABASE_URL <<EOF
-- 检查表是否存在
SELECT tablename FROM pg_tables WHERE tablename = 'decision_insights';

-- 检查索引
SELECT indexname FROM pg_indexes WHERE tablename = 'decision_insights';

-- 检查表结构
\d decision_insights
EOF
```

**时间估计**: 2-5分钟
**Rollback**: 如果失败，运行 `rollback_decision_insights.sql`

---

### Step 3: 服务健康检查

```bash
# 1. 基础健康检查
curl https://api.danci.com/health

# 预期输出:
# {"status":"ok","timestamp":"2024-12-03T..."}

# 2. Metrics端点检查
curl https://api.danci.com/api/about/metrics/prometheus | head -20

# 预期: 应返回Prometheus格式的metrics

# 3. Alert状态检查
curl https://api.danci.com/api/alerts/active

# 预期: 应返回JSON数组（可能为空）
```

**时间估计**: 2分钟

---

### Step 4: Smoke Tests

```bash
# 运行部署后smoke tests
cd backend
npm run test:smoke  # 如有smoke test suite

# 或手动测试关键流程
curl -X POST https://api.danci.com/api/learning/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN"
```

**时间估计**: 5分钟

---

## ✅ 部署后验证 (Post-Deployment)

### 1. 功能验证

- [ ] ⏸️ Decision insights写入成功
- [ ] ⏸️ Decision insights读取成功
- [ ] ⏸️ Alert engine正常运行
- [ ] ⏸️ Metrics正常采集
- [ ] ⏸️ 无Error日志

**验证脚本**:
```bash
# 1. 触发一个决策并验证insight写入
DECISION_ID=$(curl -X POST https://api.danci.com/api/amas/decide \
  -H "Authorization: Bearer $TOKEN" | jq -r '.decisionId')

# 2. 等待3秒让异步写入完成
sleep 3

# 3. 查询决策解释
curl "https://api.danci.com/api/amas/explain-decision?decisionId=$DECISION_ID" \
  -H "Authorization: Bearer $TOKEN"

# 预期: 应返回包含stateSnapshot和difficultyFactors的JSON

# 4. 检查数据库
psql $DATABASE_URL -c "SELECT COUNT(*) FROM decision_insights;"
```

---

### 2. 性能监控

**监控指标** (前24小时):

| 指标 | 目标 | 监控方法 |
|------|------|----------|
| API响应时间 (P95) | < 200ms | Prometheus |
| API响应时间 (P99) | < 500ms | Prometheus |
| 错误率 | < 1% | Prometheus |
| Decision insights写入成功率 | > 99% | 应用日志 |
| Alert engine评估时间 | < 10ms | Prometheus |
| 无active alerts | 0 | `/api/alerts/active` |

**Dashboard**: [设置Grafana/Datadog dashboard链接]

---

### 3. 日志检查

```bash
# 查看最近100行日志
pm2 logs danci-backend --lines 100

# 或
journalctl -u danci-backend -n 100 --no-pager

# 关注以下关键词
grep -i "error\|fail\|exception" logs/application.log | tail -50
```

**预期**: 无ERROR级别日志，仅INFO和WARN

---

### 4. Alert验证

```bash
# 1. 检查是否有active alerts
curl https://api.danci.com/api/alerts/active

# 预期: []

# 2. 查看alert历史
curl https://api.danci.com/api/alerts/history?limit=10

# 3. 如果配置了webhook，检查Slack/Teams是否收到测试消息
```

---

## 🔄 Rollback计划

### 触发条件
- P0错误率 > 5%
- API不可用超过5分钟
- 数据丢失或损坏
- 用户体验严重退化

### Rollback步骤

```bash
# 1. 回滚代码
git revert <commit-hash>
git push origin main
pm2 reload danci-backend

# 2. 回滚数据库（如需要）
psql $DATABASE_URL < rollback_decision_insights.sql

# 3. 验证回滚
curl https://api.danci.com/health

# 4. 通知团队
# 发送回滚通知到Slack/邮件
```

**时间估计**: 5-10分钟

---

## 📊 部署时间表

| 阶段 | 时间 | 负责人 |
|------|------|--------|
| 部署前检查 | 30分钟 | [填写] |
| 代码部署 | 10分钟 | [填写] |
| 数据库迁移 | 5分钟 | [填写] |
| 健康检查 | 5分钟 | [填写] |
| Smoke测试 | 10分钟 | [填写] |
| 部署后验证 | 30分钟 | [填写] |
| **总计** | **~90分钟** | - |

---

## 📞 应急联系

| 角色 | 姓名 | 联系方式 |
|------|------|----------|
| 技术负责人 | [填写] | [电话/Slack] |
| DBA | [填写] | [电话/Slack] |
| DevOps | [填写] | [电话/Slack] |
| 产品负责人 | [填写] | [电话/Slack] |

---

## 📝 部署记录

### 部署日志

| 时间 | 操作 | 状态 | 备注 |
|------|------|------|------|
| [时间] | 开始部署 | ✅ | |
| [时间] | 代码部署完成 | ✅ | |
| [时间] | 数据库迁移完成 | ✅ | |
| [时间] | 健康检查通过 | ✅ | |
| [时间] | 部署完成 | ✅ | |

### 问题记录

| 问题 | 影响 | 解决方案 | 状态 |
|------|------|----------|------|
| [如有] | | | |

---

## 附录

### A. 完整迁移SQL

见文件: `backend/prisma/migrations/20251203071615_add_decision_insights/migration.sql`

### B. 配置文件示例

见文件: `operations-runbook.md`

### C. 监控Dashboard配置

[链接到Grafana/Datadog配置]

---

**部署完成签字**:

- [ ] 技术负责人: ____________ 日期: ______
- [ ] DBA: ____________ 日期: ______
- [ ] DevOps: ____________ 日期: ______

---

*文档版本: 1.0*
*最后更新: 2025-12-03*
