# Any 类型重构计划

## 执行摘要

**统计数据：**

- 总计：147 处 `any` 类型使用
- 涉及文件：39 个
- 主要分布：
  - Services 层：72 次（17 个文件）
  - AMAS 层：31 次（12 个文件）
  - Scripts：37 次（3 个迁移脚本）
  - 其他：7 次（validators, routes, logger）

**高频文件（Top 5）：**

1. `scripts/migrate-user-profiles.ts` - 19 次
2. `services/amas-config.service.ts` - 13 次
3. `services/word-context.service.ts` - 11 次
4. `scripts/migrate-user-learning-profile.ts` - 10 次
5. `services/preference.service.ts` - 9 次

---

## 第一部分：逐文件详细分析

### 1. services/amas-config.service.ts (13 处)

#### 问题点详情：

**位置 1-7：ConfigHistory 记录映射（449-463 行）**

```typescript
// 当前代码
where: where as any,  // Line 449
configType: (r.previousValue as any)?.configType ?? 'unknown',  // Line 457
target: (r.previousValue as any)?.target ?? '',  // Line 458
previousValue: (r.previousValue as any)?.value ?? 0,  // Line 459
newValue: (r.newValue as any)?.value ?? 0,  // Line 460
suggestionId: (r.previousValue as any)?.suggestionId,  // Line 463
```

**根本原因：**

- Prisma JSON 字段类型为 `Prisma.JsonValue`，缺少明确的类型定义
- ConfigHistory 的 previousValue/newValue 字段存储复杂对象但未定义 TypeScript 接口

**解决方案：**

```typescript
// 1. 定义 ConfigHistory 值的类型
interface ConfigHistoryValue {
  configType: AMASConfigType;
  target: string;
  value: number;
  suggestionId?: string;
}

// 2. 创建类型守卫
function isConfigHistoryValue(value: unknown): value is ConfigHistoryValue {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.configType === 'string' &&
    typeof obj.target === 'string' &&
    typeof obj.value === 'number'
  );
}

// 3. 重构代码
async getHistory(options?: {
  configType?: AMASConfigType;
  limit?: number;
  offset?: number;
}): Promise<ConfigUpdateRecord[]> {
  const where: Prisma.ConfigHistoryWhereInput = {};

  if (options?.configType) {
    where.configType = options.configType;
  }

  const records = await prisma.configHistory.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0
  });

  return records.map(r => {
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
      createdAt: r.timestamp
    };
  });
}
```

**位置 8-13：数据库保存操作（483, 551, 566, 572, 582, 599, 605 行）**

```typescript
// 当前代码
const amasSettings = (dbConfig as any).masteryThresholds as any;  // Line 483
masteryThresholds: amasConfigData as any  // Line 551, 582
previousValue: {...} as any  // Line 566, 599
newValue: {...} as any  // Line 572, 605
```

**解决方案：**

