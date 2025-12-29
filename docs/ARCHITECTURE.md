# 系统架构

## 后端架构

### 路由层 (35个模块)

```
routes/
├── v1_auth.rs        # 认证: login, register, logout, refresh_token
├── users.rs          # 用户: me, statistics, password, profile
├── preferences.rs    # 偏好设置: learning, notification, ui
├── words.rs          # 单词: CRUD, search, batch
├── wordbooks.rs      # 词书: user, system, available
├── learning.rs       # 学习: study-words, next-words, session
├── records.rs        # 记录: 学习记录, statistics
├── word_states.rs    # 单词状态: due, by-state, mark-mastered
├── word_scores.rs    # 单词评分: range, low/high list
├── amas.rs           # AMAS引擎: process, state, strategy, trend
├── badges.rs         # 成就徽章
├── notifications.rs  # 通知系统
├── alerts.rs         # 告警
├── experiments.rs    # A/B实验
├── optimization.rs   # 优化器
├── tracking.rs       # 埋点追踪
├── llm_advisor.rs    # LLM顾问
├── admin/            # 管理后台
│   ├── users.rs      # 用户管理
│   ├── wordbooks.rs  # 词书管理
│   ├── logs.rs       # 日志查看
│   ├── quality.rs    # 质量监控
│   ├── ops.rs        # 运维操作
│   ├── llm.rs        # LLM任务
│   ├── analytics.rs  # 分析
│   └── statistics.rs # 统计
└── ...
```

### 服务层 (27个模块)

```
services/
├── amas.rs             # AMAS核心服务
├── amas_config.rs      # AMAS配置
├── admin.rs            # 管理服务
├── alert_engine.rs     # 告警引擎
├── alerts.rs           # 告警服务
├── badge.rs            # 徽章服务
├── delayed_reward.rs   # 延迟奖励
├── evaluation.rs       # 评估服务
├── experiment.rs       # 实验服务
├── explainability.rs   # 可解释性
├── habit_profile.rs    # 习惯画像
├── insight_generator.rs # 洞察生成
├── learning_state.rs   # 学习状态
├── learning_time.rs    # 学习时间
├── llm_provider.rs     # LLM提供者
├── mastery_learning.rs # 精熟学习
├── quality_service.rs  # 质量服务
├── record.rs           # 记录服务
├── state_history.rs    # 状态历史
├── study_config.rs     # 学习配置
├── trend_analysis.rs   # 趋势分析
├── user_profile.rs     # 用户画像
├── weekly_report.rs    # 周报
├── word_scores.rs      # 评分服务
└── word_states.rs      # 状态服务
```

### AMAS 引擎

```
amas/
├── types.rs        # 核心类型: UserState, RawEvent, StrategyParams
├── config.rs       # AMASConfig 配置
├── modeling/       # 用户建模
├── decision/       # 决策算法
├── engine.rs       # AMASEngine 主引擎
└── persistence.rs  # 持久化层
```

## 前端架构

### 路由结构

```
routes/
├── public.routes.tsx   # 公开路由 (登录/注册)
├── user.routes.tsx     # 用户路由 (需登录)
├── admin.routes.tsx    # 管理路由 (需管理员)
└── about.routes.tsx    # About页面路由
```

### 页面组件

- **公开页**: Login, Register, ForgotPassword, ResetPassword
- **用户页**: Learning, Vocabulary, WordList, Statistics, Profile, Achievement...
- **管理页**: AdminDashboard, AdminUsers, AlgorithmConfig, LLMAdvisor, ExperimentDashboard...
- **About页**: AboutHome, Dashboard, Simulation, Stats, SystemStatus

## 数据流

```
用户交互 → 前端收集事件 → API请求
    ↓
后端路由 → 服务层处理 → AMAS引擎
    ↓
状态更新 → 策略调整 → 响应返回
    ↓
前端更新 → UI渲染
```

## 中间件

- CSRF保护
- 速率限制 (API/Auth分离)
- 认证验证
- 管理员权限检查
