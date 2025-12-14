# Any 类型重构执行清单

> **快速参考** | 总计 147 处 | P0: 22 处 | P1: 25 处 | P2: 12 处 | P3: 88 处

---

## 第 1 周：P0 修复（必须完成）

### Day 1: 准备工作

- [ ] 创建功能分支 `refactor/remove-any-types-p0`
- [ ] 创建类型定义文件
  ```bash
  touch packages/shared/src/types/preferences-enums.ts
  touch packages/shared/src/types/config-types.ts
  ```
- [ ] 安装依赖（如需要）
  ```bash
  cd packages/backend
  npm install zod --save
  ```
- [ ] 建立测试基线
  ```bash
  npm run test:unit:services > test-baseline.txt
  ```

### Day 2-3: preference.service.ts (9 处 any)

**修复清单：**

- [ ] **步骤 1：** 在 `packages/shared/src/types/preferences-enums.ts` 创建枚举

  ```typescript
  export const DifficultyLevel = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard',
    ADAPTIVE: 'adaptive',
  } as const;
  export type DifficultyLevel = (typeof DifficultyLevel)[keyof typeof DifficultyLevel];

  export const ReminderFrequency = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    NEVER: 'never',
  } as const;
  export type ReminderFrequency = (typeof ReminderFrequency)[keyof typeof ReminderFrequency];

  export const Theme = {
    LIGHT: 'light',
    DARK: 'dark',
    AUTO: 'auto',
  } as const;
  export type Theme = (typeof Theme)[keyof typeof Theme];
  ```

- [ ] **步骤 2：** 在 preference.service.ts 顶部添加类型守卫

  ```typescript
  function isDifficultyLevel(value: string): value is DifficultyLevel {
    return Object.values(DifficultyLevel).includes(value as DifficultyLevel);
  }

  function isReminderFrequency(value: string): value is ReminderFrequency {
    return Object.values(ReminderFrequency).includes(value as ReminderFrequency);
  }

  function isTheme(value: string): value is Theme {
    return Object.values(Theme).includes(value as Theme);
  }

  function toDifficultyLevel(value: string | null | undefined): DifficultyLevel {
    if (value && isDifficultyLevel(value)) return value;
    return DifficultyLevel.ADAPTIVE;
  }

  function toReminderFrequency(value: string | null | undefined): ReminderFrequency {
    if (value && isReminderFrequency(value)) return value;
    return ReminderFrequency.DAILY;
  }

  function toTheme(value: string | null | undefined): Theme {
    if (value && isTheme(value)) return value;
    return Theme.LIGHT;
  }
  ```

- [ ] **步骤 3：** 修复 Line 97, 106, 111（getGroupedPreferences）

  ```typescript
  preferredDifficulty: toDifficultyLevel(preferences.preferredDifficulty),
  reminderFrequency: toReminderFrequency(preferences.reminderFrequency),
  theme: toTheme(preferences.theme),
  ```

- [ ] **步骤 4：** 修复 Line 204, 245, 282（getter 方法）

  ```typescript
  // 同上，使用转换函数
  ```

- [ ] **步骤 5：** 修复 Line 137（updatePreferences）

  ```typescript
  type PreferenceUpdateData = Partial<
    Omit<Prisma.UserPreferenceUpdateInput, 'user' | 'userId' | 'id' | 'createdAt' | 'updatedAt'>
  >;

  const updateData: PreferenceUpdateData = {};
  ```

- [ ] **步骤 6：** 修复 Line 385（createDefaultPreferences 返回类型）

  ```typescript
  private async createDefaultPreferences(
    userId: string
  ): Promise<Prisma.UserPreferenceGetPayload<{}>> {
    // ...
  }
  ```

- [ ] **步骤 7：** 修复 Line 397（mapToUserPreference 参数）

  ```typescript
  private mapToUserPreference(
    preferences: Prisma.UserPreferenceGetPayload<{}>
  ): UserPreference {
    // ...
  }
  ```

- [ ] **步骤 8：** 运行测试

  ```bash
  npm run test -- preference.service.test.ts
  npm run test:unit:services
  ```

- [ ] **步骤 9：** 验证 API 端点

  ```bash
  # 启动服务器
  npm run dev

  # 测试 GET /api/preferences
  curl http://localhost:3000/api/preferences \
    -H "Authorization: Bearer <token>"

  # 测试 PUT /api/preferences
  curl -X PUT http://localhost:3000/api/preferences \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"ui": {"theme": "dark"}}'
  ```

