# 开发指南

## 环境要求

- Node.js 20+
- pnpm 10.24.0+
- Rust (最新稳定版)
- PostgreSQL 15+
- Redis 7+

## 项目结构

```
danci/
├── packages/
│   ├── backend-rust/     # Rust 后端
│   └── frontend/         # React 前端
├── package.json          # 根配置
├── pnpm-workspace.yaml   # 工作区配置
├── turbo.json           # Turborepo配置
└── docker-compose.yml   # Docker配置
```

## 安装依赖

```bash
pnpm install
```

## 启动开发服务

### 前端

```bash
pnpm dev:frontend
# 或
cd packages/frontend && pnpm dev
```

### 后端

```bash
pnpm dev:backend
# 或
cd packages/backend-rust && cargo run
```

### 全栈 (Turborepo)

```bash
pnpm dev
```

## 环境变量

### 后端 (packages/backend-rust/.env)

```env
DATABASE_URL=postgres://user:pass@localhost:5432/danci
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
PORT=3000
RUST_LOG=info
```

### 前端 (packages/frontend/.env)

```env
VITE_API_URL=http://localhost:3000
```

## 数据库

### 迁移

```bash
pnpm db:migrate
# 或
cd packages/backend-rust && sqlx migrate run
```

### SQL文件位置

```
packages/backend-rust/sql/
├── 001_initial.sql
├── 002_xxx.sql
└── ...
```

## 测试

```bash
# 全部测试
pnpm test

# 后端测试
pnpm test:backend
# 或
cd packages/backend-rust && cargo test

# 前端测试
pnpm test:frontend

# E2E测试
pnpm test:e2e
```

## 构建

```bash
# 全部构建
pnpm build

# 仅前端
cd packages/frontend && pnpm build

# 仅后端
cd packages/backend-rust && cargo build --release
```

## 代码规范

```bash
# 格式化
pnpm format

# 检查格式
pnpm format:check

# Lint
pnpm lint
```

## Docker

```bash
# 构建镜像
pnpm docker:build

# 启动服务
pnpm docker:up

# 停止服务
pnpm docker:down
```
