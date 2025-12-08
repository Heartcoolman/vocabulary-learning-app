# 开发指南

## 开发环境设置

### 环境要求

| 工具       | 版本要求 | 说明                    |
| ---------- | -------- | ----------------------- |
| Node.js    | 20+      | 运行时环境              |
| pnpm       | 10.24.0+ | 包管理器                |
| PostgreSQL | 15+      | 数据库                  |
| Redis      | 7+       | 缓存（可选）            |
| Docker     | 最新版   | 容器化部署              |
| Rust       | 最新版   | Native 模块编译（可选） |

### 快速开始

#### 方式一：使用开发脚本（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd danci

# 完整启动流程（启动数据库 + 迁移）
./scripts/dev-start.sh all

# 导入种子数据（可选）
./scripts/dev-start.sh seed

# 启动后端
./scripts/dev-start.sh backend

# 启动前端（新终端）
./scripts/dev-start.sh frontend
```

#### 方式二：手动启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库（使用 Docker）
docker-compose -f docker-compose.dev.yml up -d

# 3. 配置环境变量
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env.local

# 4. 数据库迁移
pnpm prisma:migrate

# 5. 生成 Prisma Client
pnpm prisma:generate

# 6. 导入种子数据（可选）
pnpm --filter @danci/backend prisma:seed

# 7. 启动开发服务器
pnpm dev
```

#### 方式三：Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 环境变量配置

#### 后端环境变量 (`packages/backend/.env`)

```bash
# 数据库
DATABASE_URL="postgresql://postgres:password@localhost:5432/danci?schema=public"

# Redis（可选）
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# 服务配置
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN="http://localhost:5173"

# Sentry（可选）
SENTRY_DSN=""

# LLM 配置（可选）
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_BASE_URL=""
```

#### 前端环境变量 (`packages/frontend/.env.local`)

```bash
# API 地址
VITE_API_URL=http://localhost:3000

# Sentry（可选）
VITE_SENTRY_DSN=""
```

## 代码规范

### 目录结构规范

```
packages/
├── frontend/
│   └── src/
│       ├── components/     # 按功能分类的组件
│       │   └── [feature]/  # 功能模块目录
│       │       ├── ComponentName.tsx
│       │       ├── ComponentName.test.tsx
│       │       └── index.ts
│       ├── hooks/          # 自定义 Hooks
│       │   ├── queries/    # React Query 查询
│       │   └── mutations/  # React Query 变更
│       ├── services/       # API 客户端和服务
│       ├── pages/          # 页面组件
│       ├── contexts/       # React Context
│       ├── types/          # TypeScript 类型
│       └── utils/          # 工具函数
│
└── backend/
    └── src/
        ├── routes/         # API 路由
        ├── services/       # 业务逻辑
        ├── middleware/     # Express 中间件
        ├── validators/     # Zod 验证器
        ├── amas/           # AMAS 引擎模块
        └── config/         # 配置文件
```

### TypeScript 规范

```typescript
// 使用 interface 定义对象类型
interface User {
  id: string;
  name: string;
  email: string;
}

// 使用 type 定义联合类型
type Status = 'pending' | 'active' | 'completed';

// Props 命名规范
interface ComponentNameProps {
  // 必填属性
  requiredProp: string;
  // 可选属性
  optionalProp?: number;
  // 事件回调以 on 开头
  onClick?: () => void;
  // 布尔属性以 is/has 开头
  isLoading?: boolean;
  hasError?: boolean;
}

// 函数组件定义
export function ComponentName({
  requiredProp,
  optionalProp = 0,
  onClick,
  isLoading = false,
}: ComponentNameProps) {
  return <div>{/* ... */}</div>;
}
```

### 命名规范

| 类型    | 规范                     | 示例                              |
| ------- | ------------------------ | --------------------------------- |
| 组件    | PascalCase               | `WordCard`, `UserProfile`         |
| 函数    | camelCase                | `getUserById`, `calculateScore`   |
| 常量    | UPPER_SNAKE_CASE         | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 文件名  | kebab-case 或 PascalCase | `word-card.tsx` 或 `WordCard.tsx` |
| Hook    | use 前缀                 | `useAuth`, `useWords`             |
| Context | 名词 + Context           | `AuthContext`, `ThemeContext`     |

### ESLint & Prettier

```bash
# 格式化代码
pnpm format

# 检查格式
pnpm format:check

# 运行 Lint
pnpm lint
```

### Commit 规范

项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
# 格式
<type>(<scope>): <description>

[optional body]

[optional footer(s)]

# 类型
feat:     新功能
fix:      Bug 修复
docs:     文档更新
style:    代码格式（不影响功能）
refactor: 重构
perf:     性能优化
test:     测试相关
chore:    构建/工具变动
ci:       CI 配置变动

# 示例
feat(frontend): add word mastery chart component
fix(backend): resolve AMAS state persistence issue
docs: update API documentation
refactor(amas): split engine into modular components
```

### Husky & lint-staged

项目配置了 Git Hooks：

```bash
# pre-commit: 自动格式化和 lint
pnpm lint-staged

