# 动态调整学习单词队列 - 实现计划

> 创建时间：2024-12-02
> 状态：待实现

## 1. 功能概述

在学习过程中，根据用户实时状态（AMAS）和表现趋势，**每 3 题动态调整待学习的单词队列**，包括 pending 和 active 队列。

### 核心目标
- 疲劳/注意力下降时 → 换成简单词
- 连续错误时 → 插入已掌握的简单词（提振信心）
- 表现优秀时 → 可尝试更难的词
- 某词反复错 → 移到队列后部或替换

### 调整时机
- **常规**：每 3 题触发一次检查
- **紧急**：连续 3 次错误 或 疲劳度 > 0.8 时立即触发

---

## 2. 技术方案

### 2.1 新增后端 API

**接口**：`POST /api/learning/adjust-words`

**请求参数**：
```typescript
interface AdjustWordsRequest {
  sessionId: string;           // 当前学习会话ID
  currentWordIds: string[];    // 当前 pending + active 队列中的单词ID
  masteredWordIds: string[];   // 已掌握的单词ID（排除）
  userState?: {                // 用户当前状态（来自AMAS）
    fatigue: number;           // 疲劳度 [0,1]
    attention: number;         // 注意力 [0,1]
    motivation: number;        // 动机 [-1,1]
  };
  recentPerformance: {         // 最近表现
    accuracy: number;          // 最近N题正确率 [0,1]
    avgResponseTime: number;   // 平均响应时间(ms)
    consecutiveWrong: number;  // 当前连续错误数
  };
  adjustReason: 'fatigue' | 'struggling' | 'excelling' | 'periodic';
}
```

**响应**：
```typescript
interface AdjustWordsResponse {
  adjustments: {
    remove: string[];          // 从队列移除的单词ID
    add: Array<{               // 新增的单词
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
      difficulty: number;      // 计算的难度值 [0,1]
    }>;
  };
  targetDifficulty: {          // 目标难度范围
    min: number;
    max: number;
  };
  reason: string;              // 调整说明（可用于UI展示）
}
```

### 2.2 难度计算公式

```
单词难度 = 0.3 × 词长因子 + 0.7 × (1 - 用户历史正确率)

其中：
- 词长因子 = min(1, (字母数 - 3) / 12)
- 用户历史正确率 = 该用户对该词的历史正确次数 / 总答题次数
- 新词默认正确率 = 0.5
```

### 2.3 目标难度范围决策

| 条件 | 目标难度范围 | 说明 |
|-----|-------------|------|
| fatigue > 0.7 | [0, 0.4] | 疲劳，只选简单词 |
| consecutiveWrong >= 3 | [0, 0.3] | 连续错误，插入简单词 |
| accuracy < 0.5 且下降趋势 | [0.1, 0.5] | 挣扎中，降低难度 |
| attention < 0.5 | [0.2, 0.6] | 注意力低，减少挑战 |
| accuracy > 0.85 且 motivation > 0.5 | [0.4, 0.9] | 表现优秀，提升难度 |
| 默认 | [0.2, 0.7] | 正常范围 |

---

## 3. 实现步骤

### Phase 1: 后端 API（预计 2h）

- [ ] **Step 1.1**: 在 `mastery-learning.service.ts` 新增方法
  - `adjustWordsForUser()` - 主入口
  - `computeTargetDifficulty()` - 计算目标难度范围
  - `batchComputeDifficulty()` - 批量计算单词难度
  - `fetchWordsInDifficultyRange()` - 获取指定难度范围的单词

- [ ] **Step 1.2**: 在 `learning.routes.ts` 新增路由
  - `POST /api/learning/adjust-words`
  - 参数校验
  - 错误处理

- [ ] **Step 1.3**: 单元测试
  - 难度计算测试
  - API 响应测试

### Phase 2: 前端队列管理（预计 2h）

- [ ] **Step 2.1**: 扩展 `WordQueueManager.ts`
  - 新增 `applyAdjustments()` 方法
  - 新增 `getCurrentWordIds()` 方法
  - 新增 `getMasteredWordIds()` 方法

- [ ] **Step 2.2**: 新建 `AdaptiveQueueManager.ts`
  - 答题计数和触发逻辑
  - 最近表现统计
  - 紧急条件检测
  - API 调用封装

- [ ] **Step 2.3**: 在 `ApiClient.ts` 新增方法
  - `adjustLearningWords()` - 调用调整 API

### Phase 3: Hook 集成（预计 1h）

- [ ] **Step 3.1**: 修改 `useMasteryLearning.ts`
  - 集成 `AdaptiveQueueManager`
  - 在 `submitAnswer` 后触发检查
  - 处理调整结果
  - 更新缓存

- [ ] **Step 3.2**: 调整日志记录
  - 记录调整事件
  - 可选：UI 提示调整原因

### Phase 4: 测试与优化（预计 1h）

- [ ] **Step 4.1**: 端到端测试
  - 模拟疲劳场景
  - 模拟连续错误场景
  - 模拟优秀表现场景

- [ ] **Step 4.2**: 性能优化
  - 确保 API 响应 < 200ms
  - 批量查询优化

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|-----|------|------|
| `backend/src/services/mastery-learning.service.ts` | 修改 | 新增调整逻辑 |
| `backend/src/routes/learning.routes.ts` | 修改 | 新增 API 路由 |
| `src/services/ApiClient.ts` | 修改 | 新增 API 方法 |
| `src/services/learning/WordQueueManager.ts` | 修改 | 新增调整方法 |
| `src/services/learning/AdaptiveQueueManager.ts` | **新建** | 自适应管理器 |
| `src/hooks/useMasteryLearning.ts` | 修改 | 集成调整逻辑 |

---

## 5. 接口依赖

```
useMasteryLearning (Hook)
    │
    ├── WordQueueManager (队列管理)
    │       └── applyAdjustments()
    │
    ├── AdaptiveQueueManager (自适应管理) [新建]
    │       ├── onAnswerSubmitted()
    │       ├── shouldAdjust()
    │       └── triggerAdjustment()
    │
    └── ApiClient
            └── adjustLearningWords() → POST /api/learning/adjust-words
                                              │
                                              ▼
                                    masteryLearningService
                                              │
                                              ├── adjustWordsForUser()
                                              ├── computeTargetDifficulty()
                                              ├── batchComputeDifficulty()
                                              └── fetchWordsInDifficultyRange()
```

---

## 6. 风险与注意事项

1. **网络延迟**：调整 API 可能有延迟，需异步处理，不阻塞答题流程
2. **词库不足**：当符合难度范围的词不够时，需要降级处理
3. **缓存同步**：调整后需更新本地缓存（localStorage）
4. **会话恢复**：恢复会话时需考虑之前的调整状态

---

## 7. 后续扩展

- [ ] UI 展示调整原因（如 "检测到疲劳，已切换为简单词汇"）
- [ ] 调整历史记录（用于数据分析）
- [ ] 可配置的调整策略参数
- [ ] A/B 测试不同调整策略的效果