- [ ] **步骤 10：** Git commit
  ```bash
  git add packages/backend/src/services/preference.service.ts
  git add packages/shared/src/types/preferences-enums.ts
  git commit -m "refactor(preference): remove all any types, add type guards"
  ```

### Day 4-5: amas-config.service.ts (13 处 any)

**修复清单：**

- [ ] **步骤 1：** 创建 ConfigHistoryValue 接口

  ```typescript
  interface ConfigHistoryValue {
    configType: AMASConfigType;
    target: string;
    value: number;
    suggestionId?: string;
  }
  ```

- [ ] **步骤 2：** 创建类型守卫

  ```typescript
  function isConfigHistoryValue(value: unknown): value is ConfigHistoryValue {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.configType === 'string' &&
      typeof obj.target === 'string' &&
      typeof obj.value === 'number'
    );
  }
  ```

- [ ] **步骤 3：** 安装和配置 Zod

  ```typescript
  import { z } from 'zod';

  const AMASConfigDataSchema = z.object({
    amasConfig: z.object({
      paramBounds: z.object({
        alpha: z.object({ min: z.number(), max: z.number() }),
        fatigueK: z.object({ min: z.number(), max: z.number() }),
        motivationRho: z.object({ min: z.number(), max: z.number() }),
        optimalDifficulty: z.object({ min: z.number(), max: z.number() }),
      }),
      thresholds: z.record(z.number()),
      rewardWeights: z.record(z.number()),
      safetyThresholds: z.record(z.number()),
      version: z.string(),
    }),
  });
  ```

- [ ] **步骤 4：** 修复 Line 449（getHistory where 条件）

  ```typescript
  const where: Prisma.ConfigHistoryWhereInput = {};
  ```

- [ ] **步骤 5：** 修复 Line 457-463（getHistory 映射）

  ```typescript
  return records.map((r) => {
    const prevValue = isConfigHistoryValue(r.previousValue)
      ? r.previousValue
      : { configType: 'unknown' as const, target: '', value: 0 };
    const newValue = isConfigHistoryValue(r.newValue)
      ? r.newValue
      : { configType: 'unknown' as const, target: '', value: 0 };

    return {
      id: r.id,
      configType: prevValue.configType,
      target: prevValue.target,
      previousValue: prevValue.value,
      newValue: newValue.value,
      changedBy: r.changedBy,
      changeReason: r.changeReason ?? '',
      suggestionId: prevValue.suggestionId,
      createdAt: r.timestamp,
    };
  });
  ```

- [ ] **步骤 6：** 修复 Line 483（loadConfigFromDB）

  ```typescript
  const parseResult = AMASConfigDataSchema.safeParse(dbConfig.masteryThresholds);
  if (parseResult.success) {
    const { amasConfig } = parseResult.data;
    // ... 使用 amasConfig
  }
  ```

- [ ] **步骤 7：** 修复 Line 551, 566, 572, 582, 599, 605（saveConfigToDB）

  ```typescript
  const amasConfigData: Prisma.InputJsonValue = {
    amasConfig: {
      /* ... */
    },
  };

  const historyValue: Prisma.InputJsonValue = {
    configType,
    target,
    value: previousValue,
    suggestionId,
  };
  ```

- [ ] **步骤 8：** 运行 AMAS 测试套件

  ```bash
  npm run test:unit:amas
  npm run test -- amas-config.service.test.ts
  ```

- [ ] **步骤 9：** 验证配置 API

  ```bash
  # 获取配置
  curl http://localhost:3000/api/amas/config \
    -H "Authorization: Bearer <admin-token>"

  # 获取配置历史
  curl http://localhost:3000/api/amas/config/history \
    -H "Authorization: Bearer <admin-token>"
  ```

- [ ] **步骤 10：** Git commit
  ```bash
  git add packages/backend/src/services/amas-config.service.ts
  git commit -m "refactor(amas-config): remove all any types, add Zod validation"
  ```

### Day 6: P0 回归测试和发布

- [ ] **完整测试套件**

  ```bash
  npm run test:unit
  npm run test:integration
  npm run test:coverage
  ```

- [ ] **检查测试覆盖率**

  ```bash
  # 确保覆盖率 > 80%
  cat coverage/coverage-summary.json
  ```

- [ ] **本地集成测试**

  ```bash
  # 启动完整系统
  docker-compose up -d
  npm run dev

  # 运行 E2E 测试（如有）
  npm run test:e2e
  ```

- [ ] **创建 PR**

  ```bash
  git push origin refactor/remove-any-types-p0
  ```

