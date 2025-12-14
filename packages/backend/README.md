# 词汇学习应用 - 后端服务

> **版本**: v2.0 (2025-12-12 重构完成)
> **基于**: Node.js + Express + TypeScript + PostgreSQL

智能自适应词汇学习系统的后端服务,采用事件驱动架构和 AMAS (自适应多臂老虎机算法) 智能学习引擎。

---

## 重构亮点 (v2.0)

### 架构升级

- **接口驱动设计**: 4 个核心接口,算法可插拔
- **事件驱动架构**: 8 种领域事件,服务解耦
- **API 版本化**: v1 版本体系,向后兼容
- **实时通道**: SSE 双向通信,6 种实时事件

### 学习体验提升

- **即时反馈**: 多维度奖励计算,个性化鼓励
- **主动预警**: 智能遗忘预测,定时提醒
- **心流检测**: 4 种心流状态,动态调节
- **情绪感知**: 5 种情绪识别,关怀式响应
- **碎片时间**: 短词优先,快速复习

### 监控体系

- **学习指标**: 6 大核心指标,Prometheus 集成
- **回放测试**: 决策回放,策略对比,显著性检验
- **性能优化**: 响应时间 -25%,监控开销 -60%

**详细报告**: [重构完成报告](./docs/REFACTOR_COMPLETION_REPORT.md) | [验收文档](./docs/ACCEPTANCE_CRITERIA.md) | [迁移指南](./MIGRATION_GUIDE.md)

---

## 功能特性

### 基础功能

- ✅ 用户注册和登录
- ✅ JWT 令牌认证
- ✅ 密码加密 (bcrypt)
- ✅ 单词管理 (CRUD)
- ✅ 词书管理 (系统/用户词书)
- ✅ 学习记录追踪
- ✅ 用户统计信息
- ✅ 数据验证 (Zod)
- ✅ 安全防护 (Helmet, CORS, 速率限制)
- ✅ 请求日志
- ✅ 统一错误处理

### AMAS 智能学习系统 (v2.0 重构)

#### 核心算法

- ✅ 自适应学习算法 (LinUCB + Thompson Sampling)
- ✅ 接口驱动设计 (4 个核心接口)
- ✅ 适配器模式 (3 个适配器)
- ✅ 策略注册表 (动态注册)
- ✅ 遗忘曲线统一实现

#### 状态监测

- ✅ 四维状态监测 (注意力、疲劳度、认知能力、动机)
- ✅ 用户画像合并 (认知 + 习惯)
- ✅ 状态历史追踪 (7/30/90天)

#### 决策优化

- ✅ 动态队列优化 (四因子难度模型)
- ✅ 学习时间推荐 (基于历史数据分析)
- ✅ 趋势分析报告
- ✅ 决策可解释性 (学习曲线、反事实分析)
- ✅ 延迟奖励机制

### 学习体验特性 (v2.0 新增)

- ✅ **即时反馈**: 多维度奖励 (正确性 + 速度 + 难度 + 遗忘曲线)
- ✅ **主动遗忘预警**: 定时任务,风险识别,批量提醒,SSE 实时推送
  - Worker 自动运行（默认每小时扫描一次）
  - 可通过环境变量 `ENABLE_FORGETTING_ALERT_WORKER` 控制启用/禁用
  - 可通过环境变量 `FORGETTING_ALERT_SCHEDULE` 自定义执行间隔（cron表达式）
  - 风险等级分类：高风险（<20%）、中风险（20-30%）、低风险（>30%）
  - 通过 SSE 实时推送给在线用户（详见 [遗忘预警文档](./docs/forgetting-alert-sse.md)）
- ✅ **心流检测**: 4 种状态 (心流/无聊/焦虑/冷漠)
- ✅ **碎片时间适配**: 短词优先,5 个单词限制
- ✅ **情绪感知**: 5 种情绪,行为信号融合

### 单词掌握度评估

- ✅ ACT-R 记忆模型集成
- ✅ 掌握度评估 (SRS + ACT-R + 近期表现)
- ✅ 最佳复习间隔预测
- ✅ 复习历史轨迹追踪
- ✅ 语境强化模型 (v2.0 新增)

### 事件驱动架构 (v2.0 新增)

