# 单词掌握度评估系统 - 需求文档

## 1. 项目信息

- **项目名称**: Word Mastery Evaluation System
- **版本**: v1.0
- **创建日期**: 2024
- **关联模块**: AMAS Engine, SRS System

## 2. 功能需求

### 2.1 计算层 - ACT-R 记忆模型扩展

#### FR-2.1.1 记忆提取概率计算

**描述**: 扩展现有 `ACTRMemoryModel`，增加提取概率计算方法

**输入**:
```typescript
interface ReviewTrace {
  secondsAgo: number;      // 距今秒数
  isCorrect?: boolean;     // 是否正确（影响权重）
  responseTime?: number;   // 响应时间（可选）
}
```

**输出**:
```typescript
interface RecallPrediction {
  activation: number;      // 激活度 (通常 -2 到 2)
  recallProbability: number; // 提取概率 [0, 1]
  confidence: number;      // 预测置信度 [0, 1]
}
```

**验收标准**:
- [ ] `retrievalProbability(activation)` 返回 [0, 1] 范围的概率值
- [ ] 复习次数越多、间隔越短，概率越高
- [ ] 错误复习应用惩罚因子（现有逻辑）

#### FR-2.1.2 最佳复习间隔预测

**描述**: 根据当前记忆状态，预测最佳下次复习时间

**输入**: `ReviewTrace[]`

**输出**: 
```typescript
interface IntervalPrediction {
  optimalSeconds: number;    // 最佳间隔（秒）
  minSeconds: number;        // 最小建议间隔
  maxSeconds: number;        // 最大建议间隔
  targetRecall: number;      // 目标提取概率（默认 0.9）
}
```

**验收标准**:
- [ ] 记忆越强，建议间隔越长
- [ ] 返回的间隔在合理范围内（1小时 ~ 30天）

---

### 2.2 追踪层 - WordMemoryTracker

#### FR-2.2.1 复习事件记录

**描述**: 记录用户对单词的每次复习事件

**接口**:
```typescript
recordReview(
  userId: string,
  wordId: string,
  event: {
    timestamp: number;
    isCorrect: boolean;
    responseTime: number;
  }
): Promise<void>
```

**验收标准**:
- [ ] 事件按时间顺序存储
- [ ] 支持同一单词多次复习记录
- [ ] 数据持久化到数据库

#### FR-2.2.2 复习历史查询

**描述**: 获取单词的复习历史轨迹

**接口**:
```typescript
getReviewTrace(
  userId: string,
  wordId: string,
  limit?: number  // 默认最近 50 条
): Promise<ReviewTrace[]>
```

**验收标准**:
- [ ] 返回按时间倒序排列的记录
- [ ] `secondsAgo` 字段正确计算
- [ ] 支持限制返回数量

#### FR-2.2.3 批量查询

**描述**: 批量获取多个单词的记忆状态

**接口**:
```typescript
batchGetMemoryState(
  userId: string,
  wordIds: string[]
): Promise<Map<string, WordMemoryState>>

interface WordMemoryState {
  wordId: string;
  reviewCount: number;
  lastReviewTs: number;
  trace: ReviewTrace[];
}
```

**验收标准**:
- [ ] 单次查询支持至少 100 个单词
- [ ] 使用批量数据库查询，避免 N+1 问题

---

### 2.3 服务层 - WordMasteryEvaluator

#### FR-2.3.1 单词掌握度评估

**描述**: 融合多源数据，评估单词是否学会

**接口**:
```typescript
evaluate(
  userId: string,
  wordId: string
): Promise<MasteryEvaluation>

interface MasteryEvaluation {
  isLearned: boolean;        // 是否学会
  score: number;             // 综合评分 [0, 1]
  confidence: number;        // 置信度 [0, 1]
  factors: {
    srsLevel: number;        // SRS 掌握等级 [0, 5]
    actrRecall: number;      // ACT-R 预测提取概率 [0, 1]
    recentAccuracy: number;  // 近期正确率 [0, 1]
    userFatigue: number;     // 用户疲劳度 [0, 1]
  };
  suggestion?: string;       // 建议文本（可选）
}
```

**验收标准**:
- [ ] `isLearned` 在 score >= 0.7 时为 true
- [ ] 疲劳度高时降低 confidence
- [ ] 所有 factors 字段正确填充

#### FR-2.3.2 批量评估

**描述**: 批量评估多个单词的掌握度

**接口**:
```typescript
batchEvaluate(
  userId: string,
  wordIds: string[]
): Promise<MasteryEvaluation[]>
```

**验收标准**:
- [ ] 并行处理，性能优于串行调用
- [ ] 单次支持至少 100 个单词
- [ ] 总耗时 < 500ms（100 个单词）

#### FR-2.3.3 配置权重

**描述**: 支持自定义评分权重

**接口**:
```typescript
interface EvaluatorConfig {
  weights: {
    srs: number;      // 默认 0.3
    actr: number;     // 默认 0.5
    recent: number;   // 默认 0.2
  };
  threshold: number;  // 默认 0.7
  fatigueImpact: number; // 默认 0.3
}

updateConfig(config: Partial<EvaluatorConfig>): void
```

**验收标准**:
- [ ] 权重支持动态调整
- [ ] 配置变更立即生效

