# Spec Delta: Auth - Password Reset

## ADDED Requirements

### Requirement: Email Service Integration

系统 **SHALL** 支持通过邮件发送密码重置链接。

#### Scenario: 配置SMTP邮件服务

- **Given** 环境变量设置 `EMAIL_PROVIDER=smtp`
- **And** SMTP连接参数已配置
- **When** 系统启动时
- **Then** 邮件服务应使用SMTP协议发送邮件

#### Scenario: 配置SendGrid邮件服务

- **Given** 环境变量设置 `EMAIL_PROVIDER=sendgrid`
- **And** `SENDGRID_API_KEY` 已配置
- **When** 系统启动时
- **Then** 邮件服务应使用SendGrid API发送邮件

#### Scenario: 邮件服务未配置

- **Given** 环境变量 `EMAIL_PROVIDER` 未设置
- **When** 尝试发送邮件时
- **Then** 应记录警告日志
- **And** 返回用户友好的错误消息

---

### Requirement: Password Reset Request

用户 **MUST** 能够通过邮箱请求密码重置链接。

**约束引用**: C4（始终返回200）, C6（bcrypt哈希+UUID）, C7（作废旧token）, C8（60秒速率限制）

#### Scenario: 成功请求密码重置

- **Given** 用户邮箱 "user@example.com" 已注册
- **When** 用户提交密码重置请求
- **Then** 系统应生成24小时有效的重置token
- **And** token使用bcrypt哈希存储，主键为UUID（**C6**）
- **And** 作废该用户所有旧token（**C7**）
- **And** 发送包含重置链接的邮件
- **And** 返回HTTP 200和固定格式成功消息（**C4**）

#### Scenario: 请求不存在的邮箱

- **Given** 邮箱 "nonexistent@example.com" 未注册
- **When** 用户提交密码重置请求
- **Then** 系统不应发送任何邮件
- **And** 返回与成功完全相同的HTTP 200响应（**C4**: 防止枚举攻击）

#### Scenario: 邮件发送失败

- **Given** 邮箱 "user@example.com" 已注册
- **And** 邮件服务暂时不可用
- **When** 用户提交密码重置请求
- **Then** 系统应记录错误日志
- **And** 返回HTTP 200和固定格式成功消息（**C4**: 始终返回200）

#### Scenario: 重复请求密码重置（速率限制）

- **Given** 用户在60秒内已请求过密码重置（**C8**）
- **When** 用户再次请求
- **Then** 系统应返回HTTP 429速率限制错误
- **And** 提示用户60秒后重试

---

### Requirement: Password Reset Completion

用户 **MUST** 能够使用重置链接设置新密码。

#### Scenario: 成功重置密码

- **Given** 用户拥有有效的重置token
- **When** 用户提交新密码
- **Then** 系统应更新用户密码
- **And** 标记token为已使用
- **And** 删除所有用户会话
- **And** 返回成功消息

#### Scenario: 使用过期token

- **Given** 重置token已超过24小时
- **When** 用户尝试重置密码
- **Then** 系统应返回"链接已过期"错误
- **And** 提示用户重新请求

#### Scenario: 使用已用token

- **Given** 重置token已被使用过
- **When** 用户再次尝试使用
- **Then** 系统应返回"链接已失效"错误

#### Scenario: 新密码不符合要求

- **Given** 用户拥有有效token
- **When** 用户提交不符合密码策略的新密码
- **Then** 系统应返回密码要求提示
- **And** token不应被消耗

---

## MODIFIED Requirements

### Requirement: request_password_reset Endpoint

修改现有存根端点 **SHALL** 提供完整实现。

#### Scenario: 端点返回正确响应

- **Given** 邮件服务已配置
- **When** POST `/api/v1/auth/password-reset/request` with `{"email": "user@example.com"}`
- **Then** 响应状态码应为 200
- **And** 响应体应为 `{"success": true, "message": "如果该邮箱已注册，您将收到密码重置邮件"}`

#### Scenario: 邮件服务不可用

- **Given** 邮件服务未配置或连接失败
- **When** 请求密码重置
- **Then** 响应状态码应为 503
- **And** 响应体应为 `{"success": false, "error": "SERVICE_UNAVAILABLE", "message": "邮件服务暂不可用，请联系管理员"}`

---

## Related Capabilities

- **User Authentication** - 密码重置是认证系统的组成部分
- **Session Management** - 密码重置后需清除所有会话
