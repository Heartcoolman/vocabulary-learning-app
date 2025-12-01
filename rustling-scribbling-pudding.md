# AMAS公开展示页面 - 真实数据对接实施计划

## 需求概述

将AMAS公开展示页面（`/about`路由下的Dashboard、Simulation、Stats页面）从当前的**虚拟内存数据**切换到**真实用户学习数据**。

## 探索发现总结

### 当前架构
- **虚拟数据源**：`AboutService` 类使用内存存储（`recentDecisions[]`数组，最多50条）
- **真实数据源**：PostgreSQL数据库通过Prisma ORM访问
- **关键缺失**：决策元数据（算法选择、集成权重、成员投票）未持久化到数据库

### 数据库现状
**已有表**：
- `answer_records` - 答题记录（responseTime, isCorrect, dwellTime等）
- `amas_user_states` - 用户AFCM状态（attention, fatigue, motivation, cognitive）
- `user_state_history` - 每日状态快照
- `learning_sessions` - 学习会话
- `word_learning_states` - 单词掌握状态
- `word_scores` - 单词得分聚合

**缺失字段**：
- ❌ 决策来源（coldstart vs ensemble）
- ❌ 冷启动阶段（classify/explore/normal）
- ❌ 集成权重快照
- ❌ 成员投票详情
- ❌ 决策置信度

### 现有服务参考
- `AdminService` - 使用 `groupBy()` 并行聚合多表数据
- `TrendAnalysisService` - 查询数据库后内存聚合时序数据
- `RecordService` - 批量写入with `skipDuplicates`

## 用户决策确认 ✅

### 1. 数据完整性策略
**选择：方案B** - 添加决策元数据存储（完整方案）
- ✅ 需要修改数据库Schema添加决策元数据字段
- ✅ 需要修改AMAS引擎保存逻辑
- ✅ 可以完整复现所有Dashboard指标（算法贡献分布、决策来源、权重等）

### 2. 数据范围
**选择：选项A** - 显示所有用户的聚合数据
- ✅ 系统总览模式
- ✅ 需要实现数据脱敏/匿名化机制

### 3. 历史数据处理
**选择：选项A** - 仅统计新数据
- ✅ 从实施完成后开始记录决策元数据
- ✅ 历史answer_records保持不变
- ✅ 可能初期数据量较少，需要优雅降级显示

### 4. 新增需求：决策流程可视化 🆕
**Dashboard页面新增功能**：
- 需要展示完整的决策处理流水线
- 从数据输入 → 经过各模块（感知层、建模层、学习层、决策层、评估层、优化层）
- 显示每个模块做出的选择
- 追踪数据包在各模块间的流转
- 最终输出决策结果

**关键要求**：
- 必须基于真实数据（不是虚拟模拟）
- 需要持久化决策处理轨迹
- 支持按数据包ID查询完整处理历史

---

## 实施方案设计

### 一、数据库Schema设计

#### 1.1 新增表：DecisionRecord（决策记录）

```prisma
model DecisionRecord {
  id                String   @id @default(uuid())
  userId            String
  answerRecordId    String?  @unique  // 可选关联到answer_records
  sessionId         String?
  timestamp         DateTime @default(now())

  // 决策来源
  decisionSource    String   // 'coldstart' | 'ensemble' | 'fallback'
  coldstartPhase    String?  // 'classify' | 'explore' | 'normal'

  // 集成权重快照
  weightsSnapshot   Json     // { thompson, linucb, actr, heuristic }

  // 成员投票详情
  memberVotes       Json?    // { [member]: { action, contribution, confidence } }

  // 决策结果
  selectedAction    Json     // { difficulty, batch_size, interval_scale, ... }
  decisionConfidence Float

  // 奖励（延迟回填）
  reward            Float?

  // 处理轨迹（嵌入式JSON，避免多表JOIN）
  pipelineTrace     Json     // Array of stage traces
  totalDuration     Int      // 总处理时间(ms)

  createdAt         DateTime @default(now())

  @@index([userId, timestamp])
  @@index([decisionSource])
  @@index([timestamp])
  @@index([sessionId])
}
```