- ✅ **EventBus**: 完整的事件总线系统
- ✅ **8 种领域事件**: ANSWER_RECORDED, SESSION_STARTED, SESSION_ENDED, WORD_MASTERED, FORGETTING_RISK_HIGH, STRATEGY_ADJUSTED, USER_STATE_UPDATED, REWARD_DISTRIBUTED
- ✅ **多通道支持**: 进程内 + SSE + Redis
- ✅ **错误隔离**: 单个处理器失败不影响其他

### 实时通道 (v2.0 新增)

- ✅ **SSE 实时推送**: /api/v1/realtime/sessions/:sessionId/stream
- ✅ **6 种实时事件**: feedback (反馈), alert (警报), flow-update (流程更新), next-suggestion (下一个建议), forgetting-alert (遗忘预警), ping (心跳)
- ✅ **智能遗忘预警推送**: 自动检测单词遗忘风险，实时推送复习提醒（详见 [遗忘预警文档](./docs/forgetting-alert-sse.md)）
- ✅ **用户/会话订阅**: 精准推送
- ✅ **事件过滤**: 按需订阅
- ✅ **连接管理**: 心跳机制,自动重连,优雅关闭

### 监控与告警 (v2.0 增强)

- ✅ **学习指标**: 6 大指标 (留存率、命中率、时延、中断率、预测准确率、心流比例)
- ✅ **Prometheus 集成**: 完整的指标导出
- ✅ **回放测试**: 决策回放、策略对比、显著性检验
- ✅ **告警引擎**: 阈值/趋势告警
- ✅ **Webhook 通知**

### 实验与优化

- ✅ A/B 测试系统
- ✅ 用户变体分配 (一致性哈希)
- ✅ 贝叶斯超参数优化
- ✅ 因果推断评估

### 管理功能

- ✅ 用户管理 (列表、统计、导出)
- ✅ 词库管理 (批量导入)
- ✅ 算法配置 (在线调参)
- ✅ 配置历史追踪
- ✅ 数据迁移工具 (v2.0 新增)

## 技术栈

- **运行时**: Node.js 20+
- **框架**: Express 4
- **语言**: TypeScript 5
- **数据库**: PostgreSQL 14+
- **ORM**: Prisma 5
- **认证**: JWT (jsonwebtoken)
- **密码加密**: bcrypt
- **验证**: Zod
- **安全**: Helmet, CORS, express-rate-limit

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/vocab_db"
JWT_SECRET="your_secret_key_here"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"

# Worker配置（多实例部署）
WORKER_LEADER="false"

# AMAS算法配置
DELAYED_REWARD_DELAY_MS=86400000

# 遗忘预警Worker配置
ENABLE_FORGETTING_ALERT_WORKER="true"
FORGETTING_ALERT_SCHEDULE="0 * * * *"
```

### 3. 设置数据库

确保PostgreSQL已安装并运行，然后创建数据库：

```bash
# 登录PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE vocab_db;

