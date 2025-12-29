# API 参考

## 认证

| 方法 | 路径                         | 说明         |
| ---- | ---------------------------- | ------------ |
| POST | `/api/v1/auth/login`         | 登录         |
| POST | `/api/v1/auth/register`      | 注册         |
| POST | `/api/v1/auth/logout`        | 登出         |
| GET  | `/api/v1/auth/verify`        | 验证Token    |
| POST | `/api/v1/auth/refresh_token` | 刷新Token    |
| POST | `/api/auth/password/request` | 请求密码重置 |
| POST | `/api/auth/password/reset`   | 重置密码     |

## 用户

| 方法    | 路径                                | 说明              |
| ------- | ----------------------------------- | ----------------- |
| GET/PUT | `/api/users/me`                     | 获取/更新用户信息 |
| GET     | `/api/users/me/statistics`          | 用户统计          |
| PUT     | `/api/users/me/password`            | 修改密码          |
| GET/PUT | `/api/users/profile/reward`         | 奖励画像          |
| GET     | `/api/users/profile/chronotype`     | 时间类型          |
| GET     | `/api/users/profile/learning-style` | 学习风格          |
| GET     | `/api/users/profile/cognitive`      | 认知画像          |

## 偏好设置

| 方法    | 路径                                 | 说明         |
| ------- | ------------------------------------ | ------------ |
| GET/PUT | `/api/preferences`                   | 全部偏好     |
| GET/PUT | `/api/preferences/learning`          | 学习偏好     |
| GET/PUT | `/api/preferences/notification`      | 通知偏好     |
| GET/PUT | `/api/preferences/ui`                | UI偏好       |
| POST    | `/api/preferences/reset`             | 重置偏好     |
| GET     | `/api/preferences/quiet-hours/check` | 静默时段检查 |

## 单词

| 方法           | 路径                      | 说明      |
| -------------- | ------------------------- | --------- |
| GET/POST       | `/api/words`              | 列表/创建 |
| GET            | `/api/words/search`       | 搜索      |
| GET            | `/api/words/learned`      | 已学单词  |
| POST           | `/api/words/batch`        | 批量创建  |
| POST           | `/api/words/batch-delete` | 批量删除  |
| GET/PUT/DELETE | `/api/words/:id`          | 单个操作  |

## 词书

| 方法           | 路径                             | 说明     |
| -------------- | -------------------------------- | -------- |
| GET            | `/api/wordbooks/user`            | 用户词书 |
| GET            | `/api/wordbooks/system`          | 系统词书 |
| GET            | `/api/wordbooks/available`       | 可用词书 |
| POST           | `/api/wordbooks`                 | 创建词书 |
| GET/PUT/DELETE | `/api/wordbooks/:id`             | 单个操作 |
| GET/POST       | `/api/wordbooks/:id/words`       | 词书单词 |
| POST           | `/api/wordbooks/:id/words/batch` | 批量添加 |

## 学习

| 方法 | 路径                               | 说明         |
| ---- | ---------------------------------- | ------------ |
| GET  | `/api/learning/study-words`        | 今日学习单词 |
| POST | `/api/learning/next-words`         | 获取下一批   |
| POST | `/api/learning/session`            | 创建会话     |
| POST | `/api/learning/sync-progress`      | 同步进度     |
| GET  | `/api/learning/session/:sessionId` | 会话进度     |
| POST | `/api/learning/adjust-words`       | 调整单词     |

## 单词状态

| 方法           | 路径                                     | 说明       |
| -------------- | ---------------------------------------- | ---------- |
| POST           | `/api/word-states/batch`                 | 批量获取   |
| GET            | `/api/word-states/due/list`              | 到期列表   |
| GET            | `/api/word-states/by-state/:state`       | 按状态查询 |
| GET            | `/api/word-states/stats/overview`        | 状态概览   |
| GET/PUT/DELETE | `/api/word-states/:wordId`               | 单个操作   |
| POST           | `/api/word-states/:wordId/mark-mastered` | 标记精熟   |
| POST           | `/api/word-states/:wordId/reset`         | 重置进度   |