**设计决策说明**：
- **独立表而非扩展AnswerRecord**：避免修改高频写入的核心表，降低风险
- **pipelineTrace用JSON**：避免每条记录生成6行子表数据，减少写入压力
- **answerRecordId可选**：支持模拟场景（simulate API）不关联答题记录

#### 1.2 Pipeline Trace JSON结构

```typescript
interface PipelineTrace {
  stages: StageTrace[];
  totalDuration: number;
}

interface StageTrace {
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  stageName: string;        // "感知层" | "建模层" | ...
  nodeId: string;           // "feature_builder" | "ensemble" | ...
  startTime: number;        // 相对时间戳(ms)
  duration: number;         // 处理耗时(ms)
  input: Record<string, any>;  // 输入数据摘要
  output: Record<string, any>; // 输出数据摘要
  metadata?: {
    // 阶段特定元数据
    activeNodes?: string[];  // Stage 2: 并行处理的节点
    votingResult?: object;   // Stage 3: 投票结果
    guardRailsTriggered?: string[];  // Stage 4: 触发的护栏
  };
}
```

#### 1.3 聚合统计表（可选优化）

```prisma
model DecisionDailyStats {
  id                String   @id @default(uuid())
  date              DateTime @db.Date

  // 决策来源分布
  coldstartCount    Int      @default(0)
  ensembleCount     Int      @default(0)
  fallbackCount     Int      @default(0)

  // 阶段分布
  classifyPhaseCount Int     @default(0)
  explorePhaseCount  Int     @default(0)
  normalPhaseCount   Int     @default(0)

  // 算法累计贡献
  thompsonContrib   Float    @default(0)
  linucbContrib     Float    @default(0)
  actrContrib       Float    @default(0)
  heuristicContrib  Float    @default(0)

  // 性能指标
  avgDecisionTime   Float?
  avgConfidence     Float?
  totalDecisions    Int      @default(0)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([date])
  @@index([date])
}
```

---

### 二、AMAS引擎修改

#### 2.1 修改点：engine-core.ts

在 `processEvent()` 方法中，决策完成后保存元数据：

```typescript
// 伪代码位置：engine-core.ts:processEvent() 末尾

// 构建决策记录
const decisionRecord = {
  userId,
  answerRecordId: null, // 之后关联
  sessionId,
  timestamp: new Date(),
  decisionSource: decision.meta?.decisionSource ?? 'ensemble',
  coldstartPhase: decision.meta?.ensemblePhase ?? null,
  weightsSnapshot: decision.meta?.weights ?? this.getDefaultWeights(),
  memberVotes: decision.meta?.memberVotes ?? null,
  selectedAction: decision.action,
  decisionConfidence: decision.confidence ?? 0,
  pipelineTrace: this.buildPipelineTrace(startTime, state, decision),
  totalDuration: Date.now() - startTime,
};

// 异步保存（不阻塞响应）
this.persistDecisionRecord(decisionRecord).catch(err => {
  console.warn('[AMAS] 决策记录保存失败:', err);
});
```

#### 2.2 构建Pipeline Trace

