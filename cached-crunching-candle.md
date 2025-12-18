# Rust 后端完全迁移计划 (消除 TypeScript 依赖)

## 目标

完全移除对 TypeScript 后端的依赖，实现 Rust 后端独立运行。

## 约束条件

- **执行方式**: 全程 AI 完成，按阶段步骤执行
- **算法策略**: 可以在迁移过程中优化算法实现
- **回滚策略**: TypeScript 代码归档保留但不运行

## 当前状态

| 指标       | 当前值 (2025-12-18)   | 目标值  | 进度         |
| ---------- | --------------------- | ------- | ------------ |
| API 端点   | 306/344               | 344     | 89%          |
| 服务模块   | 8/51 (关键逻辑已实现) | 51      | 16% (高内聚) |
| 数据库操作 | 412+ SQLx Queries     | 535+    | 77%          |
| 代码行数   | 56,401 行             | ~25,000 | 225%         |

## 关键阻塞项

### 1. AMAS 服务 (最高优先级)

- **当前**: `packages/backend-rust/src/services/amas.rs` (44 行空壳)
- **需要**: ~2,000 行完整实现
- **参考**: `packages/backend/src/services/amas.service.ts` (2,028 行)

### 2. 上游代理依赖

- **当前**: `packages/backend-rust/src/upstream_proxy.rs` 转发未实现端点
- **需要**: 删除代理，所有端点原生实现

---

## Phase 1: 基础设施 (第 1-2 周)

### 1.1 移除上游代理

**修改文件**:

- `packages/backend-rust/src/upstream_proxy.rs` - 删除
- `packages/backend-rust/src/main.rs` - 移除代理初始化
- `packages/backend-rust/src/state.rs` - 移除 `upstream_proxy` 字段
- `packages/backend-rust/src/routes/mod.rs` - 移除 `fallback_handler` 中的代理逻辑

**新增**:

```rust
// state.rs - 移除这个字段
pub struct AppState {
    // upstream_proxy: Option<Arc<UpstreamProxy>>, // 删除
}

// routes/mod.rs - 修改 fallback_handler
async fn fallback_handler() -> Response {
    // 移除代理转发，直接返回 404
    json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "接口不存在")
}
```

### 1.2 数据库操作层扩展

**创建目录**: `packages/backend-rust/src/db/operations/`

**新增文件**:

- `db/operations/mod.rs`
- `db/operations/amas.rs` - AMAS 相关表操作
- `db/operations/user.rs` - 用户相关表操作
- `db/operations/learning.rs` - 学习相关表操作
- `db/operations/content.rs` - 内容相关表操作

**核心表操作 (需实现)**:

```
amas_user_states, amas_user_models, decision_records,
decision_insights, pipeline_stages, feature_vectors,
reward_queue, habit_profiles, user_learning_profiles,
user_state_history, word_review_traces
```

---

## Phase 2: AMAS 引擎迁移 (第 3-6 周) - 关键路径

### 2.1 AMAS 目录结构

**创建**: `packages/backend-rust/src/amas/`

```
src/amas/
├── mod.rs           # 模块导出
├── types.rs         # 核心类型定义
├── config.rs        # 配置管理
├── engine.rs        # 主引擎
├── modeling/
│   ├── mod.rs
│   ├── attention.rs      # 注意力监控
│   ├── fatigue.rs        # 疲劳估计
│   ├── cognitive.rs      # 认知画像
│   ├── motivation.rs     # 动机追踪
│   └── trend.rs          # 趋势分析
├── decision/
│   ├── mod.rs
│   ├── ensemble.rs       # 集成决策
│   ├── coldstart.rs      # 冷启动
│   └── heuristic.rs      # 启发式
└── persistence.rs        # 持久化
```

### 2.2 核心类型定义

**文件**: `src/amas/types.rs`

```rust
pub struct UserState {
    pub attention: f64,          // A: 注意力水平
    pub fatigue: f64,            // F: 疲劳度
    pub motivation: f64,         // M: 动机水平
    pub cognitive: CognitiveProfile,  // C: 认知画像
    pub trend: TrendIndicator,   // T: 趋势指示
    pub confidence: f64,         // conf: 置信度
    pub timestamp: i64,          // ts: 时间戳
}

pub struct CognitiveProfile {
    pub memory: f64,      // 记忆能力
    pub speed: f64,       // 处理速度
    pub stability: f64,   // 稳定性
}

pub struct StrategyParams {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: f64,
    pub batch_size: usize,
    pub hint_level: u8,
}

pub struct ProcessResult {
    pub state: UserState,
    pub strategy: StrategyParams,
    pub reward: f64,
    pub explanation: String,
    pub feature_vector: Vec<f64>,
    pub word_mastery_decision: WordMasteryDecision,
}
```

