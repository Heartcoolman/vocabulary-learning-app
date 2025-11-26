# 系统架构设计

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端应用 (React)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Pages   │ │Components│ │ Services │ │ Algorithms Engine│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/REST API
┌─────────────────────────────┴───────────────────────────────────┐
│                        后端服务 (Express)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Routes  │ │ Services │ │Middleware│ │   AMAS Engine    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Prisma ORM
┌─────────────────────────────┴───────────────────────────────────┐
│                      PostgreSQL 数据库                           │
└─────────────────────────────────────────────────────────────────┘
```

## 前端架构

### 目录结构

```
src/
├── components/           # 可复用组件
│   ├── WordCard.tsx      # 单词卡片
│   ├── TestOptions.tsx   # 答题选项
│   ├── Navigation.tsx    # 导航栏
│   ├── AmasStatus.tsx    # AMAS 状态显示
│   ├── AmasSuggestion.tsx # AMAS 建议弹窗
│   ├── BadgeCelebration.tsx # 徽章庆祝动画
│   └── Icon.tsx          # 图标组件库
├── pages/                # 页面组件
│   ├── LearningPage.tsx  # 学习主页面
│   ├── VocabularyPage.tsx # 词库管理
│   ├── LearningTimePage.tsx # 学习时机分析
│   ├── TrendReportPage.tsx # 趋势分析
│   ├── AchievementPage.tsx # 成就徽章
│   ├── PlanPage.tsx      # 学习计划
│   ├── HistoryPage.tsx   # 学习历史
│   └── admin/            # 管理后台
├── services/             # 业务服务
│   ├── ApiClient.ts      # API 客户端
│   ├── LearningService.ts # 学习服务
│   ├── StorageService.ts # 存储服务
│   └── algorithms/       # 算法引擎
│       ├── SpacedRepetitionEngine.ts  # 间隔重复
│       ├── WordScoreCalculator.ts     # 单词评分
│       ├── PriorityQueueScheduler.ts  # 优先队列
│       └── AdaptiveDifficultyEngine.ts # 自适应难度
├── hooks/                # 自定义 Hooks
│   ├── useLearningSession.ts # 学习会话管理
│   └── useLearningTimer.ts   # 响应时间计时
├── contexts/             # 全局状态
│   └── AuthContext.tsx   # 认证上下文
└── types/                # 类型定义
```

### 页面功能

| 页面 | 路径 | 功能 |
|------|------|------|
| LearningPage | `/` | 主学习界面，单词卡片和测试 |
| VocabularyPage | `/vocabulary` | 词库浏览和管理 |
| WordBookDetailPage | `/wordbooks/:id` | 词书详情 |
| LearningTimePage | `/learning-time` | 24 小时学习效率分析 |
| TrendReportPage | `/trend-report` | 趋势分析报告 |
| AchievementPage | `/achievements` | 徽章成就展示 |
| PlanPage | `/plan` | 智能学习计划 |
| HistoryPage | `/history` | 学习历史记录 |
| StatisticsPage | `/statistics` | 学习统计 |
| StudySettingsPage | `/study-settings` | 学习配置 |
| ProfilePage | `/profile` | 个人资料 |
| AdminDashboard | `/admin` | 管理后台首页 |

## 后端架构

### 目录结构

```
backend/src/
├── amas/                 # AMAS 智能学习算法
│   ├── engine.ts         # 引擎主类
│   ├── types.ts          # 类型定义
│   ├── perception/       # 感知层
│   │   └── feature-builder.ts
│   ├── modeling/         # 建模层
│   │   ├── attention-monitor.ts
│   │   ├── fatigue-estimator.ts
│   │   ├── cognitive-profiler.ts
│   │   └── motivation-tracker.ts
│   ├── learning/         # 学习层
│   │   └── linucb.ts     # LinUCB 算法
│   └── decision/         # 决策层
│       ├── mapper.ts     # 策略映射
│       └── guardrails.ts # 安全约束
├── routes/               # API 路由
│   ├── auth.routes.ts    # 认证
│   ├── amas.routes.ts    # AMAS 接口
│   ├── wordbook.routes.ts # 词书
│   ├── word.routes.ts    # 单词
│   ├── record.routes.ts  # 学习记录
│   ├── badge.routes.ts   # 徽章
│   ├── plan.routes.ts    # 学习计划
│   └── admin.routes.ts   # 管理后台
├── services/             # 业务服务
│   ├── amas.service.ts   # AMAS 核心服务
│   ├── auth.service.ts   # 认证服务
│   ├── badge.service.ts  # 徽章服务
│   ├── plan-generator.service.ts # 计划生成
│   ├── trend-analysis.service.ts # 趋势分析
│   └── delayed-reward.service.ts # 延迟奖励
├── middleware/           # 中间件
│   ├── auth.middleware.ts # JWT 认证
│   ├── admin.middleware.ts # 管理员权限
│   └── validate.middleware.ts # 请求验证
├── validators/           # 数据验证
└── workers/              # 后台任务
    └── delayed-reward.worker.ts
