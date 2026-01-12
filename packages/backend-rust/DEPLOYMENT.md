# Danci Rust Backend 部署指南

## 快速启动

```bash
# 构建
cargo build --release

# 运行 (需设置环境变量)
DATABASE_URL=postgres://... ./target/release/danci-backend-rust
```

## 验证

```bash
# 压力测试
./scripts/stress-test.sh http://localhost:3001

# 集成测试
cargo test --test integration_test

# 健康检查
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready
curl http://localhost:3001/health/metrics
```

## 环境变量

| 变量              | 必需 | 说明                        |
| ----------------- | ---- | --------------------------- |
| DATABASE_URL      | 是   | PostgreSQL连接串            |
| SQLITE_PATH       | 否   | SQLite备份路径              |
| REDIS_URL         | 否   | Redis连接串                 |
| ALERT_WEBHOOK_URL | 否   | 告警Webhook                 |
| NODE_ENV          | 否   | production/development      |
| LOG_LEVEL         | 否   | trace/debug/info/warn/error |

## 监控端点

- `/health` - 综合健康状态
- `/health/live` - 存活探针 (K8s)
- `/health/ready` - 就绪探针 (K8s)
- `/health/database` - 数据库状态
- `/health/metrics` - 系统指标 + 告警状态
- `/health/info` - 版本信息

## Docker部署

```bash
# 构建镜像
docker build -t danci-backend-rust -f packages/backend-rust/Dockerfile .

# 运行
docker compose up -d backend-rust
```