### 2.3 引擎实现

**文件**: `src/amas/engine.rs`

**参考**: `packages/backend/src/amas/core/engine.ts`

**关键方法**:

```rust
impl AMASEngine {
    pub async fn process_event(&self, event: RawEvent) -> Result<ProcessResult>;
    pub async fn get_next_words(&self, user_id: &str, count: usize) -> Result<Vec<Word>>;
    pub async fn update_state(&self, user_id: &str, state: UserState) -> Result<()>;
    pub async fn select_strategy(&self, state: &UserState) -> StrategyParams;
}
```

### 2.4 算法集成

**复用**: `packages/native/src/` 中的算法

- LinUCB: `linucb/mod.rs`
- Thompson Sampling: `thompson/mod.rs`
- ACT-R: `actr/mod.rs`
- Causal Inference: `causal/estimator.rs`

**通过**: `crates/danci-algo` 引入 (已配置)

---

## Phase 3: 服务迁移 (第 7-10 周)

### 3.1 迁移顺序 (按依赖关系)

#### Sprint 1 - P0 核心服务

| 服务     | TS 文件                     | Rust 目标                    | 行数        |
| -------- | --------------------------- | ---------------------------- | ----------- |
| AMAS     | `amas.service.ts`           | `services/amas.rs`           | 2,028→1,600 |
| 学习状态 | `learning-state.service.ts` | `services/learning_state.rs` | 1,180→900   |
| AMAS配置 | `amas-config.service.ts`    | `services/amas_config.rs`    | 513→400     |

#### Sprint 2 - P1 用户画像

| 服务     | TS 文件                          | Rust 目标                   | 行数      |
| -------- | -------------------------------- | --------------------------- | --------- |
| 用户画像 | `user-profile.service.ts`        | `services/user_profile.rs`  | 1,041→800 |
| 习惯画像 | `habit-profile.service.ts`       | `services/habit_profile.rs` | 187→150   |
| 状态历史 | `state-history.service.ts`       | `services/state_history.rs` | 649→500   |
| 认知画像 | `cognitive-profiling.service.ts` | `services/cognitive.rs`     | 158→130   |

#### Sprint 3 - P2 学习评估

| 服务     | TS 文件                     | Rust 目标                    | 行数      |
| -------- | --------------------------- | ---------------------------- | --------- |
| 评估     | `evaluation.service.ts`     | `services/evaluation.rs`     | 248→200   |
| 延迟奖励 | `delayed-reward.service.ts` | `services/delayed_reward.rs` | 231→180   |
| 实验     | `experiment.service.ts`     | `services/experiment.rs`     | 1,036→800 |

#### Sprint 4 - P3 内容展示

| 服务       | TS 文件                     | Rust 目标                    | 行数        |
| ---------- | --------------------------- | ---------------------------- | ----------- |
| About      | `about.service.ts`          | `services/about.rs`          | 1,372→1,000 |
| Real About | `real-about.service.ts`     | `services/real_about.rs`     | 2,010→1,500 |
| 可解释性   | `explainability.service.ts` | `services/explainability.rs` | 620→480     |
| 单词选择   | `word-selection.service.ts` | `services/word_selection.rs` | 764→600     |

#### Sprint 5 - P4 辅助服务

| 服务     | TS 文件                     | Rust 目标                    | 行数    |
| -------- | --------------------------- | ---------------------------- | ------- |
| 通知     | `notification.service.ts`   | `services/notification.rs`   | 639→500 |
| 徽章     | `badge.service.ts`          | `services/badge.rs`          | 568→450 |
| 趋势分析 | `trend-analysis.service.ts` | `services/trend_analysis.rs` | 713→550 |
| 计划生成 | `plan-generator.service.ts` | `services/plan_generator.rs` | 577→450 |

#### Sprint 6 - P5 其他服务

剩余 25+ 服务按优先级逐步迁移

---

## Phase 4: 路由完善 (第 11-12 周)

### 4.1 路由模块状态

**已完整实现**:

