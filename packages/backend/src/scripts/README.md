# 数据迁移脚本文档

本目录包含用于数据库数据迁移和维护的脚本。

## 可用脚本

### 1. migrate-user-learning-profile.ts（基础版本）

将 `AmasUserState` 表中的用户状态数据迁移到新的 `UserLearningProfile` 表。

### 2. migrate-user-profiles.ts（完整版本，推荐）

将 `AmasUserState` 和 `HabitProfile` 数据整合并迁移到 `UserLearningProfile` 表。

### 3. verify-profile-consistency.ts

独立的数据一致性校验工具，用于检查迁移后的数据质量。

---

## 快速开始

### 推荐使用完整版本

```bash
# 1. 预览迁移（不修改数据）
npm run migrate:user-profiles

# 2. 执行迁移
npm run migrate:user-profiles:execute

# 3. 验证结果
npm run verify:profile-consistency
```

**详细使用文档**: [MIGRATION_USAGE.md](./MIGRATION_USAGE.md)

---

## UserLearningProfile 数据迁移脚本（基础版本）

### 概述

`migrate-user-learning-profile.ts` 用于将 `AmasUserState` 表中的用户状态数据迁移到新的 `UserLearningProfile` 表。

**注意**: 此版本不包含 HabitProfile 数据合并功能。如需完整功能，请使用 `migrate-user-profiles.ts`。

### 功能特性

- ✅ **增量迁移**：使用 `upsert` 操作，支持重复运行而不会重复插入数据
- ✅ **数据验证**：迁移前验证数据有效性，包括必需字段和数值范围检查
- ✅ **数据转换**：智能转换认知档案、情绪基线、心流状态等字段
- ✅ **备份机制**：执行模式下自动备份现有数据
- ✅ **回滚支持**：可通过 `--rollback` 参数回滚到备份状态
- ✅ **批量处理**：使用事务批量处理，提高性能和可靠性
- ✅ **进度日志**：详细的迁移进度和错误日志
- ✅ **一致性校验**：迁移后自动验证数据一致性

### 数据映射关系

从 `AmasUserState` 到 `UserLearningProfile` 的字段映射：

| AmasUserState                          | UserLearningProfile   | 转换逻辑                                          |
| -------------------------------------- | --------------------- | ------------------------------------------------- |
| `userId`                               | `userId`              | 直接映射                                          |
| `attention`                            | `attention`           | 直接映射                                          |
| `fatigue`                              | `fatigue`             | 直接映射                                          |
| `motivation`                           | `motivation`          | 直接映射                                          |
| `cognitiveProfile.mem/speed/stability` | `theta`               | 综合计算：(mem + speed + stability) / 3           |
| `confidence`                           | `thetaVariance`       | 反向计算：1 - confidence                          |
| `trendState.emotion`                   | `emotionBaseline`     | 解析 JSON 提取情绪标签                            |
| `attention + motivation`               | `flowScore`           | 心流分数：attention _ 0.6 + abs(motivation) _ 0.4 |
| -                                      | `flowBaseline`        | 固定值：0.5                                       |
| -                                      | `activePolicyVersion` | 默认值：'v1'                                      |
| `cognitiveProfile`                     | `forgettingParams`    | JSON 字符串化                                     |
| -                                      | `lastReportedEmotion` | 初始值：null                                      |

### 使用方法

#### 1. 预览模式（推荐首次运行）

查看将要迁移的数据，不会修改数据库：

```bash
npm run migrate:user-learning-profile
```

或

```bash
npm run migrate:user-learning-profile:verify
```

#### 2. 执行迁移

实际执行数据迁移：

```bash
npm run migrate:user-learning-profile:execute
```

或

```bash
npm run migrate:user-learning-profile -- --execute
```

#### 3. 验证迁移结果

单独验证迁移结果（不执行迁移）：

```bash
npm run migrate:user-learning-profile:verify
```

或

```bash
npm run migrate:user-learning-profile -- --verify
```

#### 4. 回滚迁移

回滚到迁移前的备份状态（仅在同一会话中有效）：

```bash
npm run migrate:user-learning-profile:rollback
```

或

```bash
npm run migrate:user-learning-profile -- --rollback
```

### 输出说明

#### 预览模式输出

```
================================================================================
UserLearningProfile 数据迁移工具
================================================================================

🚀 开始迁移 AmasUserState -> UserLearningProfile

📋 模式: 预览模式（不修改数据）

📊 查询 AmasUserState 数据...
   找到 100 条记录

🔍 验证用户数据...
   ✅ 有效记录: 98
   ⚠️  跳过 2 条无效记录（用户不存在）

🔧 数据验证与转换...
✅ 已转换 98 条记录

📋 转换后的数据示例（前10条）:
----------------------------------------------------------------------------------------------------
1. userId: xxx-xxx-xxx
   theta: 0.651, thetaVariance: 0.100
   attention: 0.432, fatigue: 0.915, motivation: 0.488
   emotionBaseline: neutral, flowScore: 0.363
...

⚠️  预览模式：未修改任何数据
💡 如需执行迁移，请使用: npm run migrate:user-learning-profile -- --execute
```

