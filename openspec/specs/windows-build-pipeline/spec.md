## ADDED Requirements

### Requirement: Windows NSIS 安装包

系统 SHALL 生成 Windows NSIS 安装包。

#### Scenario: 安装包生成

- **WHEN** 运行 `pnpm tauri build --target x86_64-pc-windows-msvc`
- **THEN** 生成 `Danci_x.x.x_x64-setup.exe` 安装包

#### Scenario: WebView2 捆绑安装

- **WHEN** 用户运行安装包且系统未安装 WebView2
- **THEN** 安装程序从捆绑的固定版本安装 WebView2 运行时 (~150MB)
- **AND** 不需要网络连接
- **AND** 确保完全离线可用

#### Scenario: 安装路径

- **WHEN** 用户完成安装
- **THEN** 应用安装到 `%LOCALAPPDATA%/Programs/Danci/`

### Requirement: GitHub Actions 构建流程

系统 SHALL 提供自动化构建流程。

#### Scenario: Windows 构建触发

- **WHEN** 推送 tag (如 `v1.0.0`) 到 main 分支
- **THEN** 触发 GitHub Actions 构建 Windows 安装包

#### Scenario: Release 自动发布

- **WHEN** 构建成功
- **THEN** 自动创建 GitHub Release
- **AND** 上传安装包作为 Release 资产

### Requirement: 版本号管理

系统 SHALL 保持版本号一致性。

#### Scenario: 版本号同步

- **WHEN** 检查 `tauri.conf.json` 和 `Cargo.toml`
- **THEN** 版本号一致

#### Scenario: 版本号来源

- **WHEN** 构建时确定版本号
- **THEN** 从 `tauri.conf.json` 中读取

### Requirement: 构建环境配置

系统 SHALL 记录构建环境要求。

#### Scenario: 构建依赖

- **WHEN** 在新环境构建
- **THEN** 需要 Rust (stable), Node.js 20+, pnpm 10.24.0+

#### Scenario: Windows SDK

- **WHEN** 在 Windows 上构建
- **THEN** 需要 Visual Studio Build Tools 和 Windows 10 SDK

### Requirement: 应用图标配置

系统 SHALL 配置应用图标。

#### Scenario: 图标文件存在

- **WHEN** 检查 `packages/tauri-app/src-tauri/icons/`
- **THEN** 存在 `icon.ico` (Windows), `icon.icns` (macOS), `32x32.png`, `128x128.png`

#### Scenario: 安装包图标

- **WHEN** 查看安装包属性
- **THEN** 显示正确的应用图标

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
- **THEN** 安装包大小约为 160-180MB (含 WebView2 捆绑)

### Requirement: 代码签名策略

系统 SHALL 明确代码签名策略为 V1 不签名。

#### Scenario: 未签名安装包

- **WHEN** 用户下载并运行安装包
- **THEN** Windows SmartScreen 显示"未知发布者"警告
- **AND** 用户需点击"更多信息"→"仍要运行"
- **AND** README 中说明此行为属于正常

#### Scenario: 未来签名计划

- **WHEN** 项目达到稳定版本且有预算
- **THEN** 考虑购买 EV 代码签名证书消除警告