```typescript
private buildPipelineTrace(
  startTime: number,
  state: UserState,
  decision: ActionSelection
): PipelineTrace {
  const now = Date.now();

  return {
    stages: [
      {
        stage: 1,
        stageName: '感知层',
        nodeId: 'feature_builder',
        startTime: 0,
        duration: 5,
        input: { eventType: 'answer', wordId: '...' },
        output: { featureCount: 22 }
      },
      {
        stage: 2,
        stageName: '建模层',
        nodeId: 'modeling_group',
        startTime: 5,
        duration: 12,
        input: { featureVector: '...' },
        output: { A: state.A, F: state.F, M: state.M },
        metadata: { activeNodes: ['attention', 'fatigue', 'motivation', 'cognitive', 'trend'] }
      },
      {
        stage: 3,
        stageName: '学习层',
        nodeId: decision.meta?.decisionSource === 'coldstart' ? 'coldstart' : 'ensemble',
        startTime: 17,
        duration: 15,
        input: { userState: { A: state.A, F: state.F, M: state.M } },
        output: {
          selectedAction: decision.action.difficulty,
          confidence: decision.confidence
        },
        metadata: {
          votingResult: decision.meta?.memberVotes,
          weights: decision.meta?.weights
        }
      },
      {
        stage: 4,
        stageName: '决策层',
        nodeId: 'guardrails',
        startTime: 32,
        duration: 3,
        input: { rawAction: decision.action },
        output: { finalAction: decision.action },
        metadata: { guardRailsTriggered: [] }
      },
      // Stage 5, 6 可在延迟奖励时回填
    ],
    totalDuration: now - startTime
  };
}
```

---

### 三、数据查询服务设计

#### 3.1 新服务：RealAboutService

```typescript
// backend/src/services/real-about.service.ts

class RealAboutService {
  private readonly cacheTTL = 60 * 1000; // 60秒缓存
  private cache = new Map<string, { data: any; expiry: number }>();

  // ==================== 统计API ====================

  async getOverviewStats(): Promise<OverviewStats> {
    return this.withCache('overview', async () => {
      const now = new Date();
      const todayStart = startOfDay(now);

      const [todayDecisions, activeUsers] = await Promise.all([
        prisma.decisionRecord.count({
          where: { timestamp: { gte: todayStart } }
        }),
        prisma.decisionRecord.groupBy({
          by: ['userId'],
          where: { timestamp: { gte: subHours(now, 24) } },
          _count: true
        }).then(r => r.length)
      ]);

      // 效率计算：对比有AMAS决策 vs 无的正确率提升
      const avgEfficiencyGain = await this.computeEfficiencyGain();

      return {
        todayDecisions,
        activeUsers,
        avgEfficiencyGain,
        timestamp: now.toISOString()
      };
    });
  }

  async getAlgorithmDistribution(): Promise<AlgorithmDistribution> {
    return this.withCache('algorithmDist', async () => {
      const records = await prisma.decisionRecord.findMany({
        where: { timestamp: { gte: subDays(new Date(), 7) } },
        select: { decisionSource: true, weightsSnapshot: true }
      });

      // 聚合各算法贡献
      const contrib = { thompson: 0, linucb: 0, actr: 0, heuristic: 0, coldstart: 0 };
      for (const r of records) {
        if (r.decisionSource === 'coldstart') {
          contrib.coldstart += 1;
        } else {
          const w = r.weightsSnapshot as EnsembleWeights;
          contrib.thompson += w.thompson;
          contrib.linucb += w.linucb;
          contrib.actr += w.actr;
          contrib.heuristic += w.heuristic;
        }
      }

      // 归一化
      const total = Object.values(contrib).reduce((a, b) => a + b, 0) || 1;
      return Object.fromEntries(
        Object.entries(contrib).map(([k, v]) => [k, v / total])
      ) as AlgorithmDistribution;
    });
  }

  async getRecentDecisions(limit = 20): Promise<RecentDecision[]> {
    const records = await prisma.decisionRecord.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        timestamp: true,
        decisionSource: true,
        selectedAction: true,
        weightsSnapshot: true
      }
    });

    return records.map(r => ({
      pseudoId: this.anonymizeUserId(r.userId),
      timestamp: r.timestamp.toISOString(),
      decisionSource: r.decisionSource,
      strategy: {
        difficulty: (r.selectedAction as any).difficulty,
        batch_size: (r.selectedAction as any).batch_size
      },
      dominantFactor: this.getDominantAlgorithm(r.weightsSnapshot)
    }));
  }

  // ==================== Pipeline可视化API ====================

  async getPipelineSnapshot(): Promise<PipelineSnapshot> {
    // 获取最近的决策作为"实时"数据包
    const recentRecords = await prisma.decisionRecord.findMany({
      orderBy: { timestamp: 'desc' },
      take: 15,
      select: {
        id: true,
        timestamp: true,
        pipelineTrace: true,
        decisionSource: true
      }
    });

    // 转换为可视化数据包格式
    const packets = recentRecords.map(r => this.recordToPacket(r));

    // 计算节点状态
    const nodeStates = this.computeNodeStates(recentRecords);

    // 计算指标
    const metrics = await this.computePipelineMetrics();

    return {
      timestamp: Date.now(),
      currentPackets: packets,
      nodeStates,
      metrics
    };
  }

  async getPacketTrace(packetId: string): Promise<PacketTrace> {
    const record = await prisma.decisionRecord.findUnique({
      where: { id: packetId }
    });

    if (!record) {
      throw new Error('Decision record not found');
    }

    const trace = record.pipelineTrace as PipelineTrace;

    return {
      packetId,
      status: 'completed',
      stages: trace.stages.map(s => ({
        stage: String(s.stage),
        stageName: s.stageName,
        nodeId: s.nodeId,
        duration: s.duration,
        input: JSON.stringify(s.input),
        output: JSON.stringify(s.output),
        details: s.metadata ? JSON.stringify(s.metadata) : undefined,
        timestamp: record.timestamp.getTime() + s.startTime
      })),
      totalDuration: trace.totalDuration
    };
  }

  // ==================== 辅助方法 ====================

  private anonymizeUserId(userId: string): string {
    const salt = this.getDailySalt();
    return crypto.createHash('sha256')
      .update(`${userId}:${salt}`)
      .digest('hex')
      .substring(0, 8);
  }

  private withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return Promise.resolve(cached.data);
    }
    return fn().then(data => {
      this.cache.set(key, { data, expiry: Date.now() + this.cacheTTL });
      return data;
    });
  }
}
```

