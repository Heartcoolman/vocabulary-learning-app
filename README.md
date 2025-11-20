# 词汇学习应用

一个全栈英语单词学习应用，支持用户注册、登录、云端同步，提供单词展示、发音、测试等功能。

## 特性

- 🔐 **用户认证** - 注册、登录、JWT令牌认证
- ☁️ **云端同步** - 多设备数据同步，自动备份
- 📚 **词库管理** - 添加、编辑、删除单词
- 🎯 **学习测试** - 选择题测试，实时反馈
- 📊 **学习统计** - 学习进度追踪，正确率统计
- 🔊 **发音功能** - 单词发音播放
- 📱 **响应式设计** - 支持手机、平板、桌面
- ♿ **可访问性** - 键盘导航、屏幕阅读器支持
- 🔄 **离线支持** - 本地优先，后台同步

## 项目结构

```
vocabulary-learning-app/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── config/            # 配置文件
│   │   ├── middleware/        # 中间件（认证、错误处理）
│   │   ├── routes/            # API路由
│   │   ├── services/          # 业务逻辑
│   │   ├── types/             # TypeScript类型
│   │   └── validators/        # 输入验证
│   ├── prisma/                # 数据库模型和迁移
│   └── package.json
├── src/                       # 前端应用
│   ├── components/            # React组件
│   │   ├── WordCard.tsx       # 单词卡片
│   │   ├── TestOptions.tsx    # 测试选项
│   │   ├── ProgressBar.tsx    # 进度条
│   │   ├── Navigation.tsx     # 导航栏
│   │   ├── SyncIndicator.tsx  # 同步状态指示器
│   │   └── MigrationPrompt.tsx # 数据迁移提示
│   ├── contexts/              # React Context
│   │   └── AuthContext.tsx    # 认证上下文
│   ├── pages/                 # 页面组件
│   │   ├── LearningPage.tsx   # 学习页面
│   │   ├── VocabularyPage.tsx # 词库管理
│   │   ├── HistoryPage.tsx    # 学习历史
│   │   ├── LoginPage.tsx      # 登录页面
│   │   ├── RegisterPage.tsx   # 注册页面
│   │   └── ProfilePage.tsx    # 个人资料
│   ├── services/              # 服务层
│   │   ├── ApiClient.ts       # API客户端
│   │   ├── StorageService.ts  # 存储服务（支持云端同步）
│   │   ├── AudioService.ts    # 音频服务
│   │   └── LearningService.ts # 学习逻辑
│   ├── types/                 # TypeScript类型
│   └── utils/                 # 工具函数
├── scripts/                   # 部署脚本
│   ├── deploy-backend.sh      # 后端部署
│   └── deploy-frontend.sh     # 前端部署
├── docs/                      # 文档
│   └── AUTHENTICATION.md      # 认证文档
├── DEPLOYMENT.md              # 部署指南
└── README.md                  # 项目说明
```

## 核心功能

### 用户认证系统

- 用户注册和登录
- JWT令牌认证
- 密码加密（bcrypt）
- 会话管理
- 个人资料管理

### 数据同步

- **本地优先策略** - 离线可用，本地IndexedDB存储
- **自动同步** - 登录后自动同步到云端
- **冲突解决** - 时间戳优先策略
- **增量同步** - 只同步变更的数据
- **同步队列** - 离线操作排队，联网后自动上传
- **数据迁移** - 一键将本地数据迁移到云端

### 词库管理

- 添加、编辑、删除单词
- 单词搜索和过滤
- 音标、释义、例句
- 音频URL支持

### 学习功能

- 单词卡片展示
- 选择题测试（2-4个选项）
- 实时答题反馈
- 进度追踪
- 学习会话管理

### 学习统计

- 总单词数
- 学习记录数
- 正确率统计
- 单词级别统计
- 学习历史查看

## 技术栈

### 前端

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **路由**: React Router v6
- **状态管理**: React Context API
- **数据存储**: IndexedDB (Dexie.js)
- **HTTP客户端**: Fetch API
- **测试**: Vitest + React Testing Library

### 后端

- **运行时**: Node.js 18+
- **框架**: Express + TypeScript
- **数据库**: PostgreSQL 14+
- **ORM**: Prisma
- **认证**: JWT (jsonwebtoken)
- **密码加密**: bcrypt
- **验证**: Zod
- **安全**: helmet, cors, express-rate-limit

### 部署

- **进程管理**: PM2
- **反向代理**: Nginx
- **SSL**: Let's Encrypt
- **数据库**: PostgreSQL

## 快速开始

### 前置要求

- Node.js 18+
- PostgreSQL 14+
- npm 或 yarn

### 后端设置

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等

# 运行数据库迁移
npx prisma migrate dev

# 启动开发服务器
npm run dev
```

后端将在 `http://localhost:3000` 运行

### 前端设置

```bash
# 在项目根目录

# 安装依赖
npm install

# 配置环境变量
echo "VITE_API_URL=http://localhost:3000" > .env.local

# 启动开发服务器
npm run dev
```

前端将在 `http://localhost:5173` 运行

### 开发命令

#### 前端

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览生产构建
npm test             # 运行测试
npm run type-check   # TypeScript类型检查
```

#### 后端

```bash
npm run dev          # 启动开发服务器（带热重载）
npm run build        # 构建生产版本
npm start            # 启动生产服务器
npx prisma studio    # 打开Prisma Studio（数据库GUI）
npx prisma migrate dev  # 运行数据库迁移
```

## 部署

详细的部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 快速部署

#### 后端部署

```bash
# 使用部署脚本
chmod +x scripts/deploy-backend.sh
./scripts/deploy-backend.sh
```

#### 前端部署

```bash
# 使用部署脚本
chmod +x scripts/deploy-frontend.sh
./scripts/deploy-frontend.sh production
```

## API文档

后端API文档请查看 [backend/API.md](./backend/API.md)

主要端点：

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户退出
- `GET /api/users/me` - 获取当前用户信息
- `GET /api/words` - 获取单词列表
- `POST /api/words` - 添加单词
- `PUT /api/words/:id` - 更新单词
- `DELETE /api/words/:id` - 删除单词
- `GET /api/records` - 获取学习记录
- `POST /api/records` - 保存学习记录
- `GET /api/statistics` - 获取学习统计

## 测试

### 前端测试

```bash
npm test                    # 运行所有测试
npm test -- --watch        # 监听模式
npm test -- --coverage     # 生成覆盖率报告
```

测试覆盖：
- ✅ 组件测试（WordCard, TestOptions, ProgressBar）
- ✅ 服务测试（LearningService, ApiClient）
- ✅ 工具函数测试（validation）
- ✅ Context测试（AuthContext）

### 后端测试

后端使用手动测试，可以使用 `backend/test-api.http` 文件配合REST Client插件进行测试。

## 环境变量

### 前端

创建 `.env.local` 文件：

```env
VITE_API_URL=http://localhost:3000
```

### 后端

创建 `backend/.env` 文件：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/vocabulary_db
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue。
