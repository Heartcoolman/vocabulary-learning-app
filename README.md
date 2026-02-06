# Danci - 智能单词学习系统

<p align="center">
  <strong>基于 AMAS 自适应学习引擎的智能单词学习平台</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%2018-61dafb?style=flat-square&logo=react" alt="React 18">
  <img src="https://img.shields.io/badge/Backend-Rust%20%2B%20Axum-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat-square&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Cache-Redis-dc382d?style=flat-square&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/Desktop-Tauri%202-24C8DB?style=flat-square&logo=tauri" alt="Tauri 2">
</p>

<p align="center">
  <a href="https://heartcoolman.github.io/vocabulary-learning-app/">📖 文档</a> •
  <a href="https://heartcoolman.github.io/vocabulary-learning-app/DOCKER">🚀 快速开始</a> •
  <a href="https://heartcoolman.github.io/vocabulary-learning-app/CHANGELOG">📝 更新日志</a>
</p>

---

## 核心特性

| 功能               | 说明                                                   |
| ------------------ | ------------------------------------------------------ |
| **AMAS 智能引擎**  | LinUCB + Thompson 采样 + FSRS 调度器，智能优化学习策略 |
| **视觉疲劳检测**   | Rust WASM 加速，实时监测眨眼与哈欠，保护学习者健康     |
| **词汇学习**       | 智能单词卡片、词源分析、掌握度追踪                     |
| **Windows 桌面版** | 一键安装、完全离线、数据本地存储                       |
| **暗黑模式**       | 全站支持，自动跟随系统偏好                             |

## 一键部署

### Zeabur（最简单）

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/2K1A1P)

### 服务器部署

```bash
curl -fsSL https://raw.githubusercontent.com/heartcoolman/vocabulary-learning-app/main/deploy/deploy.sh | sudo bash
```

部署完成后访问 `http://服务器IP:5173`

## Windows 桌面客户端

无需服务器，一键安装，开箱即用！

### 下载安装（稳定版）

前往 [Releases](https://github.com/heartcoolman/vocabulary-learning-app/releases) 页面下载：

- **Danci-windows-x64-setup.exe** - Windows 64 位安装包（下载后直接双击安装）
- **Danci-windows-x64-setup.exe.sha256** - 安装包校验文件

### 下载安装（CI 最新构建）

若想提前体验最新构建，可在 [Actions / Build Desktop](https://github.com/heartcoolman/vocabulary-learning-app/actions/workflows/build-desktop.yml) 下载 artifact：

- **windows-client-ready**（包含 `Danci-windows-x64-setup.exe` 与 `.sha256`）

### 系统要求

| 项目       | 最低要求              |
| ---------- | --------------------- |
| 操作系统   | Windows 10 版本 1903+ |
| 内存       | 4GB RAM               |
| 磁盘空间   | 500MB                 |
| 屏幕分辨率 | 1024×768              |

### SmartScreen 警告说明

首次运行时，Windows SmartScreen 可能显示 "Windows 已保护你的电脑" 警告。这是因为安装包未经 Microsoft 代码签名认证。

**解决方法**：点击 "更多信息" → "仍要运行" 即可正常安装。

### 桌面版特性

- 完全离线可用，无需网络连接
- 数据存储在本地 SQLite 文件，隐私安全
- 首次运行引导向导，轻松上手
- 支持窗口状态记忆

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev
```

## 技术栈

| 层级       | 技术                                    |
| ---------- | --------------------------------------- |
| **前端**   | React 18, TypeScript, Vite, TailwindCSS |
| **后端**   | Rust, Axum, SQLx, Tokio                 |
| **数据库** | PostgreSQL (服务器), SQLite (桌面)      |
| **缓存**   | Redis                                   |
| **桌面**   | Tauri 2                                 |
| **WASM**   | Rust + wasm-bindgen (视觉疲劳检测)      |

## 文档

详细文档请访问 **[Danci 文档站点](https://heartcoolman.github.io/vocabulary-learning-app/)**

- [Docker 部署](https://heartcoolman.github.io/vocabulary-learning-app/DOCKER)
- [本地开发](https://heartcoolman.github.io/vocabulary-learning-app/DEVELOPMENT)
- [系统架构](https://heartcoolman.github.io/vocabulary-learning-app/ARCHITECTURE)
- [API 接口](https://heartcoolman.github.io/vocabulary-learning-app/API)
- [AMAS 引擎](https://heartcoolman.github.io/vocabulary-learning-app/AMAS)
- [更新日志](https://heartcoolman.github.io/vocabulary-learning-app/CHANGELOG)

## 许可证

MIT License

---

<p align="center">
  Made with ❤️ by the Danci Team
</p>
