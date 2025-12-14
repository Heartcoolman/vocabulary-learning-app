# 依赖版本修复计划

## 一、前端依赖修复

### 1. Zod 版本回退

```json
// packages/frontend/package.json
"dependencies": {
  "zod": "^3.23.8"  // 从 ^4.1.13 改为稳定的 3.x
}
```

**修复步骤：**

```bash
cd packages/frontend
pnpm remove zod
pnpm add zod@^3.23.8
```

**影响分析：**

- ✅ 与 backend 版本对齐 (3.22.4 → 3.23.8)
- ✅ 避免未来 4.x breaking changes
- ✅ 类型定义完全兼容

### 2. React Query 版本降级

```json
// packages/frontend/package.json
"dependencies": {
  "@tanstack/react-query": "^5.60.5"  // 从 ^5.90.12 改为主流稳定版
}
```

**修复步骤：**

```bash
cd packages/frontend
pnpm update @tanstack/react-query@^5.60.5
```

**影响分析：**

- ✅ 更好的社区支持和文档
- ✅ 经过充分测试的版本
- ⚠️ 需要测试现有功能是否正常

## 二、后端依赖修复

### 1. Axios 版本降级

```json
// packages/backend/package.json
"dependencies": {
  "axios": "^1.7.9"  // 从 ^1.13.2 改为主流稳定版
}
```

**修复步骤：**

```bash
cd packages/backend
npm update axios@^1.7.9
```

**影响分析：**

- ✅ 解决 OpenTelemetry 依赖冲突
- ✅ 更稳定的 HTTP 客户端
- ✅ 安全补丁已包含

## 三、数据库安全加固

### 阶段 1：添加软删除字段（向后兼容）

#### 1.1 创建迁移文件

```prisma
// packages/backend/prisma/migrations/xxx_add_soft_delete/migration.sql

-- 为核心表添加软删除字段
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

ALTER TABLE "word_books" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_books" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

ALTER TABLE "words" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "words" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

ALTER TABLE "answer_records" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "answer_records" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

ALTER TABLE "word_learning_states" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_learning_states" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

ALTER TABLE "learning_sessions" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "learning_sessions" ADD COLUMN "is_deleted" BOOLEAN DEFAULT false;

-- 创建索引以提升查询性能
CREATE INDEX "users_is_deleted_idx" ON "users"("is_deleted");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "word_books_is_deleted_idx" ON "word_books"("is_deleted");
CREATE INDEX "words_is_deleted_idx" ON "words"("is_deleted");
CREATE INDEX "answer_records_is_deleted_idx" ON "answer_records"("is_deleted");
CREATE INDEX "word_learning_states_is_deleted_idx" ON "word_learning_states"("is_deleted");
CREATE INDEX "learning_sessions_is_deleted_idx" ON "learning_sessions"("is_deleted");
```

#### 1.2 更新 Prisma Schema

```prisma
// packages/backend/prisma/schema.prisma

model User {
  id               String    @id @default(uuid())
  email            String    @unique
  // ... 其他字段
  deletedAt        DateTime? @map("deleted_at")
  isDeleted        Boolean   @default(false) @map("is_deleted")
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([isDeleted])
  @@index([deletedAt])
  @@map("users")
}

model WordBook {
  id          String    @id @default(uuid())
  name        String
  // ... 其他字段
  deletedAt   DateTime? @map("deleted_at")
  isDeleted   Boolean   @default(false) @map("is_deleted")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([isDeleted])
  @@index([deletedAt])
  @@map("word_books")
}

// 类似地更新 Word, AnswerRecord, WordLearningState, LearningSession
```

### 阶段 2：修改级联删除策略（需要仔细测试）

#### 2.1 高危级联改为 Restrict

```prisma
// 用户删除应该被限制，而不是级联删除所有数据
model WordBook {
  user User? @relation(fields: [userId], references: [id], onDelete: Restrict)
  //                                                       ^^^^^^^^^ 从 Cascade 改为 Restrict
}

model AnswerRecord {
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)
  word Word @relation(fields: [wordId], references: [id], onDelete: Restrict)
}

model WordLearningState {
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)
  word Word @relation(fields: [wordId], references: [id], onDelete: Restrict)
}
```

#### 2.2 保留部分合理的级联

```prisma
// Session 可以级联删除（不影响核心数据）
model Session {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// 配置历史可以级联删除
model ConfigHistory {
  config AlgorithmConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
}
```

### 阶段 3：实现软删除逻辑

#### 3.1 创建软删除中间件

