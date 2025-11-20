# 前端认证系统文档

## 概述

本文档描述了词汇学习应用的前端认证系统实现，包括用户注册、登录、会话管理和路由保护。

## 架构

### 核心组件

1. **ApiClient** (`src/services/ApiClient.ts`)
   - 封装所有HTTP请求
   - 自动处理认证令牌
   - 统一错误处理
   - 401错误时自动清除令牌

2. **AuthContext** (`src/contexts/AuthContext.tsx`)
   - 全局认证状态管理
   - 提供登录、注册、退出功能
   - 自动加载用户信息
   - 令牌持久化到localStorage

3. **ProtectedRoute** (`src/components/ProtectedRoute.tsx`)
   - 路由守卫组件
   - 保护需要登录的页面
   - 未登录自动重定向到登录页

4. **页面组件**
   - LoginPage: 用户登录
   - RegisterPage: 用户注册
   - ProfilePage: 个人资料管理

## 使用方法

### 1. 环境配置

创建 `.env` 文件：

```env
VITE_API_URL=http://localhost:3000
```

### 2. 使用AuthContext

在任何组件中使用 `useAuth` Hook：

```tsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>请先登录</div>;
  }

  return (
    <div>
      <p>欢迎, {user.username}!</p>
      <button onClick={logout}>退出登录</button>
    </div>
  );
}
```

### 3. 保护路由

使用 `ProtectedRoute` 包装需要登录的页面：

```tsx
<Route
  path="/protected"
  element={
    <ProtectedRoute>
      <ProtectedPage />
    </ProtectedRoute>
  }
/>
```

### 4. API调用

使用 `apiClient` 进行API调用：

```tsx
import apiClient from '../services/ApiClient';

// 获取单词列表（需要认证）
const words = await apiClient.getWords();

// 创建单词
const newWord = await apiClient.createWord({
  spelling: 'hello',
  phonetic: 'həˈloʊ',
  meanings: ['你好'],
  examples: ['Hello, world!'],
});
```

## 认证流程

### 注册流程

1. 用户填写注册表单（邮箱、密码、用户名）
2. 前端验证输入（邮箱格式、密码长度等）
3. 调用 `apiClient.register()`
4. 后端创建用户并返回JWT令牌
5. 前端保存令牌到localStorage
6. 更新AuthContext状态
7. 自动跳转到首页

### 登录流程

1. 用户填写登录表单（邮箱、密码）
2. 前端验证输入
3. 调用 `apiClient.login()`
4. 后端验证凭证并返回JWT令牌
5. 前端保存令牌到localStorage
6. 更新AuthContext状态
7. 自动跳转到首页

### 退出流程

1. 用户点击退出按钮
2. 调用 `apiClient.logout()`
3. 后端使会话失效
4. 前端清除localStorage中的令牌
5. 更新AuthContext状态
6. 重定向到登录页

### 自动登录

1. 应用启动时，AuthContext检查localStorage
2. 如果存在令牌，调用 `apiClient.getCurrentUser()`
3. 如果令牌有效，加载用户信息
4. 如果令牌无效（401错误），自动清除令牌

## 安全特性

### 令牌管理

- JWT令牌存储在localStorage
- 每次API请求自动附加令牌
- 401错误时自动清除令牌
- 退出登录时清除令牌

### 输入验证

- 邮箱格式验证
- 密码长度验证（最少8个字符）
- 密码确认匹配验证
- 用户名长度验证

### 错误处理

- 统一的错误提示
- 网络错误处理
- 服务器错误处理
- 用户友好的错误消息

## UI/UX特性

### 表单体验

- 实时输入验证
- 清晰的错误提示
- 加载状态指示
- 键盘导航支持（Enter提交）
- 禁用状态处理

### 可访问性

- ARIA标签
- 语义化HTML
- 键盘导航
- 屏幕阅读器支持
- 焦点管理

### 响应式设计

- 移动端适配
- 平板适配
- 桌面端优化

## API端点

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户退出

### 用户相关

- `GET /api/users/me` - 获取当前用户信息
- `PUT /api/users/me/password` - 修改密码
- `GET /api/statistics` - 获取学习统计

### 单词相关

- `GET /api/words` - 获取单词列表
- `POST /api/words` - 创建单词
- `PUT /api/words/:id` - 更新单词
- `DELETE /api/words/:id` - 删除单词

### 学习记录相关

- `GET /api/records` - 获取学习记录
- `POST /api/records` - 创建学习记录

## 测试

运行测试：

```bash
npm test
```

测试覆盖：

- ApiClient令牌管理
- ApiClient错误处理
- AuthContext状态管理
- AuthContext用户加载

## 故障排查

### 问题：登录后立即退出

**原因**：后端API未运行或URL配置错误

**解决**：
1. 检查 `.env` 文件中的 `VITE_API_URL`
2. 确保后端服务正在运行
3. 检查浏览器控制台的网络错误

### 问题：令牌过期

**原因**：JWT令牌已过期（默认24小时）

**解决**：
1. 用户需要重新登录
2. 系统会自动清除过期令牌
3. 考虑实现令牌刷新机制

### 问题：CORS错误

**原因**：后端未配置CORS

**解决**：
1. 确保后端配置了正确的CORS策略
2. 检查 `Access-Control-Allow-Origin` 头
3. 确保前端URL在允许列表中

## 未来改进

1. **令牌刷新**
   - 实现自动令牌刷新
   - 避免用户频繁登录

2. **记住我功能**
   - 可选的长期会话
   - 使用refresh token

3. **社交登录**
   - Google登录
   - GitHub登录

4. **双因素认证**
   - 短信验证码
   - 邮箱验证码
   - TOTP应用

5. **密码重置**
   - 忘记密码功能
   - 邮箱验证链接

## 相关文档

- [后端API文档](../../backend/API.md)
- [UI设计规范](../../.kiro/steering/ui-design-system.md)
- [项目概述](../../backend/PROJECT_OVERVIEW.md)