---

### 2.4 数据持久化

#### FR-2.4.1 数据库模型

**描述**: 新增 Prisma 模型存储复习轨迹

```prisma
model WordReviewTrace {
  id          String   @id @default(cuid())
  userId      String
  wordId      String
  timestamp   DateTime
  isCorrect   Boolean
  responseTime Int     // 毫秒
  createdAt   DateTime @default(now())

  @@index([userId, wordId])
  @@index([userId, wordId, timestamp])
}
```

**验收标准**:
- [ ] 迁移脚本正确执行
- [ ] 索引支持高效查询

#### FR-2.4.2 数据清理

**描述**: 定期清理过期的复习记录

**规则**:
- 保留最近 6 个月的记录
- 每个单词最多保留 100 条记录

**验收标准**:
- [ ] 清理任务可配置执行周期
- [ ] 清理不影响正常业务

---

### 2.5 API 接口

#### FR-2.5.1 REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/words/:wordId/mastery` | 获取单词掌握度评估 |
| POST | `/api/words/mastery/batch` | 批量获取掌握度评估 |
| GET | `/api/words/:wordId/memory-trace` | 获取复习历史轨迹 |
| GET | `/api/users/mastery-stats` | 获取用户整体掌握统计 |

#### FR-2.5.2 响应格式

```typescript
// GET /api/words/:wordId/mastery
{
  "success": true,
  "data": {
    "wordId": "word-123",
    "isLearned": true,
    "score": 0.82,
    "confidence": 0.95,
    "factors": {
      "srsLevel": 4,
      "actrRecall": 0.85,
      "recentAccuracy": 0.9,
      "userFatigue": 0.15
    },
    "suggestion": null
  }
}
```

---

## 3. 非功能需求

### 3.1 性能要求

| 指标 | 要求 |
|------|------|
| 单词评估延迟 | < 50ms |
| 批量评估延迟（100词） | < 500ms |
| 复习记录写入延迟 | < 20ms |
| 数据库查询 | 避免 N+1 |

### 3.2 可靠性要求

- 评估失败时返回降级结果（使用 SRS 数据）
- 数据库不可用时使用内存缓存
- 所有异常记录日志

### 3.3 可维护性要求

- 代码覆盖率 > 80%
- 核心算法有单元测试
- 关键配置支持热更新

---

## 4. 实现优先级

### P0 - 核心功能（必须）

- [ ] FR-2.1.1 记忆提取概率计算
- [ ] FR-2.2.1 复习事件记录
- [ ] FR-2.2.2 复习历史查询
- [ ] FR-2.3.1 单词掌握度评估
- [ ] FR-2.4.1 数据库模型

### P1 - 重要功能（应该）

- [ ] FR-2.1.2 最佳复习间隔预测
- [ ] FR-2.2.3 批量查询
- [ ] FR-2.3.2 批量评估
- [ ] FR-2.5.1 REST API

### P2 - 增强功能（可以）

- [ ] FR-2.3.3 配置权重
- [ ] FR-2.4.2 数据清理
- [ ] FR-2.5.2 响应格式优化

---

## 5. 技术约束

### 5.1 技术栈

- 后端: Node.js + TypeScript
- 数据库: PostgreSQL + Prisma
- 现有框架: Express.js

### 5.2 代码位置

```
backend/src/
├── amas/
│   ├── modeling/
│   │   └── actr-memory.ts      # 扩展现有文件
│   ├── tracking/
│   │   └── word-memory-tracker.ts  # 新增
│   └── evaluation/
│       └── word-mastery-evaluator.ts  # 新增
├── services/
│   └── word-mastery.service.ts  # 新增
├── routes/
│   └── word-mastery.routes.ts   # 新增
└── prisma/
    └── schema.prisma            # 修改
```

### 5.3 依赖关系

```
WordMasteryEvaluator
    ├── ACTRMemoryModel (现有，需扩展)
    ├── WordMemoryTracker (新增)
    ├── WordStateService (现有)
    ├── WordScoreService (现有)
    └── AMASEngine (现有)
```

---

## 6. 测试要求

### 6.1 单元测试

- ACT-R 公式计算正确性
- 边界条件处理（空数据、极端值）
- 权重配置生效

### 6.2 集成测试

- 完整数据流：答题 → 记录 → 评估
- 批量操作性能
- 与现有 SRS 系统兼容

### 6.3 测试数据

```typescript
// 测试用例：记忆衰减曲线
const testCases = [
  { trace: [{ secondsAgo: 3600 }], expectedRecall: '>0.8' },      // 1小时前复习
  { trace: [{ secondsAgo: 86400 }], expectedRecall: '0.5-0.7' },  // 1天前复习
  { trace: [{ secondsAgo: 604800 }], expectedRecall: '<0.3' },    // 7天前复习
];
```

---

## 7. 里程碑

| 阶段 | 内容 | 预估时间 |
|------|------|----------|
| M1 | 计算层扩展 + 单元测试 | 2天 |
| M2 | 追踪层实现 + 数据库迁移 | 2天 |
| M3 | 服务层实现 + 集成测试 | 2天 |
| M4 | API 接口 + 文档 | 1天 |
| M5 | 性能优化 + 上线 | 1天 |

**总计**: 约 8 个工作日