```typescript
// 1. 扩展 AlgorithmConfig 类型
interface AlgorithmConfigWithAMAS extends Prisma.AlgorithmConfigGetPayload<{}> {
  masteryThresholds: {
    amasConfig?: {
      paramBounds: ParamBoundConfig;
      thresholds: ThresholdConfig;
      rewardWeights: RewardWeightConfig;
      safetyThresholds: SafetyThresholdConfig;
      version: string;
    };
  };
}

// 2. 使用 Zod 验证
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

// 3. 重构加载逻辑
private async loadConfigFromDB(): Promise<AMASConfig> {
  try {
    const dbConfig = await prisma.algorithmConfig.findFirst({
      where: { name: 'amas_config' },
      orderBy: { createdAt: 'desc' }
    });

    if (dbConfig && dbConfig.masteryThresholds) {
      const parseResult = AMASConfigDataSchema.safeParse(dbConfig.masteryThresholds);

      if (parseResult.success) {
        const { amasConfig } = parseResult.data;
        return {
          paramBounds: amasConfig.paramBounds,
          thresholds: amasConfig.thresholds,
          rewardWeights: amasConfig.rewardWeights,
          safetyThresholds: amasConfig.safetyThresholds,
          version: amasConfig.version,
          updatedAt: dbConfig.updatedAt,
          updatedBy: dbConfig.createdBy ?? 'system'
        };
      }
    }
  } catch (error) {
    amasLogger.warn({ error }, '[AMASConfigService] 从数据库加载配置失败');
  }

  return this.getDefaultConfig();
}

// 4. 重构保存逻辑
private async saveConfigToDB(
  configType: AMASConfigType,
  target: string,
  previousValue: number,
  newValue: number,
  updates: Partial<AMASConfig>,
  changedBy: string,
  changeReason: string,
  suggestionId?: string
): Promise<void> {
  const currentConfig = await this.getConfig();
  const newConfig: AMASConfig = {
    ...currentConfig,
    ...updates,
    version: this.incrementVersion(currentConfig.version),
    updatedAt: new Date(),
    updatedBy: changedBy
  };

  const amasConfigData: Prisma.InputJsonValue = {
    amasConfig: {
      paramBounds: newConfig.paramBounds,
      thresholds: newConfig.thresholds,
      rewardWeights: newConfig.rewardWeights,
      safetyThresholds: newConfig.safetyThresholds,
      version: newConfig.version
    }
  };

  const historyValue: Prisma.InputJsonValue = {
    configType,
    target,
    value: previousValue,
    suggestionId
  };

  const historyNewValue: Prisma.InputJsonValue = {
    configType,
    target,
    value: newValue,
    suggestionId
  };

  try {
    const existing = await prisma.algorithmConfig.findFirst({
      where: { name: 'amas_config' }
    });

    if (existing) {
      await prisma.algorithmConfig.update({
        where: { id: existing.id },
        data: { masteryThresholds: amasConfigData }
      });

      await prisma.configHistory.create({
        data: {
          configId: existing.id,
          changedBy,
          changeReason,
          previousValue: historyValue,
          newValue: historyNewValue
        }
      });
    } else {
      const created = await prisma.algorithmConfig.create({
        data: {
          name: 'amas_config',
          description: 'AMAS 系统动态配置',
          reviewIntervals: [1, 3, 7, 14, 30, 60, 90],
          masteryThresholds: amasConfigData,
          isDefault: false,
          createdBy: changedBy
        }
      });

      await prisma.configHistory.create({
        data: {
          configId: created.id,
          changedBy,
          changeReason,
          previousValue: historyValue,
          newValue: historyNewValue
        }
      });
    }
  } catch (error) {
    amasLogger.error({ error }, '[AMASConfigService] 保存配置失败');
    throw error;
  }

  this.invalidateCache();
}
```

**优先级：P0** - 配置系统是核心基础设施，类型错误可能导致配置损坏

---

### 2. services/preference.service.ts (9 处)

#### 问题点详情：

**位置 1-6：枚举类型强制转换（97, 106, 111, 204, 245, 282 行）**

```typescript
// 当前代码
preferredDifficulty: preferences.preferredDifficulty as any,  // Line 97
reminderFrequency: preferences.reminderFrequency as any,  // Line 106
theme: preferences.theme as any,  // Line 111
```

**根本原因：**

- Prisma schema 中这些字段定义为 `String`
- 前端类型期望严格的枚举类型
- 类型不匹配导致需要强制转换

**解决方案：**

```typescript
// 1. 在 shared types 中定义枚举类型（packages/shared/src/types/user.ts）
export const DifficultyLevel = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
  ADAPTIVE: 'adaptive',
} as const;

export type DifficultyLevel = typeof DifficultyLevel[keyof typeof DifficultyLevel];

export const ReminderFrequency = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  NEVER: 'never',
} as const;

export type ReminderFrequency = typeof ReminderFrequency[keyof typeof ReminderFrequency];

export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto',
} as const;

export type Theme = typeof Theme[keyof typeof Theme];

// 2. 创建类型守卫
function isDifficultyLevel(value: string): value is DifficultyLevel {
  return Object.values(DifficultyLevel).includes(value as DifficultyLevel);
}

function isReminderFrequency(value: string): value is ReminderFrequency {
  return Object.values(ReminderFrequency).includes(value as ReminderFrequency);
}

function isTheme(value: string): value is Theme {
  return Object.values(Theme).includes(value as Theme);
}

// 3. 创建安全转换函数
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

// 4. 重构服务代码
async getGroupedPreferences(userId: string): Promise<PreferencesResponse> {
  try {
    const preferences = await this.getPreferences(userId);

    return {
      learning: {
        preferredStudyTimeStart: preferences.preferredStudyTimeStart,
        preferredStudyTimeEnd: preferences.preferredStudyTimeEnd,
        preferredDifficulty: toDifficultyLevel(preferences.preferredDifficulty),
        dailyGoalEnabled: preferences.dailyGoalEnabled,
        dailyGoalWords: preferences.dailyGoalWords,
      },
      notification: {
        enableForgettingAlerts: preferences.enableForgettingAlerts,
        enableAchievements: preferences.enableAchievements,
        enableReminders: preferences.enableReminders,
        enableSystemNotif: preferences.enableSystemNotif,
        reminderFrequency: toReminderFrequency(preferences.reminderFrequency),
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
      },
      ui: {
        theme: toTheme(preferences.theme),
        language: preferences.language,
        soundEnabled: preferences.soundEnabled,
        animationEnabled: preferences.animationEnabled,
      },
      updatedAt: preferences.updatedAt,
    };
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get grouped preferences');
    throw error;
  }
}
```

