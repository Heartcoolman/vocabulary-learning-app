# TypeScript类型系统架构

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                    @danci/shared                              │
│  (Single Source of Truth for Types)                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────┐        ┌────────────────────┐        │
│  │   src/types/       │        │   src/schemas/     │        │
│  │                    │        │                    │        │
│  │  • common.ts       │◄───────┤  • user.schema.ts  │        │
│  │  • user.ts         │        │  • word.schema.ts  │        │
│  │  • word.ts         │        │  • study.schema.ts │        │
│  │  • study.ts        │        │  • amas.schema.ts  │        │
│  │  • amas.ts         │        │                    │        │
│  │  • admin.ts        │        │  (Zod Schemas)     │        │
│  │  • express.ts      │        │  Runtime Validation│        │
│  │                    │        │                    │        │
│  │  (TypeScript Types)│        └────────────────────┘        │
│  │  Compile-time Only │                                      │
│  └────────────────────┘                                      │
│                                                               │
└───────────────────────┬───────────────────┬──────────────────┘
                        │                   │
                        │                   │
        ┌───────────────▼─────┐   ┌────────▼──────────────┐
        │  @danci/backend      │   │  @danci/frontend      │
        │                      │   │                       │
        │  import types from   │   │  import types from    │
        │  '@danci/shared'     │   │  '@danci/shared'      │
        │                      │   │                       │
        │  + Express routes    │   │  + React components   │
        │  + Service layer     │   │  + API clients        │
        │  + Database layer    │   │  + State management   │
        │                      │   │                       │
        └──────────────────────┘   └───────────────────────┘
```

## 类型层次结构

```
BaseEntity (common.ts)
    │
    ├── id: ID (string)
    ├── createdAt: Timestamp (number)
    └── updatedAt: Timestamp (number)

Common Types (common.ts)
    ├── Timestamp = number
    ├── ID = string
    ├── ApiResponse<T>
    ├── PaginationParams
    └── PaginatedResponse<T>

User Types (user.ts)
    ├── UserRole = 'USER' | 'ADMIN'
    ├── UserInfo extends BaseEntity
    ├── AuthUser extends UserInfo
    ├── RegisterDto
    ├── LoginDto
    └── UpdatePasswordDto

Word Types (word.ts)
    ├── Word extends BaseEntity
    ├── WordBookType = 'SYSTEM' | 'USER'
    ├── WordBook extends BaseEntity
    ├── WordState enum
    ├── WordLearningState extends BaseEntity
    ├── WordScore extends BaseEntity
    └── DTOs (Create/Update)

Study Types (study.ts)
    ├── StudyConfig extends BaseEntity
    ├── LearningSession extends BaseEntity
    ├── AnswerRecord extends BaseEntity
    ├── AlgorithmConfig extends BaseEntity
    └── DTOs

AMAS Types (amas.ts)
    ├── UserState
    ├── CognitiveProfile
    ├── HabitProfile
    ├── Action
    ├── StrategyParams
    ├── RawEvent
    └── LearningObjectives

Admin Types (admin.ts)
    ├── UserListResponse
    ├── SystemStatsResponse
    └── UserLearningDataResponse

Express Types (express.ts)
    └── AuthRequest extends Request
```

## Schema对应关系

```
TypeScript Type              Zod Schema                    用途
─────────────────────────────────────────────────────────────────
UserInfo                 →   UserInfoSchema            →   验证用户信息
RegisterDto              →   RegisterDtoSchema         →   验证注册请求
LoginDto                 →   LoginDtoSchema            →   验证登录请求
Word                     →   WordSchema                →   验证单词数据
CreateWordDto            →   CreateWordDtoSchema       →   验证创建单词
WordBook                 →   WordBookSchema            →   验证词书数据
StudyConfig              →   StudyConfigSchema         →   验证学习配置
AnswerRecord             →   AnswerRecordSchema        →   验证答题记录
LearningEventInput       →   LearningEventInputSchema  →   验证学习事件
UserState (frontend)     →   UserStateSchema           →   验证用户状态
```

## 导入路径映射

### Backend导入示例

```typescript
// 从shared导入类型
import { AuthRequest, ApiResponse, UserInfo, Word, StudyConfig } from '@danci/shared/types';

// 从shared导入Schema
import { RegisterDtoSchema, CreateWordDtoSchema } from '@danci/shared/schemas';

// 或者从backend types重导出
import { AuthRequest, ApiResponse } from '../types';
```

### Frontend导入示例

```typescript
// 从shared导入类型
import { UserInfo, Word, WordBook, LearningSession } from '@danci/shared/types';