```

### API 路由

#### 认证 (`/api/auth`)
```
POST /register    # 用户注册
POST /login       # 用户登录
POST /logout      # 退出登录
```

#### AMAS 智能学习 (`/api/amas`)
```
POST /process     # 处理学习事件，返回策略
GET  /state       # 获取用户 AMAS 状态
GET  /phase       # 获取冷启动阶段
GET  /history     # 状态历史数据
GET  /growth      # 认知成长对比
```

#### 词书 (`/api/wordbooks`)
```
GET  /user        # 用户词书列表
GET  /system      # 系统词书列表
POST /            # 创建词书
GET  /:id         # 词书详情
GET  /:id/words   # 词书单词列表
```

#### 学习记录 (`/api/records`)
```
POST /            # 保存答题记录
GET  /            # 查询学习记录
GET  /statistics  # 学习统计
```

#### 徽章 (`/api/badges`)
```
GET  /            # 用户徽章列表
GET  /all         # 所有徽章（含进度）
POST /check       # 检查并授予新徽章
```

#### 学习计划 (`/api/plan`)
```
GET  /            # 获取学习计划
POST /generate    # 生成新计划
GET  /progress    # 计划进度
PUT  /adjust      # 调整计划
```

## AMAS 算法架构

### 四层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    决策层 (Decision)                         │
│         策略映射 + 安全约束 + 决策解释                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    学习层 (Learning)                         │
│            LinUCB 在线强化学习算法                           │
│            d=22 维特征，α=1.0 探索系数                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    建模层 (Modeling)                         │
│    注意力(A) + 疲劳度(F) + 认知能力(C) + 动机(M)            │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    感知层 (Perception)                       │
│      特征提取：响应时间、交互密度、暂停/切屏等               │
└─────────────────────────────────────────────────────────────┘
```

### 用户状态模型

```typescript
interface UserState {
  A: number;           // 注意力 [0,1]
  F: number;           // 疲劳度 [0,1]
  C: CognitiveProfile; // 认知画像 {mem, speed, stability}
  M: number;           // 动机 [-1,1]
  conf: number;        // 状态置信度
  ts: number;          // 时间戳
}
```

### 动作空间

| 参数 | 说明 | 取值范围 |
|------|------|----------|
| interval_scale | 复习间隔倍数 | 0.5, 0.8, 1.0, 1.2, 1.5 |
| new_ratio | 新词比例 | 0.1, 0.2, 0.3, 0.4 |
| difficulty | 难度等级 | easy, mid, hard |
| batch_size | 批量大小 | 5, 8, 12, 16 |
| hint_level | 提示级别 | 0, 1, 2 |

### 安全约束

```
疲劳度 > 0.8  → 强制休息建议
疲劳度 > 0.6  → 难度降低，批量减小
动机 < -0.5   → 简化任务，增加正反馈
注意力 < 0.3  → 批量减小，提示增加
```

## 数据库模型

### 核心实体

```
User                    # 用户
├── WordBook[]          # 词书
├── AnswerRecord[]      # 答题记录
├── WordLearningState[] # 单词学习状态
├── WordScore[]         # 单词评分
├── UserBadge[]         # 用户徽章
├── LearningPlan        # 学习计划
├── AmasUserState       # AMAS 状态
└── AmasUserModel       # Bandit 模型

WordBook                # 词书
├── Word[]              # 单词列表
└── type: SYSTEM|USER   # 类型

Word                    # 单词
├── spelling            # 拼写
├── phonetic            # 音标
├── meanings[]          # 释义
├── examples[]          # 例句
└── audioUrl            # 音频

AnswerRecord            # 答题记录
├── isCorrect           # 是否正确
├── responseTime        # 响应时间
├── dwellTime           # 停留时间
└── sessionId           # 会话 ID

WordLearningState       # 学习状态
├── state               # NEW|LEARNING|REVIEWING|MASTERED
├── masteryLevel        # 掌握等级 [0-5]
├── easeFactor          # 难度因子
├── nextReviewDate      # 下次复习日期
└── currentInterval     # 当前间隔天数
```

### AMAS 相关

```
AmasUserState           # AMAS 状态快照
├── attention           # 注意力
├── fatigue             # 疲劳度
├── motivation          # 动机
├── cognitiveProfile    # 认知画像 (JSON)
└── trendState          # 趋势状态

AmasUserModel           # 用户 Bandit 模型
└── modelData           # LinUCB 参数 (JSON)

FeatureVector           # 特征向量（延迟奖励用）
├── sessionId           # 会话 ID
├── features            # 22 维特征 (JSON)
└── featureVersion      # 版本

RewardQueue             # 延迟奖励队列
├── dueTs               # 到期时间
├── reward              # 奖励值
├── status              # PENDING|PROCESSING|DONE
└── idempotencyKey      # 幂等键
```

## 数据流

### 学习事件处理流程

```
用户答题
    │
    ▼
┌─────────────────────┐
│ POST /api/amas/process │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 1. 特征提取 (22维)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. 状态更新 (A/F/C/M) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. LinUCB 动作选择  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. 策略映射 + 安全约束 │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 5. 入队延迟奖励      │
└──────────┬──────────┘
           │
           ▼
返回策略和建议
```

### 延迟奖励处理

```
学习事件 → 入队延迟奖励 (dueTs = now + 24h)
                │
                ▼
        后台 Worker (每分钟)
                │
                ▼
        查询到期奖励
                │
                ▼
        加载特征向量
                │
                ▼
        更新 Bandit 模型
                │
                ▼
        标记完成
```

## 安全设计

### 认证授权
- JWT Token 认证
- bcrypt 密码加密
- 管理员权限检查
- 用户数据隔离

### 请求防护
- Rate Limiting (500 req/15min)
- 请求体大小限制 (200KB)
- Zod Schema 验证
- CORS + Helmet 防护

### 数据安全
- 用户数据隔离
- 词书权限检查
- 幂等操作保护
- 全局错误处理
