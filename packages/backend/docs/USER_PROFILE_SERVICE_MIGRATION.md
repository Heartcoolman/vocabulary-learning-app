# 用户画像服务合并迁移指南

## 概述

本次重构将三个分散的用户领域服务整合到统一的 `user-profile.service.ts` 中，提供更清晰的职责划分和更好的代码组织。

### 合并的服务

1. **user.service.ts** - 用户基础信息管理
2. **habit-profile.service.ts** - 学习习惯画像
3. **cognitive-profiling.service.ts** - 认知画像（时间节律、学习风格）

### 新的统一服务

**user-profile.service.ts** - 统一的用户画像服务，整合所有用户相关功能

---

## 迁移说明

### 1. user.service.ts → userProfileService

#### 导入变更

**旧代码：**

```typescript
import userService from '../services/user.service';
```

**新代码：**

```typescript
import { userProfileService } from '../services/user-profile.service';
```

#### API 映射

| 旧 API                                               | 新 API                                                      | 说明                 |
| ---------------------------------------------------- | ----------------------------------------------------------- | -------------------- |
| `userService.getUserById(userId)`                    | `userProfileService.getUserById(userId)`                    | 获取用户基础信息     |
| `userService.updatePassword(userId, data)`           | `userProfileService.updatePassword(userId, data)`           | 更新密码             |
| `userService.getUserStatistics(userId)`              | `userProfileService.getUserStatistics(userId)`              | 获取学习统计         |
| `userService.updateUser(userId, data)`               | `userProfileService.updateUser(userId, data)`               | 更新用户信息         |
| `userService.getUserStats(userId)`                   | `userProfileService.getUserStats(userId)`                   | 获取用户统计（简版） |
| `userService.updateRewardProfile(userId, profileId)` | `userProfileService.updateRewardProfile(userId, profileId)` | 更新奖励配置         |
| `userService.deleteUser(userId)`                     | `userProfileService.deleteUser(userId)`                     | 删除用户             |

#### 代码示例

**旧代码：**

```typescript
// 获取用户信息
const user = await userService.getUserById(userId);

// 更新密码
await userService.updatePassword(userId, {
  oldPassword: 'old123',
  newPassword: 'new456',
});

// 获取统计信息
const stats = await userService.getUserStatistics(userId);
```

**新代码：**

```typescript
// 获取用户信息
const user = await userProfileService.getUserById(userId);

// 更新密码
await userProfileService.updatePassword(userId, {
  oldPassword: 'old123',
  newPassword: 'new456',
});

// 获取统计信息
const stats = await userProfileService.getUserStatistics(userId);
```

---

### 2. habit-profile.service.ts → userProfileService

#### 导入变更

**旧代码：**

```typescript
import { habitProfileService } from '../services/habit-profile.service';
```

**新代码：**

```typescript
import { userProfileService } from '../services/user-profile.service';
```

#### API 映射

| 旧 API                                                              | 新 API                                                                   | 说明             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `habitProfileService.getProfile(userId)`                            | `userProfileService.getUserProfile(userId)` 然后访问 `habitProfile` 字段 | 获取习惯画像     |
| `habitProfileService.updateProfile(userId)`                         | `userProfileService.updateHabitProfile(userId)`                          | 更新习惯画像     |
| `habitProfileService.recordTimeEvent(userId, timestamp)`            | `userProfileService.recordTimeEvent(userId, timestamp)`                  | 记录学习时间事件 |
| `habitProfileService.recordSessionEnd(userId, duration, wordCount)` | `userProfileService.recordSessionEnd(userId, duration, wordCount)`       | 记录会话结束     |
| `habitProfileService.initializeFromHistory(userId)`                 | `userProfileService.initializeHabitFromHistory(userId)`                  | 从历史初始化     |
| `habitProfileService.resetUser(userId)`                             | `userProfileService.resetUserHabit(userId)`                              | 重置习惯识别器   |

#### 代码示例

**旧代码：**

```typescript
// 获取习惯画像
const habitProfile = await habitProfileService.getProfile(userId);

// 记录学习事件
habitProfileService.recordTimeEvent(userId);

// 记录会话结束
habitProfileService.recordSessionEnd(userId, 20, 10);

// 更新画像
await habitProfileService.updateProfile(userId);
```

