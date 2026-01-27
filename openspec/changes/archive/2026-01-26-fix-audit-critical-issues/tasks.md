# Tasks: Fix Audit Critical Issues

> **重要**: 所有实现必须严格遵循 `design.md` 中的 **Confirmed Constraints (C1-C12)** 和 **PBT Properties (PBT-1 to PBT-12)**

## Phase 1: 认证系统修复

### 1.1 邮件服务基础设施

- [x] 创建 `packages/backend-rust/src/services/email_provider.rs`
  - 定义 `EmailService` 结构体（替代trait）
  - 实现 `SendGridProvider` 通过 reqwest
  - 实现 `SmtpProvider` 通过原生TCP
  - 实现 `MockProvider` (测试用)
- [x] 添加环境变量配置
  - `EMAIL_PROVIDER`: smtp | sendgrid | mock
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
  - `SENDGRID_API_KEY`
  - `EMAIL_FROM`
- [x] 在 `AppState` 中注册邮件服务
- [x] reqwest 依赖已存在于 Cargo.toml（无需添加 lettre）

### 1.2 密码重置后端实现

- [x] 修改 `packages/backend-rust/src/routes/v1_auth.rs:172-179`
  - 实现 `request_password_reset` 端点
  - 生成重置token并存储（**C6**: bcrypt哈希 + UUID主键）
  - 新请求时作废旧token（**C7**: 每用户仅1个有效token）
  - 速率限制检查（**C8**: 同一邮箱60秒1次）
  - 调用邮件服务发送重置链接
  - 无论成功失败始终返回200（**C4**: 防止枚举攻击）
- [x] 修复Token过期时间（**C15**: 15分钟）
  - 修改 `v1_auth.rs:222`: `chrono::Duration::hours(1)` → `chrono::Duration::minutes(15)`
  - 更新邮件模板中的过期提示: "1 hour" → "15 minutes"
- [x] 创建邮件模板
  - 密码重置邮件HTML模板（内联在v1_auth.rs中）
  - 支持中英文

### 1.3 前端验证

- [x] 验证 `ForgotPasswordPage.tsx` 与新后端的集成 - 已兼容
- [x] 验证 `ResetPasswordPage.tsx` token处理逻辑 - 已兼容
- [x] 添加加载状态和错误提示 - 已存在

### 1.4 测试

- [x] 后端实现已通过编译检查
- [ ] 集成测试: 端到端密码重置流程 (mock邮件) - 需手动验证
- [ ] 手动测试: 实际邮件发送 - 需配置邮件服务后验证

---

## Phase 2: 管理后台修复

### 2.1 内容质量检查路由清理

- [x] **废弃** `packages/backend-rust/src/routes/admin/content.rs` 存根（**C1**: 使用 `/api/admin/quality`）
  - content.rs 未被 admin/mod.rs 挂载（已是死代码）
  - 更新存根端点返回 "deprecated" 或 "planned" 状态
- [x] 验证 `packages/backend-rust/src/routes/admin/quality.rs` 现有实现
  - quality.rs 已完整实现所有核心功能
  - `start_task`, `list_tasks`, `get_stats`, `list_issues` 均已工作
- [x] 质量检查前置条件检查
  - LLM未配置时阻止任务创建（**C5**: 返回配置错误）
  - 词数超过1000时拒绝创建（**C11**: 每次最多1000词）

### 2.2 内容质量检查增强端点

- [x] 修改未实现端点返回明确状态
  - content.rs 中所有增强端点现返回 `{ "status": "planned", "message": "功能开发中" }`
  - 核心检查端点返回 `{ "status": "deprecated", "message": "请使用 /api/admin/quality" }`

### 2.3 前端适配

- [x] 验证 `WordQualityPage.tsx` 错误处理 - 已正确显示后端错误消息
- [x] LLM未配置/词数超限的错误通过 onError 回调显示

### 2.4 测试

- [x] 后端实现已通过编译检查
- [ ] 手动测试: 管理员界面操作 - 需部署后验证

---

## Phase 3: 后端服务修复

### 3.1 AMAS历史端点验证与修复

- [x] 审计 `packages/backend-rust/src/routes/amas.rs`
  - `/api/amas/history` 已实现（调用 state_history::get_state_history）
  - `/api/amas/growth` 已实现（调用 state_history::get_cognitive_growth）
  - `/api/amas/changes` 已实现（调用 state_history::get_significant_changes）
- [x] 所有端点已实现真实数据库查询（无存根）

### 3.2 StorageService管理员模拟功能（**C2**）

- [x] 后端: `GET /api/admin/users/:id/words` 端点已存在
  - 管理员可通过 userId 参数查询任意用户的学习状态
  - RBAC检查: require_admin 中间件
