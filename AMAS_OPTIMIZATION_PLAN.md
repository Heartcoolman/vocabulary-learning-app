# AMAS 冷启动与个性化优化方案

## 1. 现状分析与瓶颈定位

### 1.1 冷启动机制

**当前实现** (`packages/backend-rust/src/amas/decision/coldstart.rs`)

```rust
// 固定样本数配置
pub struct ColdStartConfig {
    pub classify_samples: i32,  // 默认 3
    pub explore_samples: i32,   // 默认 5
    pub probe_sequence: vec![0, 1, 2, 0, 1, 2],
}
```

**问题**:

- 分类仅依赖 `accuracy` 和 `response_time`，忽略已有的注意力、动机、认知等信号
- 固定样本数无法根据分类置信度提前结束
- `probe_sequence` 对比度不足，难以快速区分用户类型

### 1.2 Bandit 算法未使用上下文

**LinUCB** (`packages/backend-rust/src/amas/decision/linucb.rs:23-46`)

```rust
pub fn select_action(
    &self,
    _state: &UserState,      // 未使用
    _feature: &FeatureVector, // 未使用
    candidates: &[StrategyParams],
) -> Option<StrategyParams>
```

**Thompson Sampling** (`packages/backend-rust/src/amas/decision/thompson.rs:45-71`)

```rust
pub fn select_action(
    &mut self,
    _state: &UserState,      // 未使用
    _feature: &FeatureVector, // 未使用
    candidates: &[StrategyParams],
) -> Option<StrategyParams>
```

**问题**: 两个 bandit 算法都忽略了 `FeatureVector`，无法根据用户实时状态调整策略。

### 1.3 习惯画像未进入决策

**已有数据** (`packages/backend-rust/src/services/habit_profile.rs`)

- `time_pref`: 24小时偏好分布
- `rhythm_pref`: 会话时长中位数、批量中位数
- `preferred_time_slots`: 最佳学习时段

**当前使用** (`packages/backend-rust/src/amas/engine.rs:687-706`)

```rust
// 仅在 FeatureVector 中携带 time_pref，但 bandit 不消费
let time_pref = state.habit.as_ref()
    .and_then(|h| h.time_pref.get(hour).copied())
    .unwrap_or(0.5);
```

**问题**: `HeuristicLearner` 完全不考虑习惯画像，用户感知不到"系统在学习我"。

### 1.4 FSRS 参数全局固定

**当前实现** (`packages/backend-rust/src/services/fsrs.rs:7-22`)

```rust
pub struct FSRSParams {
    pub w: [f64; 17],  // 全局固定权重
}
```

**问题**: 所有用户使用相同的记忆曲线参数，无法适应个体差异。

### 1.5 多目标优化未参与决策

**当前实现** (`packages/backend-rust/src/amas/engine.rs:1040-1100`)

```rust
fn compute_objective_evaluation(...) -> ObjectiveEvaluation {
    // 计算指标但不影响策略
    // suggested_adjustments 始终为 None
}
```

---

## 2. 优化方向（按优先级排序）

### 优先级 1: 冷启动加速

#### 2.1.1 早停策略

**目标**: 用分类置信度替代固定样本数

**实现位置**: `packages/backend-rust/src/amas/decision/coldstart.rs`

**方案**:

```rust
// 新增配置
pub struct ColdStartConfig {
    pub classify_samples: i32,
    pub explore_samples: i32,
    pub probe_sequence: Vec<i32>,
    pub early_stop_confidence: f64,  // 新增: 默认 0.7
    pub min_classify_samples: i32,   // 新增: 默认 2
}

// 修改 handle_classify
fn handle_classify(&mut self, accuracy: f64, response_time: i64) -> Option<StrategyParams> {
    // ... 现有评分逻辑 ...

    self.state.update_count += 1;

    // 计算后验置信度
    let total = self.state.classification_scores.iter().sum::<f64>();
    let max_score = self.state.classification_scores.iter().cloned()
        .max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap_or(0.0);
    let confidence = if total > 0.0 { max_score / total } else { 0.0 };

    // 早停条件
    let should_stop = self.state.update_count >= self.config.classify_samples
        || (self.state.update_count >= self.config.min_classify_samples
            && confidence >= self.config.early_stop_confidence);

    if should_stop {
        // 进入 Explore 阶段
    }
}
```

#### 2.1.2 引入更多分类信号

**目标**: 将注意力、动机、认知、RT方差加入分类判据

**实现位置**:

- `packages/backend-rust/src/amas/decision/coldstart.rs`
- `packages/backend-rust/src/amas/engine.rs`

**方案**:

```rust
// 扩展 ColdStartManager::update 签名
pub fn update(
    &mut self,
    accuracy: f64,
    response_time: i64,
    attention: f64,      // 新增
    motivation: f64,     // 新增
    cognitive_mem: f64,  // 新增
    rt_variance: f64,    // 新增
) -> Option<StrategyParams>

// 修改分类逻辑
fn handle_classify(...) -> Option<StrategyParams> {
    // Fast 用户: 高准确率 + 快响应 + 高注意力 + 低RT方差
    let fast_score = if response_time < 2000 && accuracy > 0.8
        && attention > 0.7 && rt_variance < 0.3 { 1.0 } else { 0.0 };

    // Stable 用户: 中等表现 + 稳定认知
    let stable_score = if accuracy >= 0.6 && accuracy <= 0.85
        && cognitive_mem > 0.5 { 1.0 } else { 0.0 };

    // Cautious 用户: 慢响应或低准确率 + 低动机
    let cautious_score = if (response_time > 4000 || accuracy < 0.6)
        && motivation < 0.5 { 1.0 } else { 0.0 };
}
```

#### 2.1.3 高对比探针序列

**目标**: 让 probe_sequence 更"极端"，提升区分度

**实现位置**: `packages/backend-rust/src/amas/config.rs`

**方案**:

```rust
impl Default for ColdStartConfig {
    fn default() -> Self {
        Self {
            classify_samples: 3,
            explore_samples: 5,
            // 新序列: 极端对比 (Easy-Hard-Easy-Hard-Mid-Mid)
            probe_sequence: vec![0, 2, 0, 2, 1, 1],
            early_stop_confidence: 0.7,
            min_classify_samples: 2,
        }
    }
}
```

---

### 优先级 2: 习惯画像进入决策

#### 2.2.1 HeuristicLearner 集成习惯画像

**目标**: 在偏好时间提高难度/新词比例，非偏好时间降低

**实现位置**: `packages/backend-rust/src/amas/decision/heuristic.rs`

**方案**:

```rust
pub fn suggest(&self, state: &UserState, current: &StrategyParams) -> StrategyParams {
    let mut result = current.clone();

    // 现有逻辑...

    // 新增: 习惯画像调整
    if let Some(ref habit) = state.habit {
        let hour = chrono::Utc::now().hour() as usize;
        let time_pref = habit.time_pref.get(hour).copied().unwrap_or(0.5);

        // 偏好时段 (time_pref > 0.6): 提升挑战
        if time_pref > 0.6 && state.fatigue < 0.4 {
            result.batch_size = (result.batch_size + 2).min(16);
            result.new_ratio = (result.new_ratio + 0.05).min(0.4);
        }

        // 非偏好时段 (time_pref < 0.3): 降低负担
        if time_pref < 0.3 {
            result.batch_size = (result.batch_size - 2).max(5);
            result.hint_level = (result.hint_level + 1).min(2);
        }

        // 节奏偏好: 调整批量大小
        if let Some(ref rhythm) = habit.rhythm_pref {
            let target_batch = rhythm.batch_median as i32;
            result.batch_size = ((result.batch_size + target_batch) / 2).clamp(5, 16);
        }
    }

    result
}
```

#### 2.2.2 解释显式反馈习惯调整

**目标**: 让用户感知"系统在学习我"

**实现位置**: `packages/backend-rust/src/amas/engine.rs:928-970`

**方案**:

```rust
fn build_explanation(...) -> DecisionExplanation {
    let mut factors = Vec::new();

    // 现有逻辑...

    // 新增: 习惯画像因素
    if let Some(ref habit) = state.habit {
        let hour = chrono::Utc::now().hour() as usize;
        let time_pref = habit.time_pref.get(hour).copied().unwrap_or(0.5);

        if time_pref > 0.6 {
            factors.push(DecisionFactor {
                name: "学习习惯".to_string(),
                value: time_pref,
                impact: "当前是您的高效学习时段，适当提升挑战".to_string(),
                percentage: (time_pref * 100.0) as f64,
            });
        } else if time_pref < 0.3 {
            factors.push(DecisionFactor {
                name: "学习习惯".to_string(),
                value: time_pref,
                impact: "当前非您的常规学习时段，已降低学习强度".to_string(),
                percentage: (time_pref * 100.0) as f64,
            });
        }
    }
}
```