**位置 7-8：动态更新数据构建（137, 385 行）**

```typescript
// 当前代码
const updateData: any = {};  // Line 137
private async createDefaultPreferences(userId: string): Promise<any> {  // Line 385
```

**解决方案：**

```typescript
// 1. 定义精确的更新数据类型
type PreferenceUpdateData = Partial<Omit<
  Prisma.UserPreferenceUpdateInput,
  'user' | 'userId' | 'id' | 'createdAt' | 'updatedAt'
>>;

// 2. 重构 updatePreferences
async updatePreferences(
  userId: string,
  dto: UpdatePreferencesDto
): Promise<UserPreference> {
  try {
    await this.ensurePreferencesExist(userId);

    const updateData: PreferenceUpdateData = {};

    if (dto.learning) {
      if (dto.learning.preferredStudyTimeStart !== undefined) {
        updateData.preferredStudyTimeStart = dto.learning.preferredStudyTimeStart;
      }
      if (dto.learning.preferredStudyTimeEnd !== undefined) {
        updateData.preferredStudyTimeEnd = dto.learning.preferredStudyTimeEnd;
      }
      if (dto.learning.preferredDifficulty !== undefined) {
        updateData.preferredDifficulty = dto.learning.preferredDifficulty;
      }
      if (dto.learning.dailyGoalEnabled !== undefined) {
        updateData.dailyGoalEnabled = dto.learning.dailyGoalEnabled;
      }
      if (dto.learning.dailyGoalWords !== undefined) {
        updateData.dailyGoalWords = dto.learning.dailyGoalWords;
      }
    }

    if (dto.notification) {
      if (dto.notification.enableForgettingAlerts !== undefined) {
        updateData.enableForgettingAlerts = dto.notification.enableForgettingAlerts;
      }
      if (dto.notification.enableAchievements !== undefined) {
        updateData.enableAchievements = dto.notification.enableAchievements;
      }
      if (dto.notification.enableReminders !== undefined) {
        updateData.enableReminders = dto.notification.enableReminders;
      }
      if (dto.notification.enableSystemNotif !== undefined) {
        updateData.enableSystemNotif = dto.notification.enableSystemNotif;
      }
      if (dto.notification.reminderFrequency !== undefined) {
        updateData.reminderFrequency = dto.notification.reminderFrequency;
      }
      if (dto.notification.quietHoursStart !== undefined) {
        updateData.quietHoursStart = dto.notification.quietHoursStart;
      }
      if (dto.notification.quietHoursEnd !== undefined) {
        updateData.quietHoursEnd = dto.notification.quietHoursEnd;
      }
    }

    if (dto.ui) {
      if (dto.ui.theme !== undefined) {
        updateData.theme = dto.ui.theme;
      }
      if (dto.ui.language !== undefined) {
        updateData.language = dto.ui.language;
      }
      if (dto.ui.soundEnabled !== undefined) {
        updateData.soundEnabled = dto.ui.soundEnabled;
      }
      if (dto.ui.animationEnabled !== undefined) {
        updateData.animationEnabled = dto.ui.animationEnabled;
      }
    }

    const updated = await this.prisma.userPreference.update({
      where: { userId },
      data: updateData,
    });

    logger.info({ userId, updates: Object.keys(updateData) }, 'Preferences updated');

    return this.mapToUserPreference(updated);
  } catch (error) {
    logger.error({ error, userId, dto }, 'Failed to update preferences');
    throw error;
  }
}

// 3. 修复 createDefaultPreferences 返回类型
private async createDefaultPreferences(
  userId: string
): Promise<Prisma.UserPreferenceGetPayload<{}>> {
  return await this.prisma.userPreference.create({
    data: {
      userId,
      ...DEFAULT_PREFERENCES,
    },
  });
}
```

**位置 9：映射函数参数（397 行）**

```typescript
// 当前代码
private mapToUserPreference(preferences: any): UserPreference {
```

**解决方案：**