- `v1_auth.rs`, `users.rs`, `words.rs`, `wordbooks.rs`
- `v1_sessions.rs`, `health.rs`, `study_config.rs`
- `records.rs`, `learning.rs`, `word_states.rs`, `word_scores.rs`

**需要完善** (当前为空壳或代理):

- `about.rs` - 24 端点
- `amas.rs` - 20 端点
- `admin/*.rs` - 57 端点
- `alerts.rs` - 8 端点
- `badges.rs` - 5 端点
- `experiments.rs` - 5 端点
- `llm_advisor.rs` - 9 端点
- `optimization.rs` - 8 端点
- `realtime.rs` - 6 端点 (SSE)

### 4.2 路由实现模板

```rust
// routes/xxx.rs
pub fn router() -> Router {
    Router::new()
        .route("/endpoint1", get(handler1))
        .route("/endpoint2", post(handler2))
        // 不再有 fallback 到上游
}

async fn handler1(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> impl IntoResponse {
    let service = XxxService::new(&state);
    match service.method().await {
        Ok(data) => json_success(data),
        Err(e) => json_error_from(e),
    }
}
```

---

## Phase 5: 测试验证 (第 13-14 周)

### 5.1 测试策略

**单元测试**:

- AMAS 算法正确性
- 状态转换逻辑
- 奖励计算
- 特征向量生成

**集成测试**:

- 所有 344 端点响应格式兼容
- 数据库操作完整性
- 热备系统故障切换

**契约测试**:

```bash
# 验证所有端点覆盖
cargo test --features contract-test
# 对比 api-contract.json
```

### 5.2 验证清单

- [ ] 344 端点全部返回正确响应
- [ ] AMAS 决策与 TS 版本一致 (±5% 容差)
- [ ] 双写系统数据一致
- [ ] SQLite 故障转移正常
- [ ] 性能不低于 TS 版本

---

## Phase 6: 切换与清理

### 6.1 切换步骤

1. 设置 `RUST_STANDALONE_MODE=true`
2. 移除 `LEGACY_BACKEND_URL` 环境变量
3. 删除 `upstream_proxy.rs`
4. 验证所有端点正常工作

### 6.2 清理任务

1. 从部署配置中移除 TypeScript 后端 (代码归档保留)
2. 更新部署文档
3. 清理 Cargo.toml 无用依赖
4. 归档 `packages/backend/` 目录 (保留不删除)

---

## 风险与缓解

| 风险           | 缓解措施                   |
| -------------- | -------------------------- |
| 算法结果偏差   | 并行对比测试，设置容差阈值 |
| 数据库迁移错误 | 双写验证，事务保护         |
| 性能退化       | 基准测试套件，性能监控     |
| 功能缺失       | 契约覆盖率检查             |
| 热备不兼容     | Schema 一致性检查          |

---

## Codex 验证补充 - 关键注意事项

### 1. AMAS 引擎迁移风险 (最高优先级)

**问题**: AMAS 是"需求/算法/数据"三重不确定性，44 行 stub 无法反映真实复杂度

**必须执行**:

- [ ] **规格冻结**: 从 TS 版本提炼输入/输出合同（请求、DB 依赖、返回结构、错误码）
- [ ] **黄金样本回归**: 抽取线上真实样本做回归测试，Rust 实现必须与 TS 输出逐条对比
- [ ] **确定性控制**: 对 Thompson 采样等随机算法引入可控 RNG seed，保证可重复性

### 2. 双写策略风险

**问题**: PostgreSQL + SQLite 双写的原子性难以保证

**必须执行**:

- [ ] 采用 **Outbox 模式**: 写主库 + outbox 异步投递到 SQLite，避免请求内同步双写
- [ ] 实现 **幂等键**: 记录每次写入的 request_id / business_key 防止重试造成重复
- [ ] 建立 **对账工具**: 周期性比对关键表 hash/计数，支持按时间窗口重放 outbox

### 3. SQLite 热备份注意事项

**问题**: WAL 模式、busy timeout、checkpoint、文件锁处理不当会导致数据损坏

**必须执行**:

