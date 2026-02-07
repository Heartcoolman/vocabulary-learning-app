## ADDED Requirements

### Requirement: Sidecar 二进制编译

系统 SHALL 在构建流程中编译 backend-rust 为 sidecar 二进制文件。

#### Scenario: 本地构建 sidecar

- **WHEN** 开发者执行本地构建
- **THEN** 先编译 `packages/backend-rust` 为 release 二进制
- **AND** 将产物复制到 `packages/tauri-app/src-tauri/binaries/danci-backend-<target-triple>`
- **AND** target triple 与当前构建目标一致（如 `x86_64-pc-windows-msvc`）

#### Scenario: CI 构建 sidecar

- **WHEN** GitHub Actions 执行 Windows 构建
- **THEN** 在 `pnpm tauri build` 之前先执行 `cargo build --release --manifest-path packages/backend-rust/Cargo.toml --target x86_64-pc-windows-msvc`
- **AND** 将编译产物复制到 `packages/tauri-app/src-tauri/binaries/danci-backend-x86_64-pc-windows-msvc.exe`

### Requirement: Sidecar 打包进安装包

系统 SHALL 将 sidecar 二进制文件打包进 NSIS 安装包。

#### Scenario: 安装包包含 sidecar

- **WHEN** `pnpm tauri build` 完成
- **THEN** 生成的 NSIS 安装包包含 `danci-backend-x86_64-pc-windows-msvc.exe`
- **AND** 安装后该文件位于应用安装目录

#### Scenario: 安装包大小变化

- **WHEN** 构建完成（含 sidecar）
- **THEN** 安装包大小约为 165-188MB（原 160-180MB + sidecar ~5-8MB）

## MODIFIED Requirements

### Requirement: GitHub Actions 构建流程

系统 SHALL 提供自动化构建流程。

#### Scenario: Windows 构建触发

- **WHEN** 推送 tag (如 `v1.0.0`) 到 main 分支
- **THEN** 触发 GitHub Actions 构建 Windows 安装包

#### Scenario: Release 自动发布

- **WHEN** 构建成功
- **THEN** 自动创建 GitHub Release
- **AND** 上传安装包作为 Release 资产

#### Scenario: 前端构建正确识别 Tauri 环境

- **WHEN** CI 执行 "Build frontend" 步骤
- **THEN** 设置 `TAURI_ENV_PLATFORM=windows` 环境变量
- **AND** Vite 使用 `base: './'`（相对路径）构建前端
- **AND** 构建产物中所有资源引用为相对路径

#### Scenario: Sidecar 编译步骤

- **WHEN** CI 执行构建流程
- **THEN** 在 Tauri 构建之前执行 sidecar 编译步骤
- **AND** 编译 backend-rust 为 `x86_64-pc-windows-msvc` 目标
- **AND** 将二进制复制到 `src-tauri/binaries/` 并添加 target triple 后缀

### Requirement: 最低系统要求

系统 SHALL 满足以下最低系统要求。

#### Scenario: Windows 版本要求

- **WHEN** 用户尝试安装应用
- **THEN** 要求 Windows 10 版本 1903 (Build 18362) 或更高版本
- **AND** 不支持 Windows 7/8/8.1

#### Scenario: 硬件要求

- **WHEN** 检查系统要求
- **THEN** 最低 RAM 要求为 4GB
- **AND** 最低磁盘空间要求为 500MB
- **AND** 最低屏幕分辨率为 1024x768

#### Scenario: 安装包大小

- **WHEN** 构建完成
- **THEN** 安装包大小约为 165-188MB (含 WebView2 捆绑 + sidecar 二进制)