## AMAS

| 方法 | 路径                           | 说明         |
| ---- | ------------------------------ | ------------ |
| POST | `/api/amas/process`            | 处理学习事件 |
| POST | `/api/amas/reset`              | 重置用户状态 |
| GET  | `/api/amas/state`              | 获取用户状态 |
| GET  | `/api/amas/strategy`           | 获取当前策略 |
| POST | `/api/amas/batch-process`      | 批量处理     |
| GET  | `/api/amas/delayed-rewards`    | 延迟奖励     |
| GET  | `/api/amas/time-preferences`   | 时间偏好     |
| GET  | `/api/amas/golden-time`        | 黄金时段     |
| GET  | `/api/amas/trend`              | 当前趋势     |
| GET  | `/api/amas/trend/history`      | 趋势历史     |
| GET  | `/api/amas/trend/intervention` | 干预建议     |
| GET  | `/api/amas/trend/report`       | 趋势报告     |
| GET  | `/api/amas/history`            | 状态历史     |
| GET  | `/api/amas/growth`             | 认知成长     |
| GET  | `/api/amas/changes`            | 显著变化     |
| GET  | `/api/amas/explain-decision`   | 决策解释     |
| GET  | `/api/amas/learning-curve`     | 学习曲线     |
| GET  | `/api/amas/phase`              | 冷启动阶段   |
| GET  | `/api/amas/decision-timeline`  | 决策时间线   |
| POST | `/api/amas/counterfactual`     | 反事实分析   |

## 通知

| 方法   | 路径                             | 说明     |
| ------ | -------------------------------- | -------- |
| GET    | `/api/notifications`             | 通知列表 |
| GET    | `/api/notifications/stats`       | 统计     |
| PUT    | `/api/notifications/read-all`    | 全部已读 |
| PUT    | `/api/notifications/batch/read`  | 批量已读 |
| DELETE | `/api/notifications/batch`       | 批量删除 |
| PUT    | `/api/notifications/:id/read`    | 标记已读 |
| PUT    | `/api/notifications/:id/archive` | 归档     |

## 管理员

所有管理接口需要 `ADMIN` 角色。

| 方法 | 路径                             | 说明     |
| ---- | -------------------------------- | -------- |
| -    | `/api/admin/users/*`             | 用户管理 |
| -    | `/api/admin/wordbooks/*`         | 词书管理 |
| -    | `/api/admin/logs/*`              | 日志查看 |
| -    | `/api/admin/quality/*`           | 质量监控 |
| -    | `/api/admin/ops/*`               | 运维操作 |
| -    | `/api/admin/llm/*`               | LLM任务  |
| -    | `/api/admin/analytics/*`         | 分析统计 |
| GET  | `/api/admin/statistics`          | 系统统计 |
| GET  | `/api/admin/metrics/error-rate`  | 错误率   |
| GET  | `/api/admin/metrics/performance` | 性能指标 |

## 其他

| 路径前缀                   | 说明       |
| -------------------------- | ---------- |
| `/api/alerts`              | 告警系统   |
| `/api/badges`              | 成就徽章   |
| `/api/experiments`         | A/B实验    |
| `/api/optimization`        | 优化器     |
| `/api/tracking`            | 埋点追踪   |
| `/api/llm-advisor`         | LLM顾问    |
| `/api/habit-profile`       | 习惯画像   |
| `/api/learning-sessions`   | 学习会话   |
| `/api/learning-objectives` | 学习目标   |
| `/api/algorithm-config`    | 算法配置   |
| `/api/visual-fatigue`      | 视觉疲劳   |
| `/api/word-contexts`       | 单词上下文 |
| `/api/word-mastery`        | 精熟度     |
| `/health`                  | 健康检查   |