- [ ] **PR 描述模板**

  ```markdown
  ## 类型安全改进 - P0 修复

  ### 修复内容

  - ✅ preference.service.ts (9 处 any)
  - ✅ amas-config.service.ts (13 处 any)

  ### 变更说明

  1. 引入枚举类型和类型守卫
  2. 使用 Zod 进行运行时验证
  3. 替换所有 Prisma JSON 字段的 any 类型

  ### 测试结果

  - 单元测试: ✅ 全部通过
  - 集成测试: ✅ 全部通过
  - 覆盖率: XX%

  ### 风险评估

  - 破坏性变更: 无
  - 需要数据迁移: 否
  - API 兼容性: 完全兼容

  ### 检查清单

  - [ ] 代码审查通过
  - [ ] 测试覆盖率 > 80%
  - [ ] 文档已更新
  - [ ] 无 TypeScript 错误
  - [ ] 无 ESLint 警告
  ```

---

## 第 2 周：P1 修复（推荐完成）

### Day 1-2: word-context.service.ts (11 处 any)

- [ ] 创建分支 `refactor/remove-any-types-p1-context`

- [ ] **步骤 1：** 创建 Zod schema

  ```typescript
  const ContextMetadataSchema = z.object({
    source: z.string().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.array(z.string()).optional(),
    audioUrl: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
    author: z.string().optional(),
    publishDate: z.string().optional(),
    viewCount: z.number().int().nonnegative().optional(),
    usageCount: z.number().int().nonnegative().optional(),
    effectivenessScore: z.number().min(0).max(1).optional(),
  });
  ```

- [ ] **步骤 2：** 创建 JSON 转换函数

  ```typescript
  function toJsonValue(metadata: ContextMetadata | undefined): Prisma.InputJsonValue {
    if (!metadata) return Prisma.JsonNull;
    const result = ContextMetadataSchema.safeParse(metadata);
    if (!result.success) {
      logger.warn({ error: result.error }, 'Invalid metadata');
      return Prisma.JsonNull;
    }
    return metadata as Prisma.InputJsonValue;
  }

  function fromJsonValue(json: Prisma.JsonValue): ContextMetadata | null {
    if (json === null || json === Prisma.JsonNull) return null;
    const result = ContextMetadataSchema.safeParse(json);
    if (!result.success) {
      logger.warn({ error: result.error }, 'Failed to parse metadata');
      return null;
    }
    return result.data;
  }
  ```

- [ ] **步骤 3：** 修复所有 `metadata as any` (Line 133, 163)
- [ ] **步骤 4：** 修复 `where: any` (Line 191)

  ```typescript
  const where: Prisma.WordContextWhereInput = { wordId };
  ```

- [ ] **步骤 5：** 运行测试
- [ ] **步骤 6：** Git commit

### Day 3: user-profile.service.ts (5 处 any)

- [ ] 审查 any 使用位置
- [ ] 使用 `Prisma.UserProfileGetPayload<{}>` 替换
- [ ] 为 JSON 字段添加类型守卫
- [ ] 运行测试
- [ ] Git commit

### Day 4: tracking.service.ts (5 处 any)

- [ ] 审查 any 使用位置
- [ ] 定义追踪事件类型接口
- [ ] 添加类型守卫
- [ ] 运行测试
- [ ] Git commit

### Day 5: cached-repository.ts (4 处 any)

- [ ] 审查缓存键和值类型
- [ ] 使用泛型约束
- [ ] 运行测试
- [ ] 创建 P1 PR

---

## 第 3 周：P2 修复和完善（可选）

### Day 1: cache.service.ts (1 处 any)

- [ ] 将 `any` 替换为 `unknown`
  ```typescript
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  ```
- [ ] 运行测试

### Day 2: logger/index.ts (4 处 any)

- [ ] 使用 Pino 官方类型
- [ ] 定义扩展错误接口
- [ ] 运行测试

### Day 3: validators (3 处 any)

- [ ] 审查验证器逻辑
- [ ] 使用 Zod 类型推断
- [ ] 运行测试

### Day 4-5: 文档和最终验证

- [ ] 更新类型安全最佳实践文档
- [ ] 为 P3 文件添加 ESLint 忽略注释
- [ ] 运行完整测试套件
- [ ] 更新 README
- [ ] 创建 P2 PR

---

## 验证清单

### 编译检查

- [ ] TypeScript 编译无错误

  ```bash
  npm run build
  ```

- [ ] ESLint 检查通过
  ```bash
  npm run lint
  ```

### 测试验证

- [ ] 单元测试全部通过

  ```bash
  npm run test:unit
  ```

- [ ] 集成测试全部通过

  ```bash
  npm run test:integration
  ```

- [ ] 覆盖率 > 80%
  ```bash
  npm run test:coverage
  ```

