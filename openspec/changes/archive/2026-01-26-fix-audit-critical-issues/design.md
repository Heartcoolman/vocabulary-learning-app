# Design: Fix Audit Critical Issues

## Overview

本文档描述修复8个P0严重问题的技术架构和实现方案。

## Confirmed Constraints (零决策约束)

以下约束已经用户确认，实现时**必须严格遵循**，无需再做决策：

| #   | 约束项                    | 确认值                                            |
| --- | ------------------------- | ------------------------------------------------- |
| C1  | 内容质量API路径           | 使用 `/api/admin/quality`，废弃 `content.rs` 存根 |
| C2  | StorageService userId语义 | 添加管理员模拟功能（userId + RBAC）               |
| C3  | LLM任务操作模式           | 单任务模式，无批量操作                            |
| C4  | 邮件发送失败处理          | 同步发送，始终返回200（防止枚举攻击）             |
| C5  | LLM未配置时质量检查       | 阻止任务创建，返回配置错误                        |
| C6  | Token存储方式             | bcrypt哈希 + UUID主键                             |
| C7  | Token作废策略             | 新请求作废旧token，每用户仅1个有效token           |
| C8  | 速率限制                  | 同一邮箱60秒内最多1次请求                         |
| C9  | 因果推理模块              | 实现基础功能（记录+基础分析）                     |
| C10 | 用户分群逻辑              | 基于学习进度自动分类                              |
| C11 | 质量检查词数限制          | 每次最多1000词                                    |
| C12 | 嵌入服务健康检查          | 实时探测 + 60秒缓存                               |
| C13 | 健康检查UI位置            | 在现有"向量搜索配置"卡片内                        |
| C14 | 健康检查刷新策略          | 页面加载+手动刷新（无自动轮询）                   |
| C15 | Token绝对过期时间         | 15分钟                                            |
| C16 | 生产邮件服务              | SMTP                                              |

## Architecture Decisions

### AD-1: 邮件服务架构

**决策**: 采用trait-based邮件服务抽象，支持多种后端。

**原因**:

- 不同环境可能需要不同的邮件服务（开发用SMTP，生产用SendGrid）
- 便于测试（可mock邮件发送）
- 未来扩展性（支持其他服务如Mailgun、AWS SES）

**实现**:

```
EmailProvider (trait)
├── SmtpProvider
├── SendGridProvider
└── MockProvider (for testing)
```

**配置**:

```toml
# 环境变量
EMAIL_PROVIDER=smtp|sendgrid
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASSWORD=secret
SENDGRID_API_KEY=SG.xxx
EMAIL_FROM=noreply@danci.app
```

### AD-2: 内容质量端点处理策略

**决策**: 将9个存根端点分为两类处理：

1. **核心功能端点** (4个) - 实现完整功能
   - `start_quality_check` - 启动质量检查任务
   - `list_quality_checks` - 列出检查任务
   - `get_quality_check_detail` - 获取检查详情
   - `list_issues` - 列出发现的问题

2. **增强功能端点** (5个) - 返回明确的"计划中"状态
   - `mark_issue_fixed` - 标记问题已修复
   - `ignore_issue` - 忽略问题
   - `batch_fix_issues` - 批量修复
   - `preview_enhancement` - 预览增强
   - `approve_variant` / `reject_variant` - 变体审批

**原因**:

- 核心功能是管理员的基本需求
- 增强功能需要更多设计，延后实现但不应返回500错误

### AD-3: AMAS历史端点实现策略

**决策**: 验证现有实现，补充缺失逻辑。

**分析**:

- `getStateHistory()` → `/api/amas/history` - 需验证
- `getCognitiveGrowth()` → `/api/amas/growth` - 需验证
- `getSignificantChanges()` → `/api/amas/changes` - 需验证

**实现路径**:

1. 审计amas.rs中对应路由的实际实现
2. 如果是存根，实现基于数据库的真实查询
3. 如果已实现，验证返回数据格式与前端期望匹配

### AD-4: StorageService修复

**决策**: 修复`getWordLearningStates`使用userId参数。

**当前问题**:

```typescript
async getWordLearningStates(_userId: string, wordIds: string[]) {
  // userId被忽略，参数前缀_表示未使用
}
```

**修复方案**:

- 确保API调用包含userId过滤
- 后端查询添加userId条件
- 验证多用户场景下数据隔离

## Component Interactions

### 密码重置流程

```
User → ForgotPasswordPage → AuthClient.requestPasswordReset(email)
                                    ↓
                              v1_auth.rs → EmailService.send_reset_email()
                                    ↓
                              User receives email
                                    ↓
User → ResetPasswordPage → AuthClient.resetPassword(token, password)
                                    ↓
                              v1_auth.rs → Update password + invalidate token
```

### 内容质量检查流程

```
Admin → WordQualityPage → AdminClient.startQualityCheck(wordbookId)
                                    ↓
                          admin/quality.rs → quality_service::start_task()
                                    ↓
                          Background job processes words
                                    ↓
Admin polls → AdminClient.getQualityChecks() → Returns task status
```

## Database Changes

### 新增表: email_logs (可选，用于调试)

```sql
CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "sentAt" TIMESTAMP
);
```

### 修改: quality_tasks表状态

确保`quality_tasks`表支持所需的状态流转：

- pending → running → completed/failed

## Error Handling

### 邮件发送失败

1. 记录错误日志
2. 返回用户友好消息："邮件发送失败，请稍后重试"
3. 不暴露内部错误详情

### 质量检查任务失败

1. 任务状态设为"failed"
2. 记录失败原因
3. 允许重试

## Testing Strategy

### 单元测试

- EmailProvider trait的mock实现
- 密码重置token生成和验证
- 质量检查任务状态机