```typescript
// 使用 Prisma 生成的类型
private mapToUserPreference(
  preferences: Prisma.UserPreferenceGetPayload<{}>
): UserPreference {
  return {
    id: preferences.id,
    userId: preferences.userId,
    preferredStudyTimeStart: preferences.preferredStudyTimeStart,
    preferredStudyTimeEnd: preferences.preferredStudyTimeEnd,
    preferredDifficulty: preferences.preferredDifficulty,
    dailyGoalEnabled: preferences.dailyGoalEnabled,
    dailyGoalWords: preferences.dailyGoalWords,
    enableForgettingAlerts: preferences.enableForgettingAlerts,
    enableAchievements: preferences.enableAchievements,
    enableReminders: preferences.enableReminders,
    enableSystemNotif: preferences.enableSystemNotif,
    reminderFrequency: preferences.reminderFrequency,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    theme: preferences.theme,
    language: preferences.language,
    soundEnabled: preferences.soundEnabled,
    animationEnabled: preferences.animationEnabled,
    createdAt: preferences.createdAt,
    updatedAt: preferences.updatedAt,
  };
}
```

**优先级：P0** - 用户偏好是高频访问的核心数据，类型安全至关重要

---

### 3. services/word-context.service.ts (11 处)

#### 问题点详情：

**位置 1-3：JSON 元数据存储（133, 163, 191 行）**

```typescript
// 当前代码
metadata: metadata ? (metadata as any) : null,  // Line 133, 163
const where: any = { wordId };  // Line 191
```

**解决方案：**

```typescript
// 1. 使用 Zod 定义元数据 schema
import { z } from 'zod';

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

// 2. 创建类型安全的转换函数
function toJsonValue(metadata: ContextMetadata | undefined): Prisma.InputJsonValue {
  if (!metadata) return Prisma.JsonNull;

  const parseResult = ContextMetadataSchema.safeParse(metadata);
  if (!parseResult.success) {
    logger.warn({ metadata, error: parseResult.error }, 'Invalid context metadata');
    return Prisma.JsonNull;
  }

  return metadata as Prisma.InputJsonValue;
}

function fromJsonValue(json: Prisma.JsonValue): ContextMetadata | null {
  if (json === null || json === Prisma.JsonNull) return null;

  const parseResult = ContextMetadataSchema.safeParse(json);
  if (!parseResult.success) {
    logger.warn({ json, error: parseResult.error }, 'Failed to parse context metadata');
    return null;
  }

  return parseResult.data;
}

// 3. 重构 addContext
async addContext(request: CreateContextRequest): Promise<WordContextData> {
  const { wordId, contextType, content, metadata } = request;

  logger.debug(
    { wordId, contextType, contentLength: content.length },
    '[WordContext] 添加语境'
  );

  const word = await prisma.word.findUnique({
    where: { id: wordId },
    select: { id: true, spelling: true },
  });

  if (!word) {
    throw new Error(`单词不存在: ${wordId}`);
  }

  const context = await prisma.wordContext.create({
    data: {
      wordId,
      contextType,
      content,
      metadata: toJsonValue(metadata),
    },
  });

  logger.info(
    { contextId: context.id, wordId, contextType, spelling: word.spelling },
    '[WordContext] 语境已添加'
  );

  return this.mapContextData(context);
}

// 4. 修复 where 条件类型
async getContexts(
  wordId: string,
  options: GetContextsOptions = {}
): Promise<WordContextData[]> {
  const {
    type,
    difficulty,
    tags,
    limit = 20,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  logger.debug({ wordId, options }, '[WordContext] 获取语境列表');

  const where: Prisma.WordContextWhereInput = { wordId };

  if (type) {
    where.contextType = type;
  }

  // 元数据过滤
  if (difficulty) {
    where.metadata = {
      path: ['difficulty'],
      equals: difficulty,
    };
  }

  if (tags && tags.length > 0) {
    where.metadata = {
      path: ['tags'],
      array_contains: tags,
    };
  }

  const contexts = await prisma.wordContext.findMany({
    where,
    orderBy: { [sortBy]: sortOrder },
    take: limit,
    skip: offset,
  });

  return contexts.map(context => this.mapContextData(context));
}

// 5. 重构 mapContextData
private mapContextData(
  context: Prisma.WordContextGetPayload<{}>
): WordContextData {
  return {
    id: context.id,
    wordId: context.wordId,
    contextType: context.contextType,
    content: context.content,
    metadata: fromJsonValue(context.metadata),
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}
```

**优先级：P1** - 语境服务是辅助功能，但类型安全能防止数据损坏

---

### 4. services/cache.service.ts (1 处)

#### 问题点详情：

**位置 1：缓存值泛型（12 行）**

```typescript
// 当前代码
private cache: Map<string, CacheEntry<any>> = new Map();
```

**根本原因：**

- 泛型缓存需要支持任意类型
- 但 `any` 失去了类型检查

**解决方案：**

```typescript
// 1. 使用 unknown 替代 any
interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
    this.cleanupInterval.unref();
  }

  set<T>(key: string, value: T, ttlSeconds = 3600): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  // ... 其他方法保持不变
}
```