# commit-msg: 验证 commit 信息格式
```

## Git 工作流

### 分支策略

```
main                 # 主分支，生产环境
├── develop          # 开发分支
├── feature/*        # 功能分支
├── bugfix/*         # Bug 修复分支
├── hotfix/*         # 紧急修复分支
└── release/*        # 发布分支
```

### 开发流程

```bash
# 1. 从 develop 创建功能分支
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# 2. 开发并提交
git add .
git commit -m "feat(scope): description"

# 3. 推送并创建 PR
git push origin feature/your-feature-name
# 在 GitHub 创建 Pull Request

# 4. Code Review 后合并到 develop

# 5. 删除功能分支
git branch -d feature/your-feature-name
```

### PR 规范

1. **标题**：使用 Conventional Commits 格式
2. **描述**：说明变更内容和原因
3. **关联 Issue**：如有相关 Issue，使用 `Fixes #123` 关联
4. **Review**：至少需要一人 Review 通过
5. **测试**：确保 CI 测试通过

## 测试指南

### 测试目录结构

```
packages/
├── frontend/
│   └── src/
│       ├── components/
│       │   └── __tests__/          # 组件测试
│       ├── hooks/
│       │   └── __tests__/          # Hook 测试
│       ├── services/
│       │   └── __tests__/          # 服务测试
│       └── pages/
│           └── __tests__/          # 页面测试
│
├── backend/
│   └── tests/
│       ├── unit/                   # 单元测试
│       │   ├── services/
│       │   └── amas/
│       ├── integration/            # 集成测试
│       └── performance/            # 性能测试
│
└── tests/
    └── e2e/                        # E2E 测试
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行带覆盖率
pnpm test:coverage

# 按包运行
pnpm test:frontend
pnpm test:backend

# 运行特定类型测试
pnpm test:backend:unit
pnpm test:backend:integration

# E2E 测试
pnpm test:e2e

# 监听模式
pnpm --filter @danci/frontend test:watch
```

### 测试示例

#### 组件测试

```tsx
// ComponentName.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly with required props', () => {
    render(<ComponentName title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('handles click event', () => {
    const handleClick = vi.fn();
    render(<ComponentName title="Test" onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('displays loading state', () => {
    render(<ComponentName title="Test" isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

#### Hook 测试

```tsx
// useCustomHook.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCustomHook } from './useCustomHook';

describe('useCustomHook', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useCustomHook());
    expect(result.current.value).toBe(0);
  });

  it('updates state correctly', () => {
    const { result } = renderHook(() => useCustomHook());

    act(() => {
      result.current.increment();
    });

    expect(result.current.value).toBe(1);
  });
});
```

#### API 测试

```typescript
// api.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

describe('Word API', () => {
  beforeEach(async () => {
    await prisma.word.deleteMany();
  });

  it('GET /api/words returns empty array', async () => {
    const response = await request(app).get('/api/words').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('POST /api/words creates a word', async () => {
    const response = await request(app)
      .post('/api/words')
      .set('Authorization', `Bearer ${token}`)
      .send({
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['n. 测试'],
        examples: ['This is a test.'],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.spelling).toBe('test');
  });
});
```

### 测试覆盖率要求

| 模块      | 覆盖率要求 |
| --------- | ---------- |
| 业务服务  | >= 80%     |
| AMAS 核心 | >= 90%     |
| API 路由  | >= 70%     |
| 组件      | >= 60%     |
| 工具函数  | >= 90%     |

## 开发命令参考

### 根目录命令

```bash
# 开发
pnpm dev                    # 启动所有服务
pnpm dev:frontend           # 仅启动前端
pnpm dev:backend            # 仅启动后端

# 构建
pnpm build                  # 构建所有包
pnpm clean                  # 清理构建产物

# 测试
pnpm test                   # 所有测试
pnpm test:coverage          # 带覆盖率

# 数据库
pnpm prisma:generate        # 生成 Prisma Client
pnpm prisma:migrate         # 运行迁移
pnpm prisma:studio          # 打开数据库管理界面

# 代码质量
pnpm lint                   # 运行 ESLint
pnpm format                 # 格式化代码
pnpm format:check           # 检查格式

# Docker
pnpm docker:build           # 构建镜像
pnpm docker:up              # 启动容器
pnpm docker:down            # 停止容器
```

### 包级命令

```bash
# 前端
pnpm --filter @danci/frontend dev
pnpm --filter @danci/frontend build
pnpm --filter @danci/frontend test
pnpm --filter @danci/frontend test:watch

# 后端
pnpm --filter @danci/backend dev
pnpm --filter @danci/backend build
pnpm --filter @danci/backend test
pnpm --filter @danci/backend test:unit
pnpm --filter @danci/backend test:integration

# Native 模块
pnpm --filter @danci/native build
pnpm --filter @danci/native test
```

## 调试技巧

### 前端调试

```typescript
// React Query 调试
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// 在 App 中添加
<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### 后端调试

```typescript
// 使用 Pino 日志
import { logger } from '@/logger';

logger.info({ userId, action: 'login' }, 'User logged in');
logger.error({ err, wordId }, 'Failed to process word');

// VS Code 调试配置
// .vscode/launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["--filter", "@danci/backend", "dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

### 数据库调试

```bash
# 打开 Prisma Studio
pnpm prisma:studio

# 查看数据库日志
docker-compose logs -f postgres

# 直接连接数据库
docker exec -it danci-postgres psql -U postgres -d danci
```

## 性能优化检查清单

### 前端

- [ ] 使用 React.memo 优化组件重渲染
- [ ] 使用 useMemo/useCallback 避免不必要计算
- [ ] 图片使用懒加载
- [ ] 路由使用代码分割
- [ ] 检查 bundle 大小

### 后端

- [ ] 数据库查询使用索引
- [ ] 使用 Redis 缓存热点数据
- [ ] API 响应使用压缩
- [ ] 批量操作优化
- [ ] Worker 线程处理计算密集任务

## 相关文档

- [架构文档](./ARCHITECTURE.md)
- [API 文档](./API.md)
- [组件文档](./COMPONENTS.md)
- [状态管理文档](./STATE_MANAGEMENT.md)
- [测试文档](./TESTING.md)
