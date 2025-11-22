# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## 项目概述

这是一个全栈英语单词学习应用，支持用户注册登录、词书管理、学习计划配置和多设备云端同步。基于 React + TypeScript + Vite (前端) 和 Express + Prisma + PostgreSQL (后端)。

## 核心架构

### 前端架构 (src/)

**认证与状态管理**
- `AuthContext.tsx`: 全局认证状态，管理用户登录/注册/登出，处理 JWT token
- `ApiClient.ts`: 统一 API 客户端，自动处理认证令牌、401 错误、响应转换
- `StorageService.ts`: 数据缓存服务，实现本地优先策略和云端同步状态管理

**数据同步机制**
- 使用内存缓存 + TTL (5分钟) 减少 API 调用
- `SyncIndicator.tsx` 实时显示同步状态（同步中/成功/失败/待同步）
- 登录后自动同步，增删改操作后刷新缓存

**学习系统**
- `LearningService.ts`: 学习会话管理，生成测试选项，追踪学习进度
- `LearningPage.tsx`: 从后端获取今日学习单词（基于用户配置），提交答题记录
- `StudySettingsPage.tsx`: 配置学习计划（选择词书、每日单词数）

**词书架构**
- 系统词书 (SYSTEM): 管理员创建，所有用户可见
- 用户词书 (USER): 用户自己创建和管理
- `VocabularyPage.tsx`: 词书列表（系统/用户标签页切换）
- `WordBookDetailPage.tsx`: 词书详情，单词列表，增删单词

**路由保护**
- `ProtectedRoute.tsx`: 路由守卫，未登录自动重定向到登录页
- 管理员路由 (`/admin/*`): 需要 ADMIN 角色权限

### 后端架构 (backend/src/)

**三层架构**
1. **Routes** (`routes/`): 路由定义，参数验证，调用 service 层
2. **Services** (`services/`): 业务逻辑，数据库操作，权限检查
3. **Middleware**: 认证 (`auth.middleware.ts`)、管理员权限 (`admin.middleware.ts`)、错误处理 (`error.middleware.ts`)

**核心服务**
- `auth.service.ts`: JWT 生成/验证，密码加密 (bcrypt)，会话管理
- `wordbook.service.ts`: 词书 CRUD，权限检查（用户只能操作自己的词书）
- `study-config.service.ts`: 学习配置管理，生成今日学习单词（基于配置的词书 + 每日数量）
- `record.service.ts`: 答题记录保存，学习统计计算
- `admin.service.ts`: 用户管理、系统词书管理、统计数据

**数据库模型 (Prisma)**
- `User`: 用户表，包含 role (USER/ADMIN)
- `WordBook`: 词书表，type (SYSTEM/USER) 区分系统词书和用户词书
- `Word`: 单词表，关联 wordBookId
- `AnswerRecord`: 答题记录表
- `StudyConfig`: 学习配置表（用户选择的词书、每日单词数）
- `Session`: 会话表（JWT token 管理）

**权限设计**
- 普通用户：只能访问自己的数据和系统词书
- 管理员：可以管理所有用户、创建系统词书、查看系统统计

## 开发命令

### 前端开发

```powershell
# 启动前端开发服务器 (http://localhost:5173)
npm run dev

# 构建生产版本
npm run build

# 类型检查
tsc

# 运行测试
npm test

# 预览生产构建
npm run preview

# Lint 检查
npm run lint
```

### 后端开发

```powershell
# 启动后端开发服务器 (http://localhost:3000，热重载)
cd backend
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# Prisma 操作
npm run prisma:generate  # 生成 Prisma Client
npm run prisma:migrate   # 运行数据库迁移
npm run prisma:studio    # 打开数据库 GUI
npm run prisma:seed      # 运行种子脚本
```

### 数据库管理

```powershell
# 在 backend 目录下执行

# 创建新迁移（修改 schema.prisma 后）
npx prisma migrate dev --name <migration_name>

# 重置数据库（开发环境）
npx prisma migrate reset

# 应用迁移到生产环境
npx prisma migrate deploy

# 查看数据库数据
npx prisma studio
```

## 技术栈

### 前端
- **React 18** + **TypeScript** + **Vite**
- **React Router v6**: 前端路由
- **Tailwind CSS**: 样式框架
- **Vitest** + **React Testing Library**: 测试
- **Context API**: 状态管理（AuthContext）

