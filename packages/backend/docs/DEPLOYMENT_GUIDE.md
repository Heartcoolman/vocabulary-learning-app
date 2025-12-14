# 部署指南

本文档提供了单词学习平台后端服务的完整部署指南，涵盖环境准备、依赖安装、数据库迁移、配置管理和部署检查清单。

## 目录

- [环境要求](#环境要求)
- [依赖安装](#依赖安装)
- [数据库迁移](#数据库迁移)
- [环境变量配置](#环境变量配置)
- [部署检查清单](#部署检查清单)
- [回滚流程](#回滚流程)
- [常见问题](#常见问题)

---

## 环境要求

### 硬件要求

#### 最小配置（开发/测试环境）

- CPU: 2核
- 内存: 4GB
- 磁盘: 20GB SSD
- 网络: 10Mbps

#### 推荐配置（生产环境）

- CPU: 4核以上
- 内存: 8GB以上
- 磁盘: 50GB SSD以上
- 网络: 100Mbps以上

### 软件要求

| 软件           | 版本要求          | 用途           |
| -------------- | ----------------- | -------------- |
| Node.js        | >= 20.x           | 运行环境       |
| pnpm           | >= 10.24.0        | 包管理器       |
| PostgreSQL     | >= 15.x           | 主数据库       |
| TimescaleDB    | latest (基于PG15) | 时序数据扩展   |
| Redis          | >= 7.x            | 缓存和会话存储 |
| Docker         | >= 24.x (可选)    | 容器化部署     |
| Docker Compose | >= 2.x (可选)     | 多容器编排     |

### 操作系统要求

支持的操作系统：

- Ubuntu 20.04 LTS / 22.04 LTS（推荐）
- Debian 11 / 12
- CentOS 8 / Rocky Linux 8
- macOS 12+ (仅用于开发)
- Windows Server 2019+ (需要WSL2支持)

---

## 依赖安装

### 1. 安装 Node.js

#### 使用 nvm（推荐）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc  # 或 ~/.zshrc

# 安装 Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# 验证安装
node --version  # 应该显示 v20.x.x
npm --version
```

#### 使用系统包管理器

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/Rocky Linux
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### 2. 安装 pnpm

```bash
# 启用 corepack (Node.js 自带)
corepack enable

# 或者使用 npm 全局安装
npm install -g pnpm@10.24.0

# 验证安装
pnpm --version  # 应该显示 10.24.0 或更高
```

### 3. 安装 PostgreSQL + TimescaleDB

#### 使用 Docker（推荐）

```bash
# 使用项目提供的 docker-compose
cd /path/to/danci
docker-compose up -d postgres

# 验证数据库运行
docker-compose ps postgres
docker-compose logs postgres
```

#### 本地安装

```bash
# Ubuntu/Debian
# 添加 TimescaleDB 仓库
sudo sh -c "echo 'deb [signed-by=/usr/share/keyrings/timescale.keyring] https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/timescale.keyring

# 安装 PostgreSQL 和 TimescaleDB
sudo apt update
sudo apt install -y postgresql-15 postgresql-15-timescaledb

# 配置 TimescaleDB
sudo timescaledb-tune --quiet --yes

# 启动 PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 创建数据库和用户
sudo -u postgres psql << EOF
CREATE USER danci WITH PASSWORD 'danci_secret_2024';
CREATE DATABASE vocabulary_db OWNER danci;
\c vocabulary_db
CREATE EXTENSION IF NOT EXISTS timescaledb;
GRANT ALL PRIVILEGES ON DATABASE vocabulary_db TO danci;
EOF
```

### 4. 安装 Redis

#### 使用 Docker（推荐）

```bash
# 使用项目提供的 docker-compose
docker-compose up -d redis

# 验证 Redis 运行
docker-compose exec redis redis-cli ping  # 应返回 PONG
```

#### 本地安装

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y redis-server

# 配置 Redis
sudo tee -a /etc/redis/redis.conf << EOF
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
EOF

# 启动 Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 验证安装
redis-cli ping  # 应返回 PONG
```

### 5. 安装 Rust（如果需要构建原生模块）

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 重新加载环境
source "$HOME/.cargo/env"

# 验证安装
rustc --version
cargo --version
```

---

## 数据库迁移

### 迁移前准备

#### 1. 备份现有数据库

```bash
# 创建备份目录
mkdir -p /backup/database

# 备份数据库
pg_dump -U danci -h localhost -d vocabulary_db \
  -F c -b -v -f /backup/database/vocab_backup_$(date +%Y%m%d_%H%M%S).dump

# 验证备份文件
ls -lh /backup/database/
```

#### 2. 检查数据库连接

```bash
# 测试数据库连接
psql -U danci -h localhost -d vocabulary_db -c "SELECT version();"

# 检查 TimescaleDB 扩展
psql -U danci -h localhost -d vocabulary_db -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
```

### 执行数据库迁移

#### 1. 生成 Prisma Client

```bash
cd packages/backend

# 生成 Prisma Client
pnpm prisma:generate

# 验证生成成功
ls -la node_modules/.prisma/client/
```

#### 2. 运行数据库迁移（开发环境）

```bash
# 在开发环境运行迁移（会创建迁移记录）
pnpm prisma:migrate

# 查看迁移状态
pnpm prisma migrate status
```

#### 3. 运行数据库迁移（生产环境）

```bash
# 设置生产数据库 URL
export DATABASE_URL="postgresql://user:password@host:5432/database"

# 部署迁移（不会创建新的迁移文件）
pnpm prisma migrate deploy

# 验证迁移状态
pnpm prisma migrate status
```

### 数据迁移脚本

如果有数据迁移需求，使用项目提供的迁移脚本：

#### 1. 用户学习档案迁移

```bash
# 预览迁移（不执行）
pnpm migrate:user-profiles

# 执行迁移
pnpm migrate:user-profiles:execute

# 验证迁移结果
pnpm migrate:user-profiles:verify

# 如需回滚
pnpm migrate:user-profiles:rollback
```

#### 2. 复习日期修复

```bash
# 预览需要修复的数据
pnpm fix:next-review-date

# 执行修复
pnpm fix:next-review-date:execute

# 验证修复结果
pnpm fix:next-review-date:verify
```

#### 3. 档案一致性验证

```bash
# 验证数据一致性
pnpm verify:profile-consistency

# 导出验证报告
pnpm verify:profile-consistency:export
```

### 数据库迁移检查点

在每次迁移后，请验证以下内容：

```bash
# 1. 检查迁移状态
pnpm prisma migrate status

# 2. 验证表结构
psql -U danci -d vocabulary_db -c "\dt"

# 3. 检查索引
psql -U danci -d vocabulary_db -c "
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
"

# 4. 验证数据完整性
psql -U danci -d vocabulary_db -c "
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'words', COUNT(*) FROM words
UNION ALL
SELECT 'word_learning_states', COUNT(*) FROM word_learning_states
UNION ALL
SELECT 'answer_records', COUNT(*) FROM answer_records;
"
```

---

## 环境变量配置

### 配置文件结构

```
packages/backend/
├── .env.example          # 环境变量模板
├── .env.development      # 开发环境配置（不提交到 git）
├── .env.test             # 测试环境配置（不提交到 git）
└── .env.production       # 生产环境配置（不提交到 git）
```

### 创建环境配置

```bash
cd packages/backend

# 复制示例配置
cp .env.example .env.production

# 编辑生产环境配置
nano .env.production
```

### 必填配置项

#### 1. 数据库配置

```bash
# PostgreSQL 连接 URL
DATABASE_URL="postgresql://username:password@host:port/database"

# 示例（生产环境）
DATABASE_URL="postgresql://danci:secure_password_here@10.0.1.10:5432/vocabulary_db"

# 示例（使用 SSL）
DATABASE_URL="postgresql://danci:password@host:5432/vocabulary_db?sslmode=require"
```

#### 2. JWT 配置（必须修改）

```bash
# 生成强密钥
JWT_SECRET=$(openssl rand -base64 64)

# 设置过期时间
JWT_EXPIRES_IN="24h"  # 可选: 7d, 30d
```

#### 3. 服务器配置

```bash
# 端口配置
PORT=3000

# 环境标识
NODE_ENV="production"

# CORS 配置（允许的前端域名）
CORS_ORIGIN="https://app.yourdomain.com"
```

#### 4. 反向代理配置（生产环境重要）

```bash
# 如果在 Nginx/Caddy 等反向代理后面，设置为代理层数
TRUST_PROXY="1"

# 如果直接暴露给公网，设置为 false
TRUST_PROXY="false"
```

#### 5. Worker 配置（多实例部署）

```bash
# 主节点设置（运行定时任务）
WORKER_LEADER="true"

# 从节点设置（不运行定时任务）
WORKER_LEADER="false"
```

### 可选配置项

#### 速率限制

```bash
# 每分钟最大请求数
RATE_LIMIT_MAX=100

# 时间窗口（毫秒）
RATE_LIMIT_WINDOW_MS=60000
```

#### 日志配置

```bash
# 日志级别: trace, debug, info, warn, error, fatal
LOG_LEVEL="info"  # 生产环境推荐 info 或 warn
```

#### 监控配置

```bash
# Sentry 错误追踪
SENTRY_DSN="https://xxxx@xxxx.ingest.sentry.io/xxxx"

# 应用版本（用于 release 追踪）
APP_VERSION="1.0.0"
```

#### AMAS 算法配置

```bash
# 延迟奖励延迟时间（毫秒），默认 24 小时
DELAYED_REWARD_DELAY_MS=86400000

# AMAS 数据源配置
AMAS_ABOUT_DATA_SOURCE="real"
AMAS_REAL_DATA_READ_ENABLED="true"
AMAS_REAL_DATA_WRITE_ENABLED="true"
AMAS_VISUALIZATION_ENABLED="true"
```

### 环境变量验证

```bash
# 使用项目内置的配置验证
cd packages/backend

# 验证配置是否完整
node -e "require('./dist/config/env').env" && echo "✓ Configuration valid"
```

---

## 部署检查清单

### 部署前检查

#### 1. 代码准备

- [ ] 代码已合并到发布分支
- [ ] 所有 CI/CD 检查通过
- [ ] 版本号已更新（package.json）
- [ ] CHANGELOG 已更新
- [ ] 依赖项已审查（无严重安全漏洞）

```bash
# 检查依赖安全性
pnpm audit

# 检查过期依赖
pnpm outdated
```

#### 2. 环境检查

- [ ] 数据库备份已完成
- [ ] 环境变量已配置
- [ ] SSL 证书有效
- [ ] 磁盘空间充足（至少 20% 可用）
- [ ] 内存使用正常
- [ ] CPU 负载正常

```bash
# 磁盘空间检查
df -h

# 内存检查
free -h

# CPU 负载检查
uptime
```

#### 3. 依赖服务检查

- [ ] PostgreSQL 服务运行正常
- [ ] Redis 服务运行正常
- [ ] 网络连接正常
- [ ] DNS 解析正常

```bash
# 检查 PostgreSQL
psql -U danci -h localhost -c "SELECT 1;" vocabulary_db

# 检查 Redis
redis-cli ping

# 检查网络
curl -I https://api.yourdomain.com
```

### 部署步骤

#### 标准部署流程（非容器化）

```bash
# 1. 拉取最新代码
cd /opt/danci
git fetch origin
git checkout main
git pull origin main

# 2. 安装依赖
pnpm install --frozen-lockfile --prod

# 3. 生成 Prisma Client
pnpm --filter @danci/backend prisma:generate

# 4. 构建项目
pnpm build

# 5. 运行数据库迁移
export DATABASE_URL="postgresql://user:password@host:5432/database"
pnpm --filter @danci/backend exec prisma migrate deploy

# 6. 重启服务
sudo systemctl restart danci-backend

# 7. 验证服务状态
sudo systemctl status danci-backend

# 8. 检查日志
sudo journalctl -u danci-backend -f
```

#### Docker 部署流程

```bash
# 1. 拉取最新代码
cd /opt/danci
git pull origin main

# 2. 构建镜像
docker-compose build backend

# 3. 停止旧容器（保留数据库）
docker-compose stop backend

# 4. 运行数据库迁移
docker-compose run --rm backend pnpm --filter @danci/backend exec prisma migrate deploy

# 5. 启动新容器
docker-compose up -d backend

# 6. 验证容器状态
docker-compose ps backend

# 7. 检查日志
docker-compose logs -f backend

# 8. 清理旧镜像
docker image prune -f
```

### 部署后验证

#### 1. 健康检查

```bash
# HTTP 健康检查
curl -f http://localhost:3000/health || exit 1

# 详细健康检查
curl http://localhost:3000/health | jq '.'
```

预期响应：

```json
{
  "status": "ok",
  "timestamp": "2025-12-12T10:00:00.000Z",
  "uptime": 123.456,
  "database": "connected",
  "redis": "connected",
  "memory": {
    "heapUsed": 50.5,
    "heapTotal": 100.0,
    "external": 10.0,
    "rss": 150.0
  }
}
```

#### 2. 功能测试

```bash
# 测试用户登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# 测试 API 响应时间
time curl -s http://localhost:3000/api/health > /dev/null
```

#### 3. 数据库连接测试

```bash
# 检查数据库连接池
psql -U danci -d vocabulary_db -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE datname = 'vocabulary_db';
"

# 检查慢查询
psql -U danci -d vocabulary_db -c "
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"
```

#### 4. 日志检查

```bash
# 检查错误日志
grep -i "error" /var/log/danci/backend.log | tail -n 20

# 检查警告
grep -i "warn" /var/log/danci/backend.log | tail -n 20

# 使用 Docker
docker-compose logs --tail=100 backend | grep -i error
```

#### 5. 性能指标

```bash
# 响应时间测试
ab -n 100 -c 10 http://localhost:3000/health

# 或使用 wrk
wrk -t4 -c100 -d30s http://localhost:3000/health
```

### 部署完成检查清单

- [ ] 健康检查端点返回正常
- [ ] 用户登录功能正常
- [ ] 数据库连接正常
- [ ] Redis 连接正常
- [ ] 日志无严重错误
- [ ] 响应时间在可接受范围内（< 200ms）
- [ ] CPU 使用率正常（< 70%）
- [ ] 内存使用率正常（< 80%）
- [ ] 监控告警已配置
- [ ] 团队已通知部署完成

---

## 回滚流程

### 快速回滚决策

如果遇到以下情况，应立即考虑回滚：

- 严重功能缺陷影响核心业务
- 数据损坏或丢失
- 性能严重降级（响应时间增加 > 50%）
- 安全漏洞暴露
- 数据库迁移失败导致服务不可用

### 回滚方法

#### 方法 1: 代码回滚（推荐）

```bash
# 1. 确定要回滚到的版本
git log --oneline -10

# 2. 回滚到上一个稳定版本
cd /opt/danci
git checkout <previous-stable-commit>

# 3. 重新安装依赖（如有必要）
pnpm install --frozen-lockfile --prod

# 4. 重新构建
pnpm build

# 5. 重启服务
sudo systemctl restart danci-backend

# 6. 验证回滚成功
curl http://localhost:3000/health
```

#### 方法 2: Docker 镜像回滚

```bash
# 1. 查看可用镜像版本
docker images | grep danci-backend

# 2. 停止当前容器
docker-compose stop backend

# 3. 更新 docker-compose.yml 使用旧版本镜像
# image: ghcr.io/username/danci-backend:<old-version>

# 4. 启动旧版本容器
docker-compose up -d backend

# 5. 验证回滚成功
docker-compose logs -f backend
curl http://localhost:3000/health
```

#### 方法 3: 数据库回滚（谨慎使用）

⚠️ **警告**：数据库回滚可能导致数据丢失，仅在紧急情况下使用。

```bash
# 1. 停止应用服务
sudo systemctl stop danci-backend

# 2. 备份当前数据库（以防万一）
pg_dump -U danci -h localhost -d vocabulary_db \
  -F c -b -v -f /backup/database/pre_rollback_$(date +%Y%m%d_%H%M%S).dump

# 3. 恢复之前的备份
pg_restore -U danci -h localhost -d vocabulary_db \
  --clean --if-exists /backup/database/vocab_backup_YYYYMMDD_HHMMSS.dump

# 4. 验证数据库恢复
psql -U danci -d vocabulary_db -c "SELECT COUNT(*) FROM users;"

# 5. 启动应用服务（使用旧版本代码）
sudo systemctl start danci-backend
```

#### 方法 4: 使用 Prisma 回滚迁移

```bash
# 查看迁移历史
pnpm prisma migrate status

# 标记迁移为已解决（不执行回滚）
pnpm prisma migrate resolve --rolled-back <migration-name>

# 或者，手动回滚到特定迁移
# 注意：Prisma 不支持自动回滚，需要手动编写回滚 SQL

# 1. 创建回滚 SQL 文件
cat > rollback.sql << 'EOF'
-- 回滚示例：删除新增的列
ALTER TABLE users DROP COLUMN IF EXISTS new_column;

-- 回滚示例：恢复旧表结构
-- ...
EOF

# 2. 执行回滚 SQL
psql -U danci -d vocabulary_db -f rollback.sql

# 3. 更新迁移状态
pnpm prisma migrate resolve --rolled-back <migration-name>
```

### 回滚后验证

```bash
# 1. 健康检查
curl http://localhost:3000/health

# 2. 功能测试
# （重复部署后验证的步骤）

# 3. 检查日志
sudo journalctl -u danci-backend -n 100

# 4. 监控关键指标
# - 响应时间
# - 错误率
# - CPU/内存使用
```

### 回滚通知

回滚完成后，应通知相关人员：

```markdown
# 回滚通知模板

**回滚时间**: 2025-12-12 14:30 UTC
**回滚版本**: v1.2.3 -> v1.2.2
**回滚原因**: [描述原因，如：数据库迁移失败导致服务不可用]
**影响范围**: [描述影响的功能和用户]
**当前状态**: ✅ 服务已恢复正常
**后续计划**: [描述修复计划和重新部署时间]

**验证结果**:

- ✅ 健康检查通过
- ✅ 核心功能正常
- ✅ 性能指标正常

**责任人**: @username
```

---

## 常见问题

### Q1: 数据库迁移失败怎么办？

**症状**：`prisma migrate deploy` 命令失败

**解决方法**：

```bash
# 1. 查看详细错误
pnpm prisma migrate deploy --help
pnpm prisma migrate status

# 2. 检查数据库连接
psql -U danci -h localhost -d vocabulary_db -c "SELECT version();"

# 3. 手动解决冲突
# 如果是迁移冲突，查看 prisma/migrations/ 目录
# 手动编辑或删除有问题的迁移文件

# 4. 标记迁移为已应用（如果已手动执行）
pnpm prisma migrate resolve --applied <migration-name>

# 5. 重新运行迁移
pnpm prisma migrate deploy
```

### Q2: 服务启动后立即退出

**症状**：`systemctl status danci-backend` 显示服务已停止

**解决方法**：

```bash
# 1. 查看详细日志
sudo journalctl -u danci-backend -n 100 --no-pager

# 2. 检查常见问题
# - 端口被占用
sudo lsof -i :3000

# - 环境变量缺失
cat /etc/systemd/system/danci-backend.service | grep Environment

# - 数据库连接失败
psql -U danci -h localhost -c "SELECT 1;" vocabulary_db

# - 文件权限问题
ls -la /opt/danci/packages/backend/dist/

# 3. 手动启动测试
cd /opt/danci/packages/backend
NODE_ENV=production PORT=3000 node dist/index.js
```

### Q3: Redis 连接超时

**症状**：日志显示 `Redis connection timeout`

**解决方法**：

```bash
# 1. 检查 Redis 服务状态
sudo systemctl status redis

# 2. 测试 Redis 连接
redis-cli ping

# 3. 检查 Redis 配置
cat /etc/redis/redis.conf | grep -E "bind|port|timeout"

# 4. 检查网络连接
telnet localhost 6379

# 5. 增加连接超时时间（如需要）
# 在 .env 中添加：
# REDIS_CONNECT_TIMEOUT=10000
```

### Q4: 内存泄漏问题

**症状**：服务运行一段时间后内存占用持续增长

**解决方法**：

```bash
# 1. 监控内存使用
# 使用 PM2 或 htop 观察内存增长趋势

# 2. 生成堆快照（需要 Node.js 调试）
node --inspect dist/index.js
# 使用 Chrome DevTools 连接并生成堆快照

# 3. 临时解决：增加内存限制
NODE_OPTIONS="--max-old-space-size=4096" node dist/index.js

# 4. 定期重启服务（使用 PM2）
pm2 start dist/index.js --name danci-backend --max-memory-restart 2G

# 5. 检查是否有未关闭的数据库连接
# 查看 Prisma Client 使用是否正确关闭
```

### Q5: 高并发下响应缓慢

**症状**：高峰期响应时间显著增加

**解决方法**：

```bash
# 1. 增加 Node.js 进程数（使用 PM2 cluster 模式）
pm2 start dist/index.js -i max --name danci-backend

# 2. 优化数据库连接池
# 在 prisma/schema.prisma 中调整：
# datasource db {
#   url = env("DATABASE_URL")
#   connection_limit = 20
# }

# 3. 启用 Redis 缓存
# 确保 Redis 配置正确

# 4. 检查慢查询
psql -U danci -d vocabulary_db -c "
SELECT query, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"

# 5. 增加服务器资源
# - 升级 CPU 核心数
# - 增加内存
# - 使用负载均衡
```

### Q6: SSL/TLS 证书问题

**症状**：HTTPS 连接失败或证书过期警告

**解决方法**：

```bash
# 1. 检查证书有效期
openssl x509 -in /etc/ssl/certs/danci.crt -noout -dates

# 2. 使用 Let's Encrypt 自动更新证书
sudo certbot renew --dry-run

# 3. 配置自动续期（cron）
sudo crontab -e
# 添加：
# 0 0 * * 0 certbot renew --quiet --post-hook "systemctl reload nginx"

# 4. 验证 Nginx 配置
sudo nginx -t
sudo systemctl reload nginx
```

---

## 安全检查清单

部署前后应进行安全检查：

- [ ] JWT_SECRET 已更换为强密钥（至少 64 字符）
- [ ] 数据库密码已更换为强密码
- [ ] 防火墙已配置（仅开放必要端口）
- [ ] SSH 密钥认证已启用（禁用密码登录）
- [ ] 系统补丁已更新
- [ ] 依赖包无严重安全漏洞（`pnpm audit`）
- [ ] HTTPS 已启用且证书有效
- [ ] CORS 配置正确（仅允许信任的域名）
- [ ] 速率限制已启用
- [ ] 日志记录已配置（包括安全事件）
- [ ] 备份策略已实施
- [ ] 监控告警已配置

---

## 性能优化建议

### 数据库优化

```sql
-- 1. 创建常用索引
CREATE INDEX CONCURRENTLY idx_answer_records_user_timestamp
ON answer_records(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY idx_word_states_user_next_review
ON word_learning_states(user_id, next_review_date)
WHERE next_review_date IS NOT NULL;

-- 2. 分析查询计划
EXPLAIN ANALYZE
SELECT * FROM answer_records
WHERE user_id = 'xxx'
ORDER BY timestamp DESC
LIMIT 20;

-- 3. 定期 VACUUM
VACUUM ANALYZE;

-- 4. 更新统计信息
ANALYZE;
```

### 应用层优化

```bash
# 1. 启用 Node.js 集群模式
pm2 start dist/index.js -i max

# 2. 启用 HTTP/2
# 在 Nginx 配置中添加：
# listen 443 ssl http2;

# 3. 启用 Gzip 压缩
# 在 Nginx 配置中添加：
# gzip on;
# gzip_types text/plain text/css application/json application/javascript;

# 4. 配置 Redis 缓存策略
# 缓存常用数据，减少数据库查询
```

---

## 下一步

- 阅读 [运维指南](./OPERATIONS_GUIDE.md) 了解日常运维操作
- 阅读 [迁移部署指南](./MIGRATION_DEPLOYMENT.md) 了解版本升级策略
- 配置监控和告警系统（参考 [monitoring/](../monitoring/) 目录）

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: Backend Team