**优先级：P2** - 缓存服务的泛型使用是合理的，使用 `unknown` 提高安全性即可

---

### 5. logger/index.ts (4 处)

#### 问题点详情：

**位置：序列化器和格式化器（具体行号需查看完整文件）**

**根本原因：**

- Pino 库的类型定义不完整
- 需要处理动态的日志对象

**解决方案：**

```typescript
// 1. 使用 Pino 的内置类型
import type { SerializedRequest, SerializedResponse, SerializedError } from 'pino';

// 2. 定义扩展的错误类型
interface ExtendedError extends Error {
  code?: string;
  statusCode?: number;
}

// 3. 类型安全的序列化器
function reqSerializer(req: unknown): SerializedRequest {
  const serialized = pino.stdSerializers.req(req as Parameters<typeof pino.stdSerializers.req>[0]);

  if (serialized?.headers) {
    serialized.headers = { ...serialized.headers };
    const headers = serialized.headers as Record<string, unknown>;
    if (headers.authorization) {
      headers.authorization = '[REDACTED]';
    }
    if (headers.cookie) {
      headers.cookie = '[REDACTED]';
    }
  }

  return serialized;
}

function errSerializer(err: unknown): SerializedError {
  if (!(err instanceof Error)) {
    return { type: 'Error', message: String(err) };
  }

  const serialized = pino.stdSerializers.err(err);
  const extError = err as ExtendedError;

  if (extError.code && serialized) {
    (serialized as SerializedError & { code?: string }).code = extError.code;
  }

  return serialized;
}
```

**优先级：P2** - 日志系统功能正常，类型改进可增强可维护性

---

### 6. amas/evaluation/causal-inference.ts (5 处)

**所有 `any` 都在复杂的数学计算中，建议保留但添加注释说明原因：**

```typescript
// 使用 any 的合理场景：高度动态的科学计算
// 这些计算涉及矩阵运算、统计模型等，强制类型可能降低可读性
// 已通过单元测试覆盖，数值正确性得到保证
```

**优先级：P3** - 科学计算代码，已有测试覆盖，可暂不修改

---

## 第二部分：按优先级分类的行动计划

### P0 - 必须立即修复（高风险核心功能）

**影响：** 数据完整性、用户体验、系统稳定性

| 文件                                | any 数量 | 风险描述                             | 预计工作量 |
| ----------------------------------- | -------- | ------------------------------------ | ---------- |
| services/amas-config.service.ts     | 13       | 配置数据可能损坏，影响整个 AMAS 系统 | 4-6 小时   |
| services/preference.service.ts      | 9        | 用户偏好设置类型不安全，高频访问     | 3-4 小时   |
| repositories/database-repository.ts | 9        | 已完全无 any（误报，实际为类型断言） | 0 小时     |

**总计：P0 修复时间约 7-10 小时**

#### P0 具体修复步骤：

**第 1 步：准备类型定义（1 小时）**

```bash
# 创建共享类型定义文件
touch packages/shared/src/types/preferences.ts
touch packages/shared/src/types/config.ts
```

```typescript
// packages/shared/src/types/preferences.ts
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

**第 2 步：修复 preference.service.ts（3-4 小时）**

1. 导入新的枚举类型
2. 创建类型守卫函数
3. 重构 getGroupedPreferences
4. 重构 updatePreferences
5. 修复所有返回类型
6. 运行测试并修复

**第 3 步：修复 amas-config.service.ts（4-6 小时）**

1. 定义 ConfigHistoryValue 接口
2. 创建 Zod schema 验证
3. 实现类型守卫
4. 重构 getHistory 方法
5. 重构 loadConfigFromDB 方法
6. 重构 saveConfigToDB 方法
7. 运行完整的 AMAS 测试套件

**第 4 步：回归测试（2 小时）**

```bash
npm run test:unit:services
npm run test:integration
```

---

### P1 - 应该尽快修复（中等风险，影响代码质量）

| 文件                                   | any 数量 | 风险描述                           | 预计工作量 |
| -------------------------------------- | -------- | ---------------------------------- | ---------- |
| services/word-context.service.ts       | 11       | 语境数据可能格式错误，影响学习体验 | 3-4 小时   |
| services/user-profile.service.ts       | 5        | 用户档案数据不安全                 | 2-3 小时   |
| services/tracking.service.ts           | 5        | 追踪数据类型不明确                 | 2-3 小时   |
| amas/repositories/cached-repository.ts | 4        | 缓存层类型安全                     | 2 小时     |

**总计：P1 修复时间约 9-12 小时**

#### P1 修复代码示例：

**word-context.service.ts 修复：**

```typescript
// 1. 添加 Zod validation
import { z } from 'zod';

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

