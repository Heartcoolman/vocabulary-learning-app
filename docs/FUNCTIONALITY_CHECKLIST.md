# Danci 功能检查清单

本文档将项目划分为10个功能模块，用于逐一检查各部分功能是否正常工作。

---

## 模块 1：认证与用户管理

**后端路由**: `/api/v1/auth/*`, `/api/users/*`
**前端页面**: `LoginPage`, `RegisterPage`, `ProfilePage`, `ForgotPasswordPage`, `ResetPasswordPage`

### 检查项

| #   | 功能点       | 检查方法                            | 预期结果                     |
| --- | ------------ | ----------------------------------- | ---------------------------- |
| 1.1 | 用户注册     | POST `/api/v1/auth/register`        | 创建新用户，返回 JWT token   |
| 1.2 | 用户登录     | POST `/api/v1/auth/login`           | 验证凭据，返回 JWT token     |
| 1.3 | Token 刷新   | POST `/api/v1/auth/refresh`         | 返回新的 access token        |
| 1.4 | 用户信息获取 | GET `/api/users/me`                 | 返回当前用户信息             |
| 1.5 | 用户信息更新 | PUT `/api/users/me`                 | 更新成功                     |
| 1.6 | 密码重置请求 | POST `/api/v1/auth/forgot-password` | 发送重置邮件                 |
| 1.7 | 前端登录页面 | 访问 `/login`                       | 页面正常渲染，可输入凭据     |
| 1.8 | 前端注册页面 | 访问 `/register`                    | 页面正常渲染，可填写注册表单 |
| 1.9 | 前端个人资料 | 访问 `/profile`                     | 显示用户信息，可编辑         |

---

## 模块 2：词书与单词管理

**后端路由**: `/api/wordbooks/*`, `/api/words/*`, `/api/admin/wordbooks/*`
**前端页面**: `WordListPage`, `VocabularyPage`, `WordBookDetailPage`

### 检查项

| #    | 功能点         | 检查方法                                                | 预期结果                                                |
| ---- | -------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 2.1  | 词书列表       | GET `/api/wordbooks`                                    | 返回用户可用词书列表                                    |
| 2.2  | 词书详情       | GET `/api/wordbooks/:id`                                | 返回词书信息（不含单词列表）                            |
| 2.2a | 词书单词列表   | GET `/api/wordbooks/:id/words`                          | 返回该词书的单词列表（支持分页：`?page=1&pageSize=20`） |
| 2.3  | 用户选择词书   | PUT `/api/study-config` `{"selectedWordBookId": "..."}` | 设置当前学习词书（通过学习配置接口）                    |
| 2.4  | 单词搜索       | GET `/api/words/search?q=xxx`                           | 返回匹配单词                                            |
| 2.5  | 单词详情       | GET `/api/words/:id`                                    | 返回单词完整信息（释义、例句、音标）                    |
| 2.6  | 用户批量导入   | POST `/api/wordbooks/:id/words/batch`                   | 向用户词书批量导入单词                                  |
| 2.6a | 管理员批量导入 | POST `/api/admin/wordbooks/:id/words/batch`             | 向任意词书批量导入单词（管理员）                        |
| 2.7  | 前端词书详情页 | 访问 `/wordbooks/:id`                                   | 显示词书信息和单词列表                                  |
| 2.8  | 前端词库页面   | 访问 `/vocabulary`                                      | 显示词书选择和单词列表                                  |

---

## 模块 3：核心学习功能

**后端路由**: `/api/learning/*`, `/api/records/*`, `/api/learning-sessions/*`
**前端页面**: `LearningPage`
**核心组件**: `WordCard`, `AmasSuggestion`, `SuggestionModal`

### 检查项