#### 2.2.3 实时习惯画像（降低样本门槛）

**目标**: 减少 learning_time 的样本门槛

**实现位置**: `packages/backend-rust/src/services/learning_time.rs`

**方案**:

```rust
// 当前: MIN_SESSION_COUNT = 5
// 建议: 降低到 2，并用置信度标记
const MIN_SESSION_COUNT: i64 = 2;
const HIGH_CONFIDENCE_SESSION_COUNT: i64 = 5;

pub async fn get_time_preferences(...) -> Result<TimePreferenceResponse, String> {
    let session_count = get_session_count(proxy, user_id).await?;

    if session_count < MIN_SESSION_COUNT {
        return Ok(TimePreferenceResponse::Insufficient(...));
    }

    let time_pref = calculate_time_pref_from_records(proxy, user_id).await?;
    let confidence = if session_count >= HIGH_CONFIDENCE_SESSION_COUNT {
        calculate_confidence(session_count, &time_pref)
    } else {
        0.5 * calculate_confidence(session_count, &time_pref) // 低置信度
    };

    Ok(TimePreferenceResponse::Sufficient(TimePreferenceResult {
        time_pref,
        confidence,
        // ...
    }))
}
```

---

### 优先级 3: 上下文 Bandit

#### 2.3.1 LinUCB 上下文版

**目标**: 让 LinUCB 真正使用 FeatureVector

**实现位置**: `packages/backend-rust/src/amas/decision/linucb.rs`

**方案**:

```rust
pub struct ContextualLinUCBModel {
    context_dim: usize,   // 上下文特征维度 (10)
    action_dim: usize,    // 动作特征维度 (5)
    alpha: f64,
    // 每个动作维护独立的 A/b
    action_params: HashMap<String, (Vec<Vec<f64>>, Vec<f64>)>,
}

impl ContextualLinUCBModel {
    pub fn select_action(
        &self,
        state: &UserState,
        feature: &FeatureVector,
        candidates: &[StrategyParams],
    ) -> Option<StrategyParams> {
        let context = feature.values(); // 使用上下文特征

        let mut best_score = f64::NEG_INFINITY;
        let mut best_action = None;

        for candidate in candidates {
            let action_key = self.strategy_to_key(candidate);
            let action_feat = self.strategy_to_feature(candidate);

            // 联合特征: [context; action]
            let joint_feat: Vec<f64> = context.iter()
                .chain(action_feat.iter())
                .copied()
                .collect();

            let (a, b) = self.get_or_init_params(&action_key);
            let score = self.compute_ucb(&joint_feat, a, b);

            if score > best_score {
                best_score = score;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }

    pub fn update(&mut self, feature: &FeatureVector, strategy: &StrategyParams, reward: f64) {
        let context = feature.values();
        let action_key = self.strategy_to_key(strategy);
        let action_feat = self.strategy_to_feature(strategy);

        let joint_feat: Vec<f64> = context.iter()
            .chain(action_feat.iter())
            .copied()
            .collect();

        let (a, b) = self.get_or_init_params_mut(&action_key);
        // A = A + x * x^T
        // b = b + reward * x
        self.update_params(a, b, &joint_feat, reward);
    }
}
```

#### 2.3.2 Thompson Sampling 上下文版

**目标**: 让 Thompson 根据用户状态动态调整

**实现位置**: `packages/backend-rust/src/amas/decision/thompson.rs`

**方案**:

```rust
pub struct ContextualThompsonModel {
    // 使用逻辑回归后验
    context_dim: usize,
    weights: HashMap<String, Vec<f64>>,  // 每个动作的权重
    precision: HashMap<String, Vec<Vec<f64>>>,  // 精度矩阵
}

impl ContextualThompsonModel {
    pub fn select_action(
        &mut self,
        state: &UserState,
        feature: &FeatureVector,
        candidates: &[StrategyParams],
    ) -> Option<StrategyParams> {
        let context = feature.values();
        let mut rng = rand::rng();

        let mut best_score = f64::NEG_INFINITY;
        let mut best_action = None;

        for candidate in candidates {
            let action_key = self.strategy_to_key(candidate);
            let (mean, cov) = self.get_posterior(&action_key);

            // 从后验采样权重
            let sampled_weights = self.sample_multivariate_normal(&mut rng, &mean, &cov);

            // 计算预期奖励
            let expected_reward = self.dot_product(&sampled_weights, context);

            if expected_reward > best_score {
                best_score = expected_reward;
                best_action = Some(candidate.clone());
            }
        }

        best_action
    }
}
```