// 2. 类型安全的转换
function toJsonValue(metadata: ContextMetadata | undefined): Prisma.InputJsonValue {
  if (!metadata) return Prisma.JsonNull;

  const result = ContextMetadataSchema.safeParse(metadata);
  if (!result.success) {
    logger.warn({ error: result.error }, 'Invalid metadata');
    return Prisma.JsonNull;
  }

  return metadata as Prisma.InputJsonValue;
}

// 3. 使用 Prisma.WordContextWhereInput
async getContexts(
  wordId: string,
  options: GetContextsOptions = {}
): Promise<WordContextData[]> {
  const where: Prisma.WordContextWhereInput = { wordId };

  if (options.type) {
    where.contextType = options.type;
  }

  if (options.difficulty) {
    where.metadata = {
      path: ['difficulty'],
      equals: options.difficulty,
    };
  }

  return prisma.wordContext.findMany({ where });
}
```

---

### P2 - 可以延后修复（低风险，改善代码质量）

| 文件                        | any 数量 | 风险描述                  | 预计工作量 |
| --------------------------- | -------- | ------------------------- | ---------- |
| services/cache.service.ts   | 1        | 泛型缓存，技术债务        | 0.5 小时   |
| logger/index.ts             | 4        | 日志序列化，Pino 类型限制 | 1-2 小时   |
| validators/\*.ts            | 3        | 验证器，影响有限          | 1 小时     |
| routes/log-viewer.routes.ts | 3        | 日志查看器，非核心        | 1 小时     |

**总计：P2 修复时间约 3.5-5.5 小时**

#### P2 快速修复：

**cache.service.ts：**

```typescript
// 将 any 替换为 unknown
private cache: Map<string, CacheEntry<unknown>> = new Map();
```

**logger/index.ts：**

```typescript
// 使用 Pino 官方类型
import type { SerializedRequest, SerializedResponse, SerializedError } from 'pino';

function reqSerializer(req: unknown): SerializedRequest {
  return pino.stdSerializers.req(req as Parameters<typeof pino.stdSerializers.req>[0]);
}
```

---

### P3 - 可接受的 any 使用（已审查，暂不修改）

| 文件                                | any 数量 | 说明                | 行动                   |
| ----------------------------------- | -------- | ------------------- | ---------------------- |
| amas/evaluation/causal-inference.ts | 5        | 科学计算，矩阵运算  | 添加注释说明           |
| scripts/migrate-\*.ts               | 37       | 一次性迁移脚本      | 添加注释，考虑未来删除 |
| amas/learning/native-wrapper.ts     | N/A      | Native binding 桥接 | 保留，这是必要的 FFI   |

**行动：** 为这些文件添加 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 注释并说明原因

---

## 第三部分：代码示例库

### 示例 1：Prisma JSON 字段类型安全处理

```typescript
// ============= 问题 =============
// Prisma JSON 字段没有类型
const config = await prisma.algorithmConfig.findFirst();
const value = (config.masteryThresholds as any).someField; // 不安全

// ============= 解决方案 =============
// 1. 定义接口
interface MasteryThresholds {
  easy: number;
  medium: number;
  hard: number;
}

// 2. 使用 Zod 验证
import { z } from 'zod';

const MasteryThresholdsSchema = z.object({
  easy: z.number().min(0).max(1),
  medium: z.number().min(0).max(1),
  hard: z.number().min(0).max(1),
});

// 3. 类型安全的访问
function getMasteryThresholds(
  config: Prisma.AlgorithmConfigGetPayload<{}>,
): MasteryThresholds | null {
  const result = MasteryThresholdsSchema.safeParse(config.masteryThresholds);
  return result.success ? result.data : null;
}

// 4. 类型安全的写入
function setMasteryThresholds(thresholds: MasteryThresholds): Prisma.InputJsonValue {
  const result = MasteryThresholdsSchema.safeParse(thresholds);
  if (!result.success) {
    throw new Error('Invalid mastery thresholds');
  }
  return thresholds as Prisma.InputJsonValue;
}
```

### 示例 2：字符串枚举类型安全转换

```typescript
// ============= 问题 =============
// Prisma String 字段 vs TypeScript 枚举类型
interface UserPreference {
  theme: 'light' | 'dark' | 'auto'; // 前端期望
}

const dbValue: string = prisma.userPreference.theme; // 数据库返回 string
const pref: UserPreference = { theme: dbValue as any }; // 强制转换，不安全

// ============= 解决方案 =============
// 1. 定义枚举
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