```typescript
// packages/backend/src/middleware/soft-delete.middleware.ts

import { Prisma } from '@prisma/client';

export const softDeleteMiddleware: Prisma.Middleware = async (params, next) => {
  // 拦截 delete 操作，转换为 update
  if (params.action === 'delete') {
    params.action = 'update';
    params.args['data'] = {
      deletedAt: new Date(),
      isDeleted: true,
    };
  }

  // 拦截 deleteMany 操作
  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data !== undefined) {
      params.args.data['deletedAt'] = new Date();
      params.args.data['isDeleted'] = true;
    } else {
      params.args['data'] = {
        deletedAt: new Date(),
        isDeleted: true,
      };
    }
  }

  // 自动过滤已软删除的记录
  if (params.action === 'findUnique' || params.action === 'findFirst') {
    params.action = 'findFirst';
    params.args.where = {
      ...params.args.where,
      isDeleted: false,
    };
  }

  if (params.action === 'findMany') {
    if (params.args.where) {
      if (params.args.where.isDeleted === undefined) {
        params.args.where['isDeleted'] = false;
      }
    } else {
      params.args['where'] = { isDeleted: false };
    }
  }

  return next(params);
};
```

#### 3.2 注册中间件

```typescript
// packages/backend/src/config/database.ts

import { PrismaClient } from '@prisma/client';
import { softDeleteMiddleware } from '../middleware/soft-delete.middleware';

export const prisma = new PrismaClient();

// 注册软删除中间件
prisma.$use(softDeleteMiddleware);
```

#### 3.3 硬删除工具函数（管理员使用）

```typescript
// packages/backend/src/utils/hard-delete.ts

export async function hardDeleteUser(prisma: PrismaClient, userId: string) {
  // 管理员专用：真正删除数据（需要权限验证）
  return prisma.user.delete({
    where: { id: userId },
  });
}

export async function restoreUser(prisma: PrismaClient, userId: string) {
  // 恢复软删除的用户
  return prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      isDeleted: false,
    },
  });
}
```

## 四、迁移执行计划

### 阶段 1：依赖版本修复（立即执行）

1. ✅ 修改 package.json 版本号
2. ✅ 执行 `pnpm install` 重新安装依赖
3. ✅ 运行测试套件确保功能正常
4. ✅ 提交 Git commit

### 阶段 2：添加软删除字段（非破坏性）

1. ✅ 生成并运行数据库迁移
2. ✅ 更新 Prisma schema
3. ✅ 重新生成 Prisma Client
4. ✅ 运行测试

### 阶段 3：实现软删除逻辑（需要充分测试）

1. ⚠️ 创建软删除中间件
2. ⚠️ 在开发环境测试
3. ⚠️ 在预生产环境验证
4. ⚠️ 逐步部署到生产

### 阶段 4：修改级联策略（需要维护窗口）

1. ⚠️ 备份生产数据库
2. ⚠️ 在维护窗口执行迁移
3. ⚠️ 验证应用功能
4. ⚠️ 监控错误日志

## 五、风险评估与回滚计划

### 依赖版本回滚

```bash
# 如果出现问题，快速回滚
git revert <commit-hash>
pnpm install
npm test
```

### 数据库回滚

```sql
-- 回滚阶段 1（删除软删除字段）
ALTER TABLE "users" DROP COLUMN "deleted_at";
ALTER TABLE "users" DROP COLUMN "is_deleted";
-- 重复其他表...

-- 回滚阶段 4（恢复级联删除）
-- 需要生成新的迁移文件
```

## 六、测试清单

### 依赖版本测试

- [ ] Frontend 构建成功
- [ ] Backend 构建成功
- [ ] 类型检查通过
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] E2E 测试通过

### 软删除功能测试

- [ ] 删除用户后数据仍然存在
- [ ] 查询自动过滤已删除记录
- [ ] 恢复功能正常工作
- [ ] 硬删除功能正常（管理员）
- [ ] 性能测试（大量软删除数据）
- [ ] 外键约束正常工作

### 级联策略测试

- [ ] 删除用户时正确报错（Restrict）
- [ ] Session 正常级联删除
- [ ] 配置历史正常级联删除
- [ ] 实验数据正常级联删除

## 七、监控指标

### 依赖版本监控

- 包安装成功率
- 构建时间变化
- 运行时错误率

### 数据库监控

- 软删除记录数量
- 查询性能（带 isDeleted 过滤）
- 外键约束冲突错误
- 磁盘空间使用（软删除会占用更多空间）

## 八、长期维护

### 定期清理软删除数据

```typescript
// 每月运行一次，清理 90 天前的软删除数据
async function cleanupOldSoftDeletedRecords() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  await prisma.user.deleteMany({
    where: {
      isDeleted: true,
      deletedAt: {
        lt: ninetyDaysAgo,
      },
    },
  });

  // 对其他表执行相同操作...
}
```

### 依赖版本更新策略

1. 每月检查依赖更新
2. 优先更新安全补丁
3. 在开发分支测试次要版本更新
4. 主要版本更新需要充分测试和评估
