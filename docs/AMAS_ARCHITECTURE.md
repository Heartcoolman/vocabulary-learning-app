# AMAS 架构蓝图

## 1. 分层视图

| 层级 | 职责 | 关键实现 |
| --- | --- | --- |
| 感知 Perception | 将 `RecordService` 产生的原始事件标准化、窗口化、生成 `FeatureVector` | `backend/src/amas/perception/feature-builder.ts`、`backend/src/amas/config/action-space.ts` (`DEFAULT_PERCEPTION_CONFIG`)
| 建模 Modeling | 维护用户级状态 `A/F/C/M/T`，从连续事件估计注意力、疲劳、认知、动机与趋势 | `backend/src/amas/modeling/attention-monitor.ts`、`.../fatigue-estimator.ts`、`.../cognitive-profiler.ts`、`.../motivation-tracker.ts`、`.../trend-analyzer.ts`
| 记忆建模 | 基于 ACT-R 的长期记忆推断与最优间隔计算 | `backend/src/amas/modeling/actr-memory.ts`
| 学习 Learning | LinUCB、ColdStart、Thompson、Heuristic、Ensemble 等多臂策略选择与更新 | `backend/src/amas/learning/linucb.ts`、`.../coldstart.ts`、`.../thompson-sampling.ts`、`.../heuristic.ts`、`backend/src/amas/decision/ensemble.ts`
| 决策 Decision | 将动作映射到策略参数、施加 guardrail、安全降级、生成解释与建议 | `backend/src/amas/decision/mapper.ts`、`.../guardrails.ts`、`.../explain.ts`、`.../fallback.ts`
| 评估 Evaluation | 计算掌握度、延迟奖励、因果与实验评估 | `backend/src/amas/evaluation/word-mastery-evaluator.ts`、`.../delayed-reward-aggregator.ts`、`.../causal-inference.ts`
| 追踪 Tracking | 维持学习轨迹、记忆状态的持久化查询能力 | `backend/src/amas/tracking/word-memory-tracker.ts`
| 服务层 Routes/Services | 对外 API、依赖注入、鉴权、节流 | `backend/src/services/record.service.ts`、`backend/src/services/word-mastery.service.ts`、`backend/src/services/amas.service.ts`、`backend/src/routes/word-mastery.routes.ts`、`backend/src/routes/amas.routes.ts`、`backend/src/app.ts`

## 2. 端到端流程

> 路由入口：`backend/src/routes/amas.routes.ts` / `word-mastery.routes.ts` 通过 `authMiddleware` 鉴权后调用 `AMASService`（`backend/src/services/amas.service.ts`）。服务层在构造函数中实例化 `AMASEngine`，并注入 `databaseStateRepository`、`databaseModelRepository`，确保所有用户状态都走数据库持久化。

0. **服务编排 (`amas.service.ts`)**：`processLearningEvent` 负责接收 REST 事件、补齐 `sessionId`、调用 `AMASEngine.processEvent`，并在成功后将 `ProcessResult` 扔给 `delayedRewardService`、`stateHistoryService` 等下游服务。
1. **事件写入 (`record.service.ts`)**：
   - 校验单词归属与时间戳，写入 `answerRecord`。
   - 通过 `wordMasteryService.recordReview` 将 `ReviewEvent` 转存到 `word_review_traces`（幂等依赖数据库唯一约束）。
2. **感知层 (`FeatureBuilder.processEvent`)**：
   - 以用户为粒度维护滑动窗口，归一化响应时间、停顿、切屏、失焦等信号。
   - 若检测到异常（如噪点或缺失字段），中止主流程并交由 `AMASEngine.createIntelligentFallbackResult`。
3. **建模层 (`updateUserState`)**：
   - `AttentionMonitor.update` 通过 `sigmoid(-w·f)` 生成 `A`；权重从 `DEFAULT_ATTENTION_WEIGHTS` 注入。
   - `FatigueEstimator.update` 将错误率趋势、反应时间增量和重复错误映射为疲劳得分 `F`，包含 EMA 衰减。
   - `CognitiveProfiler` 使用正确率与方差估计 `C.mem/speed/stability`；`MotivationTracker` 用成功/失败事件更新 `M`。
   - 可选 `TrendAnalyzer` 对长期能力曲线进行 `up/flat/down/stuck` 判定。