**新代码：**

```typescript
// 获取完整用户画像（包含习惯画像）
const profile = await userProfileService.getUserProfile(userId, {
  includeHabit: true,
  includeCognitive: false,
  includeLearning: false,
});
const habitProfile = profile.habitProfile;

// 记录学习事件
userProfileService.recordTimeEvent(userId);

// 记录会话结束
userProfileService.recordSessionEnd(userId, 20, 10);

// 更新习惯画像
await userProfileService.updateHabitProfile(userId);
```

---

### 3. cognitive-profiling.service.ts → userProfileService

#### 导入变更

**旧代码：**

```typescript
import {
  getChronotypeProfile,
  getLearningStyleProfile,
  invalidateCognitiveCacheForUser,
} from '../services/cognitive-profiling.service';
```

**新代码：**

```typescript
import { userProfileService } from '../services/user-profile.service';
```

#### API 映射

| 旧 API                                    | 新 API                                                                         | 说明             |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| `getChronotypeProfile(userId)`            | `userProfileService.getCognitiveProfile(userId)` 然后访问 `chronotype` 字段    | 获取时间节律画像 |
| `getLearningStyleProfile(userId)`         | `userProfileService.getCognitiveProfile(userId)` 然后访问 `learningStyle` 字段 | 获取学习风格画像 |
| `invalidateCognitiveCacheForUser(userId)` | `userProfileService.invalidateCognitiveCache(userId)`                          | 使缓存失效       |

#### 代码示例

**旧代码：**

```typescript
// 获取时间节律画像
const chronotype = await getChronotypeProfile(userId);

// 获取学习风格画像
const learningStyle = await getLearningStyleProfile(userId);

// 使缓存失效
invalidateCognitiveCacheForUser(userId);
```

**新代码：**

```typescript
// 一次获取两个画像
const cognitiveProfile = await userProfileService.getCognitiveProfile(userId);
const chronotype = cognitiveProfile.chronotype;
const learningStyle = cognitiveProfile.learningStyle;

// 使缓存失效
userProfileService.invalidateCognitiveCache(userId);
```

---

## 新功能

### 1. 获取完整用户画像

```typescript
// 获取所有画像数据
const profile = await userProfileService.getUserProfile(userId);

// profile 包含：
// - user: 用户基础信息
// - habitProfile: 学习习惯画像
// - cognitiveProfile: { chronotype, learningStyle }
// - learningProfile: 学习档案（UserLearningProfile）

// 选择性获取
const profile = await userProfileService.getUserProfile(userId, {
  includeHabit: true, // 是否包含习惯画像
  includeCognitive: true, // 是否包含认知画像
  includeLearning: true, // 是否包含学习档案
});
```

### 2. 学习档案管理

```typescript
// 获取学习档案
const learningProfile = await userProfileService.getUserLearningProfile(userId);

// 更新学习档案
await userProfileService.updateUserLearningProfile(userId, {
  theta: 0.5,
  attention: 0.8,
  fatigue: 0.2,
  motivation: 0.9,
});
```

### 3. 事件发布

服务会通过事件总线发布画像更新事件，解耦服务间通信：

```typescript
// 更新画像时会自动发布 USER_STATE_UPDATED 事件
await userProfileService.updateHabitProfile(userId);

// 其他服务可以监听这些事件
eventBus.subscribe('USER_STATE_UPDATED', (event) => {
  console.log('用户画像已更新:', event.payload);
});
```

---

## 路由层迁移

### user.routes.ts

**变更点：**

- 导入改为 `userProfileService`
- 所有 `userService` 调用改为 `userProfileService`
- 认知画像端点改用 `getCognitiveProfile()`

**示例：**

```typescript
// 旧代码
router.get('/profile/chronotype', async (req, res) => {
  const profile = await getChronotypeProfile(req.user!.id);
  res.json({ success: true, data: profile });
});

// 新代码
router.get('/profile/chronotype', async (req, res) => {
  const cognitiveProfile = await userProfileService.getCognitiveProfile(req.user!.id);
  res.json({ success: true, data: cognitiveProfile.chronotype });
});
```

### habit-profile.routes.ts

**变更点：**