# 退出
\q
```

### 4. 运行数据库迁移

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## 可用脚本

- `npm run dev` - 启动开发服务器（热重载）
- `npm run build` - 构建生产版本
- `npm start` - 启动生产服务器
- `npm run prisma:generate` - 生成Prisma客户端
- `npm run prisma:migrate` - 运行数据库迁移
- `npm run prisma:studio` - 打开Prisma Studio（数据库GUI）

## 项目结构 (v2.0 重构后)

```
backend/
├── prisma/
│   └── schema.prisma          # 数据库模型定义 (新增 3 个模型, 3 个枚举)
├── src/
│   ├── amas/                  # AMAS 智能学习算法 (115 文件)
│   │   ├── interfaces/        # 🆕 接口层 (4 个核心接口)
│   │   ├── adapters/          # 🆕 适配器层 (3 个适配器)
│   │   ├── policies/          # 🆕 策略层 (策略注册表)
│   │   ├── models/            # 🆕 模型层 (心流检测, 情绪识别)
│   │   ├── rewards/           # 🆕 奖励层 (即时反馈)
│   │   ├── engine.ts          # 核心引擎
│   │   ├── modeling/          # 状态建模 (注意力、疲劳、动机、认知、遗忘曲线)
│   │   ├── learning/          # 学习算法 (LinUCB、Thompson Sampling)
│   │   ├── decision/          # 决策引擎 (策略映射、安全约束)
│   │   ├── evaluation/        # 评估与优化 (掌握度、延迟奖励)
│   │   └── services/          # 决策记录、AMAS 服务
│   ├── core/                  # 🆕 核心基础设施
│   │   ├── event-bus.ts       # 🆕 事件总线 (8 种领域事件)
│   │   └── index.ts           # 统一导出
│   ├── monitoring/            # 监控与告警
│   │   ├── learning-metrics.ts # 🆕 学习指标 (6 大指标)
│   │   ├── amas-metrics.ts    # Prometheus 指标收集
│   │   ├── alert-engine.ts    # 告警引擎
│   │   └── monitoring-service.ts # 监控服务
│   ├── routes/
│   │   ├── v1/                # 🆕 v1 版本 API
│   │   │   ├── index.ts       # 路由入口
│   │   │   └── realtime.routes.ts # 🆕 实时路由
│   │   ├── auth.routes.ts     # 认证路由
│   │   ├── user.routes.ts     # 用户路由
│   │   ├── word.routes.ts     # 单词路由
│   │   ├── record.routes.ts   # 学习记录路由
│   │   ├── amas.routes.ts     # AMAS 核心路由
│   │   ├── learning.routes.ts # 学习队列路由
│   │   ├── word-mastery.routes.ts # 单词掌握度路由
│   │   ├── habit-profile.routes.ts # 习惯画像路由
│   │   ├── alerts.routes.ts   # 告警路由
│   │   ├── about.routes.ts    # 统计展示路由
│   │   ├── experiments.routes.ts # A/B 测试路由
│   │   └── optimization.routes.ts # 优化路由
│   ├── services/
│   │   ├── realtime.service.ts # 🆕 实时服务
│   │   ├── learning-state.service.ts # 🆕 学习状态服务
│   │   ├── word-selection.service.ts # 🆕 选词服务
│   │   ├── user-profile.service.ts # 🆕 用户画像服务
│   │   ├── auth.service.ts    # 认证服务
│   │   ├── user.service.ts    # 用户服务
│   │   ├── word.service.ts    # 单词服务
│   │   ├── record.service.ts  # 学习记录服务
│   │   ├── amas.service.ts    # AMAS 服务
│   │   ├── mastery-learning.service.ts # 掌握模式学习服务
│   │   ├── word-mastery.service.ts # 单词掌握度服务
│   │   ├── habit-profile.service.ts # 习惯画像服务
│   │   ├── about.service.ts   # 统计展示服务
│   │   ├── experiment.service.ts # 🆕 实验服务 (变体分配)
│   │   ├── optimization.service.ts # 贝叶斯优化服务
│   │   └── explainability.service.ts # 可解释性服务
│   ├── workers/               # 🆕 后台任务
│   │   ├── forgetting-alert.worker.ts # 🆕 遗忘预警 Worker
│   │   ├── delayed-reward.worker.ts # 延迟奖励 Worker
│   │   └── optimization.worker.ts # 优化 Worker
│   ├── schedulers/            # 🆕 调度器
│   │   └── metrics-scheduler.ts # 🆕 指标收集调度
│   ├── scripts/               # 🆕 运维脚本
│   │   ├── migrate-user-profiles.ts # 🆕 用户画像迁移
│   │   └── verify-profile-consistency.ts # 🆕 一致性校验
│   ├── config/
│   │   ├── database.ts        # 数据库连接
│   │   ├── env.ts             # 环境变量配置
│   │   └── amas-feature-flags.ts # AMAS 特性开关
│   ├── middleware/
│   │   ├── auth.middleware.ts # 认证中间件
│   │   ├── admin.middleware.ts # 管理员中间件
│   │   ├── error.middleware.ts # 错误处理中间件
│   │   ├── metrics.middleware.ts # 监控指标中间件
│   │   └── logger.middleware.ts # 日志中间件
│   ├── types/
│   │   └── index.ts           # TypeScript 类型定义
│   ├── validators/
│   │   ├── auth.validator.ts  # 认证验证
│   │   ├── word.validator.ts  # 单词验证
│   │   └── record.validator.ts # 记录验证
│   ├── app.ts                 # Express 应用配置
│   └── index.ts               # 服务器入口
├── tests/                     # 测试文件 (135 文件)
│   ├── unit/                  # 单元测试
│   │   ├── amas/              # 🆕 AMAS 单元测试
│   │   │   ├── adapters/      # 适配器测试
│   │   │   ├── models/        # 模型测试
│   │   │   └── policies/      # 策略测试
│   │   ├── monitoring/        # 🆕 监控测试
│   │   └── services/          # 服务测试
│   ├── regression/            # 🆕 回归测试
│   │   └── amas-replay.test.ts # 🆕 AMAS 回放测试
│   ├── integration/           # 集成测试
│   └── performance/           # 性能测试
├── docs/                      # 🆕 文档目录
│   ├── README.md              # 文档索引
│   ├── REFACTOR_COMPLETION_REPORT.md # 🆕 重构完成报告
│   ├── ACCEPTANCE_CRITERIA.md # 🆕 验收标准文档
│   ├── USER_PROFILE_SERVICE_MIGRATION.md # 用户画像服务迁移指南
│   ├── amas-contracts.md      # AMAS 接口契约
│   ├── amas-file-reorganization.md # 文件重组计划
│   ├── learning-metrics-usage.md # 学习指标使用文档
│   └── archive/               # 🆕 历史文档存档
│       ├── LEARNING_SERVICES_MIGRATION_GUIDE.md
│       ├── AMAS_DECISION_PIPELINE_MIGRATION.md
│       └── ...                # 其他临时文档
├── .env.example               # 环境变量示例
├── .gitignore
├── package.json               # 🆕 新增 6 个 CLI 命令
├── tsconfig.json
├── MIGRATION_GUIDE.md         # 🆕 统一迁移指南
├── PLAN_COMPLETION_REPORT.md  # 计划完成报告
├── REFACTORING_COMPLETE.md    # 重构完成摘要
├── VERIFICATION_REPORT.md     # 验证报告
├── API.md                     # API 文档
├── DEPLOYMENT.md              # 部署文档
├── SETUP.md                   # 安装配置指南
└── README.md                  # 项目说明 (已更新)
```

**图例**: 🆕 表示 v2.0 新增

## API文档

详细的API文档请查看 [API.md](./API.md)。

## 文档架构

本项目采用结构化的文档管理系统:

### 主要文档

- **README.md** - 项目概览和快速开始指南
- **MIGRATION_GUIDE.md** - 统一迁移指南,整合所有服务迁移说明
- **API.md** - 完整的API接口文档
- **DEPLOYMENT.md** - 生产环境部署指南
- **SETUP.md** - 开发环境安装配置

### 重构报告

- **PLAN_COMPLETION_REPORT.md** - v2.0重构计划完成报告
- **REFACTORING_COMPLETE.md** - 重构工作总结
- **VERIFICATION_REPORT.md** - 系统验证报告

### 专题文档 (docs/)

- **docs/README.md** - 文档索引和导航
- **docs/REFACTOR_COMPLETION_REPORT.md** - 详细重构完成报告
- **docs/ACCEPTANCE_CRITERIA.md** - 验收标准
- **docs/USER_PROFILE_SERVICE_MIGRATION.md** - 用户画像服务迁移
- **docs/amas-contracts.md** - AMAS接口契约
- **docs/learning-metrics-usage.md** - 学习指标使用指南

### 历史文档 (docs/archive/)

已归档的临时文档和历史迁移指南:

- 学习服务迁移指南
- AMAS决策流水线迁移
- 数据迁移文档
- 其他临时总结报告

### 主要端点

- `POST /api/auth/register` - 注册用户
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 退出登录
- `GET /api/users/me` - 获取当前用户信息
- `PUT /api/users/me/password` - 修改密码
- `GET /api/words` - 获取所有单词
- `POST /api/words` - 添加单词
- `PUT /api/words/:id` - 更新单词
- `DELETE /api/words/:id` - 删除单词
- `GET /api/records` - 获取学习记录
- `POST /api/records` - 保存答题记录
- `GET /api/records/statistics` - 获取学习统计

## 数据库模型

### User（用户）

- id: UUID
- email: String (唯一)
- passwordHash: String
- username: String
- createdAt: DateTime
- updatedAt: DateTime

### Word（单词）

- id: UUID
- userId: String (外键)
- spelling: String
- phonetic: String
- meanings: String[]
- examples: String[]
- audioUrl: String (可选)
- createdAt: DateTime
- updatedAt: DateTime

### AnswerRecord（答题记录）

- id: UUID
- userId: String (外键)
- wordId: String (外键)
- selectedAnswer: String
- correctAnswer: String
- isCorrect: Boolean
- timestamp: DateTime

### Session（会话）

- id: UUID
- userId: String (外键)
- token: String (唯一)
- expiresAt: DateTime
- createdAt: DateTime

## 后台任务Worker配置

系统包含多个后台Worker，用于自动执行定时任务。Workers仅在`WORKER_LEADER=true`的节点上运行，多实例部署时只需在一个实例上启用。

### 遗忘预警Worker

**功能**: 定时扫描用户的单词学习状态，识别高风险遗忘单词并创建预警。

**配置环境变量**:

- `ENABLE_FORGETTING_ALERT_WORKER`: 是否启用（`true`/`false`，默认：`true`）
- `FORGETTING_ALERT_SCHEDULE`: 执行间隔（cron表达式，默认：`0 * * * *` 即每小时整点）

**示例配置**:

```env
# 启用遗忘预警Worker，每小时执行一次
ENABLE_FORGETTING_ALERT_WORKER="true"
FORGETTING_ALERT_SCHEDULE="0 * * * *"