- [ ] 标准化 PRAGMA 配置: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`
- [ ] 使用 **SQLite 官方 backup API** (rusqlite 支持)，禁止文件级复制
- [ ] 备份后执行 `PRAGMA integrity_check;` 校验
- [ ] 设置备份文件生命周期、磁盘空间告警

### 4. upstream_proxy.rs 移除清单

**问题**: proxy 组件可能承载隐式行为，删除后影响生产流量

**必须迁移到 Axum/Tower layer**:

- [ ] Header 透传 (X-Request-ID, X-Forwarded-For 等)
- [ ] 鉴权注入
- [ ] 超时/重试策略
- [ ] 流式响应 (SSE)
- [ ] 压缩 (gzip/br)
- [ ] 请求体大小限制
- [ ] CORS 配置

### 5. Prisma → SQLx 迁移陷阱

**必须注意**:

- [ ] `include/select` 查询语义差异，手写 SQL 容易漏条件
- [ ] N+1 查询问题：Prisma 可能做了合并缓存，手写 SQL 需用 `EXPLAIN` 验证
- [ ] NULL/默认值映射：Rust `Option<T>` 必须与数据库 schema 严格一致
- [ ] 时区统一：JS Date 与 Postgres timestamptz 差异，统一为 UTC + ISO8601
- [ ] 事务隔离级别：明确哪些写操作需要事务包裹

### 6. 推荐 Rust Crate 清单

**Web 层**:

- `axum` + `tower`/`tower-http`: 统一中间件
- `tracing` + `tracing-subscriber`: 结构化日志 (request_id/user_id/trace_id)
- `thiserror` + `anyhow`: 错误处理
- `config` 或 `figment`: 配置管理

**数据层**:

- `sqlx` + `sqlx::migrate!()`: 迁移脚本版本化
- 开启 SQLx **离线校验** (CI 中 `sqlx prepare`)
- `uuid`, `time`: 类型映射

### 7. 测试策略补充

**契约/回归测试 (必须)**:

- [ ] API 合同测试：从 TS 导出 OpenAPI，Rust 必须跑同一套契约
- [ ] 黄金样本回放：录制真实请求 + 固定 DB 快照 → TS 与 Rust 输出 diff
- [ ] **错误码/错误体测试**: 迁移最容易"成功路径一致、失败路径全变"

**集成测试**:

- [ ] 临时数据库测试 (Postgres/SQLite)
- [ ] 双写失败注入测试 (PG 成功 SQLite 失败、反之)
- [ ] 幂等验证

**性能测试**:

- [ ] P95/P99 延迟对比
- [ ] 关键 endpoint 并发压测
- [ ] 内存增长监控
- [ ] 热备份长时间运行测试

### 8. 架构决策点 (迁移前定义)

- [ ] **请求上下文**: 统一 request_id/trace_id/user_id 的携带与日志注入
- [ ] **统一鉴权模型**: 集中成 extractor + policy 层
- [ ] **错误分类**: 业务/依赖/超时/校验 分类 + 指标 (成功率/延迟/DB 错误)
- [ ] **发布策略**: 灰度/按路由切换/按用户切换机制 (344 endpoint 禁止一次性切换)

---

## 工作量估算

| 阶段               | 时长      | 复杂度 | 代码行数       |
| ------------------ | --------- | ------ | -------------- |
| Phase 1: 基础设施  | 2 周      | 中     | ~500           |
| Phase 2: AMAS 引擎 | 4 周      | **高** | ~4,000         |
| Phase 3: 服务迁移  | 4 周      | 高     | ~8,000         |
| Phase 4: 路由完善  | 2 周      | 中     | ~2,000         |
| Phase 5: 测试验证  | 2 周      | 中     | ~1,500         |
| Phase 6: 切换清理  | 2 周      | 低     | ~200           |
| **总计**           | **16 周** |        | **~16,200 行** |

---

## 关键文件清单

### TypeScript 参考 (需迁移)

```
packages/backend/src/services/amas.service.ts          # AMAS 核心
packages/backend/src/services/learning-state.service.ts # 状态管理
packages/backend/src/services/user-profile.service.ts  # 用户画像
packages/backend/src/amas/core/engine.ts               # 引擎架构
packages/backend/src/amas/modeling/*.ts                # 建模模块
```

### Rust 目标 (需创建/扩展)

```
packages/backend-rust/src/services/amas.rs             # 扩展 44→2000 行
packages/backend-rust/src/amas/                        # 新建目录
packages/backend-rust/src/services/learning_state.rs   # 新建
packages/backend-rust/src/services/user_profile.rs     # 新建
packages/backend-rust/src/db/operations/               # 新建目录
```

### 需删除

```
packages/backend-rust/src/upstream_proxy.rs            # 删除代理
```
