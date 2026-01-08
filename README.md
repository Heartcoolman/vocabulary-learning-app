# Danci - 智能单词学习系统

基于 AMAS (Adaptive Multi-dimensional Awareness System) 的自适应单词学习平台。

## 技术栈

- **后端**: Rust + Axum + SQLx
- **前端**: React 18 + TypeScript + Vite + TailwindCSS
- **数据库**: PostgreSQL + Redis
- **构建**: pnpm + Turborepo

## 快速开始

### Docker Compose (推荐)

```bash
docker-compose up -d
```

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动前端
pnpm dev:frontend

# 启动后端
pnpm dev:backend
```

## 项目结构

```
danci/
├── packages/
│   ├── backend-rust/     # Rust 后端服务
│   │   ├── src/
│   │   │   ├── routes/   # API 路由 (35个模块)
│   │   │   ├── services/ # 业务服务 (27个模块)
│   │   │   ├── amas/     # AMAS 引擎
│   │   │   └── db/       # 数据库操作
│   │   └── sql/          # 数据库迁移
│   └── frontend/         # React 前端应用
│       └── src/
│           ├── pages/    # 页面组件
│           ├── components/ # UI 组件
│           ├── routes/   # 路由配置
│           └── services/ # API 客户端
└── docs/                 # 项目文档
```

## 核心功能

- **AMAS 智能学习引擎**: 四维状态监测 (注意力/疲劳度/认知能力/动机)
- **间隔重复算法**: 基于遗忘曲线的智能复习调度
- **用户画像**: 学习习惯分析与个性化推荐
- **成就系统**: 徽章与学习激励
- **管理后台**: 用户管理、算法配置、实验仪表盘

## 常用命令

```bash
pnpm dev           # 启动开发服务
pnpm build         # 构建项目
pnpm test          # 运行测试
pnpm lint          # 代码检查
pnpm format        # 代码格式化
pnpm db:migrate    # 数据库迁移
```

## 文档

- [系统架构](docs/ARCHITECTURE.md)
- [API 参考](docs/API.md)
- [AMAS 引擎](docs/AMAS.md)
- [开发指南](docs/DEVELOPMENT.md)
- [前端组件](docs/COMPONENTS.md)
