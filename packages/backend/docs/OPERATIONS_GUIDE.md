# 运维指南

本文档提供单词学习平台后端服务的日常运维指南，包括系统监控、日志分析、故障排查、性能优化、数据库维护和备份恢复等内容。

## 目录

- [系统监控指标](#系统监控指标)
- [日志查询和分析](#日志查询和分析)
- [常见问题排查](#常见问题排查)
- [性能优化建议](#性能优化建议)
- [数据库维护](#数据库维护)
- [备份和恢复](#备份和恢复)
- [安全维护](#安全维护)
- [容量规划](#容量规划)

---

## 系统监控指标

### 核心监控指标

#### 1. 应用层指标

| 指标       | 描述             | 正常范围   | 告警阈值       |
| ---------- | ---------------- | ---------- | -------------- |
| 响应时间   | API 平均响应时间 | < 200ms    | > 500ms        |
| 错误率     | 5xx 错误占比     | < 0.1%     | > 1%           |
| QPS        | 每秒请求数       | 取决于业务 | -              |
| 并发连接数 | 活跃连接数       | < 1000     | > 2000         |
| 进程状态   | 进程运行状态     | running    | stopped/failed |

#### 2. 系统资源指标

| 指标       | 描述          | 正常范围 | 告警阈值      |
| ---------- | ------------- | -------- | ------------- |
| CPU 使用率 | 系统 CPU 占用 | < 70%    | > 85%         |
| 内存使用率 | 系统内存占用  | < 80%    | > 90%         |
| 磁盘使用率 | 磁盘空间占用  | < 80%    | > 90%         |
| 磁盘 I/O   | 磁盘读写速率  | 正常     | IOPS 达到瓶颈 |
| 网络流量   | 入站/出站流量 | 正常     | 接近带宽上限  |

#### 3. 数据库指标

| 指标       | 描述           | 正常范围  | 告警阈值  |
| ---------- | -------------- | --------- | --------- |
| 活跃连接数 | 当前数据库连接 | < 50      | > 100     |
| 慢查询数量 | 执行时间 > 1s  | < 10/分钟 | > 50/分钟 |
| 锁等待时间 | 事务锁等待     | < 100ms   | > 500ms   |
| 缓存命中率 | 查询缓存命中   | > 95%     | < 80%     |
| 复制延迟   | 主从复制延迟   | < 1s      | > 5s      |

#### 4. Redis 指标

| 指标         | 描述           | 正常范围 | 告警阈值 |
| ------------ | -------------- | -------- | -------- |
| 内存使用率   | Redis 内存占用 | < 80%    | > 90%    |
| 连接数       | 客户端连接数   | < 100    | > 500    |
| 命令执行速率 | 每秒操作数     | 正常     | -        |
| 键过期速率   | 过期键清理速率 | 正常     | -        |
| 持久化状态   | AOF/RDB 状态   | 正常     | 失败     |

### 监控实施

#### 使用 Prometheus + Grafana

##### 1. 安装 Prometheus

```bash
# 下载 Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvf prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# 创建配置文件
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'danci-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['localhost:9121']
EOF

# 启动 Prometheus
./prometheus --config.file=prometheus.yml
```

##### 2. 安装 Node Exporter（系统指标）

```bash
# 下载 Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
tar xvf node_exporter-1.6.0.linux-amd64.tar.gz
cd node_exporter-1.6.0.linux-amd64

# 创建 systemd 服务
sudo tee /etc/systemd/system/node-exporter.service << 'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/opt/node_exporter/node_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable node-exporter
sudo systemctl start node-exporter
```

##### 3. 安装 Postgres Exporter

```bash
# 下载 Postgres Exporter
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.13.0/postgres_exporter-0.13.0.linux-amd64.tar.gz
tar xvf postgres_exporter-0.13.0.linux-amd64.tar.gz

# 配置数据库连接
export DATA_SOURCE_NAME="postgresql://danci:password@localhost:5432/vocabulary_db?sslmode=disable"

# 创建 systemd 服务
sudo tee /etc/systemd/system/postgres-exporter.service << 'EOF'
[Unit]
Description=Postgres Exporter
After=network.target

[Service]
Type=simple
Environment="DATA_SOURCE_NAME=postgresql://danci:password@localhost:5432/vocabulary_db?sslmode=disable"
ExecStart=/opt/postgres_exporter/postgres_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable postgres-exporter
sudo systemctl start postgres-exporter
```

##### 4. 安装 Redis Exporter

```bash
# 下载 Redis Exporter
wget https://github.com/oliver006/redis_exporter/releases/download/v1.51.0/redis_exporter-v1.51.0.linux-amd64.tar.gz
tar xvf redis_exporter-v1.51.0.linux-amd64.tar.gz

# 创建 systemd 服务
sudo tee /etc/systemd/system/redis-exporter.service << 'EOF'
[Unit]
Description=Redis Exporter
After=network.target

[Service]
Type=simple
ExecStart=/opt/redis_exporter/redis_exporter --redis.addr=localhost:6379
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable redis-exporter
sudo systemctl start redis-exporter
```

##### 5. 安装 Grafana

```bash
# 添加 Grafana 仓库
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# 安装 Grafana
sudo apt-get update
sudo apt-get install grafana

# 启动 Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# 访问 Grafana（默认端口 3000）
# http://localhost:3000
# 默认账号: admin / admin
```

##### 6. 配置 Grafana 数据源

```bash
# 登录 Grafana 后：
# 1. 添加数据源 -> Prometheus
# 2. URL: http://localhost:9090
# 3. 保存并测试

# 导入预设仪表板：
# - Node Exporter Dashboard: ID 1860
# - PostgreSQL Dashboard: ID 9628
# - Redis Dashboard: ID 763
```

#### 告警规则配置

创建 Prometheus 告警规则：

```yaml
# /etc/prometheus/alert.rules.yml
groups:
  - name: danci_backend_alerts
    interval: 30s
    rules:
      # 应用层告警
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: '高错误率检测'
          description: '5xx 错误率超过 1%，当前值: {{ $value }}'

      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: '响应时间缓慢'
          description: '95分位响应时间超过 500ms，当前值: {{ $value }}'

      # 系统资源告警
      - alert: HighCpuUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'CPU 使用率过高'
          description: 'CPU 使用率超过 85%，当前值: {{ $value }}%'

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: '内存使用率过高'
          description: '内存使用率超过 90%，当前值: {{ $value }}%'

      - alert: DiskSpaceLow
        expr: (1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: '磁盘空间不足'
          description: '磁盘使用率超过 90%，当前值: {{ $value }}%'

      # 数据库告警
      - alert: PostgresDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'PostgreSQL 服务不可用'
          description: 'PostgreSQL 连接失败'

      - alert: TooManyConnections
        expr: pg_stat_activity_count > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: '数据库连接过多'
          description: '当前活跃连接: {{ $value }}'

      - alert: SlowQueries
        expr: rate(pg_stat_statements_mean_time_seconds[5m]) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: '慢查询过多'
          description: '平均查询时间超过 1 秒'

      # Redis 告警
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Redis 服务不可用'
          description: 'Redis 连接失败'

      - alert: RedisHighMemory
        expr: (redis_memory_used_bytes / redis_memory_max_bytes) * 100 > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Redis 内存使用率过高'
          description: 'Redis 内存使用率: {{ $value }}%'
```

配置告警通知（Alertmanager）：

```yaml
# /etc/alertmanager/alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical'
    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:5001/webhook'

  - name: 'critical'
    email_configs:
      - to: 'ops@example.com'
        from: 'alert@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alert@example.com'
        auth_password: 'password'
    webhook_configs:
      - url: 'http://localhost:5001/webhook/critical'

  - name: 'warning'
    email_configs:
      - to: 'ops@example.com'
        from: 'alert@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alert@example.com'
        auth_password: 'password'
```

---

## 日志查询和分析

### 日志架构

应用采用 Pino 日志框架，支持结构化 JSON 日志输出。

#### 日志级别

| 级别  | 数值 | 用途         |
| ----- | ---- | ------------ |
| trace | 10   | 详细调试信息 |
| debug | 20   | 调试信息     |
| info  | 30   | 常规信息     |
| warn  | 40   | 警告信息     |
| error | 50   | 错误信息     |
| fatal | 60   | 致命错误     |

### 日志查询

#### 1. 使用 journalctl（systemd 服务）

```bash
# 查看实时日志
sudo journalctl -u danci-backend -f

# 查看最近 100 行日志
sudo journalctl -u danci-backend -n 100

# 查看特定时间范围日志
sudo journalctl -u danci-backend --since "2025-12-12 10:00:00" --until "2025-12-12 11:00:00"

# 按优先级过滤
sudo journalctl -u danci-backend -p err  # 仅显示错误级别及以上

# 导出日志到文件
sudo journalctl -u danci-backend --since today > /tmp/backend.log
```

#### 2. 使用 Docker（容器化部署）

```bash
# 查看实时日志
docker-compose logs -f backend

# 查看最近 100 行日志
docker-compose logs --tail=100 backend

# 查看特定时间范围日志
docker-compose logs --since "2025-12-12T10:00:00" --until "2025-12-12T11:00:00" backend

# 导出日志到文件
docker-compose logs --no-color backend > /tmp/backend.log
```

#### 3. 查询结构化日志（JSON）

```bash
# 使用 jq 解析 JSON 日志
sudo journalctl -u danci-backend -n 1000 --output=cat | \
  grep '^{' | jq -r 'select(.level >= 50) | "\(.time) [\(.level)] \(.msg)"'

# 查询特定用户的请求
sudo journalctl -u danci-backend -n 10000 --output=cat | \
  grep '^{' | jq -r 'select(.userId == "user-id-here") | "\(.time) \(.msg)"'

# 统计错误类型
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.level >= 50) | .err.type' | sort | uniq -c | sort -rn

# 查询慢请求（响应时间 > 1000ms）
sudo journalctl -u danci-backend -n 10000 --output=cat | \
  grep '^{' | jq -r 'select(.responseTime > 1000) | "\(.time) \(.req.url) \(.responseTime)ms"'
```

### 日志分析

#### 1. 错误分析

```bash
# 统计今日错误数量
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.level >= 50)' | wc -l

# 按错误类型分组
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.level >= 50) | .err.message' | sort | uniq -c | sort -rn

# 查找特定错误堆栈
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.err.message | contains("Database")) | "\(.time) \(.err.stack)"'
```

#### 2. 性能分析

```bash
# 统计 API 平均响应时间
sudo journalctl -u danci-backend --since "1 hour ago" --output=cat | \
  grep '^{' | jq -r 'select(.responseTime) | .responseTime' | \
  awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'

# 找出最慢的 10 个请求
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.responseTime) | "\(.responseTime) \(.req.method) \(.req.url)"' | \
  sort -rn | head -10

# 统计各 API 端点调用次数
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r '.req.url' | sort | uniq -c | sort -rn | head -20
```

#### 3. 用户行为分析

```bash
# 统计活跃用户数
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.userId) | .userId' | sort -u | wc -l

# 查看特定用户的操作记录
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.userId == "user-id") | "\(.time) \(.req.method) \(.req.url)"'

# 统计登录失败次数
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.msg | contains("login failed"))' | wc -l
```

#### 4. 数据库查询分析

```bash
# 查找慢查询（从应用日志）
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.query and .duration > 1000) | "\(.time) \(.query) \(.duration)ms"'

# 统计数据库操作类型
sudo journalctl -u danci-backend --since today --output=cat | \
  grep '^{' | jq -r 'select(.query) | .query' | \
  grep -oP '^(SELECT|INSERT|UPDATE|DELETE)' | sort | uniq -c
```

### 日志聚合（ELK Stack）

#### 安装 Elasticsearch + Logstash + Kibana

```bash
# 1. 安装 Elasticsearch
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.9.0-linux-x86_64.tar.gz
tar -xzf elasticsearch-8.9.0-linux-x86_64.tar.gz
cd elasticsearch-8.9.0/
./bin/elasticsearch

# 2. 安装 Logstash
wget https://artifacts.elastic.co/downloads/logstash/logstash-8.9.0-linux-x86_64.tar.gz
tar -xzf logstash-8.9.0-linux-x86_64.tar.gz
cd logstash-8.9.0/

# 配置 Logstash
cat > config/danci.conf << 'EOF'
input {
  file {
    path => "/var/log/danci/backend.log"
    codec => json
    start_position => "beginning"
  }
}

filter {
  if [level] >= 50 {
    mutate {
      add_tag => ["error"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "danci-backend-%{+YYYY.MM.dd}"
  }
}
EOF

./bin/logstash -f config/danci.conf

# 3. 安装 Kibana
wget https://artifacts.elastic.co/downloads/kibana/kibana-8.9.0-linux-x86_64.tar.gz
tar -xzf kibana-8.9.0-linux-x86_64.tar.gz
cd kibana-8.9.0/
./bin/kibana

# 访问 Kibana: http://localhost:5601
```

### 日志轮转配置

```bash
# 创建 logrotate 配置
sudo tee /etc/logrotate.d/danci-backend << 'EOF'
/var/log/danci/backend.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 danci danci
    sharedscripts
    postrotate
        systemctl reload danci-backend > /dev/null 2>&1 || true
    endscript
}
EOF

# 测试配置
sudo logrotate -d /etc/logrotate.d/danci-backend

# 手动执行轮转
sudo logrotate -f /etc/logrotate.d/danci-backend
```

---

## 常见问题排查

### 1. 服务不可用

#### 症状

- HTTP 请求返回 502/503 错误
- 健康检查端点不响应

#### 排查步骤

```bash
# 1. 检查服务状态
sudo systemctl status danci-backend
# 或
docker-compose ps backend

# 2. 查看最近日志
sudo journalctl -u danci-backend -n 100
# 或
docker-compose logs --tail=100 backend

# 3. 检查端口占用
sudo lsof -i :3000
sudo netstat -tlnp | grep :3000

# 4. 检查进程
ps aux | grep node

# 5. 检查资源使用
top -p $(pgrep -f "node.*backend")

# 6. 检查依赖服务
# PostgreSQL
psql -U danci -h localhost -c "SELECT 1;" vocabulary_db
# Redis
redis-cli ping

# 7. 尝试手动启动
cd /opt/danci/packages/backend
NODE_ENV=production node dist/index.js
```

#### 常见原因及解决方法

| 原因           | 解决方法                               |
| -------------- | -------------------------------------- |
| 端口被占用     | `sudo lsof -i :3000`，终止占用进程     |
| 数据库连接失败 | 检查 DATABASE_URL，重启数据库          |
| Redis 连接失败 | 检查 Redis 服务状态                    |
| 内存不足       | 增加内存或优化代码                     |
| 文件权限问题   | `sudo chown -R danci:danci /opt/danci` |

### 2. 响应缓慢

#### 症状

- API 响应时间超过 1 秒
- 用户反馈页面加载慢

#### 排查步骤

```bash
# 1. 检查系统负载
uptime
top
htop

# 2. 检查 CPU 使用
mpstat -P ALL 1

# 3. 检查内存使用
free -h
vmstat 1

# 4. 检查磁盘 I/O
iostat -x 1

# 5. 检查网络连接
netstat -an | grep :3000 | wc -l

# 6. 分析慢查询
psql -U danci -d vocabulary_db << 'EOF'
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF

# 7. 检查 Redis 性能
redis-cli --latency
redis-cli --stat

# 8. 使用 Node.js Profiler
node --inspect dist/index.js
# 使用 Chrome DevTools 连接并分析性能
```

#### 优化建议

1. **数据库优化**

```sql
-- 添加缺失索引
CREATE INDEX CONCURRENTLY idx_missing ON table_name(column_name);

-- 更新统计信息
ANALYZE;

-- 执行 VACUUM
VACUUM ANALYZE;
```

2. **应用层优化**

```bash
# 启用集群模式
pm2 start dist/index.js -i max

# 启用 Redis 缓存
# 检查缓存配置是否正确

# 增加数据库连接池
# 在 schema.prisma 中调整 connection_limit
```

3. **系统层优化**

```bash
# 调整系统参数
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=8192

# 增加文件描述符限制
ulimit -n 65535
```

### 3. 数据库死锁

#### 症状

- 请求超时
- 日志显示 "deadlock detected"

#### 排查步骤

```sql
-- 查看当前锁情况
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- 查看长时间运行的查询
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
  AND state = 'active';

-- 终止阻塞查询（谨慎使用）
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <blocking_pid>;
```

#### 预防措施

1. **优化事务逻辑**
   - 减少事务持有时间
   - 避免在事务中执行耗时操作
   - 统一锁获取顺序

2. **添加超时配置**

```sql
-- 设置语句超时
ALTER DATABASE vocabulary_db SET statement_timeout = '30s';

-- 设置锁等待超时
ALTER DATABASE vocabulary_db SET lock_timeout = '10s';
```

### 4. 内存泄漏

#### 症状

- 内存使用持续增长
- 最终导致 OOM（Out of Memory）

#### 排查步骤

```bash
# 1. 监控内存增长
watch -n 5 'ps aux | grep node | grep -v grep'

# 2. 生成堆快照
# 启动时添加 --inspect 参数
node --inspect dist/index.js

# 使用 Chrome DevTools:
# chrome://inspect
# 连接到应用，生成堆快照并分析

# 3. 使用 clinic.js 诊断
npm install -g clinic
clinic doctor -- node dist/index.js
# 运行一段时间后停止，查看报告

# 4. 检查事件监听器泄漏
# 在代码中添加：
process.setMaxListeners(0); // 临时调试
# 查看日志中的 MaxListenersExceededWarning

# 5. 使用 heapdump 生成快照
npm install heapdump
# 在代码中添加：
// const heapdump = require('heapdump');
// heapdump.writeSnapshot('/tmp/' + Date.now() + '.heapsnapshot');
```

#### 修复建议

1. **检查常见泄漏点**
   - 未关闭的数据库连接
   - 未清理的定时器/interval
   - 全局变量滥用
   - 事件监听器未移除

2. **临时解决方案**

```bash
# 使用 PM2 自动重启（内存超限）
pm2 start dist/index.js --max-memory-restart 2G
```

### 5. Redis 连接问题

#### 症状

- 日志显示 "Redis connection error"
- 会话数据丢失

#### 排查步骤

```bash
# 1. 检查 Redis 服务
sudo systemctl status redis
redis-cli ping

# 2. 检查连接数
redis-cli info clients

# 3. 检查内存使用
redis-cli info memory

# 4. 检查持久化状态
redis-cli info persistence

# 5. 测试连接
redis-cli
> AUTH password
> SELECT 0
> GET test_key
```

#### 常见问题及解决

| 问题       | 解决方法                    |
| ---------- | --------------------------- |
| 连接数耗尽 | 增加 maxclients 配置        |
| 内存不足   | 增加 maxmemory 或清理过期键 |
| 持久化失败 | 检查磁盘空间和权限          |
| 网络超时   | 检查网络配置，增加 timeout  |

---

## 性能优化建议

### 数据库优化

#### 1. 索引优化

```sql
-- 分析查询计划
EXPLAIN ANALYZE
SELECT * FROM answer_records
WHERE user_id = 'xxx'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC
LIMIT 20;

-- 创建复合索引
CREATE INDEX CONCURRENTLY idx_answer_records_user_time
ON answer_records(user_id, timestamp DESC);

-- 创建部分索引（条件索引）
CREATE INDEX CONCURRENTLY idx_word_states_due_review
ON word_learning_states(user_id, next_review_date)
WHERE next_review_date IS NOT NULL AND state != 'MASTERED';

-- 检查未使用的索引
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE 'pg_%'
ORDER BY tablename, indexname;

-- 删除未使用的索引
DROP INDEX CONCURRENTLY idx_unused;
```

#### 2. 查询优化

```sql
-- 批量操作代替循环
-- 不推荐:
-- INSERT INTO table VALUES (1), (2), (3), ...

-- 推荐:
INSERT INTO table (id, name)
VALUES (1, 'a'), (2, 'b'), (3, 'c')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 使用 CTE 优化复杂查询
WITH recent_records AS (
  SELECT user_id, word_id, is_correct
  FROM answer_records
  WHERE timestamp > NOW() - INTERVAL '7 days'
)
SELECT
  user_id,
  COUNT(*) as total,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
FROM recent_records
GROUP BY user_id;

-- 避免 SELECT *，只查询需要的列
SELECT id, user_id, word_id, is_correct
FROM answer_records
WHERE user_id = 'xxx'
LIMIT 20;
```

#### 3. 连接池优化

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // 调整连接池大小
  connection_limit = 20
  // 连接超时
  connect_timeout = 10
  // 池超时
  pool_timeout = 10
}
```

#### 4. 定期维护

```bash
#!/bin/bash
# /opt/danci/scripts/db-maintenance.sh

# 每周执行一次数据库维护

# 1. VACUUM ANALYZE（清理死元组，更新统计）
psql -U danci -d vocabulary_db -c "VACUUM ANALYZE;"

# 2. 重建索引（如有必要）
psql -U danci -d vocabulary_db -c "REINDEX DATABASE vocabulary_db;"

# 3. 检查表膨胀
psql -U danci -d vocabulary_db << 'EOF'
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS external_size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
EOF

# 4. 检查慢查询
psql -U danci -d vocabulary_db << 'EOF'
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF
```

添加到 crontab：

```bash
# 每周日凌晨 3 点执行
0 3 * * 0 /opt/danci/scripts/db-maintenance.sh >> /var/log/danci/db-maintenance.log 2>&1
```

### 应用层优化

#### 1. 启用缓存

```typescript
// 示例：缓存用户配置
import Redis from 'ioredis';

const redis = new Redis();

async function getUserConfig(userId: string) {
  const cacheKey = `user:config:${userId}`;

  // 尝试从缓存获取
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 从数据库查询
  const config = await prisma.userStudyConfig.findUnique({
    where: { userId },
  });

  // 写入缓存（TTL 1 小时）
  await redis.setex(cacheKey, 3600, JSON.stringify(config));

  return config;
}
```

#### 2. 使用集群模式

```bash
# 使用 PM2 集群模式
pm2 start dist/index.js -i max --name danci-backend

# 查看集群状态
pm2 list
pm2 monit

# 重启集群（零停机）
pm2 reload danci-backend
```

#### 3. 优化日志输出

```javascript
// src/logger/index.ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // 生产环境不输出美化日志，提高性能
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});
```

#### 4. 请求压缩

```bash
# 在 Nginx 中启用 Gzip
cat >> /etc/nginx/conf.d/danci.conf << 'EOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript
           application/json application/javascript application/xml+rss
           application/rss+xml font/truetype font/opentype
           application/vnd.ms-fontobject image/svg+xml;
EOF

sudo nginx -t
sudo systemctl reload nginx
```

---

## 数据库维护

### 日常维护任务

#### 1. 备份检查

```bash
# 检查备份文件
ls -lh /backup/database/ | tail -10

# 验证最新备份
pg_restore --list /backup/database/vocab_backup_latest.dump | head -20
```

#### 2. 连接监控

```sql
-- 当前连接数
SELECT count(*) FROM pg_stat_activity;

-- 按状态分组
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;

-- 查看空闲连接
SELECT pid, usename, datname, state, query_start
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < NOW() - INTERVAL '1 hour';
```

#### 3. 表膨胀检查

```sql
-- 检查表大小
SELECT
  schemaname AS schema,
  tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 检查死元组
SELECT
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_ratio DESC;
```

#### 4. 性能统计重置（月初执行）

```sql
-- 重置 pg_stat_statements（清除历史统计）
SELECT pg_stat_statements_reset();

-- 重置表统计
SELECT pg_stat_reset();
```

### 定期维护计划

| 任务       | 频率 | 时间          | 命令                         |
| ---------- | ---- | ------------- | ---------------------------- |
| VACUUM     | 每周 | 周日 03:00    | `VACUUM ANALYZE;`            |
| 备份验证   | 每周 | 周一 09:00    | 手动验证                     |
| 慢查询分析 | 每周 | 周五 10:00    | 查询 pg_stat_statements      |
| 索引维护   | 每月 | 每月1日 04:00 | `REINDEX DATABASE`           |
| 统计重置   | 每月 | 每月1日 05:00 | `pg_stat_statements_reset()` |

---

## 备份和恢复

### 备份策略

#### 1. 全量备份（每日）

```bash
#!/bin/bash
# /opt/danci/scripts/backup-full.sh

BACKUP_DIR="/backup/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vocab_full_$TIMESTAMP.dump"

# 创建备份
pg_dump -U danci -h localhost -d vocabulary_db \
  -F c -b -v -f "$BACKUP_FILE"

# 验证备份
if [ $? -eq 0 ]; then
  echo "Backup successful: $BACKUP_FILE"

  # 更新最新备份链接
  ln -sf "$BACKUP_FILE" "$BACKUP_DIR/vocab_backup_latest.dump"

  # 删除 7 天前的备份
  find "$BACKUP_DIR" -name "vocab_full_*.dump" -mtime +7 -delete
else
  echo "Backup failed!" >&2
  exit 1
fi
```

添加到 crontab：

```bash
# 每天凌晨 2 点执行全量备份
0 2 * * * /opt/danci/scripts/backup-full.sh >> /var/log/danci/backup.log 2>&1
```

#### 2. 增量备份（WAL 归档）

```bash
# 配置 PostgreSQL 进行 WAL 归档
# 编辑 postgresql.conf

# 启用 WAL 归档
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
archive_timeout = 3600  # 每小时归档一次

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

#### 3. 备份到远程存储（推荐）

```bash
#!/bin/bash
# /opt/danci/scripts/backup-remote.sh

BACKUP_FILE="/backup/database/vocab_backup_latest.dump"
S3_BUCKET="s3://your-bucket/backups/danci"

# 上传到 AWS S3（或其他对象存储）
aws s3 cp "$BACKUP_FILE" "$S3_BUCKET/vocab_backup_$(date +%Y%m%d).dump"

# 删除 30 天前的远程备份
aws s3 ls "$S3_BUCKET/" | \
  while read -r line; do
    file=$(echo "$line" | awk '{print $4}')
    filedate=$(echo "$file" | grep -oP '\d{8}' | head -1)
    if [ -n "$filedate" ]; then
      if [ $(date -d "$filedate" +%s) -lt $(date -d "30 days ago" +%s) ]; then
        aws s3 rm "$S3_BUCKET/$file"
      fi
    fi
  done
```

### 恢复流程

#### 1. 完全恢复（从全量备份）

```bash
# 1. 停止应用服务
sudo systemctl stop danci-backend

# 2. 创建恢复前备份（以防万一）
pg_dump -U danci -h localhost -d vocabulary_db \
  -F c -b -v -f /backup/database/pre_restore_$(date +%Y%m%d_%H%M%S).dump

# 3. 删除现有数据库（谨慎操作）
psql -U postgres -c "DROP DATABASE IF EXISTS vocabulary_db;"

# 4. 重新创建数据库
psql -U postgres -c "CREATE DATABASE vocabulary_db OWNER danci;"
psql -U postgres -d vocabulary_db -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# 5. 恢复备份
pg_restore -U danci -h localhost -d vocabulary_db \
  --clean --if-exists --verbose /backup/database/vocab_backup_latest.dump

# 6. 验证数据
psql -U danci -d vocabulary_db -c "
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'words', COUNT(*) FROM words
UNION ALL
SELECT 'answer_records', COUNT(*) FROM answer_records;
"

# 7. 重启应用服务
sudo systemctl start danci-backend

# 8. 验证服务
curl http://localhost:3000/health
```

#### 2. 时间点恢复（PITR）

```bash
# 1. 恢复基础备份
pg_restore -U danci -d vocabulary_db /backup/database/vocab_full_20251212.dump

# 2. 创建恢复配置
cat > /var/lib/postgresql/data/recovery.conf << 'EOF'
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2025-12-12 14:30:00'
recovery_target_action = 'promote'
EOF

# 3. 重启 PostgreSQL
sudo systemctl restart postgresql

# 4. 验证恢复
psql -U danci -d vocabulary_db -c "SELECT NOW();"
```

#### 3. 部分恢复（单表）

```bash
# 恢复单个表
pg_restore -U danci -d vocabulary_db \
  --table=users \
  /backup/database/vocab_backup_latest.dump
```

### 备份验证

```bash
#!/bin/bash
# /opt/danci/scripts/verify-backup.sh

BACKUP_FILE="/backup/database/vocab_backup_latest.dump"

# 1. 检查备份文件是否存在
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found!" >&2
  exit 1
fi

# 2. 检查备份文件大小（应该 > 10MB）
FILE_SIZE=$(stat -c%s "$BACKUP_FILE")
if [ "$FILE_SIZE" -lt 10485760 ]; then
  echo "Backup file too small: $FILE_SIZE bytes" >&2
  exit 1
fi

# 3. 列出备份内容
pg_restore --list "$BACKUP_FILE" | head -20

# 4. 验证备份完整性
pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "Backup is valid"
else
  echo "Backup is corrupted!" >&2
  exit 1
fi

echo "Backup verification passed"
```

---

## 安全维护

### 1. 定期更新

```bash
# 更新系统包
sudo apt update
sudo apt upgrade -y

# 更新 Node.js 依赖
cd /opt/danci
pnpm audit
pnpm audit fix

# 检查安全漏洞
pnpm audit --audit-level=high
```

### 2. 访问控制

```bash
# 检查 PostgreSQL 访问控制
sudo cat /etc/postgresql/15/main/pg_hba.conf

# 检查防火墙规则
sudo ufw status
sudo iptables -L -n

# 限制 SSH 访问
sudo vim /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
# AllowUsers danci

sudo systemctl restart sshd
```

### 3. 日志审计

```bash
# 启用 PostgreSQL 日志审计
# 编辑 postgresql.conf
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'ddl'  # 记录所有 DDL 语句
log_connections = on
log_disconnections = on

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

### 4. 密钥轮换

```bash
# 生成新的 JWT 密钥
NEW_JWT_SECRET=$(openssl rand -base64 64)

# 更新环境变量
sudo vim /etc/systemd/system/danci-backend.service
# Environment="JWT_SECRET=<new_secret>"

# 重启服务
sudo systemctl daemon-reload
sudo systemctl restart danci-backend
```

---

## 容量规划

### 磁盘空间规划

```bash
# 查看当前磁盘使用
df -h

# 查看数据库大小
psql -U danci -d vocabulary_db -c "
SELECT pg_size_pretty(pg_database_size('vocabulary_db'));
"

# 预估增长
# - 每个用户约 50MB
# - 每天新增约 1GB（1000 活跃用户）
# - 每月新增约 30GB
```

### 内存规划

```bash
# 推荐配置（生产环境）
# - PostgreSQL: 2-4GB
# - Redis: 256MB-1GB
# - Node.js (per process): 512MB-1GB
# - 系统预留: 2GB
# 总计: 8GB+ 内存推荐
```

### 扩容策略

1. **垂直扩容**：增加单台服务器配置
2. **水平扩容**：增加服务器数量
   - 使用负载均衡（Nginx/HAProxy）
   - 数据库读写分离（主从复制）
   - Redis 集群

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: DevOps Team