#### 2.3.3 Feature Flag 灰度控制

**实现位置**: `packages/backend-rust/src/amas/config.rs`

**方案**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    // 现有字段...
    pub contextual_linucb_enabled: bool,   // 新增
    pub contextual_thompson_enabled: bool, // 新增
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            // 现有默认值...
            contextual_linucb_enabled: false,   // 默认关闭，灰度开启
            contextual_thompson_enabled: false,
        }
    }
}
```

---

### 优先级 4: FSRS 用户级参数自适应

#### 2.4.1 用户级 FSRS 参数

**目标**: 根据用户真实遗忘率微调参数

**实现位置**: `packages/backend-rust/src/services/fsrs.rs`

**方案**:

```rust
pub struct UserFSRSParams {
    pub base: FSRSParams,
    pub user_adjustments: [f64; 17],  // 用户级调整因子
    pub sample_count: i64,
    pub last_updated: i64,
}

impl UserFSRSParams {
    pub fn effective_params(&self) -> FSRSParams {
        let mut w = self.base.w;
        for i in 0..17 {
            w[i] *= self.user_adjustments[i];
        }
        FSRSParams { w }
    }

    pub fn update_from_retention(&mut self, predicted: f64, actual: f64) {
        // 根据预测与实际遗忘率差异调整
        let error = actual - predicted;

        // 主要调整 w4-w8 (稳定性相关参数)
        for i in 4..9 {
            self.user_adjustments[i] *= 1.0 + error * 0.1;
            self.user_adjustments[i] = self.user_adjustments[i].clamp(0.5, 2.0);
        }

        self.sample_count += 1;
        self.last_updated = chrono::Utc::now().timestamp_millis();
    }
}
```

#### 2.4.2 动态 desired_retention

**目标**: 根据用户画像动态调整目标保留率

**实现位置**: `packages/backend-rust/src/amas/engine.rs`

**方案**:

```rust
fn compute_desired_retention(&self, state: &UserState, word_state: &WordState) -> f64 {
    let base_retention = word_state.desired_retention;

    // 高动机用户: 提高目标保留率
    let motivation_adj = if state.motivation > 0.7 { 0.02 } else { 0.0 };

    // 高认知能力用户: 提高目标保留率
    let cognitive_adj = if state.cognitive.mem > 0.8 { 0.02 } else { 0.0 };

    // 疲劳时: 降低目标保留率（允许更长间隔）
    let fatigue_adj = if state.fused_fatigue.unwrap_or(state.fatigue) > 0.6 { -0.02 } else { 0.0 };

    (base_retention + motivation_adj + cognitive_adj + fatigue_adj).clamp(0.8, 0.95)
}
```

---

### 优先级 5: 多目标优化参与决策

#### 2.5.1 约束违规自动调参

**目标**: 当约束不满足时自动调整策略

**实现位置**: `packages/backend-rust/src/amas/engine.rs:1040-1100`

**方案**:

```rust
fn compute_objective_evaluation(
    &self,
    state: &UserState,
    strategy: &StrategyParams,
    options: &ProcessOptions,
) -> (ObjectiveEvaluation, Option<StrategyParams>) {
    // 现有指标计算...

    let mut suggested_strategy = None;

    if !violations.is_empty() {
        let mut adjusted = strategy.clone();

        for violation in &violations {
            match violation.constraint.as_str() {
                "minAccuracy" => {
                    // 准确率不足: 降低难度，增加提示
                    adjusted.difficulty = match adjusted.difficulty {
                        DifficultyLevel::Hard => DifficultyLevel::Mid,
                        DifficultyLevel::Mid => DifficultyLevel::Easy,
                        DifficultyLevel::Easy => DifficultyLevel::Easy,
                    };
                    adjusted.hint_level = (adjusted.hint_level + 1).min(2);
                }
                "maxDailyTime" => {
                    // 超时: 减少批量
                    adjusted.batch_size = (adjusted.batch_size - 3).max(5);
                }
                "minRetention" => {
                    // 保留率不足: 缩短间隔
                    adjusted.interval_scale = (adjusted.interval_scale * 0.8).max(0.5);
                }
                _ => {}
            }
        }

        suggested_strategy = Some(adjusted);
    }

    (ObjectiveEvaluation {
        metrics,
        constraints_satisfied: violations.is_empty(),
        constraint_violations: violations,
        suggested_adjustments: suggested_strategy.as_ref().map(|s| s.clone()),
    }, suggested_strategy)
}
```

---

## 3. 快速调参（立即可做）

### 3.1 配置文件调整

**位置**: `packages/backend-rust/src/amas/config.rs`

```rust
// 冷启动加速
cold_start: ColdStartConfig {
    classify_samples: 2,  // 从 3 降到 2
    explore_samples: 4,   // 从 5 降到 4
    probe_sequence: vec![0, 2, 0, 2, 1, 1],  // 高对比序列
}

