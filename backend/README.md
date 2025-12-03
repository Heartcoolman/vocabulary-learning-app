# 词汇学习应用 - 后端服务

基于Node.js + Express + TypeScript + PostgreSQL的后端API服务。

## 功能特性

### 基础功能
- ✅ 用户注册和登录
- ✅ JWT令牌认证
- ✅ 密码加密（bcrypt）
- ✅ 单词管理（CRUD）
- ✅ 词书管理（系统/用户词书）
- ✅ 学习记录追踪
- ✅ 用户统计信息
- ✅ 数据验证（Zod）
- ✅ 安全防护（Helmet, CORS, 速率限制）
- ✅ 请求日志
- ✅ 统一错误处理

### AMAS 智能学习系统
- ✅ 自适应学习算法（LinUCB + Thompson Sampling）
- ✅ 四维状态监测（注意力、疲劳度、认知能力、动机）
- ✅ 动态队列优化（四因子难度模型）
- ✅ 学习时间推荐（基于历史数据分析）
- ✅ 趋势分析报告
- ✅ 决策可解释性（学习曲线、反事实分析）
- ✅ 延迟奖励机制

### 单词掌握度评估
- ✅ ACT-R 记忆模型集成
- ✅ 掌握度评估（SRS + ACT-R + 近期表现）
- ✅ 最佳复习间隔预测
- ✅ 复习历史轨迹追踪

### 用户画像
- ✅ 习惯画像（生物钟、学习风格）
- ✅ 认知能力画像（记忆力、速度、稳定性）
- ✅ 状态历史追踪（7/30/90天）

### 监控与告警
- ✅ Prometheus 指标收集
- ✅ 告警引擎（阈值/趋势告警）
- ✅ Webhook 通知

### 实验与优化
- ✅ A/B 测试系统
- ✅ 贝叶斯超参数优化
- ✅ 因果推断评估

### 管理功能
- ✅ 用户管理（列表、统计、导出）
- ✅ 词库管理（批量导入）
- ✅ 算法配置（在线调参）
- ✅ 配置历史追踪

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

## 项目结构

```
backend/
├── prisma/
│   └── schema.prisma          # 数据库模型定义
├── src/
│   ├── amas/                  # AMAS 智能学习算法
│   │   ├── engine.ts          # 核心引擎
│   │   ├── modeling/          # 状态建模（注意力、疲劳、动机、认知）
│   │   ├── learning/          # 学习算法（LinUCB、Thompson Sampling）
│   │   ├── decision/          # 决策引擎（策略映射、安全约束）
│   │   ├── evaluation/        # 评估与优化（掌握度、延迟奖励）
│   │   └── services/          # 决策记录、AMAS服务
│   ├── config/
│   │   ├── database.ts        # 数据库连接
│   │   ├── env.ts             # 环境变量配置
│   │   └── amas-feature-flags.ts # AMAS特性开关
│   ├── middleware/
│   │   ├── auth.middleware.ts # 认证中间件
│   │   ├── admin.middleware.ts # 管理员中间件
│   │   ├── error.middleware.ts# 错误处理中间件
│   │   ├── metrics.middleware.ts # 监控指标中间件
│   │   └── logger.middleware.ts# 日志中间件
│   ├── monitoring/            # 监控与告警
│   │   ├── amas-metrics.ts    # Prometheus指标收集
│   │   ├── alert-engine.ts    # 告警引擎
│   │   └── monitoring-service.ts # 监控服务
│   ├── routes/
│   │   ├── auth.routes.ts     # 认证路由
│   │   ├── user.routes.ts     # 用户路由
│   │   ├── word.routes.ts     # 单词路由
│   │   ├── record.routes.ts   # 学习记录路由
│   │   ├── amas.routes.ts     # AMAS核心路由
│   │   ├── learning.routes.ts # 学习队列路由
│   │   ├── word-mastery.routes.ts # 单词掌握度路由
│   │   ├── habit-profile.routes.ts # 习惯画像路由
│   │   ├── alerts.routes.ts   # 告警路由
│   │   ├── about.routes.ts    # 统计展示路由
│   │   ├── experiments.routes.ts # A/B测试路由
│   │   └── optimization.routes.ts # 优化路由
│   ├── services/
│   │   ├── auth.service.ts    # 认证服务
│   │   ├── user.service.ts    # 用户服务
│   │   ├── word.service.ts    # 单词服务
│   │   ├── record.service.ts  # 学习记录服务
│   │   ├── amas.service.ts    # AMAS服务
│   │   ├── mastery-learning.service.ts # 掌握模式学习服务
│   │   ├── word-mastery.service.ts # 单词掌握度服务
│   │   ├── habit-profile.service.ts # 习惯画像服务
│   │   ├── about.service.ts   # 统计展示服务
│   │   ├── optimization.service.ts # 贝叶斯优化服务
│   │   └── explainability.service.ts # 可解释性服务
│   ├── types/
│   │   └── index.ts           # TypeScript类型定义
│   ├── validators/
│   │   ├── auth.validator.ts  # 认证验证
│   │   ├── word.validator.ts  # 单词验证
│   │   └── record.validator.ts# 记录验证
│   ├── app.ts                 # Express应用配置
│   └── index.ts               # 服务器入口
├── tests/                     # 测试文件
│   ├── unit/                  # 单元测试
│   ├── integration/           # 集成测试
│   └── load/                  # 负载测试
├── .env.example               # 环境变量示例
├── .gitignore
├── package.json
├── tsconfig.json
├── API.md                     # API文档
└── README.md
```

## API文档

详细的API文档请查看 [API.md](./API.md)。

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
