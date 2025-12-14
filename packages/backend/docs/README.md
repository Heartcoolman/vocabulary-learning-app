# 部署与运维文档总览

本目录包含了单词学习平台后端服务的完整部署和运维文档。

## 📚 文档目录

### 核心文档

1. **[部署指南](./DEPLOYMENT_GUIDE.md)** - 完整的部署流程
   - 环境要求和依赖安装
   - 数据库迁移步骤详解
   - 环境变量配置说明
   - 部署检查清单
   - 回滚流程和应急处理

2. **[运维指南](./OPERATIONS_GUIDE.md)** - 日常运维操作手册
   - 系统监控指标和告警配置
   - 日志查询和分析方法
   - 常见问题排查步骤
   - 性能优化建议
   - 数据库维护操作
   - 备份和恢复流程

3. **[迁移部署指南](./MIGRATION_DEPLOYMENT.md)** - 版本升级策略
   - 版本迁移概述和准备工作
   - 数据迁移执行流程
   - 零停机部署策略（蓝绿部署、滚动更新）
   - 分阶段上线建议
   - 灰度发布方案
   - 回滚计划和应急处理

4. **[CI/CD 流程文档](./CI_CD_GUIDE.md)** - 持续集成和部署
   - CI 流程（代码检查、测试、构建）
   - CD 流程（自动部署、验证）
   - 环境说明和配置
   - 工作流配置详解
   - 最佳实践和故障排查

### 监控配置

**[monitoring/](./monitoring/)** - 监控系统配置文件

- **[README.md](./monitoring/README.md)** - 监控配置说明
- **[prometheus.yml](./monitoring/prometheus.yml)** - Prometheus 主配置
- **[alert-rules.yml](./monitoring/alert-rules.yml)** - 告警规则配置
- **[grafana-dashboard.json](./monitoring/grafana-dashboard.json)** - Grafana 仪表板

---

## 🚀 快速开始

### 首次部署

如果你是第一次部署该系统，请按以下顺序阅读文档：

1. **阅读 [部署指南](./DEPLOYMENT_GUIDE.md)**
   - 检查环境要求
   - 安装所有依赖
   - 配置环境变量
   - 执行数据库迁移
   - 完成部署检查清单

2. **配置监控系统**
   - 阅读 [monitoring/README.md](./monitoring/README.md)
   - 部署 Prometheus 和 Grafana
   - 配置告警规则
   - 导入 Grafana 仪表板

3. **设置 CI/CD**
   - 阅读 [CI/CD 流程文档](./CI_CD_GUIDE.md)
   - 配置 GitHub Secrets
   - 验证工作流运行

### 版本升级

如果需要升级到新版本，请参考：

1. **[迁移部署指南](./MIGRATION_DEPLOYMENT.md)**
   - 选择合适的部署策略
   - 执行数据迁移
   - 分阶段上线
   - 监控和验证

### 日常运维

日常运维工作请参考：

1. **[运维指南](./OPERATIONS_GUIDE.md)**
   - 监控系统健康状态
   - 查询和分析日志
   - 执行定期维护任务
   - 处理常见问题

---

## 📋 部署检查清单

使用以下检查清单确保部署完整性：

### 部署前

- [ ] 硬件资源满足要求（CPU、内存、磁盘）
- [ ] 所有依赖已安装（Node.js、pnpm、PostgreSQL、Redis）
- [ ] 环境变量已正确配置
- [ ] 数据库已备份
- [ ] SSL 证书有效
- [ ] 防火墙规则已配置

### 部署中

- [ ] 代码已拉取到最新版本
- [ ] 依赖已安装（`pnpm install --frozen-lockfile`）
- [ ] Prisma Client 已生成（`pnpm prisma:generate`）
- [ ] 项目已构建（`pnpm build`）
- [ ] 数据库迁移已执行（`pnpm prisma migrate deploy`）
- [ ] 服务已启动（systemd 或 Docker）

### 部署后

- [ ] 健康检查通过（`/health` 端点）
- [ ] 核心功能测试通过（登录、单词学习）
- [ ] 日志无严重错误
- [ ] 监控指标正常（CPU、内存、响应时间）
- [ ] 告警系统已配置
- [ ] 备份任务已设置

---

## 🔧 常用命令

### 服务管理

```bash
# 启动服务
sudo systemctl start danci-backend

# 停止服务
sudo systemctl stop danci-backend

# 重启服务
sudo systemctl restart danci-backend

# 查看服务状态
sudo systemctl status danci-backend

# 查看服务日志
sudo journalctl -u danci-backend -f
```

### Docker 管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f backend

# 重启单个服务
docker-compose restart backend
```

### 数据库操作

```bash
# 连接数据库
psql -U danci -d vocabulary_db

# 备份数据库
pg_dump -U danci -d vocabulary_db -F c -b -v -f backup.dump

# 恢复数据库
pg_restore -U danci -d vocabulary_db backup.dump

# 查看数据库大小
psql -U danci -d vocabulary_db -c "SELECT pg_size_pretty(pg_database_size('vocabulary_db'));"
```

### 日志查询

```bash
# 查看实时日志
sudo journalctl -u danci-backend -f

