# 更新日志

## v1.6.3

### 2026-01-21 - AMAS 算法增强与 About 页面展示

**AMAS 决策算法增强**

- Thompson Sampling 新增上下文感知，学习效果更精准
- LinUCB 优化特征交互，策略推荐更智能
- 冷启动加速，新用户更快进入个性化学习
- Ensemble 集成器自适应权重，决策更稳定
- 新增 ELO 评分，量化学习能力成长
- 新增 ZPD (最近发展区) 分析，精准匹配学习难度

**About 页面算法展示**

- About 首页学习层新增 FSRS 个性化间隔调度算法
- About 首页建模层新增 TrendAnalyzer 学习趋势洞察
- AboutDataFlow 数据流页面新增 FSRS 算法权重可视化
- AboutDataFlow 新增「建模层算法」面板，展示 5 个核心算法实时状态

**建模层算法面板**

- 注意力监测 (Attention Monitor) - 实时追踪
- 疲劳估计 (Fatigue Estimator) - 多源融合
- 认知画像 (Cognitive Profiler) - 能力建模
- 动机追踪 (Motivation Tracker) - 情绪识别
- 趋势分析 (TrendAnalyzer) - 掌握预测

**Bug 修复**

- 修复权重默认值处理使用 `||` 导致有效 `0` 值被误判的问题
- 修复 ELO 迁移中不存在的 frequency 列引用

---

## v1.6.2

### 2026-01-20 - 系统版本与 OTA 更新

**系统版本显示**

- 管理后台显示当前系统版本号
- 自动检测 GitHub Release 最新版本
- 有更新时显示提示徽章和版本号

**OTA 远程更新**

- 管理员可在后台一键触发系统更新
- 支持更新进度显示和状态追踪
- 更新阶段：下载镜像 → 重启服务 → 完成

**Bug 修复**

- 修复 Rust 代码格式化检查失败
- 修复 AdminDashboard 测试 mock 缺失问题
- 修复部署脚本迁移检测逻辑

---

## v1.6.1

### 2026-01-20 - 管理面板独立化与用户角色管理

**管理面板独立化**

- 独立管理后台入口 `/admin-login` 和 `/admin`
- 独立 admin bundle（Vite 多入口构建）
- 深色主题管理登录页面
- 管理员专用路由守卫

**用户角色管理**

- 新增 `BANNED` 角色，支持用户封禁
- 管理员可切换用户角色（USER / ADMIN / BANNED）
- 登录与 Token 验证双重封禁检查
- 角色变更后自动清除用户会话与 Redis 缓存

**部署优化**

- 部署脚本新增 `update` 命令，支持快速版本更新
- 首次部署自动创建管理员账户并显示凭据
- `seed-admin` CLI 子命令用于安全创建管理员

---

## v1.6.0

### 2026-01-19 - 一键部署脚本与文档站点

**一键部署脚本**

- 新增 `deploy/deploy.sh` 中文一键部署脚本
- 自动安装 Docker 和 Docker Compose
- 自动生成安全密钥（JWT、数据库密码）
- 使用 GitHub 预构建镜像，无需本地编译
- 等待数据库就绪并校验迁移完成状态

**文档站点**

- 迁移至 VitePress 文档框架
- 切换至 @sugarat/theme 糖糖主题
- 添加使用教程、部署配置、更新日志等文档

**CI/CD 优化**

- 移除 CI 中的数据库迁移步骤
- 修复 Windows 构建时文件名包含冒号的问题
- 添加 pnpm overrides 解决 zod 版本冲突

---

## v1.5.5

### 2026-01-08 - CI/CD 增强与词源分析

**词源分析服务**

- 实现词源路由、服务和后台工作器
- 支持单词起源和词素分析
- 前端词源展示组件

**FSRS 调度器**

- 实现自由间隔重复调度算法
- 添加缓存基础设施

**CI/CD 增强**

- 新增 Rust CI 工作流
- 新增 E2E 测试集成 PostgreSQL 和 Redis
- 新增覆盖率检查

**Native 模块升级**

- napi/napi-derive 从 2.16 升级到 3.x
- @napi-rs/cli 从 2.18.4 升级到 3.5.1

---

## v1.5.2

### 2025-12-29 - 分析、LLM 和部署优化

**后端**

- 添加分析和 LLM 数据库操作及管理端路由
- 扩展 admin service、insight generator、learning state
- 优化 Dockerfile

**前端**

- 新页面：PreferencesPage、LLMTasksPage、WordDetailModal
- UI 组件增强：Alert、Checkbox、Modal、Progress、Select、Toast

---

## v1.5.1

### 2025-12-28 - 暗黑模式全面支持

**主题系统**

- ThemeContext + 系统偏好检测
- ThemeToggle 手动切换组件
- Tailwind `darkMode: 'class'` 配置

**组件暗黑模式覆盖**

- UI 基础组件：Alert, Avatar, Badge, Button, Card, Input, Modal, Table 等 30+ 组件
- 图表组件：PerformanceTrendChart, WeightRadarChart, LearningCurveChart 等
- 业务组件：FloatingEyeIndicator, 视觉疲劳组件, 徽章/掌握度组件
- 页面组件：认证、主页面、管理、关于页面全覆盖

---

## v1.5.0

### 2025-12-27 - AMAS 算法增强与数据库简化

**AMAS 决策算法**