// 从shared导入Schema（用于客户端验证）
import { LoginDtoSchema, CreateWordDtoSchema } from '@danci/shared/schemas';
```

## 数据流

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │ 1. 发送请求
         │    { email, password }
         ▼
┌─────────────────┐
│  API Request    │◄──── LoginDtoSchema.parse()
│  (Express)      │      (运行时验证)
└────────┬────────┘
         │ 2. 验证通过
         │    LoginDto
         ▼
┌─────────────────┐
│  Service Layer  │◄──── 使用 UserInfo 类型
│  (Business)     │      (编译时检查)
└────────┬────────┘
         │ 3. 操作数据
         │    UserInfo
         ▼
┌─────────────────┐
│  Database       │◄──── Prisma models
│  (PostgreSQL)   │      (ORM类型)
└────────┬────────┘
         │ 4. 返回数据
         │    UserInfo
         ▼
┌─────────────────┐
│  API Response   │──►  ApiResponse<UserInfo>
│  (Express)      │      (类型安全响应)
└────────┬────────┘
         │ 5. 返回前端
         │    { success, data: UserInfo }
         ▼
┌─────────────────┐
│   Frontend      │◄──── UserInfo (类型推断)
│   (React)       │      (自动完成)
└─────────────────┘
```

## 类型安全保证

### 编译时 (TypeScript)

```typescript
// ✅ 正确 - 类型匹配
const user: UserInfo = {
  id: '123',
  email: 'user@example.com',
  username: 'user',
  role: 'USER',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ❌ 错误 - 类型不匹配
const user: UserInfo = {
  id: '123',
  email: 'user@example.com',
  username: 'user',
  role: 'INVALID', // Error: Type 'INVALID' is not assignable to type 'USER' | 'ADMIN'
  createdAt: new Date(), // Error: Type 'Date' is not assignable to type 'number'
  updatedAt: Date.now(),
};
```

### 运行时 (Zod)

```typescript
import { RegisterDtoSchema } from '@danci/shared/schemas';

// ✅ 验证成功
const validData = {
  email: 'user@example.com',
  password: 'password123',
  username: 'user',
};
const result = RegisterDtoSchema.safeParse(validData);
// result.success === true
// result.data === validData

// ❌ 验证失败
const invalidData = {
  email: 'invalid-email',
  password: '123', // 太短
  username: 'u', // 太短
};
const result = RegisterDtoSchema.safeParse(invalidData);
// result.success === false
// result.error.issues = [
//   { path: ['email'], message: 'Invalid email format' },
//   { path: ['password'], message: 'Password must be at least 6 characters' },
//   { path: ['username'], message: 'Username must be at least 2 characters' }
// ]
```

## 关键特性

### 1. Single Source of Truth

- ✅ 所有类型定义在 `@danci/shared`
- ✅ Backend和Frontend共享相同定义
- ✅ 修改一处，全局生效

### 2. 类型 + 验证

- ✅ TypeScript类型：编译时检查
- ✅ Zod Schema：运行时验证
- ✅ 类型推断：`z.infer<typeof Schema>`

### 3. 时间戳统一

- ✅ 所有日期使用 `Timestamp` (number)
- ✅ ���秒级Unix时间戳
- ✅ JSON序列化友好

### 4. 强类型ID

- ✅ 使用 `ID` 类型代替裸 `string`
- ✅ 语义清晰
- ✅ 便于重构

### 5. BaseEntity模式

- ✅ 统一的基础字段
- ✅ 继承简化定义
- ✅ 一致的接口

## 最佳实践

### DO ✅

```typescript
// ✅ 使用BaseEntity
interface MyEntity extends BaseEntity {
  name: string;
}

// ✅ 使用Timestamp
interface MyEvent {
  timestamp: Timestamp;
}

// ✅ 明确可空类型
interface MyData {
  value: string | null;
}

// ✅ 从Schema推断类型
import { RegisterDtoSchema } from '@danci/shared/schemas';
type RegisterDto = z.infer<typeof RegisterDtoSchema>;

// ✅ 使用运行时验证
const result = RegisterDtoSchema.safeParse(data);
if (result.success) {
  // data已验证，类型安全
  processData(result.data);
}
```

### DON'T ❌

```typescript
// ❌ 不要使用Date类型
interface MyEntity {
  createdAt: Date; // 使用 Timestamp 代替
}

// ❌ 不要在backend/frontend重复定义类型
// backend/src/types/my-type.ts
interface User { ... } // 应该在 @danci/shared

// ❌ 不要忽略运行时验证
app.post('/api', (req, res) => {
  // 直接使用req.body，没有验证
  const data = req.body; // ❌
});

// ❌ 不要使用隐式可空
interface MyData {
  value?: string; // 使用 string | null 代替
}
```

## 扩展路径

### 添加新类型

1. 在 `packages/shared/src/types/` 创建或编辑文件
2. 导出类型定义
3. 在 `types/index.ts` 中导出
4. 在 `schemas/` 创建对应的Schema（可选）

### 使用类型

```typescript
// Backend
import { MyType } from '@danci/shared/types';

// Frontend
import { MyType } from '@danci/shared/types';
```

### 集成验证

```typescript
// Express middleware
import { MyDtoSchema } from '@danci/shared/schemas';

app.post('/api/endpoint', (req, res) => {
  const result = MyDtoSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error.message,
    });
  }

  // result.data 已验证并类型安全
  processRequest(result.data);
});
```

---

**维护者**: AI Assistant (Claude)
**最后更新**: 2025-12-07