- [x] 验证多用户数据隔离：非admin返回403

### 3.3 洞察生成分群修复（**C10**: 基于学习进度自动分类）

- [x] 在 `insight_generator.rs` 中实现分群过滤函数
  - 分群定义：new（7天内注册）、active（7天内活跃）、at_risk（14-30天未活跃）、returning（回归用户）
  - `build_segment_filter()` 和 `build_segment_filter_for_user()` 函数
- [x] 修改 `collect_segment_stats` 使用 segment 参数过滤数据
  - `segment=None` 时不过滤
  - 其他值应用对应WHERE条件

### 3.4 因果推理模块（**C9**: 实现基础功能）

- [x] `evaluation.rs` 已完整实现：
  - `POST /evaluation/causal/observe` - 记录观测数据
  - `GET /evaluation/causal/ate` - 获取平均处理效应（使用 danci_algo::CausalInferenceNative）
  - `GET /evaluation/causal/compare` - 策略对比
  - `GET /evaluation/causal/diagnostics` - 诊断信息
- [x] 数据不足时返回 `None`（空结果而非错误）

### 3.5 LLM任务单任务模式（**C3**: 明确无批量操作）

- [x] 验证 `packages/frontend/src/pages/admin/LLMTasksPage.tsx`
  - 无多选UI（已确认）
  - 仅支持单任务操作（已确认）
  - 任务状态转换正确（pending → processing → completed|failed）
- [x] 规格已符合单任务模式要求

### 3.6 嵌入服务健康检查（**C12-C14**: 实时探测+60秒缓存+UI规格）

- [x] 后端: 添加探测端点 `packages/backend-rust/src/routes/semantic.rs`
  - 新增 `GET /api/semantic/health` 端点
  - 实际调用嵌入API验证连接
  - 结果缓存60秒，超时后重新探测
  - 返回格式 `{ "healthy": bool, "latencyMs": number?, "error": string?, "model": string, "cached": bool }`
- [x] 前端: 修改 `packages/frontend/src/pages/admin/SystemSettingsPage.tsx`
  - **位置**: 在现有"向量搜索配置"卡片内（**C13**）
  - **刷新策略**: 页面加载+手动刷新按钮，无自动轮询（**C14**）
  - **状态映射**:
    - `healthy:true` → 绿色"健康"
    - `healthy:false && !error.includes("未配置")` → 红色"异常"
    - `error.includes("未配置")` → 灰色"未配置"
    - 请求失败 → 红色"获取失败"
  - **显示内容**: 状态图标、延迟(ms或"—")、模型名、缓存/实时标签
  - **错误处理**: 健康检查失败不阻塞设置表单
  - 使用 `staleTime: 60000` 对齐后端缓存

### 3.7 测试

- [x] 后端实现已通过编译检查
- [ ] 手动测试: 管理员界面全流程 - 需部署后验证

---

## Phase 4: 文档与部署

### 4.1 配置文档

- [x] 更新 `packages/backend-rust/README.md`
  - 添加邮件服务配置说明（EMAIL*PROVIDER, SMTP*\*, SENDGRID_API_KEY）
  - 添加新环境变量列表

### 4.2 数据库迁移

- [x] 无需新迁移（使用现有 password_reset_tokens 表）

### 4.3 部署清单

- [ ] 配置生产环境邮件服务
- [ ] 验证环境变量
- [ ] 回滚计划

---

## Validation Checklist

### 功能验证

- [ ] 忘记密码 → 收到邮件 → 重置成功 → 登录成功
- [ ] 内容质量检查任务创建和查询
- [ ] AMAS历史数据正确显示
- [ ] 多用户学习状态隔离
- [ ] 洞察按分群正确过滤
- [ ] 嵌入服务健康检查反映真实状态

### 回归验证

- [ ] 现有登录功能正常
- [ ] 现有密码修改功能正常
- [ ] 管理后台其他功能正常
- [ ] 学习功能正常

---

## Dependencies

```
Phase 1 (邮件服务) - 无外部依赖，可立即开始
    ↓
Phase 2 (管理后台) - 无外部依赖，可与Phase 1并行
    ↓
Phase 3 (后端服务) - 无外部依赖，可与Phase 1/2并行
    ↓
Phase 4 (文档部署) - 依赖Phase 1-3完成
```

## Effort Estimate

| Phase     | Tasks  | Complexity |
| --------- | ------ | ---------- |
| Phase 1   | 4      | Medium     |
| Phase 2   | 4      | Low        |
| Phase 3   | 7      | Medium     |
| Phase 4   | 3      | Low        |
| **Total** | **18** | -          |