| #   | 功能点        | 检查方法                             | 预期结果                  |
| --- | ------------- | ------------------------------------ | ------------------------- |
| 3.1 | 获取学习单词  | GET `/api/learning/next`             | 返回下一个待学习单词      |
| 3.2 | 提交答题结果  | POST `/api/records`                  | 记录用户答题，更新状态    |
| 3.3 | 批量提交记录  | POST `/api/records/batch`            | 批量保存学习记录          |
| 3.4 | 学习统计      | GET `/api/records/statistics`        | 返回今日/总体学习统计     |
| 3.5 | 学习会话创建  | POST `/api/learning-sessions`        | 创建新学习会话            |
| 3.6 | 学习会话结束  | PUT `/api/learning-sessions/:id/end` | 结束会话，计算统计        |
| 3.7 | 前端学习页面  | 访问 `/learn`                        | WordCard 正常显示，可答题 |
| 3.8 | 答题交互      | 在 WordCard 上作答                   | 动画反馈正常，状态更新    |
| 3.9 | AMAS 建议显示 | 答题后查看                           | 显示学习策略建议          |

---

## 模块 4：AMAS 自适应学习引擎

**后端路由**: `/api/amas/*`
**核心模块**: `amas/engine.rs`, `amas/decision/*`, `amas/modeling/*`
**前端**: `ExplainabilityModal`

### 检查项

| #   | 功能点        | 检查方法                 | 预期结果                |
| --- | ------------- | ------------------------ | ----------------------- |
| 4.1 | 事件处理      | POST `/api/amas/event`   | 返回策略调整和用户状态  |
| 4.2 | 用户状态获取  | GET `/api/amas/state`    | 返回 A/F/C/M/T 五维状态 |
| 4.3 | 策略参数获取  | GET `/api/amas/strategy` | 返回当前学习策略参数    |
| 4.4 | 冷启动检测    | 新用户首次学习           | 触发冷启动流程          |
| 4.5 | LinUCB 决策   | 持续学习后检查           | 策略根据表现动态调整    |
| 4.6 | Thompson 采样 | 持续学习后检查           | 探索-利用平衡正常       |
| 4.7 | 解释性接口    | GET `/api/amas/explain`  | 返回决策解释            |
| 4.8 | 前端解释弹窗  | 点击"为什么推荐这个"     | 显示 AMAS 决策解释      |

---

## 模块 5：单词状态与掌握度管理

**后端路由**: `/api/word-states/*`, `/api/word-scores/*`, `/api/word-mastery/*`
**前端页面**: `WordMasteryPage`

### 检查项

| #   | 功能点       | 检查方法                                | 预期结果                                  |
| --- | ------------ | --------------------------------------- | ----------------------------------------- |
| 5.1 | 单词状态获取 | GET `/api/word-states/:wordId`          | 返回单词学习状态                          |
| 5.2 | 批量状态获取 | POST `/api/word-states/batch`           | 返回多个单词状态                          |
| 5.3 | 状态更新     | PUT `/api/word-states/:wordId`          | 更新状态成功                              |
| 5.4 | 单词分数获取 | GET `/api/word-scores/:wordId`          | 返回准确度/速度/稳定性分数                |
| 5.5 | 低分单词列表 | GET `/api/word-scores/low?threshold=60` | 返回需重点复习的单词                      |
| 5.6 | 掌握度统计   | GET `/api/word-mastery/stats`           | 返回 NEW/LEARNING/REVIEWING/MASTERED 分布 |
| 5.7 | 需复习单词   | GET `/api/word-mastery/due`             | 返回到期需复习的单词                      |
| 5.8 | 前端掌握度页 | 访问 `/word-mastery`                    | 显示掌握度分布图表                        |

---

## 模块 6：用户画像与习惯分析

**后端路由**: `/api/habit-profile/*`, `/api/visual-fatigue/*`, `/api/tracking/*`
**前端组件**: `HabitHeatmap`, `FatigueAlertModal`

### 检查项