### 集成测试

- 端到端密码重置流程（使用mock邮件）
- 质量检查任务创建和查询
- AMAS历史数据查询

### 手动测试清单

- [ ] 忘记密码页面提交邮件
- [ ] 检查邮件是否收到
- [ ] 点击重置链接
- [ ] 设置新密码成功
- [ ] 使用新密码登录

## Property-Based Testing (PBT) Properties

以下不变量**必须**在测试中验证：

### PBT-1: 内容质量API路由不变量

- **[INVARIANT]** 任何内容质量请求仅通过 `/api/admin/quality` 改变状态；`/api/admin/content/*` 不改变状态并返回404
- **[FALSIFICATION]** 对两个前缀生成随机端点，执行POST/PUT/DELETE，断言仅 `/api/admin/quality` 导致DB变更

### PBT-2: StorageService管理员模拟

- **[INVARIANT]** admin+userId响应等同于该用户token的直接调用；非admin的userId不匹配请求被拒绝
- **[FALSIFICATION]** 随机化用户/角色/userId，比较模拟读取与直接读取；确保非admin模拟返回403

### PBT-3: LLM任务状态单调性

- **[INVARIANT]** 状态转换单调：`pending → processing → (completed|failed)`；重复操作幂等
- **[FALSIFICATION]** 生成随机操作序列（含重复/乱序），断言无逆向转换或跨任务副作用

### PBT-4: 邮件响应一致性

- **[INVARIANT]** `request_password_reset` 始终返回HTTP 200和固定格式响应，无论邮箱是否存在或发送是否失败
- **[FALSIFICATION]** 随机化存在/不存在邮箱及发送结果，比较响应一致性

### PBT-5: 质量检查LLM前置条件

- **[INVARIANT]** LLM未配置时任务创建被拒绝，DB无新增行
- **[FALSIFICATION]** 关闭LLM配置，尝试创建任务，断言零副作用

### PBT-6: Token哈希完整性

- **[INVARIANT]** 存储的token哈希可通过bcrypt验证，且哈希≠明文；id为UUID格式
- **[FALSIFICATION]** 生成随机token，请求重置，读取DB，断言 `bcrypt.verify(token, hash)==true` 且 `hash!=token`

### PBT-7: Token单一性

- **[INVARIANT]** 每用户最多1个有效未使用token；新请求使所有旧token失效
- **[FALSIFICATION]** 连续请求两个token，用旧token尝试重置，断言失败；仅最新token成功

### PBT-8: 速率限制边界

- **[INVARIANT]** 任意60秒窗口内，同一邮箱新创建token数 ≤ 1；60秒后可创建新token
- **[FALSIFICATION]** 生成带时间戳的请求序列，断言token创建数遵守60秒边界

### PBT-9: 因果推理可用性

- **[INVARIANT]** 有足够观察数据时返回非空结果；数据不足时确定性返回None
- **[FALSIFICATION]** 生成阈值上下的合成数据，验证null/非null结果

### PBT-10: 分群分类确定性

- **[INVARIANT]** 分类是进度指标的确定性函数；用户映射到恰好一个分群；进度提升不会降级分群
- **[FALSIFICATION]** 随机化学习指标，运行分类两次检验确定性；向上扰动指标断言无降级

### PBT-11: 词数边界

- **[INVARIANT]** 词数 > 1000 时任务创建被拒绝；接受时 `totalItems ≤ 1000`
- **[FALSIFICATION]** 生成边界大小词书（999/1000/1001+），断言接受/拒绝及totalItems边界

### PBT-12: 健康检查缓存

- **[INVARIANT]** 健康检查结果缓存60秒；窗口内重复检查返回相同结果；超时后执行新探测
- **[FALSIFICATION]** mock提供者交替成功/失败，变化时间差，断言60秒内缓存命中，60秒后获得新结果

### PBT-13: 健康检查UI位置

- **[INVARIANT]** 健康状态UI元素必须是"向量搜索配置"卡片的后代，且仅出现一次
- **[FALSIFICATION]** DOM查询验证：(a)仅一个健康UI节点存在；(b)最近卡片祖先标题为"向量搜索配置"；(c)不在stats卡片中

### PBT-14: 刷新行为幂等性

- **[INVARIANT]** 健康API仅在初始加载和手动刷新时调用；空闲期间无后台轮询；调用次数=点击次数+1
- **[FALSIFICATION]** 计数器+随机空闲时间验证计数器稳定；手动刷新序列断言计数器精确递增

### PBT-15: Token时间有效性

- **[INVARIANT]** `now - issued_at < 900s` 时Token有效；边界：14m59s=有效，15m00s=无效，15m01s=无效
- **[FALSIFICATION]** 生成边界时间点(14m59s/15m00s/15m01s)±5s模糊测试，断言接受/拒绝符合不等式

### PBT-16: Token有效性单调性

- **[INVARIANT]** 对固定Token，有效性随时间单调递减；已失效Token不可"复活"
- **[FALSIFICATION]** 生成随机时间序列，模拟时间推进，断言失效后无法恢复

### PBT-17: SMTP失败掩盖

- **[INVARIANT]** 生产环境(SMTP)下，无论传输状态(超时/连接拒绝/认证失败)如何，`request_password_reset`始终返回HTTP 200
- **[FALSIFICATION]** MockEmailProvider抛出各种异常(Timeout/ConnectionRefused)，模糊测试断言状态码始终为200

### PBT-18: Token单一性并发安全

- **[INVARIANT]** 并发请求后每用户仅最新Token有效；事务隔离确保最多一个成功验证
- **[FALSIFICATION]** 两线程并发请求同一用户Token，捕获两个Token，随机验证断言最多1个成功