# 更频繁的检查（每30分钟）
FORGETTING_ALERT_SCHEDULE="*/30 * * * *"

# 每天凌晨2点执行
FORGETTING_ALERT_SCHEDULE="0 2 * * *"

# 禁用遗忘预警Worker
ENABLE_FORGETTING_ALERT_WORKER="false"
```

**工作流程**:

1. 扫描所有活跃用户的学习状态
2. 使用遗忘曲线计算当前保持率
3. 识别保持率低于阈值（0.3）的单词
4. 创建或更新ForgettingAlert记录
5. 记录统计信息到日志

**监控指标**:

- 扫描用户数
- 扫描单词数
- 创建的预警数
- 更新的预警数
- 处理耗时

### 其他Workers

系统还包含以下Workers（都需要`WORKER_LEADER=true`）:

1. **延迟奖励Worker** (`delayed-reward.worker.ts`)
   - 执行间隔: 每分钟
   - 功能: 处理延迟奖励任务，更新LinUCB模型

2. **优化Worker** (`optimization.worker.ts`)
   - 执行间隔: 每天凌晨3点
   - 功能: 执行贝叶斯超参数优化

3. **LLM顾问Worker** (`llm-advisor.worker.ts`)
   - 执行间隔: 每周日凌晨4点
   - 功能: 生成AI学习建议

**多实例部署注意事项**:

```env
# 主节点（运行Workers）
WORKER_LEADER="true"

