# Docker 部署指南

## 🚀 一键部署（推荐）

在全新服务器上，只需一条命令即可完成部署：

```bash
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/deploy/deploy.sh | sudo bash
```

此脚本会自动：

- 安装 Docker 和 Docker Compose（如未安装）
- 下载生产环境配置文件
- 生成安全的随机密钥
- 拉取预构建的 Docker 镜像
- 启动所有服务

部署完成后，访问 `http://服务器IP:5173` 即可使用。

### 部署后管理

```bash
cd /opt/danci

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose down

# 更新到最新版本
docker compose pull && docker compose up -d
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    danci-network                        │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Nginx   │───▶│ Rust Backend │───▶│ PostgreSQL    │  │
│  │ :5173   │    │ :3000        │    │ (TimescaleDB) │  │
│  └─────────┘    └──────────────┘    └───────────────┘  │
│       │                │                               │
│       │                ▼                               │
│       │         ┌─────────────┐                        │
│       │         │ Redis       │                        │
│       │         │ :6379       │                        │
│       │         └─────────────┘                        │
│       ▼                                                │
│  前端静态资源 + API 反向代理                            │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 配置环境变量

```bash
cp infrastructure/docker/.env.docker .env
```

编辑 `.env`，**必须修改以下生产配置**：

```env
# 数据库密码（使用强随机密码）
POSTGRES_PASSWORD=your_secure_password_here

# JWT 密钥（64+ 字符随机字符串）
JWT_SECRET=your_64_char_random_secret_here

# 前端访问域名
CORS_ORIGIN=https://your-domain.com
```

### 2. 启动服务

```bash
# 构建并启动所有服务
docker compose up -d

# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f
```

### 3. 访问服务

| 服务     | 地址                      |
| -------- | ------------------------- |
| 前端     | http://localhost:5173     |
| 后端 API | http://localhost:5173/api |
| 后端直连 | http://localhost:3001     |

## 服务说明

### 服务列表

| 服务         | 镜像                                                  | 端口 | 说明            |
| ------------ | ----------------------------------------------------- | ---- | --------------- |
| postgres     | timescale/timescaledb:latest-pg15                     | 5432 | 主数据库        |
| redis        | redis:7-alpine                                        | 6379 | 缓存 + 分布式锁 |
| backend-rust | ghcr.io/heartcoolman/vocabulary-learning-app/backend  | 3000 | Rust API 服务   |
| frontend     | ghcr.io/heartcoolman/vocabulary-learning-app/frontend | 5173 | 前端 + 反向代理 |

### 健康检查

```bash
# 后端健康状态
curl http://localhost:3001/health

# 详细指标
curl http://localhost:3001/health/metrics

# 数据库连接
curl http://localhost:3001/health/database
```

## 环境变量

### 必需

| 变量                | 默认值            | 说明         |
| ------------------- | ----------------- | ------------ |
| `POSTGRES_PASSWORD` | danci_secret_2024 | 数据库密码   |
| `JWT_SECRET`        | -                 | JWT 签名密钥 |

### 可选

| 变量                      | 默认值                | 说明             |
| ------------------------- | --------------------- | ---------------- |
| `POSTGRES_USER`           | danci                 | 数据库用户       |
| `POSTGRES_DB`             | vocabulary_db         | 数据库名         |
| `POSTGRES_PORT`           | 5432                  | 数据库端口       |
| `REDIS_PORT`              | 6379                  | Redis 端口       |
| `FRONTEND_PORT`           | 5173                  | 前端端口         |
| `BACKEND_RUST_PORT`       | 3001                  | 后端端口         |
| `RUST_LOG`                | info                  | 日志级别         |
| `CORS_ORIGIN`             | http://localhost:5173 | 允许的跨域源     |
| `SQLITE_FALLBACK_ENABLED` | true                  | 启用 SQLite 热备 |

## 常用命令

```bash
# 停止服务
docker compose down

# 停止并删除数据卷（慎用）
docker compose down -v

# 重建镜像
docker compose build --no-cache

# 单独重启后端
docker compose restart backend-rust

# 查看后端日志
docker compose logs -f backend-rust

# 进入后端容器
docker compose exec backend-rust sh

# 进入数据库
docker compose exec postgres psql -U danci -d vocabulary_db
```

## 开发环境

仅启动数据库服务，前后端本地运行：

```bash
docker compose -f docker-compose.dev.yml up -d
```

然后：

```bash
pnpm install
pnpm dev
```

## 生产部署

### 推荐方式：一键部署

使用上方的一键部署脚本，自动拉取 GitHub 预构建镜像，无需本地编译。

### 手动部署

1. 下载配置文件：

```bash
mkdir -p /opt/danci && cd /opt/danci
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/docker-compose.prod.yml -o docker-compose.yml
```

2. 创建 `.env` 文件并配置环境变量

3. 启动服务：

```bash
docker compose pull
docker compose up -d
```

### 使用外部数据库

修改 `.env`：

```env
DATABASE_URL=postgresql://user:pass@your-db-host:5432/danci
```

然后在 `docker-compose.yml` 中注释掉 postgres 服务。

### 反向代理 (Nginx/Caddy)

示例 Caddy 配置：

```caddyfile
your-domain.com {
    reverse_proxy localhost:5173
}
```

### 数据备份

```bash
# 备份数据库
docker compose exec postgres pg_dump -U danci vocabulary_db > backup.sql

# 恢复数据库
cat backup.sql | docker compose exec -T postgres psql -U danci vocabulary_db
```

## 故障排查

### 后端无法连接数据库

```bash
# 检查 postgres 是否健康
docker compose ps postgres

# 查看 postgres 日志
docker compose logs postgres
```

### 前端无法访问 API

```bash
# 检查 nginx 配置是否生效
docker compose exec frontend cat /etc/nginx/conf.d/default.conf

# 检查后端是否启动
curl http://localhost:3001/health
```

### 重置环境

```bash
docker compose down -v
docker compose up -d
```