- LinUCB 上下文探索算法
- Thompson 采样概率选择算法
- 更新 ensemble 和 coldstart 决策模块

**数据库层简化**

- 移除旧版同步模块：dual-write manager, conflict resolver, sync manager

**文档**

- 添加功能清单和架构图

---

## v1.4.2

### 2025-12-18 - Rust 后端迁移完成 & 视觉疲劳 WASM

**后端迁移**

- 删除 Node.js 后端 (`packages/backend/`)
- 更新 docker-compose.yml 和 nginx.conf
- 更新 package.json 脚本指向 Rust 后端

**视觉疲劳 WASM 模块**

| 模块                   | 功能                                |
| ---------------------- | ----------------------------------- |
| EARCalculator          | 增强版 34 点 EAR 计算，含虹膜可见度 |
| PERCLOSCalculator      | 滑动窗口 PERCLOS 计算               |
| BlinkDetector          | 状态机眨眼检测                      |
| YawnDetector           | MAR 计算和打哈欠检测                |
| HeadPoseEstimator      | 矩阵/关键点头部姿态估计             |
| FatigueScoreCalculator | 加权综合疲劳评分                    |

**性能提升**

- 帧率从 5FPS 提升至 10FPS

---

## v1.4.1

### 2025-12-16 - SQLite 支持与项目清理

- 新增 SQLite 数据库模块和同步脚本
- 项目清理：删除临时文件，更新 .gitignore

---

## v1.4.0

### 2025-12-10 ~ 2025-12-15 - 视觉疲劳检测系统

**视觉疲劳检测**

- 实现视觉疲劳检测和前端组件重构
- 更新 AMAS 建模和视觉疲劳检测系统集成
- 禁用 in-memory 延迟奖励聚合器 + 放宽决策超时 + 并发安全
- 稳定前端 UX、AMAS 后端和测试

**AMAS 重构**

- 重组 AMAS 文件结构
- 合并视觉疲劳和 LLM 增强

---

## v1.3.2

### 2025-12-07 ~ 2025-12-09 - 前端重构与优化

**前端重构**

- 完成 Month 1 Week 1-2 重构任务
- Core API 迁移到 React Query
- 添加闪卡组件和增强前端/后端服务
- 添加路由预取和骨架屏优化

**代码质量**

- 添加 husky 和 commitlint
- 优化 lint-staged 配置
- 解决 TypeScript 和 ESLint 错误

---

## v1.3.1

### 2025-12-06 - Native 模块与测试增强

**Native 模块**

- 实现 Native LinUCB 模块 (Rust + napi-rs)
- 增强 LinUCB Rust 实现
- 添加 native Rust integration for AMAS components

**测试增强**

- 后端单元测试、API 集成测试
- 前端组件/页面/hooks 测试
- E2E 测试更新

**CI/CD**

- 添加 GitHub Actions 工作流
- 更新 Dockerfile 支持 Native 模块构建

---

## v1.3.0

### 2025-12-05 - Monorepo 重构

**架构重构**

- 完成 Monorepo 基础结构迁移
- AMAS 引擎模块化重构
- 代码模块化重构 + 测试精简

**新功能**

- 新增 LLM Advisor 功能
- 增强 AMAS 引擎 - 支持单词复习历史和暂停时间计算
- 集成 Sentry 监控 + 实验追踪系统

---

## v1.2.1

### 2025-12-03 ~ 2025-12-04 - 测试与 API 增强

**测试增强**

- 大规模补充单元测试和集成测试覆盖
- 补充嵌套组件和服务的单元测试
- 修复高中优先级问题 (14项) + 补全测试 (333+个)

**API 功能**

- 完整实现 30 个 API 功能
- 重大功能更新 - AMAS 增强、日志系统、学习目标
- LogAlertsPage 修复

**重构**

- 精简 AMAS 系统，移除纯研究工具模块
- 前端图标组件统一化和 UI 优化

---

## v1.2.0

### 2025-12-01 - Dashboard 增强与掌握度学习

**新功能**

- 增强 Dashboard 和统计页面
- 添加掌握度学习功能
- 增强 AMAS 决策流水线

**更新**

- 更新前端组件和服务
- 更新后端基础设施
- 清理和更新配置文件

---

## v1.1.2

### 2025-11-27 ~ 2025-11-30 - G3 动画与可视化

**UI 增强**

- 集成 G3 动画曲线系统
- 添加 AMAS Neural Pipeline 数据流可视化
- 增强 AMAS 系统 - 评估、优化与模拟测试

**代码质量**

- 修复类型导入错误并优化代码质量
- 更新 .gitignore 忽略敏感文件和临时文件

---

## v1.1.1

### 2025-11-25 ~ 2025-11-26 - AMAS 算法增强

**AMAS 增强**

- 实现 AMAS 智能学习算法增强功能
- 修复多个 bug 并完善 AMAS 增强功能

**重构**

- 清理冗余文档，优化代码结构和 UI 组件

---

## v1.1.0

### 2025-11-22 ~ 2025-11-24 - 词书系统与管理员功能

**词书系统**

- 添加词书系统、学习配置和管理员功能
- 添加小学词汇系统词书
- 完善图标系统、优化 UI 组件和修复数据库约束问题

**管理员系统**

- 完整的管理员系统和智能学习算法

---

## v1.0.0

### 2025-11-20 - 项目创建

- Initial commit: Vocabulary Learning App with cloud sync
- 初始化词汇学习应用项目