4. **策略选择 (`AMASEngine.processEventCore`)**：
   - 根据 `ColdStartManager` 阶段决定使用探索脚本或主策略。
   - `LinUCB.selectFromActionSpace` 计算 `p = θ^T x + α * sqrt(x^T A^{-1} x)`，或 `EnsembleLearningFramework` 汇聚 LinUCB/Thompson/ACT-R/Heuristic 结果。
   - 生成 `Action`（间隔、新词比例、难度、批量、提示级别）。
5. **决策装配**：
   - `mapActionToStrategy` 将动作投射到 `StrategyParams`，再由 `applyGuardrails` 校验疲劳、注意力、动机与趋势阈值，必要时触发 `shouldSuggestBreak`。
   - `generateExplanation` / `generateSuggestion` 结合 `FeatureVector.labels` 输出解释文本与学习建议。
6. **奖励与更新**：
   - `computeReward` 基于正确率、反应时间、停留时长与 `REWARD_WEIGHTS` 计算 `r∈[-1,1]`。
   - `bandit.update`、`coldStart.update`、`userParams.updateParams` 根据 `r` 调整参数；`featureVector` 以 `PersistableFeatureVector` 形式写入以供延迟奖励。
7. **持久化与弹性**：
   - `StateRepository.saveState` 与 `ModelRepository.saveModel` 保存最新 `UserState` 与 bandit 参数；生产环境必须提供数据库实现，否则构造函数抛错。
   - `withUserLock`、`CircuitBreaker`、100ms 超时守卫保障串行一致性。
8. **评估与外部查询**：
   - `WordMasteryService` 读取 `amasUserState` 疲劳度后调用 `WordMasteryEvaluator`。
   - `word-mastery.routes.ts` 暴露 `/api/word-mastery` 系列接口，统一鉴权、中间件与限流。

## 3. 核心算法与原理

### 3.1 注意力/疲劳/动机模型

- **注意力**：`A_t = β · A_{t-1} + (1-β) · sigmoid(-Σ w_i f_i)`，其中 `β=ATTENTION_SMOOTHING`，`w_i` 取自 `DEFAULT_ATTENTION_WEIGHTS`（`config/action-space.ts`）。
- **疲劳**：
  - `F_base = β · Δerr + γ · Δrt + δ · repeat`（`β/γ/δ` 来自 `DEFAULT_FATIGUE_PARAMS`）。
  - `F_decay = F_t · exp(-k · breakMinutes)`（`k=0.08`，`breakMinutes` 为最近一次休息分钟数）。
  - `F_increment = F_base · (1 - F_decay) · 0.5`（使用剩余容量折扣与平滑因子抑制突增）。
  - `F_{t+1} = clip(F_decay + F_increment)`；`clip` 会把范围固定在 `[0.05, 1.0]`，并在 `breakMinutes > longBreakThreshold(30)` 时重置为 0.1。
- **动机**：`M_t = clamp(ρ · M_{t-1} + κ · successes - λ · failures - μ · quits, -1, 1)`，参数 `rho/kappa/lambda/mu` 取自 `DEFAULT_MOTIVATION_PARAMS`。

### 3.2 ACT-R 记忆模型

- **激活度**：`B = ln(Σ_j w_j · t_j^{-d}) + ε`，`w_j` 对错误复习应用 `ERROR_PENALTY=0.3`，`ε~N(0, σ)`（均在 `modeling/actr-memory.ts` 定义）。
- **回忆概率**：`P = 1 / (1 + exp(-(B - τ)/s))`，默认 `d=0.5`、`τ=0.3`、`s=0.4`。
- **最优间隔**：二分搜索 `Δt` 使 `P(Δt)=targetRecall`（默认 0.9），搜索范围至 7 天，精度 `1e-3`。
- **动作调度**：`selectAction` 依据 `P` 在易/中/难动作中排序选取，同时输出置信度 `|P-0.5|*2`。

### 3.3 LinUCB / Ensemble / Cold Start

- **LinUCB**：
  - 维护 `A`（d×d）与 `b`（d×1）；初始化 `A = DEFAULT_LAMBDA · I_d`（`DEFAULT_LAMBDA` 定义于 `config/action-space.ts`）。
  - 选择臂：`p_i = θ_i^T x + α · √(x^T A_i^{-1} x)`；`α` 可由 `getColdStartAlpha` 结合交互次数、准确率、疲劳调整。
  - 更新：`A_i ← A_i + x x^T`，`b_i ← b_i + r x`，并维护 `updateCount`。
