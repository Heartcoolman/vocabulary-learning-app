# 监控配置说明

本目录包含了单词学习平台监控系统的完整配置文件。

## 文件列表

### 1. `prometheus.yml`

Prometheus 主配置文件，定义了指标抓取规则和数据源。

**主要配置项**:

- 应用服务指标抓取（`danci-backend`）
- 系统指标抓取（Node Exporter）
- 数据库指标抓取（Postgres Exporter）
- 缓存指标抓取（Redis Exporter）

**使用方法**:

```bash
# 1. 安装 Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvf prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# 2. 复制配置文件
cp /path/to/danci/packages/backend/docs/monitoring/prometheus.yml ./prometheus.yml

# 3. 启动 Prometheus
./prometheus --config.file=prometheus.yml

# 4. 访问 Prometheus UI
# http://localhost:9090
```

### 2. `alert-rules.yml`

Prometheus 告警规则配置，定义了各类监控告警。

**告警类别**:

- **应用层告警**: 错误率、响应时间、服务可用性
- **系统资源告警**: CPU、内存、磁盘使用率
- **数据库告警**: 连接数、慢查询、复制延迟
- **Redis 告警**: 内存使用、连接数、持久化状态
- **业务指标告警**: 登录失败率、会话异常终止
- **安全告警**: DDoS 攻击、暴力破解

**使用方法**:

```bash
# 1. 在 prometheus.yml 中引用规则文件
rule_files:
  - 'alert-rules.yml'

# 2. 验证规则语法
promtool check rules alert-rules.yml

# 3. 重新加载配置（不重启 Prometheus）
curl -X POST http://localhost:9090/-/reload
```

### 3. `grafana-dashboard.json`

Grafana 仪表板配置，提供可视化监控界面。

**仪表板面板**:

- **服务概览**: 服务状态、响应时间、错误率、QPS
- **API 性能**: 响应时间分布、请求速率（按状态码）
- **系统资源**: CPU、内存、磁盘使用率
- **数据库监控**: 连接数、查询时间

**使用方法**:

```bash
# 1. 安装 Grafana
sudo apt-get install -y grafana

# 2. 启动 Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# 3. 访问 Grafana
# http://localhost:3000
# 默认账号: admin / admin

# 4. 添加 Prometheus 数据源
# Configuration -> Data Sources -> Add data source -> Prometheus
# URL: http://localhost:9090

# 5. 导入仪表板
# Dashboards -> Import -> Upload JSON file
# 选择 grafana-dashboard.json
```

## 快速开始

### 完整监控栈部署

使用 Docker Compose 快速部署完整监控栈：

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  # Prometheus
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alert-rules.yml:/etc/prometheus/alerts/alert-rules.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - '9090:9090'
    networks:
      - monitoring

  # Grafana
  grafana:
    image: grafana/grafana:9.5.0
    container_name: grafana
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - '3001:3000'
    networks:
      - monitoring
    depends_on:
      - prometheus

  # Alertmanager
  alertmanager:
    image: prom/alertmanager:v0.26.0
    container_name: alertmanager
    volumes:
      - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    ports:
      - '9093:9093'
    networks:
      - monitoring

  # Node Exporter
  node-exporter:
    image: prom/node-exporter:v1.6.0
    container_name: node-exporter
    command:
      - '--path.rootfs=/host'
    volumes:
      - /:/host:ro,rslave
    ports:
      - '9100:9100'
    networks:
      - monitoring

  # Postgres Exporter
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.13.0
    container_name: postgres-exporter
    environment:
      DATA_SOURCE_NAME: 'postgresql://danci:password@postgres:5432/vocabulary_db?sslmode=disable'
    ports:
      - '9187:9187'
    networks:
      - monitoring
      - danci-network

  # Redis Exporter
  redis-exporter:
    image: oliver006/redis_exporter:v1.51.0
    container_name: redis-exporter
    environment:
      REDIS_ADDR: 'redis:6379'
    ports:
      - '9121:9121'
    networks:
      - monitoring
      - danci-network

volumes:
  prometheus_data:
  grafana_data:

networks:
  monitoring:
    name: monitoring
  danci-network:
    external: true
    name: danci-network