### 后端
- **Node.js 20+** + **TypeScript**
- **Express 4**: Web 框架
- **Prisma 5**: ORM，类型安全的数据库访问
- **PostgreSQL 14+**: 数据库
- **jsonwebtoken**: JWT 认证
- **bcrypt**: 密码加密
- **zod**: 输入验证
- **helmet + cors + rate-limit**: 安全防护

## 环境配置

### 前端环境变量 (.env.local)

```env
VITE_API_URL=http://localhost:3000
```

### 后端环境变量 (backend/.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/vocabulary_db"
JWT_SECRET="your_secret_key_here"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
```

**生产环境必须修改**:
- `JWT_SECRET`: 使用强随机字符串
- `DATABASE_URL`: 生产数据库连接
- `CORS_ORIGIN`: 前端域名

## 开发指南

### 添加新 API 端点

1. 在 `backend/src/services/` 创建或修改 service 文件
2. 在 `backend/src/routes/` 创建或修改路由文件
3. 在 `backend/src/app.ts` 注册路由
4. 在 `src/services/ApiClient.ts` 添加前端调用方法
5. 更新 `backend/API.md` 文档

### 修改数据库模型

1. 编辑 `backend/prisma/schema.prisma`
2. 运行 `npx prisma migrate dev --name <change_description>`
3. 更新相关 service 和 route
4. 如需更新前端类型，修改 `src/types/models.ts`

### 添加新页面

1. 在 `src/pages/` 创建页面组件
2. 在 `src/App.tsx` 添加路由配置
3. 如需保护路由，用 `<ProtectedRoute>` 包裹
4. 在 `src/components/Navigation.tsx` 添加导航链接（如需要）

### 管理员功能开发

1. 后端：在 `backend/src/routes/admin.routes.ts` 添加路由
2. 后端：在 `backend/src/services/admin.service.ts` 实现业务逻辑
3. 后端：路由自动使用 `adminMiddleware` 进行权限检查
4. 前端：在 `src/pages/admin/` 创建管理页面
5. 前端：在 `src/services/ApiClient.ts` 添加 `admin*` 方法

### 认证流程

**注册/登录**:
1. 前端调用 `ApiClient.register()` 或 `ApiClient.login()`
2. 后端验证凭证，生成 JWT token 和 session 记录
3. 前端保存 token 到 `localStorage`，更新 `AuthContext`
4. `StorageService.setCurrentUser()` 初始化用户数据缓存

**受保护的请求**:
1. `ApiClient` 自动在请求头添加 `Authorization: Bearer <token>`
2. 后端 `authMiddleware` 验证 token，解析 userId
3. 如 token 过期或无效，返回 401
4. 前端收到 401 自动清除 token，重定向到登录页

### 数据同步机制

**缓存策略**:
- 内存缓存 + 5 分钟 TTL
- `getWords()`: 优先返回缓存，缓存失效时从云端刷新
- 增删改操作后调用 `refreshCacheFromCloud()` 刷新缓存

**同步状态**:
- `StorageService.getSyncStatus()`: 获取当前同步状态
- `StorageService.onSyncStatusChange()`: 订阅同步状态变化
- `SyncIndicator` 组件实时显示同步状态给用户

## 常见问题

### 后端无法连接数据库
检查 `backend/.env` 中 `DATABASE_URL` 配置，确保 PostgreSQL 服务运行中。

### 前端请求 CORS 错误
确保后端 `.env` 中 `CORS_ORIGIN` 包含前端地址（开发环境为 `http://localhost:5173`）。

### Token 过期导致频繁登出
JWT 默认 24 小时过期，可修改 `backend/.env` 中 `JWT_EXPIRES_IN`。生产环境建议实现 refresh token 机制。

### Prisma 迁移冲突
开发环境执行 `npx prisma migrate reset` 重置数据库。生产环境需手动解决迁移冲突。

### 热重载不工作
- 前端：检查 Vite 配置，确保文件在 `src/` 目录下
- 后端：确保使用 `npm run dev`（使用 `tsx watch`）

## 测试

### 前端测试

```powershell
# 运行所有测试
npm test

# 监听模式
npm test -- --watch

# 覆盖率报告
npm test -- --coverage
```

**测试覆盖**:
- 组件：`WordCard`, `TestOptions`, `ProgressBar`
- 服务：`LearningService`, `ApiClient`
- 工具函数：`validation`
- Context：`AuthContext`

### 后端测试

