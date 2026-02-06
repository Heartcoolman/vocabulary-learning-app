## ADDED Requirements

### Requirement: WASM 模块本地打包

系统 SHALL 将所有 WASM 模块打包到应用内部。

#### Scenario: WASM 文件嵌入

- **WHEN** Tauri 应用构建完成
- **THEN** `visual_fatigue_wasm.js` 和 `visual_fatigue_wasm_bg.wasm` 包含在应用资源中

#### Scenario: WASM 离线加载

- **WHEN** 应用在无网络环境下运行
- **THEN** WASM 模块从本地资源正确加载
- **AND** 所有 7 个算法模块 (EAR, PERCLOS, BlinkDetector, YawnDetector, HeadPoseEstimator, BlendshapeAnalyzer, FatigueScoreCalculator) 可用

### Requirement: MediaPipe 模型本地化

系统 SHALL 将 MediaPipe 模型文件打包到应用内部。

#### Scenario: 模型文件嵌入

- **WHEN** Tauri 应用构建完成
- **THEN** `face_landmarker.task` 模型文件包含在应用资源中

#### Scenario: 模型离线加载

- **WHEN** 初始化视觉疲劳检测
- **THEN** 从本地资源加载 MediaPipe 模型
- **AND** 不尝试从 CDN 下载

### Requirement: 资源加载路径适配

系统 SHALL 正确配置 Tauri 资源加载路径。

#### Scenario: WASM 加载路径

- **WHEN** Worker 加载 WASM 模块
- **THEN** 使用 `tauri://localhost/wasm/*` 协议路径
- **OR** 使用相对路径 `/wasm/*` (Tauri 自动解析)

#### Scenario: 模型加载路径

- **WHEN** MediaPipe 初始化
- **THEN** 使用 `tauri://localhost/models/*` 协议路径

### Requirement: CSP 配置适配

系统 SHALL 配置允许 WASM 执行的 CSP 策略。

#### Scenario: WASM 执行权限

- **WHEN** 检查 tauri.conf.json 的 CSP 配置
- **THEN** 包含 `'wasm-unsafe-eval'` 以允许 WASM 执行

#### Scenario: 本地资源访问

- **WHEN** 检查 CSP 配置
- **THEN** 允许 `tauri:` 和 `asset:` 协议

### Requirement: 资源完整性检查

系统 SHALL 在启动时验证关键资源完整性。

#### Scenario: WASM 完整性检查

- **WHEN** 应用启动
- **THEN** 验证 WASM 文件存在且可加载
- **AND** 加载失败时显示明确错误提示

#### Scenario: 优雅降级

- **WHEN** WASM 或 MediaPipe 加载失败
- **THEN** 视觉疲劳检测功能禁用
- **AND** 其他学习功能正常可用

### Requirement: MediaPipe GPU 回退

系统 SHALL 在 GPU 不可用时优雅降级。

#### Scenario: 默认推理后端

- **WHEN** 初始化 MediaPipe
- **THEN** 使用 MediaPipe 默认推理后端
- **AND** 不显式检测 GPU 可用性

#### Scenario: 推理失败降级

- **WHEN** MediaPipe 推理失败（任何原因）
- **THEN** 禁用视觉疲劳检测功能
- **AND** 在 UI 中显示"视觉疲劳检测暂不可用"
- **AND** 记录错误日志但不阻塞应用
- **AND** 其他学习功能正常可用