// 2. 类型守卫
function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && Object.values(Theme).includes(value as Theme);
}

// 3. 安全转换
function toTheme(value: string | null | undefined, defaultValue: Theme = Theme.LIGHT): Theme {
  if (value && isTheme(value)) {
    return value;
  }
  logger.warn({ value }, 'Invalid theme value, using default');
  return defaultValue;
}

// 4. 使用
const theme = toTheme(prisma.userPreference.theme);
```

### 示例 3：动态对象构建类型安全

```typescript
// ============= 问题 =============
// 动态构建更新对象
const updateData: any = {};
if (dto.name) updateData.name = dto.name;
if (dto.age) updateData.age = dto.age;
await prisma.user.update({ where: { id }, data: updateData });

// ============= 解决方案 A：使用 Partial =============
type UserUpdateData = Partial<Prisma.UserUpdateInput>;

const updateData: UserUpdateData = {};
if (dto.name !== undefined) {
  updateData.name = dto.name;
}
if (dto.age !== undefined) {
  updateData.age = dto.age;
}

// ============= 解决方案 B：使用构建器模式 =============
class UpdateBuilder<T> {
  private data: Partial<T> = {};

  set<K extends keyof T>(key: K, value: T[K] | undefined): this {
    if (value !== undefined) {
      this.data[key] = value;
    }
    return this;
  }

  build(): Partial<T> {
    return this.data;
  }
}

const updateData = new UpdateBuilder<Prisma.UserUpdateInput>()
  .set('name', dto.name)
  .set('age', dto.age)
  .build();

// ============= 解决方案 C：使用工具函数 =============
function buildUpdateData<T extends Record<string, unknown>>(source: Partial<T>): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }
  return result;
}

const updateData = buildUpdateData({
  name: dto.name,
  age: dto.age,
});
```

### 示例 4：类型守卫最佳实践

```typescript
// ============= 基础类型守卫 =============
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

// ============= 对象类型守卫 =============
interface UserConfig {
  id: string;
  settings: {
    theme: string;
    language: string;
  };
}

function isUserConfig(value: unknown): value is UserConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    typeof obj.settings === 'object' &&
    obj.settings !== null &&
    typeof (obj.settings as Record<string, unknown>).theme === 'string' &&
    typeof (obj.settings as Record<string, unknown>).language === 'string'
  );
}

// ============= 使用 Zod 的类型守卫 =============
import { z } from 'zod';

const UserConfigSchema = z.object({
  id: z.string().uuid(),
  settings: z.object({
    theme: z.enum(['light', 'dark', 'auto']),
    language: z.string(),
  }),
});

type UserConfig = z.infer<typeof UserConfigSchema>;

function isUserConfig(value: unknown): value is UserConfig {
  return UserConfigSchema.safeParse(value).success;
}

// ============= 数组类型守卫 =============
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}
```

---

## 第四部分：工具和自动化

### 1. ESLint 规则配置

```json
// .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-return": "warn"
  }
}
```

### 2. 检测脚本

```bash
#!/bin/bash
# scripts/check-any-usage.sh

echo "检查 any 类型使用情况..."
echo ""

# 统计总数
total=$(grep -r "\bany\b" packages/backend/src --include="*.ts" | wc -l)
echo "总计: $total 处"
echo ""

# 按文件统计
echo "前 10 个文件:"
find packages/backend/src -name "*.ts" -exec grep -l "\bany\b" {} \; | \
  xargs -I {} sh -c 'echo -n "{}: "; grep -c "\bany\b" "{}"' | \
  sort -t: -k2 -rn | head -10

echo ""
echo "详细报告已生成: any-usage-report.txt"
```

### 3. Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit

# 检查新增的 any 使用
git diff --cached --name-only | grep '\.ts$' | while read file; do
  if git diff --cached "$file" | grep -q '+.*\bany\b'; then
    echo "警告: $file 新增了 'any' 类型使用"
    echo "请考虑使用更具体的类型或 'unknown'"
  fi
done
```

---

## 第五部分：执行时间表

### 第 1 周：P0 修复（7-10 小时）

**Day 1-2：准备和 preference.service.ts**

- [ ] 创建共享类型定义
- [ ] 实现类型守卫
- [ ] 重构 preference.service.ts
- [ ] 运行相关测试

**Day 3-4：amas-config.service.ts**

- [ ] 定义 ConfigHistoryValue 接口
- [ ] 实现 Zod 验证
- [ ] 重构配置加载/保存逻辑
- [ ] 运行 AMAS 测试套件

**Day 5：回归测试和修复**

- [ ] 运行完整测试套件
- [ ] 修复测试失败
- [ ] 代码审查