- 导入改为 `userProfileService`
- 使用新的 API 获取习惯画像

### profile.routes.ts

**变更点：**

- 导入改为 `userProfileService`
- 使用 `getCognitiveProfile()` 替代直接调用

---

## 类型定义变更

### 新增类型

```typescript
import type {
  UserProfile, // 完整用户画像
  UpdatePasswordDto, // 密码更新参数
  UserStatistics, // 用户统计信息
  UpdateHabitProfileParams, // 习惯画像更新参数
  UpdateLearningProfileParams, // 学习档案更新参数
  ProfileUpdatedPayload, // 画像更新事件载荷
} from '../services/user-profile.service';
```

---

## 测试迁移

### 单元测试

旧的测试文件仍然有效，但建议迁移到新服务：

```typescript
// 旧测试
import userService from '../services/user.service';

test('should get user by id', async () => {
  const user = await userService.getUserById('user-id');
  expect(user).toBeDefined();
});

// 新测试
import { userProfileService } from '../services/user-profile.service';

test('should get user by id', async () => {
  const user = await userProfileService.getUserById('user-id');
  expect(user).toBeDefined();
});
```

---

## 兼容性说明

### 旧服务状态

所有旧服务文件已标记为 `@deprecated`，但仍可使用（为了向后兼容）：

1. **user.service.ts** - 完全废弃，请使用 `userProfileService`
2. **habit-profile.service.ts** - 部分废弃，内部仍被 `userProfileService` 使用
3. **cognitive-profiling.service.ts** - 部分废弃，内部仍被 `userProfileService` 使用

### 导出兼容性

`services/index.ts` 仍然导出旧服务（带有 `@deprecated` 标记）：

```typescript
export { default as userService } from './user.service';
export { habitProfileService } from './habit-profile.service';
export { default as cognitiveProfilingService } from './cognitive-profiling.service';
export { userProfileService } from './user-profile.service';
```

---

## 迁移检查清单

### 必须迁移

- [ ] 路由层：user.routes.ts
- [ ] 路由层：habit-profile.routes.ts
- [ ] 路由层：profile.routes.ts
- [ ] 服务层：amas.service.ts（如有引用）
- [ ] 中间件（如有引用）

### 建议迁移

- [ ] 测试文件
- [ ] 其他服务文件中的引用
- [ ] 文档和示例代码

### 验证步骤

- [ ] 运行单元测试：`npm test`
- [ ] 运行集成测试
- [ ] 检查 TypeScript 编译：`npm run build`
- [ ] 手动测试关键功能：
  - [ ] 用户登录
  - [ ] 用户信息获取
  - [ ] 密码修改
  - [ ] 学习统计
  - [ ] 习惯画像
  - [ ] 认知画像

---

## 常见问题

### Q1: 为什么不直接删除旧服务？

A: 为了向后兼容和平滑迁移。旧服务标记为 `@deprecated` 后，开发者可以逐步迁移代码，而不会立即中断现有功能。

### Q2: habit-profile.service 和 cognitive-profiling.service 为什么还保留？

A: 这两个服务包含复杂的业务逻辑（习惯识别、认知分析），userProfileService 内部仍然依赖它们。只是外部不应该直接调用。

### Q3: 迁移后性能会有影响吗？

A: 不会。新服务只是重新组织了代码结构，核心逻辑没有改变。某些情况下，通过 `getUserProfile()` 一次获取多个画像反而更高效。

### Q4: 如何处理错误？

A: 新服务的错误处理与旧服务一致：

- 认知画像不足数据：抛出 `InsufficientDataError`
- 分析失败：抛出 `AnalysisError`
- 其他错误：抛出标准 Error

---

## 参考资源

- [user-profile.service.ts](../src/services/user-profile.service.ts) - 新服务实现
- [user.service.ts](../src/services/user.service.ts) - 旧服务（已废弃）
- [habit-profile.service.ts](../src/services/habit-profile.service.ts) - 旧服务（内部使用）
- [cognitive-profiling.service.ts](../src/services/cognitive-profiling.service.ts) - 旧服务（内部使用）

---

## 支持

如有问题，请联系开发团队或提交 Issue。

**迁移完成日期：** 2025-12-12
**版本：** v1.0.0