- **ColdStartManager**：`classify → explore → normal` 三阶段；前两阶段使用预定义脚本减少探索成本。
- **Ensemble**：组合 LinUCB、Thompson、ACT-R、Heuristic，以 `weights`（受 `getEnsembleLearnerFlags` 控制）加权评分；内部 LinUCB 参数可复用存储。

### 3.4 Guardrails 与回退

- `applyGuardrails` 会按顺序调用 `applyFatigueProtection`、`applyMotivationProtection`、`applyAttentionProtection`、`applyTrendProtection`（均位于 `decision/guardrails.ts`），并依赖 `config/action-space.ts` 中的阈值：如 `CRITICAL_FATIGUE=0.8` 触发强制休息、`MIN_ATTENTION=0.3` 触发降级策略、`LOW_MOTIVATION=-0.3` 降低难度。
- `shouldSuggestBreak` 与 `shouldForceBreak` 仅依据疲劳阈值（`HIGH_FATIGUE=0.6`、`CRITICAL_FATIGUE=0.8`）决定是否在响应中加入休息提示或直接短路。
- 触发保护后，`mapActionToStrategy` 会重新计算批量、新词比例、提示级别，并通过常规日志记录原因（暂无专用 telemetry 事件）。
- `intelligentFallback` 依据 `FallbackReason`（`circuit_open`、`exception`、`degraded_state`、`timeout` 等）回退到 `DEFAULT_STRATEGY`、`HeuristicLearner` 或提示休息，并记录日志以便审计。

### 3.5 奖励与解释

- 奖励由正确性、反应时间、停留时长、提示使用等指标按 `REWARD_WEIGHTS` 加权求和，并夹在 `[-1,1]`。
- `generateExplanation` 结合 `FeatureVector.labels`，列出主要影响因子、策略变化；`generateSuggestion` 以当前 `A/F/M` 输出自然语言建议。

## 4. 记忆追踪与掌握度评估

### 4.1 `word_review_traces` 表

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT (PK) | 唯一事件 ID |
| `userId` / `wordId` | TEXT | 复合索引支撑用户-单词查询 |
| `timestamp` | TIMESTAMP(3) | 事件发生时间 |
| `isCorrect` | BOOLEAN | 是否答对 |
| `responseTime` | INTEGER | 反应时 (ms) |
| `createdAt` | TIMESTAMP | 服务器写入时间 |

索引 `userId_wordId` 与 `userId_wordId_timestamp` 支撑单词轨迹和区间查询；外键确保用户与单词级联删除。

### 4.2 `WordMemoryTracker`

- `recordReview` / `batchRecordReview` 使用 Prisma `create` / `createMany`，批量操作可避免多次往返。
- `getReviewTrace` 限制单次 100 条，返回 `ReviewTrace{secondsAgo,isCorrect}`，供 ACT-R 直接消费。
- `batchGetMemoryState` 将查询结果按单词分组，返还 `reviewCount`、`lastReviewTs`、`trace`。
- 清理接口 `cleanupOldRecords`、`trimWordRecords` 控制存储成本与热数据集大小。
- 所有写入由 `RecordService.createRecord/batchCreateRecords` 触发，后者在写 `answerRecord` 成功后调用 `wordMasteryService.recordReview/batchRecordReview`；`word_review_traces` 本身无唯一约束，因此幂等性需要调用方确保（例如重放时传入过滤后的事件）。
- 写入失败会被捕获并 `console.warn`，不阻塞主事务；调用方可根据需要补偿或重放。

### 4.3 `WordMasteryEvaluator`

- 默认权重：`w_srs=0.3`、`w_actr=0.5`、`w_recent=0.2`；阈值 `threshold=0.7`、疲劳影响 `fatigueImpact=0.3`。
- 评价流程：
  1. 并行读取 `wordStateService` (SRS) 与 `wordScoreService` (recentAccuracy) 以及 `WordMemoryTracker` (trace)。
  2. `ACTRMemoryModel.retrievalProbability(trace)` 产出 `actrRecall`。
  3. `rawScore = w_srs * (level/5) + w_actr * actrRecall + w_recent * recentAccuracy`。
  4. `confidence = 1 - fatigue * fatigueImpact`；`isLearned = (rawScore * confidence) ≥ threshold`。
  5. `generateSuggestion` 根据 recall 与 SRS 等级给出复习建议。