| #   | 功能点       | 检查方法                         | 预期结果               |
| --- | ------------ | -------------------------------- | ---------------------- |
| 6.1 | 习惯画像获取 | GET `/api/habit-profile`         | 返回用户学习习惯数据   |
| 6.2 | 习惯画像更新 | 持续学习后检查                   | 画像数据自动更新       |
| 6.3 | 视觉疲劳检测 | GET `/api/visual-fatigue/status` | 返回当前疲劳状态       |
| 6.4 | 疲劳事件上报 | POST `/api/visual-fatigue/event` | 记录疲劳事件           |
| 6.5 | 学习追踪记录 | POST `/api/tracking/event`       | 记录用户行为事件       |
| 6.6 | 追踪数据查询 | GET `/api/tracking/events`       | 返回用户行为历史       |
| 6.7 | 前端热力图   | 查看 HabitHeatmap 组件           | 显示学习时间分布热力图 |
| 6.8 | 疲劳提醒弹窗 | 长时间学习后                     | 弹出休息建议           |

---

## 模块 7：统计与历史记录

**后端路由**: `/api/records/statistics`, `/api/learning-sessions/*`
**前端页面**: `StatisticsPage`, `HistoryPage`
**前端组件**: `LineChart`

### 检查项

| #   | 功能点       | 检查方法                                   | 预期结果             |
| --- | ------------ | ------------------------------------------ | -------------------- |
| 7.1 | 今日统计     | GET `/api/records/statistics?period=today` | 返回今日学习数据     |
| 7.2 | 周统计       | GET `/api/records/statistics?period=week`  | 返回本周学习趋势     |
| 7.3 | 月统计       | GET `/api/records/statistics?period=month` | 返回本月学习数据     |
| 7.4 | 历史会话列表 | GET `/api/learning-sessions`               | 返回历史学习会话     |
| 7.5 | 会话详情     | GET `/api/learning-sessions/:id`           | 返回会话详细记录     |
| 7.6 | 前端统计页面 | 访问 `/statistics`                         | 显示图表和统计数据   |
| 7.7 | 前端历史页面 | 访问 `/history`                            | 显示历史学习记录列表 |
| 7.8 | 趋势图表     | 查看 LineChart                             | 正确渲染学习曲线     |

---

## 模块 8：通知与计划系统

**后端路由**: `/api/notifications/*`, `/api/plan/*`, `/api/learning-objectives/*`
**前端服务**: `NotificationClient`, `PreferencesClient`

### 检查项

| #   | 功能点       | 检查方法                          | 预期结果         |
| --- | ------------ | --------------------------------- | ---------------- |
| 8.1 | 通知列表     | GET `/api/notifications`          | 返回用户通知列表 |
| 8.2 | 通知标记已读 | PUT `/api/notifications/:id/read` | 标记成功         |
| 8.3 | 学习计划获取 | GET `/api/plan`                   | 返回当前学习计划 |
| 8.4 | 学习计划更新 | PUT `/api/plan`                   | 更新计划成功     |
| 8.5 | 学习目标列表 | GET `/api/learning-objectives`    | 返回用户学习目标 |
| 8.6 | 创建学习目标 | POST `/api/learning-objectives`   | 创建目标成功     |
| 8.7 | 偏好设置获取 | GET `/api/preferences`            | 返回用户偏好设置 |
| 8.8 | 偏好设置更新 | PUT `/api/preferences`            | 更新偏好成功     |

---

## 模块 9：实验与优化系统

**后端路由**: `/api/experiments/*`, `/api/evaluation/*`, `/api/optimization/*`, `/api/algorithm-config/*`
**前端页面**: `ExperimentDashboard`

### 检查项

