# Danci - 智能单词学习系统

基于 **AMAS (Adaptive Multi-dimensional Awareness System)** 的自适应单词学习平台。

## 核心特性

### AMAS 智能学习引擎

- **四维状态监测**: 实时追踪注意力、疲劳度、认知能力、学习动机
- **LinUCB 算法**: 基于上下文的多臂老虎机算法，优化单词选择策略
- **Thompson 采样**: 贝叶斯方法实现探索与利用的平衡
- **FSRS 调度器**: 自由间隔重复调度算法，基于遗忘曲线智能安排复习

### 视觉疲劳检测

- **Rust WASM 加速**: 所有检测算法使用 Rust 编写并编译为 WASM，帧率达 10FPS
- **EAR 计算**: 增强版 34 点眼睛纵横比计算，含虹膜可见度分析
- **PERCLOS 检测**: 滑动窗口 PERCLOS 疲劳指标计算
- **眨眼与哈欠检测**: 状态机眨眼检测 + MAR 打哈欠检测

### 词汇学习功能

- **智能单词卡片**: 支持发音、例句、词源分析
- **词源词根分析**: 深入理解单词构成，增强记忆
- **掌握度追踪**: 多维度评估单词掌握程度
- **学习会话管理**: 支持会话恢复和进度同步

## 技术栈

| 层级          | 技术                                    |
| ------------- | --------------------------------------- |
| **前端**      | React 18, TypeScript, Vite, TailwindCSS |
| **后端**      | Rust, Axum, SQLx, Tokio                 |
| **数据库**    | PostgreSQL, Redis                       |
| **WASM 模块** | Rust + wasm-bindgen (视觉疲劳检测)      |

## 快速导航

- [Docker 部署](DOCKER.md) - 一键部署到服务器
- [本地开发](DEVELOPMENT.md) - 本地开发环境配置
- [系统架构](ARCHITECTURE.md) - 后端与前端架构说明
- [API 接口](API.md) - 完整 API 参考文档
- [AMAS 引擎](AMAS.md) - 核心学习算法详解

## 一键部署

```bash
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/deploy/deploy.sh | sudo bash
```

部署完成后访问 `http://服务器IP:5173` 即可使用。