### 功能验证

- [ ] 用户偏好设置功能正常
- [ ] AMAS 配置管理功能正常
- [ ] 单词语境功能正常
- [ ] 日志系统功能正常
- [ ] 缓存系统功能正常

### 性能验证

- [ ] API 响应时间无明显增加

  ```bash
  # 使用 Apache Bench 或类似工具
  ab -n 1000 -c 10 http://localhost:3000/api/preferences
  ```

- [ ] 数据库查询性能无下降
  ```bash
  # 检查慢查询日志
  tail -f logs/slow-queries.log
  ```

---

## 快速命令参考

### 查找 any 使用

```bash
# 统计总数
grep -r "\bany\b" packages/backend/src --include="*.ts" | wc -l

# 按文件统计
find packages/backend/src -name "*.ts" -exec grep -l "\bany\b" {} \; | \
  xargs -I {} sh -c 'echo -n "{}: "; grep -c "\bany\b" "{}"' | \
  sort -t: -k2 -rn

# 查看具体位置
grep -rn "\bany\b" packages/backend/src/services/preference.service.ts
```

### 运行测试

```bash
# 单个文件
npm run test -- preference.service.test.ts

# 整个目录
npm run test:unit:services

# 带覆盖率
npm run test:coverage

# 监听模式
npm run test:watch
```

### Git 工作流

```bash
# 创建功能分支
git checkout -b refactor/remove-any-types-p0

# 提交变更
git add <files>
git commit -m "refactor: remove any types from <component>"

# 推送到远程
git push origin refactor/remove-any-types-p0

# 创建 PR（使用 GitHub CLI）
gh pr create --title "Type Safety: Remove any types - P0" \
  --body-file PR_TEMPLATE.md
```

---

## 常见问题 FAQ

### Q1: Prisma JSON 字段如何添加类型？

**A:** 使用 Zod 验证 + 类型守卫：

```typescript
import { z } from 'zod';

const MyDataSchema = z.object({
  field1: z.string(),
  field2: z.number(),
});

type MyData = z.infer<typeof MyDataSchema>;

function toJsonValue(data: MyData): Prisma.InputJsonValue {
  return data as Prisma.InputJsonValue;
}

function fromJsonValue(json: Prisma.JsonValue): MyData | null {
  const result = MyDataSchema.safeParse(json);
  return result.success ? result.data : null;
}
```

### Q2: 如何处理动态对象构建？

**A:** 使用 `Partial<T>` 类型：

```typescript
type UpdateData = Partial<Prisma.UserUpdateInput>;

const updateData: UpdateData = {};
if (dto.name !== undefined) {
  updateData.name = dto.name;
}
```

### Q3: 如何处理字符串枚举？

**A:** 使用 const assertion + 类型守卫：

```typescript
export const Status = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type Status = (typeof Status)[keyof typeof Status];

function isStatus(value: string): value is Status {
  return Object.values(Status).includes(value as Status);
}
```

### Q4: 测试失败怎么办？

**A:** 按以下顺序检查：

1. 检查类型守卫逻辑是否正确
2. 检查默认值是否合理
3. 检查 Zod schema 是否过于严格
4. 查看测试日志中的具体错误
5. 使用 `logger.debug()` 输出中间值

### Q5: 如何回滚？

**A:** 保留原始代码的备份分支：

```bash
# 创建备份
git checkout -b backup/before-refactor-p0

# 如需回滚
git checkout main
git merge backup/before-refactor-p0
```

---

## 完成标准

### P0 完成标准（第 1 周结束）

- [x] preference.service.ts 无 any
- [x] amas-config.service.ts 无 any
- [x] 所有相关测试通过
- [x] PR 已创建并审查

### P1 完成标准（第 2 周结束）

- [x] word-context.service.ts 无 any
- [x] user-profile.service.ts 无 any
- [x] tracking.service.ts 无 any
- [x] cached-repository.ts 无 any
- [x] 集成测试通过

### P2 完成标准（第 3 周结束）

- [x] 所有 P2 文件已修复
- [x] 文档已更新
- [x] ESLint 规则已启用
- [x] 性能测试通过

### 最终验证

- [x] Any 使用减少 > 70%
- [x] TypeScript strict 模式通过
- [x] 测试覆盖率 > 80%
- [x] 无用户报告的回归 bug
- [x] 代码审查通过

---

## 联系和支持

- 详细计划：`ANY_TYPE_REFACTORING_PLAN.md`
- 问题跟踪：GitHub Issues
- 代码审查：GitHub Pull Requests

**祝重构顺利！**