#### 执行模式输出

```
================================================================================
UserLearningProfile 数据迁移工具
================================================================================

🚀 开始迁移 AmasUserState -> UserLearningProfile

📋 模式: 执行模式

📊 查询 AmasUserState 数据...
   找到 100 条记录

🔍 验证用户数据...
   ✅ 有效记录: 100

📦 备份现有的 UserLearningProfile 数据...
✅ 已备份 50 条记录

🔧 数据验证与转换...
✅ 已转换 100 条记录

🔧 开始执行迁移...
   处理批次 1/2...
   处理批次 2/2...

================================================================================
📊 迁移统计:
   - 总记录数: 100
   - 成功: 100
   - 失败: 0
   - 跳过: 0

🔍 验证迁移结果...

📊 数据统计:
   - AmasUserState 记录数: 100
   - UserLearningProfile 记录数: 100
   - User 总数: 150

📈 覆盖率分析:
   - 有 AmasUserState 的用户: 100
   - 有 UserLearningProfile 的用户: 100
   - 缺少 UserLearningProfile 的用户: 0
   - 多余的 UserLearningProfile: 0

🔬 数据一致性检查（抽样10条）...
   ✅ 用户 xxx 数据一致
   ✅ 用户 xxx 数据一致
   ...

📋 验证总结:
   - 迁移覆盖率: 100.0%
   🎉 迁移完成度: 优秀

================================================================================
✅ 完成！
================================================================================
```

### 错误处理

脚本会自动处理以下情况：

1. **用户不存在**：跳过对应的 AmasUserState 记录
2. **数据验证失败**：记录错误详情并跳过
3. **数据转换失败**：捕获异常并记录
4. **批量插入失败**：记录整个批次的错误

所有错误都会在迁移统计中显示：

```
❌ 错误详情（前10条）:
   1. userId: xxx-xxx-xxx
      错误: Validation failed: attention out of range
   2. userId: yyy-yyy-yyy
      错误: Transformation failed: Invalid cognitiveProfile JSON
```

### 安全性保障

1. **预览模式优先**：首次运行时使用预览模式查看迁移计划
2. **自动备份**：执行模式下自动备份现有数据
3. **事务保护**：使用数据库事务确保批量操作的原子性
4. **增量迁移**：使用 `upsert` 避免重复插入
5. **数据验证**：迁移前后进行数据一致性校验

### 最佳实践

1. **首次运行预览**

   ```bash
   npm run migrate:user-learning-profile
   ```

   检查将要迁移的数据是否正确

2. **执行迁移**

   ```bash
   npm run migrate:user-learning-profile:execute
   ```

   确认无误后执行实际迁移

3. **验证结果**

   ```bash
   npm run migrate:user-learning-profile:verify
   ```

   迁移后再次验证数据一致性

4. **增量更新**

   如果有新的 AmasUserState 数据，可以直接重新运行执行命令，脚本会自动处理增量迁移。

### 故障排除

#### 问题：迁移覆盖率低于 100%

**可能原因**：

- 部分用户的 AmasUserState 数据验证失败
- 部分用户不存在于 User 表

**解决方案**：

1. 查看错误详情，修复数据问题
2. 重新运行迁移脚本

#### 问题：数据一致性检查失败

**可能原因**：

- 数据转换逻辑错误
- 并发修改导致数据不一致

**解决方案**：

1. 检查 AmasUserState 原始数据
2. 如果需要，使用 `--rollback` 回滚
3. 修复数据后重新迁移

#### 问题：批量插入失败

**可能原因**：

- 数据库连接问题
- 唯一约束冲突
- 外键约束冲突

**解决方案**：

1. 检查数据库连接状态
2. 查看错误日志定位具体问题
3. 修复后重新运行

### 技术细节

#### 批处理配置

- **批次大小**：50 条记录/批次
- **事务处理**：每批使用独立事务
- **错误隔离**：单批失败不影响其他批次

#### 数据验证规则

- `attention`: [0, 1] 范围
- `fatigue`: [0, 1] 范围
- `motivation`: [-1, 1] 范围
- `theta`: [-3, 3] 范围（IRT 能力参数）
- `thetaVariance`: [0.1, 2] 范围

#### 性能指标

- **处理速度**：约 50-100 条/秒（取决于数据库性能）
- **内存占用**：低（使用批量处理和流式查询）
- **事务时长**：每批约 0.5-2 秒

### 相关文档

- [Prisma Schema](/packages/backend/prisma/schema.prisma)
- [AmasUserState Model](/packages/backend/prisma/schema.prisma#L269-L287)
- [UserLearningProfile Model](/packages/backend/prisma/schema.prisma#L870-L890)

### 维护记录

| 日期       | 版本  | 说明                       |
| ---------- | ----- | -------------------------- |
| 2025-12-12 | 1.0.0 | 初始版本，支持基本迁移功能 |

### 联系方式

如有问题或建议，请联系开发团队或提交 Issue。