```

启动监控栈：

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

## 访问地址

部署成功后，可以通过以下地址访问各个服务：

| 服务         | 地址                  | 默认账号      |
| ------------ | --------------------- | ------------- |
| Prometheus   | http://localhost:9090 | 无需认证      |
| Grafana      | http://localhost:3001 | admin / admin |
| Alertmanager | http://localhost:9093 | 无需认证      |

## 监控指标说明

### 应用指标

后端服务需要暴露 `/metrics` 端点，返回 Prometheus 格式的指标。

**关键指标**:

- `http_requests_total`: HTTP 请求总数（按状态码分类）
- `http_request_duration_seconds`: HTTP 请求耗时（直方图）
- `http_requests_in_flight`: 当前正在处理的请求数
- `auth_login_total`: 登录请求总数（按成功/失败分类）
- `learning_session_total`: 学习会话总数（按状态分类）
- `word_query_total`: 单词查询总数（按状态分类）

### 系统指标

由 Node Exporter 提供的系统级指标。

**关键指标**:

- `node_cpu_seconds_total`: CPU 时间（按模式分类）
- `node_memory_MemAvailable_bytes`: 可用内存
- `node_memory_MemTotal_bytes`: 总内存
- `node_filesystem_avail_bytes`: 可用磁盘空间
- `node_filesystem_size_bytes`: 总磁盘空间
- `node_disk_io_time_seconds_total`: 磁盘 I/O 时间

### 数据库指标

由 Postgres Exporter 提供。

**关键指标**:

- `pg_up`: PostgreSQL 服务状态（1=运行，0=停止）
- `pg_stat_activity_count`: 当前连接数（按状态分类）
- `pg_settings_max_connections`: 最大连接数配置
- `pg_stat_statements_mean_time_seconds`: 平均查询时间
- `pg_replication_lag`: 复制延迟（秒）
- `pg_stat_user_tables_n_dead_tup`: 死元组数量

### Redis 指标

由 Redis Exporter 提供。

**关键指标**:

- `redis_up`: Redis 服务状态
- `redis_memory_used_bytes`: 已使用内存
- `redis_memory_max_bytes`: 最大内存限制
- `redis_connected_clients`: 当前连接数
- `redis_evicted_keys_total`: 被淘汰的键总数
- `redis_rdb_last_save_timestamp_seconds`: 最后一次 RDB 保存时间

## 告警配置

### 告警级别

| 级别     | 说明                     | 响应时间     |
| -------- | ------------------------ | ------------ |
| critical | 严重问题，影响服务可用性 | 5 分钟内     |
| warning  | 潜在问题，需要关注       | 1 小时内     |
| info     | 信息通知                 | 工作时间处理 |

### 告警通知

配置 Alertmanager 发送告警通知：

```yaml
# alertmanager.yml
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

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://your-webhook-endpoint'

  - name: 'critical'
    email_configs:
      - to: 'ops@example.com'
        from: 'alert@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alert@example.com'
        auth_password: 'password'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        channel: '#alerts'
        title: 'Critical Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

## 故障排查

### Prometheus 无法抓取指标

**问题**: Prometheus UI 显示目标状态为 DOWN

**排查步骤**:

```bash
# 1. 检查目标服务是否可访问
curl http://localhost:3000/metrics

# 2. 检查防火墙规则
sudo ufw status

# 3. 检查 Prometheus 日志
docker logs prometheus
```

### Grafana 无法连接 Prometheus

**问题**: Grafana 仪表板无数据

**排查步骤**:

```bash
# 1. 测试数据源连接
# Grafana UI -> Configuration -> Data Sources -> Test

# 2. 检查 Prometheus URL 是否正确
# 容器内部: http://prometheus:9090
# 宿主机: http://localhost:9090

# 3. 查看 Grafana 日志
docker logs grafana
```

### 告警未触发

**问题**: 满足告警条件但未收到通知

**排查步骤**:

```bash
# 1. 检查告警规则
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.type=="alerting")'

# 2. 查看告警状态
# Prometheus UI -> Alerts

# 3. 检查 Alertmanager 配置
curl http://localhost:9093/api/v2/status | jq '.'

# 4. 测试告警发送
amtool alert add alertname=Test severity=critical
```

## 性能调优

### Prometheus 存储优化

```yaml
# prometheus.yml
global:
  scrape_interval: 15s       # 抓取间隔（降低可减少存储）
  evaluation_interval: 15s   # 评估间隔

# 命令行参数
--storage.tsdb.retention.time=30d  # 保留 30 天数据
--storage.tsdb.retention.size=50GB # 最大存储 50GB
```

### Grafana 查询优化

- 使用时间范围限制（不要查询过长时间）
- 使用合适的时间粒度（不要过细）
- 避免复杂的查询表达式
- 使用变量和模板

## 扩展阅读

- [Prometheus 官方文档](https://prometheus.io/docs/)
- [Grafana 官方文档](https://grafana.com/docs/)
- [Node Exporter 指标说明](https://github.com/prometheus/node_exporter)
- [Postgres Exporter 使用指南](https://github.com/prometheus-community/postgres_exporter)
- [Redis Exporter 配置](https://github.com/oliver006/redis_exporter)

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: DevOps Team
