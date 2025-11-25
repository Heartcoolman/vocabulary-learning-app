# 部署运维手册

## 概述

本文档提供词汇学习应用的部署、运维和故障排查指南。

## 环境要求

### 后端

- Node.js >= 18.x
- PostgreSQL >= 14.x
- PM2 (进程管理)
- npm >= 9.x

### 前端

- Node.js >= 18.x
- npm >= 9.x
- 静态文件服务器 (Nginx/Apache)

## 部署流程

### 首次部署

#### 1. 后端部署

```bash
# 克隆代码
git clone <repository-url>
cd vocabulary-app

# 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 文件，设置数据库连接等

# 运行部署脚本（首次需要种子数据）
RUN_DB_SEED=true ./scripts/deploy-backend.sh

# 手动启动 PM2 进程
cd backend
pm2 start dist/index.js --name vocabulary-api
pm2 save
```

#### 2. 前端部署

```bash
# 配置环境变量
cp .env.example .env.production
# 编辑 .env.production 文件

# 运行部署脚本
./scripts/deploy-frontend.sh production

# 将 dist 目录部署到 Web 服务器
rsync -avz --delete dist/ user@server:/var/www/vocabulary-app/frontend/
```

### 常规更新部署

```bash
# 拉取最新代码
git pull origin main

# 后端更新
./scripts/deploy-backend.sh

# 前端更新
./scripts/deploy-frontend.sh production
```

## 环境变量配置

### 后端 (backend/.env)

```env
# 数据库连接
DATABASE_URL=postgresql://user:password@localhost:5432/vocabulary

# JWT 配置
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=24h

# 服务器配置
PORT=3000
NODE_ENV=production

# 种子数据密码（仅开发/测试环境）
ADMIN_PASSWORD=secure-admin-password
TEST_USER_PASSWORD=secure-test-password
```

### 前端 (.env.production)

```env
VITE_API_URL=https://api.yourdomain.com
VITE_APP_NAME=词汇学习
```

## 数据库管理

### 迁移操作

```bash
# 查看迁移状态
cd backend
npx prisma migrate status

# 应用迁移
npx prisma migrate deploy

# 回滚迁移（谨慎操作）
# Prisma 不支持直接回滚，需要手动执行 SQL
```

### 备份与恢复

```bash
# 备份数据库
pg_dump -h localhost -U user -d vocabulary > backup_$(date +%Y%m%d).sql

# 恢复数据库
psql -h localhost -U user -d vocabulary < backup_20240101.sql
```

### 种子数据

```bash
# 运行种子脚本（仅开发/测试环境）
cd backend
ADMIN_PASSWORD=xxx TEST_USER_PASSWORD=xxx npx prisma db seed
```

## 监控与日志

### PM2 监控

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs vocabulary-api

# 查看实时监控
pm2 monit

# 查看详细信息
pm2 show vocabulary-api
```

### 日志位置

- PM2 日志：`~/.pm2/logs/`
- 应用日志：`backend/logs/` (如配置)
- Nginx 日志：`/var/log/nginx/`

## 健康检查

### 后端健康检查

```bash
curl http://localhost:3000/health
```

**预期响应：**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

### 数据库连接检查

```bash
curl http://localhost:3000/health/db
```

## 故障排查

### 常见问题

#### 1. 数据库连接失败

**症状：** 应用启动失败，日志显示 "Can't reach database server"

**排查步骤：**
```bash
# 检查 PostgreSQL 服务
sudo systemctl status postgresql

# 检查连接
psql -h localhost -U user -d vocabulary

# 检查环境变量
cat backend/.env | grep DATABASE_URL
```

#### 2. PM2 进程崩溃

**症状：** 应用反复重启

**排查步骤：**
```bash
# 查看错误日志
pm2 logs vocabulary-api --err --lines 100

# 检查内存使用
pm2 show vocabulary-api | grep memory

# 重置重启计数
pm2 reset vocabulary-api
```

#### 3. 迁移失败

**症状：** `prisma migrate deploy` 报错

**排查步骤：**
```bash
# 查看迁移状态
npx prisma migrate status

# 检查失败的迁移
ls -la prisma/migrations/

# 手动修复（谨慎）
# 1. 备份数据库
# 2. 手动执行 SQL 修复
# 3. 标记迁移为已应用
npx prisma migrate resolve --applied <migration_name>
```

#### 4. 前端构建失败

**症状：** 类型检查错误或构建错误

**排查步骤：**
```bash
# 清理缓存
rm -rf node_modules/.vite

# 重新安装依赖
rm -rf node_modules
npm ci

# 单独运行类型检查
npm run type-check
```

## 回滚操作

### 代码回滚

```bash
# 查看最近提交
git log --oneline -10

# 回滚到指定版本
git checkout <commit-hash>

# 重新部署
./scripts/deploy-backend.sh
./scripts/deploy-frontend.sh production
```

### 数据库回滚

**警告：** 数据库回滚是破坏性操作，请确保有备份。

```bash
# 恢复备份
psql -h localhost -U user -d vocabulary < backup_before_migration.sql

# 标记迁移为未应用（如需要）
# 需要手动操作 _prisma_migrations 表
```

## 性能优化

### 数据库优化

```sql
-- 分析表统计信息
ANALYZE;

-- 查看慢查询
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

-- 查看索引使用情况
SELECT * FROM pg_stat_user_indexes;
```

### 应用优化

```bash
# 增加 PM2 实例数
pm2 scale vocabulary-api 4

# 配置集群模式
pm2 start dist/index.js -i max --name vocabulary-api
```

## 安全检查清单

- [ ] 生产环境未使用默认密码
- [ ] DATABASE_URL 不包含明文密码在日志中
- [ ] JWT_SECRET 为强随机字符串
- [ ] HTTPS 已启用
- [ ] CORS 配置正确
- [ ] 速率限制已启用
- [ ] 数据库定期备份
- [ ] 日志不包含敏感信息

## 联系方式

如遇到无法解决的问题，请联系：

- 技术支持：support@example.com
- 紧急联系：oncall@example.com

## 相关文档

- [认证系统文档](./AUTHENTICATION.md)
- [AMAS 算法指南](./AMAS-algorithm-guide.md)
- [API 文档](../backend/API.md)
