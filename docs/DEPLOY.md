# 部署配置

## 环境变量

### 必需配置

| 变量           | 说明                | 示例                                          |
| -------------- | ------------------- | --------------------------------------------- |
| `DATABASE_URL` | PostgreSQL 连接串   | `postgresql://user:pass@localhost:5432/danci` |
| `REDIS_URL`    | Redis 连接串        | `redis://localhost:6379`                      |
| `JWT_SECRET`   | JWT 密钥 (64+ 字符) | 随机生成                                      |

### 可选配置

| 变量           | 说明           | 默认值    |
| -------------- | -------------- | --------- |
| `BACKEND_HOST` | 后端监听地址   | `0.0.0.0` |
| `BACKEND_PORT` | 后端监听端口   | `3000`    |
| `LOG_LEVEL`    | 日志级别       | `info`    |
| `CORS_ORIGIN`  | 允许的跨域来源 | `*`       |

## 服务架构

```
Nginx (:5173) → Rust Backend (:3000) → PostgreSQL + Redis
     ↓
前端静态资源 + API 反向代理 (/api)
```

| 服务         | 镜像                                                  | 端口 | 说明            |
| ------------ | ----------------------------------------------------- | ---- | --------------- |
| postgres     | timescale/timescaledb:latest-pg15                     | 5432 | 主数据库        |
| redis        | redis:7-alpine                                        | 6379 | 缓存 + 分布式锁 |
| backend-rust | ghcr.io/heartcoolman/vocabulary-learning-app/backend  | 3000 | Rust API 服务   |
| frontend     | ghcr.io/heartcoolman/vocabulary-learning-app/frontend | 5173 | 前端 + 反向代理 |

## 生产部署

### 使用外部数据库

修改 `.env`：

```env
DATABASE_URL=postgresql://user:pass@your-db-host:5432/danci
```

然后在 `docker-compose.yml` 中注释掉 postgres 服务。

### 反向代理配置

**Caddy 示例：**

```caddyfile
your-domain.com {
    reverse_proxy localhost:5173
}
```

**Nginx 示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 数据备份

```bash
# 备份数据库
docker compose exec postgres pg_dump -U danci vocabulary_db > backup.sql

# 恢复数据库
cat backup.sql | docker compose exec -T postgres psql -U danci vocabulary_db
```

## 健康检查

```bash
# 后端健康状态
curl http://localhost:3001/health

# 详细指标
curl http://localhost:3001/health/metrics

# 数据库连接
curl http://localhost:3001/health/database
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