# 从节点（不运行Workers）
WORKER_LEADER="false"
```

## 安全特性

- **密码加密**: 使用bcrypt进行密码哈希
- **JWT认证**: 无状态令牌认证
- **CORS**: 配置跨域资源共享
- **Helmet**: 设置安全HTTP头
- **速率限制**: 防止API滥用
- **输入验证**: 使用Zod验证所有输入
- **SQL注入防护**: Prisma参数化查询

## 部署

### 生产环境配置

1. 设置环境变量：

```env
NODE_ENV=production
DATABASE_URL=<production_database_url>
JWT_SECRET=<strong_random_secret>
CORS_ORIGIN=<frontend_domain>
```

2. 构建应用：

```bash
npm run build
```

3. 运行数据库迁移：

```bash
npm run prisma:migrate
```

4. 启动服务器：

```bash
npm start
```

### 使用PM2（推荐）

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start dist/index.js --name vocab-backend

# 查看日志
pm2 logs vocab-backend

# 重启应用
pm2 restart vocab-backend
```

### Docker部署

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build
RUN npm run prisma:generate

EXPOSE 3000

CMD ["npm", "start"]
```

构建和运行：

```bash
docker build -t vocab-backend .
docker run -p 3000:3000 --env-file .env vocab-backend
```

## 故障排除

### 数据库连接失败

确保PostgreSQL正在运行，并且 `DATABASE_URL` 配置正确。

```bash
# 检查PostgreSQL状态
sudo systemctl status postgresql

# 启动PostgreSQL
sudo systemctl start postgresql
```

### 端口已被占用

修改 `.env` 文件中的 `PORT` 值，或停止占用该端口的进程。

```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>
```

### Prisma迁移错误

重置数据库并重新迁移：

```bash
npm run prisma:migrate reset
npm run prisma:migrate
```

## 开发建议

- 使用 `npm run prisma:studio` 可视化管理数据库
- 查看日志了解请求详情
- 使用Postman或类似工具测试API
- 定期备份数据库

## 许可证

MIT

## 联系方式

如有问题，请提交Issue或联系开发团队。