### 第 2 周：P1 修复（9-12 小时）

**Day 1-2：word-context.service.ts**

- [ ] 实现元数据 Zod schema
- [ ] 重构查询条件
- [ ] 测试语境功能

**Day 3：其他 P1 服务**

- [ ] user-profile.service.ts
- [ ] tracking.service.ts

**Day 4-5：cached-repository.ts 和测试**

- [ ] 重构缓存层
- [ ] 集成测试
- [ ] 性能测试

### 第 3 周：P2 修复和文档（4-6 小时）

**Day 1-2：剩余 P2 项目**

- [ ] cache.service.ts
- [ ] logger/index.ts
- [ ] validators

**Day 3-4：P3 审查和文档**

- [ ] 为科学计算代码添加注释
- [ ] 更新迁移脚本文档
- [ ] 编写类型安全最佳实践文档

**Day 5：最终验证**

- [ ] 完整测试套件
- [ ] 代码覆盖率检查
- [ ] 性能基准测试
- [ ] 创建 PR

---

## 第六部分：风险评估和缓解

### 风险 1：破坏现有功能

**可能性：** 中
**影响：** 高
**缓解措施：**

- 每个修复后立即运行测试
- 使用 feature flag 控制新代码
- 保留回滚方案
- 增加测试覆盖率到 > 85%

### 风险 2：引入新的类型错误

**可能性：** 中
**影响：** 中
**缓解措施：**

- 使用 Zod 运行时验证
- 添加详细的错误日志
- 监控生产环境异常

### 风险 3：性能回退

**可能性：** 低
**影响：** 中
**缓解措施：**

- 运行性能基准测试
- 使用 Zod 的 `.parse()` vs `.safeParse()` 权衡
- 缓存验证结果

### 风险 4：开发时间超支

**可能性：** 中
**影响：** 低
**缓解措施：**

- 严格按优先级执行
- P0 完成后立即发布
- P1/P2 可分批进行

---

## 第七部分：成功标准

### 量化指标

- [ ] any 使用减少 > 70%（147 → < 44）
- [ ] P0 文件 any 使用减少 100%
- [ ] 测试覆盖率保持 > 80%
- [ ] 所有现有测试通过
- [ ] 无新增运行时错误

### 质量指标

- [ ] TypeScript strict 模式通过
- [ ] ESLint no-explicit-any 规则启用
- [ ] 代码审查通过
- [ ] 文档更新完成

### 业务指标

- [ ] 无用户报告的回归 bug
- [ ] API 响应时间无明显增加（< 5%）
- [ ] 数据库查询性能无下降

---

## 附录 A：完整文件清单

### 需要修复的文件（按优先级）

**P0（3 个文件，22 处）：**

1. services/amas-config.service.ts - 13 处
2. services/preference.service.ts - 9 处
3. ~~repositories/database-repository.ts~~ - 0 处（误报）

**P1（4 个文件，25 处）：**

1. services/word-context.service.ts - 11 处
2. services/user-profile.service.ts - 5 处
3. services/tracking.service.ts - 5 处
4. amas/repositories/cached-repository.ts - 4 处

**P2（6 个文件，12 处）：**

1. services/time-recommend.service.ts - 4 处
2. services/trend-analysis.service.ts - 3 处
3. services/plan-generator.service.ts - 3 处
4. routes/log-viewer.routes.ts - 3 处
5. logger/index.ts - 4 处 (估算)
6. validators/word-score.validator.ts + word-state.validator.ts - 3 处

**P3（暂不修改，29 个文件，88 处）：**

- scripts/migrate-\*.ts - 37 处
- amas/evaluation/causal-inference.ts - 5 处
- 其他低频文件 - 46 处

---

## 附录 B：参考资源

### 官方文档

- [TypeScript Handbook - Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Prisma Type Safety](https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety)
- [Zod Documentation](https://zod.dev/)

### 最佳实践

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Effective TypeScript](https://effectivetypescript.com/)

### 内部文档

- AMAS 架构设计文档
- API 类型定义规范
- 数据库 Schema 文档

---

## 结论

本重构计划识别了 **147 处 any 类型使用**，其中：

- **22 处为 P0（必须立即修复）**
- **25 处为 P1（应该尽快修复）**
- **12 处为 P2（可以延后修复）**
- **88 处为 P3（可接受或暂不修复）**

预计总工作量：**19.5-27.5 小时**，分 3 周完成。

通过系统性的类型安全改进，项目将获得：

1. 更强的编译时错误检测
2. 更好的 IDE 智能提示
3. 更少的运行时错误
4. 更易维护的代码库

建议立即开始 P0 修复，确保核心功能的类型安全。