// 注意力平滑
attention_smoothing: 0.2,  // 从 0.3 降到 0.2，更快响应

// 置信度衰减
confidence_decay: 0.95,  // 从 0.99 降到 0.95，更快适应
```

### 3.2 API 调参

**位置**: `packages/backend-rust/src/routes/algorithm_config.rs`

通过 API 动态调整参数，支持 A/B 测试:

- `POST /api/algorithm-config` 更新配置
- `GET /api/algorithm-config` 获取当前配置

---

## 4. 实施路线图

### Phase 1: 快速见效（1-2周）

- [ ] 冷启动参数调优（3.1）
- [ ] 早停策略实现（2.1.1）
- [ ] 习惯画像进入 HeuristicLearner（2.2.1）

### Phase 2: 核心优化（2-4周）

- [ ] 冷启动多信号分类（2.1.2）
- [ ] 解释显式反馈（2.2.2）
- [ ] 上下文 LinUCB（2.3.1）

### Phase 3: 深度个性化（4-6周）

- [ ] 上下文 Thompson（2.3.2）
- [ ] FSRS 用户级参数（2.4.1）
- [ ] 多目标优化参与决策（2.5.1）

---

## 5. 关键代码位置索引

| 模块        | 文件路径                                               | 关键函数/结构                                 |
| ----------- | ------------------------------------------------------ | --------------------------------------------- |
| 冷启动      | `packages/backend-rust/src/amas/decision/coldstart.rs` | `ColdStartManager::update`, `handle_classify` |
| 冷启动配置  | `packages/backend-rust/src/amas/config.rs`             | `ColdStartConfig`                             |
| LinUCB      | `packages/backend-rust/src/amas/decision/linucb.rs`    | `LinUCBModel::select_action`                  |
| Thompson    | `packages/backend-rust/src/amas/decision/thompson.rs`  | `ThompsonSamplingModel::select_action`        |
| 启发式      | `packages/backend-rust/src/amas/decision/heuristic.rs` | `HeuristicLearner::suggest`                   |
| 集成决策    | `packages/backend-rust/src/amas/decision/ensemble.rs`  | `EnsembleDecision::decide`                    |
| 特征向量    | `packages/backend-rust/src/amas/engine.rs:673-721`     | `build_feature_vector`                        |
| 用户状态    | `packages/backend-rust/src/amas/engine.rs:780-850`     | `update_modeling`                             |
| 解释生成    | `packages/backend-rust/src/amas/engine.rs:928-970`     | `build_explanation`                           |
| 多目标      | `packages/backend-rust/src/amas/engine.rs:1040-1100`   | `compute_objective_evaluation`                |
| FSRS        | `packages/backend-rust/src/services/fsrs.rs`           | `FSRSParams`, `fsrs_next_interval`            |
| 习惯画像    | `packages/backend-rust/src/services/habit_profile.rs`  | `compute_realtime_habit_profile`              |
| 时间偏好    | `packages/backend-rust/src/services/learning_time.rs`  | `get_time_preferences`                        |
| 特性开关    | `packages/backend-rust/src/amas/config.rs:268-291`     | `FeatureFlags`                                |
| 算法配置API | `packages/backend-rust/src/routes/algorithm_config.rs` | 配置更新接口                                  |

---

## 6. 预期效果

| 优化项        | 预期改善              | 用户感知             |
| ------------- | --------------------- | -------------------- |
| 冷启动早停    | 分类时间减少 30-50%   | 更快进入个性化学习   |
| 多信号分类    | 分类准确率提升 15-20% | 初始策略更贴合       |
| 习惯画像决策  | 策略匹配度提升 20%    | "系统懂我的学习习惯" |
| 上下文 Bandit | 个性化收敛加速 40%    | 策略调整更及时       |
| FSRS 自适应   | 记忆效率提升 10-15%   | 复习间隔更合理       |
| 多目标优化    | 约束违规减少 50%      | 学习体验更平衡       |