| #   | 功能点         | 检查方法                            | 预期结果           |
| --- | -------------- | ----------------------------------- | ------------------ |
| 9.1 | 实验列表       | GET `/api/experiments`              | 返回 A/B 测试列表  |
| 9.2 | 实验详情       | GET `/api/experiments/:id`          | 返回实验配置和结果 |
| 9.3 | 用户实验分组   | GET `/api/experiments/assignment`   | 返回用户所属实验组 |
| 9.4 | 评估指标获取   | GET `/api/evaluation/metrics`       | 返回系统评估指标   |
| 9.5 | 优化建议       | GET `/api/optimization/suggestions` | 返回学习优化建议   |
| 9.6 | 算法配置获取   | GET `/api/algorithm-config`         | 返回当前算法参数   |
| 9.7 | 算法配置更新   | PUT `/api/algorithm-config`         | 更新参数成功       |
| 9.8 | 前端实验仪表盘 | 访问 `/admin/experiments`           | 显示实验管理界面   |

---

## 模块 10：管理后台

**后端路由**: `/api/admin/*`
**前端页面**:

- `/admin/users` - 用户管理 (`UserManagementPage`)
- `/admin/word-quality` - 单词质量 (`WordQualityPage`)
- `/admin/llm-advisor` - LLM 顾问 (`LLMAdvisorPage`)
- `/admin/debug` - 系统调试 (`SystemDebugPage`)
- `/admin/statistics` - 后台统计 (`StatisticsPage`)

### 检查项

| #     | 功能点           | 检查方法                      | 预期结果                 |
| ----- | ---------------- | ----------------------------- | ------------------------ |
| 10.1  | 管理员权限验证   | 非管理员访问 `/admin/*`       | 返回 403 Forbidden       |
| 10.2  | 用户列表         | GET `/api/admin/users`        | 返回所有用户列表         |
| 10.3  | 用户详情         | GET `/api/admin/users/:id`    | 返回用户详细信息         |
| 10.4  | 用户数据导出     | GET `/api/admin/users/export` | 导出 Excel/CSV           |
| 10.5  | 系统词书管理     | GET `/api/admin/wordbooks`    | 返回系统词书列表         |
| 10.6  | 单词质量检查     | GET `/api/admin/quality`      | 返回单词质量报告         |
| 10.7  | 系统日志查看     | GET `/api/admin/logs`         | 返回系统日志             |
| 10.8  | 系统运维操作     | POST `/api/admin/ops/*`       | 执行运维操作             |
| 10.9  | LLM 顾问管理     | GET `/api/llm-advisor/*`      | LLM 服务状态和配置       |
| 10.10 | 前端用户管理页面 | 访问 `/admin/users`           | 正常显示用户管理界面     |
| 10.11 | 前端单词质量页面 | 访问 `/admin/word-quality`    | 正常显示单词质量检查界面 |
| 10.12 | 前端系统调试页面 | 访问 `/admin/debug`           | 正常显示系统调试界面     |

---

## 附录：快速启动检查

### 后端启动

```bash
cd packages/backend-rust
cargo run
# 检查: 服务监听端口，日志无错误
```

### 前端启动

```bash
cd packages/frontend
pnpm dev
# 检查: Vite 启动成功，页面可访问
```

### 健康检查

```bash
curl http://localhost:3000/health
# 预期: {"status":"ok"}
```

### 数据库连接

```bash
curl http://localhost:3000/api/health
# 预期: 返回数据库连接状态
```

---

## 检查状态记录

| 模块                | 状态      | 检查日期 | 备注 |
| ------------------- | --------- | -------- | ---- |
| 1. 认证与用户管理   | ⬜ 待检查 | -        | -    |
| 2. 词书与单词管理   | ⬜ 待检查 | -        | -    |
| 3. 核心学习功能     | ⬜ 待检查 | -        | -    |
| 4. AMAS 自适应引擎  | ⬜ 待检查 | -        | -    |
| 5. 单词状态与掌握度 | ⬜ 待检查 | -        | -    |
| 6. 用户画像与习惯   | ⬜ 待检查 | -        | -    |
| 7. 统计与历史记录   | ⬜ 待检查 | -        | -    |
| 8. 通知与计划系统   | ⬜ 待检查 | -        | -    |
| 9. 实验与优化系统   | ⬜ 待检查 | -        | -    |
| 10. 管理后台        | ⬜ 待检查 | -        | -    |