# 查看最近 100 行日志
sudo journalctl -u danci-backend -n 100

# 查看特定时间范围日志
sudo journalctl -u danci-backend --since "2025-12-12 10:00" --until "2025-12-12 11:00"

# 查询错误日志
sudo journalctl -u danci-backend | grep -i error | tail -20
```

---

## 📊 监控指标

### 关键性能指标（KPI）

| 指标                | 目标值  | 告警阈值 |
| ------------------- | ------- | -------- |
| 服务可用性          | 99.9%   | < 99.5%  |
| API 响应时间（P95） | < 200ms | > 500ms  |
| 错误率              | < 0.1%  | > 1%     |
| CPU 使用率          | < 70%   | > 85%    |
| 内存使用率          | < 80%   | > 90%    |
| 磁盘使用率          | < 80%   | > 90%    |
| 数据库连接数        | < 50    | > 100    |
| Redis 内存使用      | < 80%   | > 90%    |

### 业务指标

| 指标              | 说明                   | 监控方式     |
| ----------------- | ---------------------- | ------------ |
| 日活跃用户（DAU） | 每日登录用户数         | 数据库查询   |
| 学习完成率        | 完成学习任务的用户占比 | 应用日志分析 |
| 平均学习时长      | 用户平均学习时间       | 会话数据统计 |
| 单词掌握率        | 达到掌握状态的单词占比 | 学习状态统计 |

---

## 🆘 应急响应

### 紧急联系方式

| 角色       | 联系人 | 联系方式 | 职责           |
| ---------- | ------ | -------- | -------------- |
| 技术负责人 | -      | -        | 技术决策和升级 |
| 运维负责人 | -      | -        | 系统维护和监控 |
| 后端开发   | -      | -        | 代码修复和部署 |
| DBA        | -      | -        | 数据库维护     |

### 紧急情况处理流程

1. **服务完全不可用**
   - 检查服务状态：`systemctl status danci-backend`
   - 查看错误日志：`journalctl -u danci-backend -n 100`
   - 尝试重启服务：`systemctl restart danci-backend`
   - 如无法恢复，执行回滚（参考 [部署指南 - 回滚流程](./DEPLOYMENT_GUIDE.md#回滚流程)）

2. **数据库连接失败**
   - 检查 PostgreSQL 状态：`systemctl status postgresql`
   - 检查连接数：`psql -U danci -c "SELECT count(*) FROM pg_stat_activity;"`
   - 重启 PostgreSQL：`systemctl restart postgresql`

3. **Redis 连接失败**
   - 检查 Redis 状态：`systemctl status redis`
   - 测试连接：`redis-cli ping`
   - 重启 Redis：`systemctl restart redis`

4. **性能严重下降**
   - 检查系统资源：`top` 或 `htop`
   - 检查数据库慢查询
   - 检查日志错误
   - 考虑临时扩容或限流

---

## 📝 维护计划

### 日常维护（每日）

- [ ] 检查服务健康状态
- [ ] 查看监控告警
- [ ] 检查磁盘空间
- [ ] 查看错误日志

### 周维护（每周）

- [ ] 数据库 VACUUM（周日凌晨 3:00）
- [ ] 备份验证（周一上午 9:00）
- [ ] 慢查询分析（周五上午 10:00）
- [ ] 安全更新检查

### 月维护（每月）

- [ ] 数据库索引重建（每月 1 日凌晨 4:00）
- [ ] 统计信息重置（每月 1 日凌晨 5:00）
- [ ] 日志归档清理
- [ ] 容量规划评估
- [ ] 性能报告生成

---

## 🔗 相关资源

### 内部文档

- [API 文档](../README.md) - 后端 API 接口文档
- [AMAS 算法文档](../docs/amas-contracts.md) - AMAS 系统设计
- [学习指标文档](../docs/learning-metrics-usage.md) - 学习指标使用说明

### 外部资源

- [Node.js 官方文档](https://nodejs.org/docs/)
- [Prisma 文档](https://www.prisma.io/docs/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [Redis 文档](https://redis.io/documentation)
- [Docker 文档](https://docs.docker.com/)
- [Prometheus 文档](https://prometheus.io/docs/)
- [Grafana 文档](https://grafana.com/docs/)

### 社区支持

- [GitHub Issues](https://github.com/yourusername/danci/issues)
- [技术论坛](https://forum.example.com)
- [Slack 频道](https://slack.example.com)

---

## 📖 文档贡献

如果发现文档有误或需要补充，请：

1. 在 GitHub 上创建 Issue
2. 提交 Pull Request（修改 `packages/backend/docs/` 目录下的文档）
3. 联系文档维护者

### 文档更新规范

- 保持文档清晰简洁
- 提供实际可用的命令示例
- 包含故障处理步骤
- 添加检查点和验证步骤
- 更新文档版本和日期

---

## 📄 许可证

本文档遵循项目主许可证。

---

**文档版本**: 1.0.0
**最后更新**: 2025-12-12
**维护者**: DevOps Team
**联系方式**: devops@example.com
