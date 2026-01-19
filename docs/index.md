---
layout: home

hero:
  name: Danci
  text: 智能单词学习系统
  tagline: 基于 AMAS 自适应学习引擎，让单词记忆更高效
  actions:
    - theme: brand
      text: 快速开始
      link: /DOCKER
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/Heartcoolman/vocabulary-learning-app

features:
  - icon: 🧠
    title: AMAS 智能引擎
    details: 四维状态监测 + LinUCB 算法 + Thompson 采样 + FSRS 调度器，智能优化学习策略
  - icon: 👁️
    title: 视觉疲劳检测
    details: Rust WASM 加速，EAR/PERCLOS 计算，实时监测眨眼与哈欠，保护学习者健康
  - icon: 📚
    title: 词汇学习功能
    details: 智能单词卡片、词源词根分析、掌握度追踪、学习会话管理
  - icon: ⚡
    title: 现代技术栈
    details: React 18 + Rust + PostgreSQL，高性能、类型安全、可扩展
---

## 一键部署

```bash
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/deploy/deploy.sh | sudo bash
```

部署完成后访问 `http://服务器IP:5173` 即可使用。

## 技术栈

| 层级          | 技术                                    |
| ------------- | --------------------------------------- |
| **前端**      | React 18, TypeScript, Vite, TailwindCSS |
| **后端**      | Rust, Axum, SQLx, Tokio                 |
| **数据库**    | PostgreSQL, Redis                       |
| **WASM 模块** | Rust + wasm-bindgen (视觉疲劳检测)      |
