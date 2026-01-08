# 前端组件

## 页面结构

```
pages/
├── 公开页面
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ForgotPasswordPage.tsx
│   └── ResetPasswordPage.tsx
│
├── 用户页面
│   ├── LearningPage.tsx          # 学习主页
│   ├── VocabularyPage.tsx        # 词汇本
│   ├── WordListPage.tsx          # 单词列表
│   ├── WordBookDetailPage.tsx    # 词书详情
│   ├── WordMasteryPage.tsx       # 精熟度
│   ├── TodayWordsPage.tsx        # 今日单词
│   ├── FlashcardPage.tsx         # 闪卡
│   ├── StatisticsPage.tsx        # 统计
│   ├── HistoryPage.tsx           # 历史记录
│   ├── ProfilePage.tsx           # 个人资料
│   ├── AchievementPage.tsx       # 成就
│   ├── BadgeGalleryPage.tsx      # 徽章
│   ├── PlanPage.tsx              # 学习计划
│   ├── StudyProgressPage.tsx     # 学习进度
│   ├── StudySettingsPage.tsx     # 学习设置
│   ├── TrendReportPage.tsx       # 趋势报告
│   ├── LearningProfilePage.tsx   # 学习画像
│   ├── HabitProfilePage.tsx      # 习惯画像
│   ├── LearningTimePage.tsx      # 学习时间
│   ├── LearningObjectivesPage.tsx # 学习目标
│   └── BatchImportPage.tsx       # 批量导入
│
├── 管理页面 (admin/)
│   ├── AdminDashboard.tsx        # 管理仪表盘
│   ├── AdminUsers.tsx            # 用户管理
│   ├── AdminWordBooks.tsx        # 词书管理
│   ├── UserDetailPage.tsx        # 用户详情
│   ├── UserManagementPage.tsx    # 用户管理
│   ├── WordDetailPage.tsx        # 单词详情
│   ├── AlgorithmConfigPage.tsx   # 算法配置
│   ├── ConfigHistoryPage.tsx     # 配置历史
│   ├── AMASExplainabilityPage.tsx # AMAS可解释性
│   ├── ExperimentDashboard.tsx   # 实验仪表盘
│   ├── OptimizationDashboard.tsx # 优化仪表盘
│   ├── CausalInferencePage.tsx   # 因果推断
│   ├── LLMAdvisorPage.tsx        # LLM顾问
│   ├── LogAlertsPage.tsx         # 日志告警
│   ├── LogViewerPage.tsx         # 日志查看
│   ├── WeeklyReportPage.tsx      # 周报
│   ├── SystemDebugPage.tsx       # 系统调试
│   └── PerformanceTestPage.tsx   # 性能测试
│
└── About页面 (about/)
    ├── AboutLayout.tsx           # 布局
    ├── AboutHomePage.tsx         # 首页
    ├── DashboardPage.tsx         # 仪表盘
    ├── SimulationPage.tsx        # 模拟
    ├── StatsPage.tsx             # 统计
    └── SystemStatusPage.tsx      # 系统状态
```

## 路由配置

```
routes/
├── index.tsx          # 路由入口
├── types.ts           # 类型定义
├── public.routes.tsx  # 公开路由
├── user.routes.tsx    # 用户路由
├── admin.routes.tsx   # 管理路由
├── about.routes.tsx   # About路由
├── components.tsx     # 路由组件
└── prefetch.ts        # 预加载
```

## 组件目录

```
components/
├── ui/               # 基础UI组件
├── admin/            # 管理后台组件
├── badges/           # 徽章组件
├── dashboard/        # 仪表盘组件
├── explainability/   # 可解释性组件
├── profile/          # 个人资料组件
├── progress/         # 进度组件
└── word-mastery/     # 精熟度组件
```

## 服务层

```
services/
└── client/
    ├── index.ts          # API客户端入口
    ├── BaseClient.ts     # 基础客户端
    ├── AuthClient.ts     # 认证客户端
    ├── WordClient.ts     # 单词客户端
    ├── LearningClient.ts # 学习客户端
    ├── AMASClient.ts     # AMAS客户端
    └── admin/
        └── AdminClient.ts # 管理客户端
```
