# 后端测试文档

## 测试框架

- **Vitest**: 现代化的测试框架，原生支持TypeScript
- **Supertest**: HTTP集成测试工具
- **vitest-mock-extended**: Prisma客户端mock工具
- **@faker-js/faker**: 测试数据生成工具

## 目录结构

```
tests/
├── unit/                    # 单元测试
│   └── services/           # 服务层单元测试
│       └── auth.service.spec.ts
├── integration/            # 集成测试
│   └── routes/            # 路由集成测试
│       └── auth.routes.spec.ts
├── helpers/               # 测试工具函数
│   ├── factories.ts      # 测试数据工厂
│   └── db.helper.ts      # 数据库辅助函数
└── setup.ts              # 测试初始化配置
```

## 运行测试

### 前置条件

1. 确保已安装依赖：`npm install`
2. 配置测试数据库：
   - 复制 `.env.test` 并修改数据库连接
   - 创建测试数据库：`CREATE DATABASE vocabulary_db_test;`
   - 运行迁移：`DATABASE_URL="..." npx prisma migrate deploy`

### 测试命令

```bash
# 运行所有测试
npm test

# 只运行单元测试
npm run test:unit

# 只运行集成测试
npm run test:integration

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试策略

### 单元测试

- **目标**: 测试服务层的业务逻辑
- **特点**:
  - 使用mock隔离外部依赖（Prisma、bcrypt、jwt等）
  - 快速执行，无需真实数据库
  - 专注于业务逻辑和边界条件
- **覆盖场景**:
  - 正常流程
  - 错误处理
  - 边界条件
  - 异常情况

### 集成测试

- **目标**: 测试完整的HTTP请求/响应流程
- **特点**:
  - 使用真实的Prisma客户端连接测试数据库
  - 测试路由、中间件、服务层的完整集成
  - 每个测试前清理数据库，确保测试独立性
- **覆盖场景**:
  - API端点的完整流程
  - 请求参数验证
  - 认证和授权
  - 数据库状态变化

## 已完成的测试

### Auth模块

#### 单元测试 (auth.service.spec.ts)
- ✅ register: 成功注册、邮箱已存在
- ✅ login: 成功登录、用户不存在、密码错误
- ✅ logout: 删除会话
- ✅ verifyToken: 有效token、无效token、会话不存在、会话过期、用户不存在
- ✅ generateToken: 生成JWT token

#### 集成测试 (auth.routes.spec.ts)
- ✅ POST /api/auth/register: 成功注册(201)、邮箱已存在(400)、参数验证失败(400)
- ✅ POST /api/auth/login: 成功登录(200)、用户不存在(400)、密码错误(400)、参数验证失败(400)
- ✅ POST /api/auth/logout: 成功退出(200)、未认证(401)

## 后续扩展计划

### 优先级1: 核心业务闭环
- Word/WordBook模块测试
- Record模块测试
- WordState/WordScore模块测试
- 完整学习流程集成测试

### 优先级2: 权限和配置
- Admin模块测试
- AlgorithmConfig模块测试
- StudyConfig模块测试

### 优先级3: 其他功能
- User模块测试
- Cache服务测试
- 中间件测试（限流、错误处理等）

## 最佳实践

1. **测试独立性**: 每个测试应该独立运行，不依赖其他测试的状态
2. **数据清理**: 集成测试前后清理数据库，避免数据污染
3. **描述清晰**: 测试描述应该清楚说明测试的场景和预期结果
4. **最小化mock**: 单元测试只mock必要的依赖，保持测试真实性
5. **覆盖边界**: 不仅测试正常流程，还要测试边界条件和错误情况

## 注意事项

1. **测试数据库**:
   - 使用独立的测试数据库，不要使用开发或生产数据库
   - 建议使用本地数据库或Docker容器
   - 不要在 `.env.test` 中提交真实的数据库凭据

2. **并发执行**:
   - 单元测试可以并发执行
   - 集成测试使用串行模式（`--pool forks --poolOptions.forks.singleFork`）避免数据库竞态

3. **资源清理**:
   - 测试结束后确保断开所有数据库连接
   - 避免资源泄漏导致测试挂起

## 故障排查

### 测试挂起不退出
- 检查是否有未断开的数据库连接
- 确保 `afterAll` 中调用了 `prisma.$disconnect()`

### 测试数据污染
- 确保每个测试前调用 `cleanDatabase()`
- 使用唯一的测试数据（如时间戳）避免冲突

### 集成测试失败
- 检查测试数据库是否正确配置
- 确保数据库迁移已执行
- 查看测试日志中的详细错误信息
