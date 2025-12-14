# 迁移部署指南

本文档提供从旧版本迁移到新版本的详细指南,包括数据迁移、零停机部署、灰度发布等策略。

## 目录

- [版本迁移概述](#版本迁移概述)
- [数据迁移执行流程](#数据迁移执行流程)
- [零停机部署策略](#零停机部署策略)
- [分阶段上线建议](#分阶段上线建议)
- [灰度发布方案](#灰度发布方案)
- [回滚计划](#回滚计划)
- [迁移检查清单](#迁移检查清单)

---

## 版本迁移概述

### 迁移类型

#### 1. 兼容性迁移（Minor/Patch 版本）

- 无破坏性变更
- 数据库 schema 兼容
- API 向后兼容
- **风险级别**: 低
- **停机时间**: 无需停机

#### 2. 重大版本迁移（Major 版本）

- 可能包含破坏性变更
- 数据库 schema 可能变更
- API 可能不兼容
- **风险级别**: 中-高
- **停机时间**: 建议短暂停机或采用蓝绿部署

### 迁移准备

#### 迁移前检查清单

- [ ] 完整备份当前数据库
- [ ] 记录当前版本号和配置
- [ ] 审查变更日志（CHANGELOG.md）
- [ ] 在测试环境验证迁移流程
- [ ] 准备回滚方案
- [ ] 通知用户维护时间（如需停机）
- [ ] 确认团队成员待命

#### 环境准备

```bash
# 1. 检查当前版本
cd /opt/danci
git describe --tags
cat packages/backend/package.json | grep version

# 2. 检查系统资源
df -h           # 磁盘空间（至少 20% 可用）
free -h         # 内存
uptime          # 负载

# 3. 备份当前数据库
pg_dump -U danci -h localhost -d vocabulary_db \
  -F c -b -v -f "/backup/database/pre_migration_$(date +%Y%m%d_%H%M%S).dump"

# 4. 备份当前配置
cp /opt/danci/packages/backend/.env "/backup/config/.env.$(date +%Y%m%d_%H%M%S)"

# 5. 备份当前代码
cd /opt/danci
git stash
git tag "pre-migration-$(date +%Y%m%d_%H%M%S)"
```

---

## 数据迁移执行流程

### 数据迁移场景

本系统包含以下数据迁移场景:

1. **用户学习档案迁移** (`UserLearningProfile`)
2. **学习状态数据迁移** (`WordLearningState`)
3. **复习日期修复** (next_review_date 修复)

### 迁移脚本使用

#### 1. 用户学习档案迁移

这个迁移将旧的 `AmasUserState` 数据合并到新的 `UserLearningProfile` 表中。

##### 步骤 1: 预览迁移（Dry Run）

```bash
cd /opt/danci/packages/backend

# 预览将要迁移的数据
pnpm migrate:user-profiles

# 查看输出示例:
# ✓ Found 150 AMAS user states to migrate
# ✓ Found 20 existing user learning profiles
# ✓ 130 new profiles will be created
# ✓ 20 existing profiles will be updated
```

##### 步骤 2: 验证数据一致性

```bash
# 验证当前数据状态
pnpm verify:profile-consistency

# 导出详细报告
pnpm verify:profile-consistency:export

# 查看报告
cat consistency-report.json | jq '.'
```

##### 步骤 3: 执行迁移

```bash
# 执行实际迁移
pnpm migrate:user-profiles:execute

# 预期输出:
# Starting migration...
# ✓ Migrated user profile for user-id-1
# ✓ Migrated user profile for user-id-2
# ...
# ✓ Migration completed: 130 created, 20 updated
```

##### 步骤 4: 验证迁移结果

```bash
# 验证迁移后的数据
pnpm migrate:user-profiles:verify

# 检查数据库
psql -U danci -d vocabulary_db << 'EOF'
-- 检查迁移的记录数
SELECT COUNT(*) FROM user_learning_profiles;

-- 验证数据完整性
SELECT
  ulp.user_id,
  ulp.attention,
  ulp.fatigue,
  ulp.motivation,
  aus.attention AS old_attention,
  aus.fatigue AS old_fatigue,
  aus.motivation AS old_motivation
FROM user_learning_profiles ulp
LEFT JOIN amas_user_states aus ON ulp.user_id = aus.user_id
LIMIT 10;

-- 检查是否有遗漏的用户
SELECT aus.user_id
FROM amas_user_states aus
LEFT JOIN user_learning_profiles ulp ON aus.user_id = ulp.user_id
WHERE ulp.id IS NULL;
EOF
```

##### 步骤 5: 回滚（如需要）

```bash
# 仅在迁移失败时使用
pnpm migrate:user-profiles:rollback

# 或手动回滚
psql -U danci -d vocabulary_db << 'EOF'
-- 删除迁移的数据
DELETE FROM user_learning_profiles
WHERE created_at > NOW() - INTERVAL '1 hour';
EOF
```

#### 2. 复习日期修复迁移

修复 `next_review_date` 字段的数据不一致问题。

```bash
# 预览需要修复的数据
pnpm fix:next-review-date

# 预期输出:
# Found 45 records with inconsistent next_review_date:
# - 30 records with NULL next_review_date but non-NULL last_review_date
# - 15 records with invalid next_review_date (in the past)

# 执行修复
pnpm fix:next-review-date:execute

# 验证修复结果
pnpm fix:next-review-date:verify
```

### 自定义数据迁移

如果需要编写自定义迁移脚本:

```typescript
// src/scripts/migrate-custom.ts
import prisma from '../config/database';
import { logger } from '../logger';

async function migrateCustomData(dryRun: boolean = true) {
  logger.info('Starting custom data migration...');

  try {
    // 1. 查询需要迁移的数据
    const recordsToMigrate = await prisma.oldTable.findMany({
      where: {
        // 筛选条件
      },
    });

    logger.info(`Found ${recordsToMigrate.length} records to migrate`);

    if (dryRun) {
      logger.info('Dry run mode - no changes will be made');
      return;
    }

    // 2. 批量迁移数据
    let migratedCount = 0;
    for (const record of recordsToMigrate) {
      try {
        await prisma.newTable.create({
          data: {
            // 映射字段
            newField: record.oldField,
            // ...
          },
        });
        migratedCount++;
      } catch (error) {
        logger.error({ error, record }, 'Failed to migrate record');
      }
    }

    logger.info(
      `Migration completed: ${migratedCount}/${recordsToMigrate.length} records migrated`,
    );
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI 入口
const dryRun = !process.argv.includes('--execute');
migrateCustomData(dryRun);
```

在 `package.json` 中添加脚本:

```json
{
  "scripts": {
    "migrate:custom": "tsx src/scripts/migrate-custom.ts",
    "migrate:custom:execute": "tsx src/scripts/migrate-custom.ts --execute"
  }
}
```

### 大规模数据迁移优化

对于大数据量迁移（> 100万条记录）:

```typescript
// 分批处理
async function migrateLargeDataset() {
  const BATCH_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.oldTable.findMany({
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    // 批量插入
    await prisma.newTable.createMany({
      data: batch.map((record) => ({
        // 映射字段
      })),
      skipDuplicates: true,
    });

    offset += BATCH_SIZE;
    logger.info(`Migrated ${offset} records...`);

    // 短暂暂停，避免过载
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```

---

## 零停机部署策略

### 蓝绿部署

蓝绿部署通过维护两套完全相同的环境实现零停机。

#### 架构图

```
               Load Balancer
                     |
         +-----------+-----------+
         |                       |
    Blue Environment        Green Environment
    (当前生产)               (新版本)
         |                       |
    Blue Database           Green Database
```

#### 实施步骤

##### 1. 准备绿色环境

```bash
# 在新服务器上部署绿色环境
ssh green-server

# 克隆代码
git clone https://github.com/yourusername/danci.git /opt/danci-green
cd /opt/danci-green
git checkout v2.0.0

# 安装依赖
pnpm install --frozen-lockfile --prod

# 配置环境变量（使用相同的数据库）
cp /opt/danci/.env /opt/danci-green/packages/backend/.env

# 构建
pnpm build

# 运行数据库迁移（仅新增，兼容旧版本）
cd packages/backend
pnpm prisma migrate deploy
```

##### 2. 启动绿色环境（不接收流量）

```bash
# 启动服务（使用不同端口）
PORT=3001 pnpm --filter @danci/backend start

# 健康检查
curl http://localhost:3001/health
```

##### 3. 切换流量

```bash
# 更新负载均衡配置（Nginx 示例）
sudo tee /etc/nginx/conf.d/danci-upstream.conf << 'EOF'
upstream danci_backend {
    # 注释掉蓝色环境
    # server blue-server:3000;

    # 启用绿色环境
    server green-server:3001;
}
EOF

# 测试配置
sudo nginx -t

# 平滑重载（零停机）
sudo nginx -s reload
```

##### 4. 验证绿色环境

```bash
# 监控日志
tail -f /var/log/nginx/access.log

# 检查错误率
curl http://your-domain.com/health

# 监控关键指标
# - 响应时间
# - 错误率
# - 数据库连接
```

##### 5. 观察期（建议 30 分钟）

在观察期内监控所有指标，如有问题立即切回蓝色环境。

##### 6. 清理蓝色环境

```bash
# 确认绿色环境稳定后，停止蓝色环境
ssh blue-server
systemctl stop danci-backend
```

### 滚动更新（Rolling Update）

适用于多实例部署，逐个更新实例。

#### 实施步骤（使用 PM2）

```bash
# 假设有 4 个实例在运行
pm2 list
# ┌─────┬──────────────┬─────────┬─────────┐
# │ id  │ name         │ status  │ cpu     │
# ├─────┼──────────────┼─────────┼─────────┤
# │ 0   │ backend-0    │ online  │ 12%     │
# │ 1   │ backend-1    │ online  │ 15%     │
# │ 2   │ backend-2    │ online  │ 10%     │
# │ 3   │ backend-3    │ online  │ 13%     │
# └─────┴──────────────┴─────────┴─────────┘

# 滚动更新（每次更新 1 个实例）
pm2 reload backend-0
# 等待 30 秒，验证实例健康

pm2 reload backend-1
# 等待 30 秒，验证实例健康

pm2 reload backend-2
# 等待 30 秒，验证实例健康

pm2 reload backend-3
# 完成更新
```

#### 自动化滚动更新脚本

```bash
#!/bin/bash
# /opt/danci/scripts/rolling-update.sh

set -e

INSTANCES=(backend-0 backend-1 backend-2 backend-3)
HEALTH_CHECK_URL="http://localhost:3000/health"
WAIT_TIME=30

for instance in "${INSTANCES[@]}"; do
  echo "Updating $instance..."

  # 重载实例
  pm2 reload "$instance"

  # 等待实例启动
  sleep 5

  # 健康检查
  for i in {1..10}; do
    if curl -f "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
      echo "✓ $instance is healthy"
      break
    fi
    if [ $i -eq 10 ]; then
      echo "✗ $instance health check failed after 10 attempts"
      # 回滚
      pm2 restart "$instance"
      exit 1
    fi
    sleep 2
  done

  # 等待观察
  echo "Waiting $WAIT_TIME seconds before next instance..."
  sleep "$WAIT_TIME"
done

echo "Rolling update completed successfully"
```

### 金丝雀部署（Canary Deployment）

先将新版本部署到小部分流量，验证无误后再全量发布。

#### 实施步骤（使用 Nginx）

##### 1. 配置金丝雀路由

```nginx
# /etc/nginx/conf.d/danci-canary.conf
upstream danci_backend_stable {
    server blue-server:3000;
}

upstream danci_backend_canary {
    server green-server:3001;
}

# 根据请求将 10% 流量导向金丝雀版本
split_clients "$remote_addr" $backend_pool {
    10%     danci_backend_canary;
    *       danci_backend_stable;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://$backend_pool;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

##### 2. 监控金丝雀版本

```bash
# 监控金丝雀实例的错误率
tail -f /var/log/nginx/access.log | grep green-server

# 对比稳定版本和金丝雀版本的指标
# - 响应时间
# - 错误率
# - 业务指标
```

##### 3. 逐步增加流量

```bash
# 如果金丝雀版本表现良好，逐步增加流量比例
# 10% -> 25% -> 50% -> 100%

# 更新 Nginx 配置
sudo vim /etc/nginx/conf.d/danci-canary.conf
# 修改: 10% -> 25%

sudo nginx -t
sudo nginx -s reload
```

##### 4. 完全切换

```bash
# 当金丝雀版本承载 100% 流量且稳定后
# 更新配置，移除金丝雀逻辑

sudo tee /etc/nginx/conf.d/danci-upstream.conf << 'EOF'
upstream danci_backend {
    server green-server:3001;  # 新版本
}
EOF

sudo nginx -t
sudo nginx -s reload
```

---

## 分阶段上线建议

### 阶段 1: 内部测试（1-3 天）

**目标**: 验证新版本功能和性能

```bash
# 1. 部署到测试环境
git checkout v2.0.0
pnpm install
pnpm build
pnpm --filter @danci/backend prisma migrate deploy

# 2. 运行自动化测试
pnpm test
pnpm --filter @danci/backend test:integration

# 3. 手动测试核心功能
# - 用户注册/登录
# - 单词学习流程
# - 数据统计和报告
# - AMAS 算法运行

# 4. 性能测试
ab -n 1000 -c 10 http://test-server:3000/api/health
wrk -t4 -c100 -d30s http://test-server:3000/api/health

# 5. 数据迁移验证
pnpm migrate:user-profiles:execute
pnpm verify:profile-consistency
```

**验收标准**:

- [ ] 所有自动化测试通过
- [ ] 核心功能手动测试通过
- [ ] 性能指标达标（响应时间 < 200ms, 错误率 < 0.1%）
- [ ] 数据迁移无误

### 阶段 2: 小范围灰度（3-7 天）

**目标**: 在生产环境验证，限制影响范围

```bash
# 1. 部署金丝雀版本（5% 流量）
# 使用上述金丝雀部署方法

# 2. 白名单用户测试
# 为内部员工或测试用户开启新版本
# 通过请求头或 Cookie 标识

# Nginx 配置示例:
# if ($http_x_canary = "true") {
#     set $backend_pool danci_backend_canary;
# }

# 3. 监控关键指标
# - 用户反馈
# - 错误日志
# - 性能指标
# - 业务指标（学习完成率、准确率等）

# 4. 数据一致性检查
psql -U danci -d vocabulary_db << 'EOF'
-- 检查新旧数据是否一致
SELECT COUNT(*) FROM user_learning_profiles;
SELECT COUNT(*) FROM amas_user_states;

-- 检查关键业务数据
SELECT COUNT(*) FROM answer_records WHERE timestamp > NOW() - INTERVAL '24 hours';
EOF
```

**验收标准**:

- [ ] 金丝雀版本错误率与稳定版本相当
- [ ] 用户反馈无重大问题
- [ ] 数据一致性检查通过
- [ ] 性能指标稳定

### 阶段 3: 逐步扩大（7-14 天）

**目标**: 逐步增加流量，验证系统稳定性

```bash
# 逐步增加金丝雀流量比例
# 5% -> 10% -> 25% -> 50%

# 每次增加后观察 24-48 小时

# 监控脚本
#!/bin/bash
# /opt/danci/scripts/monitor-canary.sh

while true; do
  # 检查错误率
  ERROR_RATE=$(grep -c "status=5" /var/log/nginx/access.log | tail -1000)
  echo "Error rate: $ERROR_RATE per 1000 requests"

  # 检查响应时间
  AVG_RESPONSE_TIME=$(awk '{print $NF}' /var/log/nginx/access.log | tail -1000 | awk '{sum+=$1; count++} END {print sum/count}')
  echo "Avg response time: $AVG_RESPONSE_TIME ms"

  # 检查数据库连接
  DB_CONNECTIONS=$(psql -U danci -d vocabulary_db -t -c "SELECT count(*) FROM pg_stat_activity;")
  echo "DB connections: $DB_CONNECTIONS"

  sleep 60
done
```

**验收标准**:

- [ ] 50% 流量下系统稳定运行 > 48 小时
- [ ] 关键指标无异常波动
- [ ] 无用户投诉或严重问题

### 阶段 4: 全量发布（14+ 天）

**目标**: 完全切换到新版本

```bash
# 1. 切换 100% 流量到新版本
sudo tee /etc/nginx/conf.d/danci-upstream.conf << 'EOF'
upstream danci_backend {
    server new-server:3000;
}
EOF

sudo nginx -t
sudo nginx -s reload

# 2. 持续监控 24 小时

# 3. 清理旧版本资源
# 停止旧版本服务
systemctl stop danci-backend-old

# 删除旧数据表（如已确认不再需要）
psql -U danci -d vocabulary_db << 'EOF'
-- 谨慎操作：仅在确认数据迁移完全成功后执行
-- DROP TABLE IF EXISTS amas_user_states;
EOF

# 4. 更新文档和通知
# 更新 API 文档、运维手册等
```

**验收标准**:

- [ ] 新版本稳定运行 > 24 小时
- [ ] 所有监控指标正常
- [ ] 用户反馈良好
- [ ] 旧版本资源已清理

---

## 灰度发布方案

### 方案 1: 基于用户 ID 灰度

根据用户 ID 哈希值决定是否使用新版本。

#### Nginx 配置

```nginx
# /etc/nginx/conf.d/danci-gradual.conf

map $arg_userId $backend_version {
    default         stable;
    ~^[0-4]         canary;  # user_id 首位为 0-4 的使用金丝雀版本
}

upstream danci_backend_stable {
    server stable-server:3000;
}

upstream danci_backend_canary {
    server canary-server:3001;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        set $backend danci_backend_stable;

        if ($backend_version = "canary") {
            set $backend danci_backend_canary;
        }

        proxy_pass http://$backend;
    }
}
```

### 方案 2: 基于地理位置灰度

先在特定地区发布新版本。

```nginx
# 基于客户端 IP 地址
geo $gradual_release {
    default         stable;
    # 北京地区使用金丝雀版本
    1.2.3.0/24      canary;
    # 上海地区使用金丝雀版本
    5.6.7.0/24      canary;
}

server {
    location / {
        set $backend danci_backend_stable;

        if ($gradual_release = "canary") {
            set $backend danci_backend_canary;
        }

        proxy_pass http://$backend;
    }
}
```

### 方案 3: 基于功能开关（Feature Flag）

通过应用层控制功能发布。

```typescript
// src/config/feature-flags.ts
export interface FeatureFlags {
  useNewAlgorithm: boolean;
  enableRealTimeNotifications: boolean;
  enableAdvancedAnalytics: boolean;
}

export function getFeatureFlags(userId: string): FeatureFlags {
  // 从 Redis 或数据库读取配置
  const config = await redis.hgetall(`feature:flags:${userId}`);

  // 默认配置
  const defaults: FeatureFlags = {
    useNewAlgorithm: false,
    enableRealTimeNotifications: false,
    enableAdvancedAnalytics: false,
  };

  return { ...defaults, ...config };
}

// 使用示例
async function handleRequest(req: Request, res: Response) {
  const userId = req.user.id;
  const flags = await getFeatureFlags(userId);

  if (flags.useNewAlgorithm) {
    // 使用新算法
    return newAlgorithm(req, res);
  } else {
    // 使用旧算法
    return oldAlgorithm(req, res);
  }
}
```

#### 功能开关管理

```bash
# 为特定用户启用新功能
redis-cli HSET feature:flags:user123 useNewAlgorithm true

# 批量启用（通过脚本）
#!/bin/bash
# /opt/danci/scripts/enable-feature.sh

FEATURE="useNewAlgorithm"
USER_IDS=("user1" "user2" "user3")

for user_id in "${USER_IDS[@]}"; do
  redis-cli HSET "feature:flags:$user_id" "$FEATURE" true
  echo "Enabled $FEATURE for $user_id"
done

# 全局启用（所有用户）
redis-cli SET "feature:flags:global:useNewAlgorithm" true
```

---

## 回滚计划

### 快速回滚决策树

```
发现问题
    |
    ├─ 影响 < 1% 用户 ─> 继续观察，准备热修复
    ├─ 影响 1-10% 用户 ─> 减少金丝雀流量，评估问题
    ├─ 影响 > 10% 用户 ─> 立即回滚
    └─ 数据损坏/安全问题 ─> 立即回滚 + 紧急修复
```

### 回滚步骤

#### 1. 代码回滚（蓝绿部署）

```bash
# 立即切换回蓝色环境（旧版本）
sudo tee /etc/nginx/conf.d/danci-upstream.conf << 'EOF'
upstream danci_backend {
    server blue-server:3000;  # 切回旧版本
}
EOF

sudo nginx -t
sudo nginx -s reload

# 验证回滚
curl http://your-domain.com/health
```

#### 2. 数据库回滚（如需要）

```bash
# 检查是否需要回滚数据库迁移
pnpm prisma migrate status

# 如果新版本执行了数据库迁移，需要回滚

# ⚠️ 警告：数据库回滚可能导致数据丢失
# 仅在测试环境或确认安全的情况下执行

# 方法 1: 使用 Prisma 标记迁移为已回滚
pnpm prisma migrate resolve --rolled-back <migration-name>

# 方法 2: 手动执行回滚 SQL
psql -U danci -d vocabulary_db -f rollback.sql

# 方法 3: 从备份恢复（最安全但最慢）
pg_restore -U danci -d vocabulary_db /backup/database/pre_migration.dump
```

#### 3. 缓存清理

```bash
# 清理 Redis 缓存（避免旧版本读取新版本数据）
redis-cli FLUSHALL

# 或选择性清理
redis-cli --scan --pattern "user:*" | xargs redis-cli DEL
```

#### 4. 验证回滚

```bash
# 1. 健康检查
curl http://your-domain.com/health

# 2. 核心功能测试
# 用户登录
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'

# 3. 检查日志
tail -f /var/log/nginx/access.log | grep "status=5"

# 4. 监控关键指标
# - 响应时间
# - 错误率
# - 数据库连接
```

### 回滚后分析

```markdown
# 回滚报告模板

## 回滚概要

- **回滚时间**: 2025-12-12 14:30 UTC
- **受影响版本**: v2.0.0
- **回滚到版本**: v1.9.5
- **回滚原因**: [详细描述问题]
- **影响范围**: [用户数量、功能范围]

## 问题分析

### 根本原因

[详细分析问题的根本原因]

### 触发条件

[什么情况下会触发问题]

### 影响评估

- 用户影响: X 人
- 数据完整性: 是/否受影响
- 系统稳定性: 是/否受影响

## 修复方案

### 短期方案

[立即采取的补救措施]

### 长期方案

[避免问题再次发生的措施]

## 时间线

- 14:00 - 部署新版本
- 14:15 - 发现问题
- 14:20 - 决策回滚
- 14:25 - 开始回滚
- 14:30 - 回滚完成
- 14:35 - 验证系统恢复

## 后续行动

- [ ] 修复问题
- [ ] 增加测试覆盖
- [ ] 更新部署流程
- [ ] 团队复盘会议

## 责任人

- **技术负责人**: @username
- **运维负责人**: @username
```

---

## 迁移检查清单

### 迁移前检查

**数据准备**

- [ ] 完整备份数据库（< 1 小时前）
- [ ] 验证备份完整性
- [ ] 导出关键配置文件
- [ ] 记录当前系统状态（版本、连接数、QPS 等）

**环境检查**

- [ ] 测试环境迁移成功
- [ ] 自动化测试全部通过
- [ ] 性能测试达标
- [ ] 负载测试通过

**团队准备**

- [ ] 迁移计划已审核
- [ ] 回滚方案已准备
- [ ] 团队成员已分配角色
- [ ] 监控和告警已配置
- [ ] 沟通渠道已建立（Slack/微信群等）

**用户通知**

- [ ] 维护公告已发布（如需停机）
- [ ] 关键用户已提前通知
- [ ] 客服团队已培训

### 迁移中检查

**实时监控**

- [ ] CPU 使用率正常
- [ ] 内存使用率正常
- [ ] 磁盘 I/O 正常
- [ ] 网络流量正常
- [ ] 数据库连接数正常
- [ ] 日志无严重错误

**功能验证**

- [ ] 健康检查端点响应正常
- [ ] 用户登录功能正常
- [ ] 核心业务功能正常
- [ ] API 响应时间正常

**数据验证**

- [ ] 数据迁移脚本执行成功
- [ ] 数据一致性检查通过
- [ ] 关键表记录数正确
- [ ] 关键业务数据完整

### 迁移后检查

**系统稳定性**（观察期 24 小时）

- [ ] 无服务中断
- [ ] 错误率 < 0.1%
- [ ] 响应时间 < 200ms（P95）
- [ ] 数据库查询性能正常
- [ ] Redis 缓存命中率 > 95%

**数据完整性**

- [ ] 数据迁移验证脚本执行通过
- [ ] 关键业务指标正常
- [ ] 用户反馈无数据问题
- [ ] 数据库约束检查通过

**清理工作**

- [ ] 旧版本服务已停止（如适用）
- [ ] 临时文件已清理
- [ ] 旧数据表已归档/删除（如适用）
- [ ] 文档已更新

**复盘和总结**

- [ ] 迁移报告已完成
- [ ] 问题和改进点已记录
- [ ] 团队复盘会议已安排
- [ ] 知识库已更新

---

## 最佳实践

### 1. 始终在测试环境验证

```bash
# 建立与生产环境一致的测试环境
# 包括：
# - 相同的操作系统版本
# - 相同的依赖版本
# - 相似的数据规模（至少 10% 生产数据）
# - 相同的网络拓扑
```

### 2. 自动化测试覆盖

```bash
# 迁移前运行全套测试
pnpm test                          # 单元测试
pnpm test:integration              # 集成测试
pnpm test:performance              # 性能测试

# 确保测试覆盖率 > 80%
pnpm test:coverage
```

### 3. 增量迁移优于大爆炸式迁移

- 将大的迁移拆分为多个小的、可逆的步骤
- 每个步骤独立验证
- 支持随时暂停或回滚

### 4. 保持向后兼容

```typescript
// 在迁移期间，新旧代码应该能同时运行
// 使用特性开关控制新功能

if (featureFlags.useNewUserProfileModel) {
  // 读取新表
  return prisma.userLearningProfile.findUnique({ ... });
} else {
  // 读取旧表
  return prisma.amasUserState.findUnique({ ... });
}
```

### 5. 详细的日志记录

```typescript
// 在迁移脚本中添加详细日志
logger.info({ userId, operation: 'migrate_profile' }, 'Starting migration');
// ... 执行迁移
logger.info({ userId, duration: Date.now() - start }, 'Migration completed');
```

### 6. 设置迁移超时

```bash
# 防止迁移脚本无限期运行
timeout 3600 pnpm migrate:user-profiles:execute  # 1 小时超时
```

---

## 相关文档

- [部署指南](./DEPLOYMENT_GUIDE.md) - 基础部署流程
- [运维指南](./OPERATIONS_GUIDE.md) - 日常运维操作
- [数据库迁移文档](../src/scripts/README.md) - 数据迁移脚本使用

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: DevOps Team