- `batchEvaluate` 利用 Map 结构复用批量查询结果，避免 N+1。
- `WordMasteryService` 在未显式传入疲劳度时会从 `prisma.amasUserState` 读取 `fatigue` 字段，用于衰减 `confidence` 并保证评估与实时状态一致。

### 4.4 服务与路由

- `WordMasteryService` 聚合 evaluator + tracker + ACT-R，提供 `evaluateWord`、`batchEvaluateWords`、`getUserMasteryStats`、`predictInterval` 等接口。
- `word-mastery.routes.ts` （挂载于 `/api/word-mastery`）提供：
  - `GET /:wordId`：查询参数 `userFatigue`（0-1）可覆盖默认疲劳，响应 `{ success, data: MasteryEvaluation }`。
  - `POST /batch`：请求体 `{ wordIds: string[], userFatigue?: number }`，强制校验数组非空且长度 ≤ `MAX_BATCH_SIZE=100`，错误时返回 400 + 描述。
  - `GET /:wordId/trace`：支持 `limit`（≤100），返回 `{ wordId, trace[], count }`。
  - `GET /stats`：返回 `UserMasteryStats`，包含 `totalWords/masteredWords/learningWords/newWords/averageScore/averageRecall/needReviewCount`。
  - `GET /:wordId/interval`：可选 `targetRecall`（0-1），响应 `{ interval: IntervalPrediction, humanReadable }`。

## 5. 状态、弹性与可观测性

- **存储接口**：`StateRepository` / `ModelRepository` 在生产中由 `databaseStateRepository` / `databaseModelRepository`（`backend/src/amas/repositories/database-repository.ts`）实现，分别写入 `amasUserState` 与 `amasUserModel` 表：前者持久化 `attention/fatigue/motivation/confidence/C/H/T/ts`，后者序列化 LinUCB 的 `A/b/L/d/lambda/alpha/updateCount`。构造 `AMASEngine` 时如未传入数据库仓库且 `NODE_ENV=production` 会直接抛错，防止误用内存存储。
- **并发控制**：`withUserLock` 将每个 `userId` 映射到一个 Promise 链，新的事件会在上一个 Promise 完成后运行，从而避免并发写入；`interactionCounts` 追踪交互次数并决定 `ColdStartPhase` 阈值（<15 classify，<50 explore）。
- **熔断与超时**：`createDefaultCircuitBreaker` 使用 `failureThreshold=0.5`、`windowSize=20`、`windowDurationMs=60s`、`openDurationMs=5s`、`halfOpenProbe=2`；`executeWithTimeout` + `AbortController` 将核心处理包裹在 100ms 限制内并触发 `TimeoutFlag`。
- **降级路径**：
  - `intelligentFallback` 依据 `FallbackReason` 选择默认策略、heuristic 或提示休息。
  - `telemetry.record` 会打点 `amas.decision.latency`（直方图）、`amas.degradation`（异常计数）、`amas.circuit.event` 与 `amas.circuit.transition`（熔断状态）、`amas.timeout`（超时次数），并透传 `telemetry.increment` 所需的标签（用户ID、reason 等）。

## 6. API 与扩展点

- `backend/src/app.ts` 通过 `app.use('/api/amas', amasRoutes)` 与 `app.use('/api/word-mastery', wordMasteryRoutes)` 将 AMAS 能力暴露给前端；所有路由共享 `authMiddleware` 与速率限制策略。
- 扩展点：
  - 新的特征或建模器可通过 `EngineDependencies` 注入（如自定义 `FeatureBuilder`、`TrendAnalyzer`）。
  - 评估/追踪层可扩展新的 `evaluation/*` 模块并在 `index.ts` 导出。
  - 通过 `feature-flags` 控制 Ensemble、TrendAnalyzer、ColdStart、UserParams 等模块开关。

## 7. 质量保障与测试

- **单元测试**：`backend/tests/unit/amas/evaluation/word-mastery-evaluator.test.ts` 覆盖配置更新、单词评估、批量评估、疲劳对置信度的影响、建议生成与分数截断。
- **建议的附加测试**：
  - 对 `AMASEngine.processEvent` 的集成测试，验证并发锁、超时与 guardrail 行为。
  - 数据库存根测试，确保 `word_review_traces` CRUD 与清理逻辑安全。
- **可观察性**：结合 `telemetry` 指标与结构化日志（`httpLoggerMiddleware`、`logger`），可在 APM 中重建端到端 trace。
