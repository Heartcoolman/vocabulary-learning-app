# 系统迁移指南

本文档整合了系统中所有重要的迁移指南，帮助开发者快速完成代码迁移和系统升级。

## 目录

1. [学习服务迁移](#1-学习服务迁移)
2. [用户画像服务迁移](#2-用户画像服务迁移)
3. [AMAS决策流水线迁移](#3-amas决策流水线迁移)
4. [数据迁移](#4-数据迁移)

---

## 1. 学习服务迁移

### 概述

三个独立的学习服务已合并到统一的 `LearningStateService`：

- `WordStateService` (单词学习状态)
- `WordScoreService` (单词得分)
- `WordMasteryService` (掌握度评估)

### 快速迁移

#### 更新导入

```typescript
// 旧代码
import { wordStateService } from './services/word-state.service';
import { wordScoreService } from './services/word-score.service';
import { wordMasteryService } from './services/word-mastery.service';

// 新代码
import { learningStateService } from './services/learning-state.service';
```

#### API映射

| 旧服务             | 旧方法               | 新方法                                    |
| ------------------ | -------------------- | ----------------------------------------- |
| wordStateService   | getWordState()       | learningStateService.getWordState()       |
| wordStateService   | batchGetWordStates() | learningStateService.batchGetWordStates() |
| wordScoreService   | getWordScore()       | learningStateService.getWordScore()       |
| wordScoreService   | updateScore()        | learningStateService.updateWordScore()    |
| wordMasteryService | evaluateWord()       | learningStateService.evaluateWord()       |
| wordMasteryService | recordReview()       | learningStateService.recordReview()       |

### 新增功能

#### 统一的完整状态查询

```typescript
// 一次获取单词的完整学习状态（包括学习状态、分数、掌握度）
const completeState = await learningStateService.getWordState(
  userId,
  wordId,
  true, // includeMastery
);
// 返回: { learningState, score, mastery }
```

#### 综合学习统计

```typescript
// 获取用户的综合学习统计
const stats = await learningStateService.getUserLearningStats(userId);
// 返回: { stateStats, scoreStats, masteryStats }
```

### 详细文档

完整的API映射和迁移示例，请参阅 [docs/archive/LEARNING_SERVICES_MIGRATION_GUIDE.md](docs/archive/LEARNING_SERVICES_MIGRATION_GUIDE.md)

---

## 2. 用户画像服务迁移

### 概述

三个用户领域服务已整合到统一的 `UserProfileService`：

- `user.service.ts` (用户基础信息)
- `habit-profile.service.ts` (学习习惯画像)
- `cognitive-profiling.service.ts` (认知画像)

### 快速迁移

#### 更新导入

```typescript
// 旧代码
import userService from '../services/user.service';
import { habitProfileService } from '../services/habit-profile.service';
import {
  getChronotypeProfile,
  getLearningStyleProfile,
} from '../services/cognitive-profiling.service';

// 新代码
import { userProfileService } from '../services/user-profile.service';
```

#### API映射

| 旧服务                    | 旧方法                    | 新方法                                   |
| ------------------------- | ------------------------- | ---------------------------------------- |
| userService               | getUserById()             | userProfileService.getUserById()         |
| userService               | updatePassword()          | userProfileService.updatePassword()      |
| habitProfileService       | getProfile()              | userProfileService.getUserProfile()      |
| habitProfileService       | updateProfile()           | userProfileService.updateHabitProfile()  |
| cognitiveProfilingService | getChronotypeProfile()    | userProfileService.getCognitiveProfile() |
| cognitiveProfilingService | getLearningStyleProfile() | userProfileService.getCognitiveProfile() |

### 新增功能

#### 获取完整用户画像

```typescript
// 一次获取所有画像数据
const profile = await userProfileService.getUserProfile(userId, {
  includeHabit: true, // 学习习惯画像
  includeCognitive: true, // 认知画像（时间节律、学习风格）
  includeLearning: true, // 学习档案
});

// profile 包含：
// - user: 用户基础信息
// - habitProfile: 学习习惯画像
// - cognitiveProfile: { chronotype, learningStyle }
// - learningProfile: 学习档案
```

#### 学习档案管理

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

### 详细文档

完整的迁移指南和示例，请参阅 [docs/USER_PROFILE_SERVICE_MIGRATION.md](docs/USER_PROFILE_SERVICE_MIGRATION.md)

---

## 3. AMAS决策流水线迁移

### 概述

AMAS Decision Pipeline 是一个异步决策轨迹记录系统，用于捕获和分析AMAS的决策过程。

### 核心功能

- **异步记录**: 决策轨迹异步写入数据库，不阻塞主业务流程
- **流水线追踪**: 记录感知/建模/学习/决策/评估/优化六个阶段
- **可观测性**: Prometheus格式指标，支持监控和告警
- **特性开关**: 通过环境变量控制数据源和读写权限

### 分阶段部署

#### Phase 1: 数据库Schema变更

```bash
cd packages/backend
npx prisma migrate deploy
```

#### Phase 2: 代码部署（虚拟数据源）

```bash
# 使用默认配置（虚拟数据源，写入禁用）
npm run dev
```

#### Phase 3: 启用真实数据源（只读）

```bash
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
npm run dev
```

#### Phase 4: 启用写入（灰度）

```bash
AMAS_ABOUT_DATA_SOURCE=real \
AMAS_REAL_DATA_READ_ENABLED=true \
AMAS_REAL_DATA_WRITE_ENABLED=true \
npm run dev
```

### 环境变量配置

| 变量                         | 值             | 说明             |
| ---------------------------- | -------------- | ---------------- |
| AMAS_ABOUT_DATA_SOURCE       | virtual / real | 数据源选择       |
| AMAS_REAL_DATA_READ_ENABLED  | true / false   | 真实数据读取权限 |
| AMAS_REAL_DATA_WRITE_ENABLED | true / false   | 决策记录写入权限 |

### 监控指标

- `amas_write_success_total` - 写入成功次数
- `amas_write_failure_total` - 写入失败次数
- `amas_queue_size` - 队列长度
- `amas_queue_backpressure_total` - 背压触发次数

### 详细文档

完整的部署流程、监控配置和故障排查，请参阅 [docs/archive/AMAS_DECISION_PIPELINE_MIGRATION.md](docs/archive/AMAS_DECISION_PIPELINE_MIGRATION.md)

---

## 4. 数据迁移

### UserLearningProfile 数据迁移

将 `AmasUserState` 表的数据迁移到 `UserLearningProfile` 表。

#### 快速开始

##### 第一步：预览迁移

```bash
npm run migrate:user-learning-profile
```

##### 第二步：执行迁移

```bash
npm run migrate:user-learning-profile:execute
```

##### 第三步：验证结果

```bash
npm run migrate:user-learning-profile:verify
```

#### 数据映射

| 源字段 (AmasUserState) | 目标字段 (UserLearningProfile) | 转换说明                            |
| ---------------------- | ------------------------------ | ----------------------------------- |
| userId                 | userId                         | 直接映射                            |
| attention              | attention                      | 直接映射 (0-1)                      |
| fatigue                | fatigue                        | 直接映射 (0-1)                      |
| motivation             | motivation                     | 直接映射 (-1 到 1)                  |
| cognitiveProfile       | theta                          | 计算：(mem + speed + stability) / 3 |
| confidence             | thetaVariance                  | 计算：1 - confidence                |

### 详细文档

完整的迁移步骤和故障排查，请参阅 [src/scripts/MIGRATION_GUIDE.md](src/scripts/MIGRATION_GUIDE.md)

---

## 兼容性说明

### 向后兼容

所有旧服务都标记为 `@deprecated` 但仍然可用，确保现有代码不会立即中断：

- 旧的学习服务仍可使用
- 旧的用户服务仍可使用
- 所有现有API端点继续工作

### 建议迁移时间线

1. **立即**: 新代码使用新服务
2. **1-2周**: 逐步迁移现有代码
3. **1个月后**: 考虑移除旧服务的导出
4. **未来**: 可能删除旧服务文件

---

## 测试验证

### 单元测试

```bash
npm test
```

### TypeScript编译检查

```bash
npm run build
```

### 集成测试

```bash
npm run test:integration
```

---

## 常见问题

### Q: 为什么不直接删除旧服务？

A: 为了向后兼容和平滑迁移。旧服务标记为 `@deprecated` 后，开发者可以逐步迁移代码，而不会立即中断现有功能。

### Q: 迁移后性能会有影响吗？

A: 不会。新服务只是重新组织了代码结构，核心逻辑没有改变。某些情况下，通过统一接口一次获取多个数据反而更高效。

### Q: 如何处理迁移过程中的错误？

A:

1. 查看相应的详细迁移文档
2. 检查旧服务文件中的 `@deprecated` 注释
3. 参考新服务的完整API文档
4. 查看已更新的路由文件作为实际示例

---

## 获取帮助

如果在迁移过程中遇到问题：

1. 查看本指南中的详细文档链接
2. 检查 [docs/](docs/) 目录下的相关文档
3. 查看 [docs/archive/](docs/archive/) 目录下的历史文档
4. 联系开发团队或提交Issue

---

## 文档结构

```
packages/backend/
├── MIGRATION_GUIDE.md           # 本文档 - 统一迁移指南
├── README.md                    # 项目主文档
├── docs/
│   ├── README.md               # 文档索引
│   ├── USER_PROFILE_SERVICE_MIGRATION.md
│   ├── amas-contracts.md
│   ├── amas-file-reorganization.md
│   └── archive/                # 历史文档存档
│       ├── LEARNING_SERVICES_MIGRATION_GUIDE.md
│       ├── AMAS_DECISION_PIPELINE_MIGRATION.md
│       ├── AMAS_REORGANIZATION_PLAN.md
│       └── ...
└── src/
    └── scripts/
        └── MIGRATION_GUIDE.md  # 数据迁移脚本指南
```

---

最后更新时间: 2025-12-12