后端目前使用手动测试。可通过以下方式测试 API:
- 使用 Postman 或 Insomnia 导入 API 端点
- 使用 VS Code REST Client 扩展（创建 `.http` 文件）
- 查阅 `backend/API.md` 了解所有端点

## API 文档

完整 API 文档：`backend/API.md`

**主要端点**:
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/wordbooks/user` - 获取用户词书
- `GET /api/wordbooks/system` - 获取系统词书
- `GET /api/study-config` - 获取学习配置
- `PUT /api/study-config` - 更新学习配置
- `GET /api/study-config/today-words` - 获取今日学习单词
- `POST /api/records` - 保存答题记录
- `GET /api/admin/users` - 管理员：获取用户列表
- `POST /api/admin/wordbooks` - 管理员：创建系统词书

## 部署

### 生产环境部署

详细部署指南：`backend/DEPLOYMENT.md`

**快速步骤**:
1. 配置生产环境变量
2. 构建前后端：`npm run build`
3. 运行数据库迁移：`npx prisma migrate deploy`
4. 启动后端：`npm start` 或使用 PM2
5. 部署前端静态文件到 CDN 或静态托管服务

**推荐方案**:
- 后端：使用 PM2 进程管理 + Nginx 反向代理
- 数据库：PostgreSQL（自建或云服务）
- 前端：Vercel / Netlify / Cloudflare Pages
- SSL：Let's Encrypt

## 项目规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则（`npm run lint`）
- 使用 Prettier 格式化（配置在 `.prettierrc`）
- 组件使用函数式组件 + Hooks

### 注释规范
- 所有注释使用简体中文
- 函数/组件添加 JSDoc 注释说明用途
- 复杂逻辑添加行内注释解释

### Git 提交规范
- 提交信息使用简体中文
- 格式：`类型: 描述` (例如：`修复: 解决登录状态丢失问题`)
- 类型：新增、修复、优化、重构、文档、测试、样式

### 文件命名
- 组件文件：PascalCase (例如：`WordCard.tsx`)
- 服务文件：camelCase (例如：`auth.service.ts`)
- 工具文件：camelCase (例如：`validation.ts`)
- 类型文件：camelCase (例如：`models.ts`)

## 相关文档

- `README.md` - 项目说明和快速开始
- `QUICK_START.md` - 快速启动指南
- `backend/README.md` - 后端详细说明
- `backend/SETUP.md` - 后端环境配置
- `backend/API.md` - API 接口文档
- `backend/DEPLOYMENT.md` - 部署指南
- `docs/USER_GUIDE.md` - 用户使用指南
- `docs/AUTHENTICATION.md` - 认证系统文档
- `ui-design-system.md` - UI/UX 设计规范
- `.claude/CLAUDE.md` - Claude AI 开发准则

## 架构决策记录

### 词书架构设计
- **决策**: 使用单表 `WordBook` + `type` 字段区分系统词书和用户词书
- **原因**: 简化数据模型，避免表结构重复，便于统一查询和权限控制
- **影响**: 词书权限检查需在 service 层实现，前端通过 `type` 字段区分展示

### 学习单词生成逻辑
- **决策**: 今日学习单词由后端根据 `StudyConfig` 动态生成
- **原因**: 避免前端缓存过期问题，确保所有设备看到一致的学习内容
- **影响**: 每次进入学习页面都需请求后端，但保证数据一致性

### 数据同步策略
- **决策**: 本地内存缓存 + TTL，增删改后刷新缓存
- **原因**: 减少 API 调用，提升响应速度，同时保证数据新鲜度
- **影响**: 多设备同时操作可能有短暂数据不一致，但用户体验更流畅

### 认证方式
- **决策**: JWT token + Session 表双重记录
- **原因**: JWT 无状态便于扩展，Session 表支持主动失效和管理
- **影响**: 需维护 Session 表清理逻辑，退出登录需删除 Session 记录

## 未来改进方向

- [ ] 实现 Refresh Token 机制，避免频繁登录
- [ ] 添加单词搜索和过滤功能
- [ ] 支持单词收藏和标记功能
- [ ] 实现学习报告和成就系统
- [ ] 添加社交功能（分享词书、学习排行）
- [ ] 支持批量导入单词（CSV/Excel）
- [ ] 实现更多学习模式（拼写、听力）
- [ ] 移动端 App 开发（React Native）
- [ ] 添加后端单元测试和集成测试
- [ ] 实施 CI/CD 自动化部署
