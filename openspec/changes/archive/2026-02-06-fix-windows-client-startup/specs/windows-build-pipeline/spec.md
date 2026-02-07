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