---

### 四、前端适配

前端代码（DashboardPage, SimulationPage, StatsPage）**无需修改**。

API响应格式保持与当前虚拟实现一致，只需切换后端数据源。

---

### 五、实施阶段

#### Phase 1: 数据库Schema（预计1天）
1. 添加 `DecisionRecord` 表到 schema.prisma
2. 添加 `DecisionDailyStats` 表（可选）
3. 运行 `prisma migrate dev`
4. 验证表结构

**涉及文件**：
- `backend/prisma/schema.prisma`

#### Phase 2: AMAS引擎集成（预计2天）
1. 在 `engine-core.ts` 添加决策记录逻辑
2. 实现 `buildPipelineTrace()` 方法
3. 实现异步持久化
4. 添加单元测试

**涉及文件**：
- `backend/src/amas/engine/engine-core.ts`
- `backend/src/amas/engine/engine-types.ts`

#### Phase 3: 查询服务（预计2天）
1. 创建 `RealAboutService` 类
2. 实现所有统计查询方法
3. 实现Pipeline可视化API
4. 实现缓存机制
5. 添加数据脱敏

**涉及文件**：
- `backend/src/services/real-about.service.ts`（新建）
- `backend/src/routes/about.routes.ts`（切换服务）

#### Phase 4: 集成测试与优化（预计1天）
1. 端到端测试
2. 性能优化（索引调整）
3. 空数据降级处理
4. 文档更新

---

### 六、关键文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/prisma/schema.prisma` | 新增 | DecisionRecord表 |
| `backend/src/amas/engine/engine-core.ts` | 修改 | 添加决策记录保存 |
| `backend/src/services/real-about.service.ts` | 新建 | 真实数据查询服务 |
| `backend/src/routes/about.routes.ts` | 修改 | 切换到新服务 |
| `backend/src/services/about.service.ts` | 保留 | 作为fallback/演示 |

---

### 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 写入性能影响 | 异步保存，不阻塞响应 |
| 初期数据量低 | 检测数据量，低于阈值使用默认值/提示 |
| 查询慢 | 预聚合 + 60s缓存 + 合理索引 |
| 历史数据无元数据 | 明确只统计新数据，UI提示"数据从XX日期开始" |
