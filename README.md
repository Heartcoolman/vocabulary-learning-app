# 智能词汇学习应用

一个基于 **AMAS 自适应学习算法** 的全栈英语单词学习应用，支持用户认证、云端同步、智能学习推荐、成就系统等功能。

## 核心特性

### 智能学习系统 (AMAS)
- **自适应学习算法** - 基于 LinUCB 强化学习的多维度用户状态感知系统
- **四维状态监测** - 实时追踪注意力(A)、疲劳度(F)、认知能力(C)、动机(M)
- **学习时机推荐** - 分析 24 小时学习效率，智能推荐黄金学习时段
- **趋势分析报告** - 正确率、响应时间、动机趋势追踪与干预建议
- **延迟奖励系统** - 基于间隔重复的异步奖励更新机制

### 学习功能
- **间隔重复算法** - SM-2 改进算法，智能安排复习时间
- **自适应难度** - 根据用户表现动态调整题目难度
- **单词评分系统** - 综合准确率、速度、稳定性、熟练度的多维评分
- **优先队列调度** - 智能决定学习顺序，优先复习薄弱单词

### 成就与激励
- **徽章系统** - 四类成就徽章（连续学习、正确率、认知提升、里程碑）
- **智能学习计划** - 每日目标、周里程碑、词书分配、自动调整
- **状态历史追踪** - 7/30/90 天历史数据，认知成长对比

### 基础功能
- **用户认证** - JWT 令牌认证，支持注册、登录、会话管理
- **云端同步** - 多设备数据同步，离线优先策略
- **词库管理** - 系统词书 + 用户自定义词书，支持批量导入
- **学习测试** - 选择题测试，实时反馈，键盘快捷键支持
- **发音功能** - 单词发音播放，支持 Web Speech API

### 管理后台
- **用户管理** - 用户列表、统计、数据导出
- **词库管理** - 系统词库创建和维护
- **算法配置** - AMAS 算法参数在线调整
- **配置历史** - 参数变更追踪和审计

## 技术栈

### 前端
| 技术 | 说明 |
|------|------|
| React 18 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| React Router v6 | 路由管理 |
| IndexedDB (Dexie.js) | 本地存储 |
| Vitest | 单元测试 |

### 后端
| 技术 | 说明 |
|------|------|
| Node.js 18+ | 运行时 |
| Express | Web 框架 |
| TypeScript | 类型安全 |
| PostgreSQL 14+ | 数据库 |
| Prisma | ORM |
| JWT + bcrypt | 认证加密 |
| Zod | 数据验证 |
| node-cron | 后台任务 |

## 快速开始

### 环境要求
- Node.js 18+
- PostgreSQL 14+
- npm 或 yarn

### 后端启动

```bash
cd backend
npm install
cp .env.example .env  # 配置数据库连接
npx prisma migrate dev
npm run dev
```

后端运行在 `http://localhost:3000`

### 前端启动

```bash
npm install
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm run dev
```

前端运行在 `http://localhost:5173`

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── pages/              # 页面组件
│   ├── services/           # 业务服务
│   │   └── algorithms/     # 学习算法引擎
│   ├── hooks/              # 自定义 Hooks
│   ├── contexts/           # React Context
│   └── types/              # 类型定义
├── backend/                # 后端源码
│   ├── src/
│   │   ├── amas/           # AMAS 智能学习算法
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务服务
│   │   ├── middleware/     # 中间件
│   │   └── validators/     # 数据验证
│   └── prisma/             # 数据库模型
└── scripts/                # 部署脚本
```

## 文档

| 文档 | 说明 |
|------|------|
| [backend/API.md](./backend/API.md) | API 接口文档 |
| [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md) | 部署指南 |
| [backend/SETUP.md](./backend/SETUP.md) | 开发环境配置 |

## 开发命令

```bash
# 前端
npm run dev          # 开发服务器
npm run build        # 生产构建
npm test             # 运行测试

# 后端
cd backend
npm run dev          # 开发服务器
npm run build        # 生产构建
npx prisma studio    # 数据库管理界面
```

## 许可证

MIT License
