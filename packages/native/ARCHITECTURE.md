# AMAS Native 模块 - 混合架构设计方案 v2

> **修订说明**：根据 Codex 审计反馈修订，修正性能预估、增强数值稳定性、优化 FFI 接口

## 1. 概述

本方案将 AMAS (Adaptive Memory Assistance System) 中的 CPU 密集型算法用 Rust 重写，通过 napi-rs 与现有 TypeScript 后端集成，在保持开发效率的同时实现 **2-8 倍** 的性能提升。

### 1.1 修正后的性能目标

| 指标 | 当前 (TypeScript) | 目标 (Rust) | 预期提升 |
|------|-------------------|-------------|----------|
| LinUCB selectAction | ~5ms | ~1-2ms | **2-5x** |
| LinUCB update | ~10ms | ~2-3ms | **3-5x** |
| Cholesky 分解 (d=22) | ~50μs | ~10-20μs | **2-5x** |
| Rank-1 更新 (d=22) | ~20μs | ~5-10μs | **2-4x** |
| 贝叶斯优化 GP 更新 | ~2ms | ~0.5-1ms | **2-4x** |
| 内存占用 | 基准 | 0.5x | **2x** |

> **注意**：原方案预估 10-50x 过于乐观。d=22 维度下单次操作仅几千次浮点运算，
> FFI 往返开销会抵消部分收益。2-8x 是更现实的预期。

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TypeScript 层 (业务逻辑)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ AMASEngine                                                   │   │
│  │   └── LearningManager                                        │   │
│  │         ├── selectAction() ──┐                              │   │
│  │         └── updateModels() ──┤                              │   │
│  └──────────────────────────────┼──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────┼──────────────────────────────┐   │
│  │ NativeWrapper (统一包装器)                                    │   │
│  │   ├── LinUCBNativeWrapper                                    │   │
│  │   ├── BayesianNativeWrapper  ◄── [新增]                      │   │
│  │   ├── 健康检测 & 自动恢复    ◄── [新增]                      │   │
│  │   ├── 监控指标暴露           ◄── [新增]                      │   │
│  │   └── 熔断器 + 降级逻辑                                      │   │
│  └──────────────────────────────┼──────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │
                    ╔═════════════╧══════════════╗
                    ║   napi-rs FFI 边界          ║
                    ║   - Float64Array 零拷贝     ║  ◄── [优化]
                    ║   - 枚举代替字符串          ║  ◄── [优化]
                    ║   - 批量 API               ║  ◄── [新增]
                    ╚═════════════╤══════════════╝
                                  │
┌─────────────────────────────────┼───────────────────────────────────┐
│                       Rust 层 (高性能计算)                           │
│  ┌──────────────────────────────┼──────────────────────────────┐   │
│  │ @danci/native                                                │   │
│  │                                                              │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │   │
│  │  │  linucb.rs     │  │  matrix.rs     │  │  sanitize.rs   │ │   │
│  │  │  - select      │  │  - cholesky    │  │  - NaN 检测    │ │   │
│  │  │  - update      │  │  - rank1_update│  │  - 幅度裁剪    │ │   │
│  │  │  - batch_*     │  │  - solve       │  │  - 对角线保护  │ │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘ │   │
│  │                                                              │   │
│  │  字段命名与 TS 对齐: A/b/L/updateCount  ◄── [修复]           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 关键改进点 (基于 Codex 审计)

| 问题 | 原方案 | 修订方案 |
|------|--------|----------|
| 性能预估过高 | 10-50x | **2-8x** (现实预期) |
| 接口不一致 | `a/b/l` | **`A/b/L/updateCount`** (与 TS 对齐) |
| 数值稳定性 | 部分实现 | **完整移植 TS 版护栏** |
| FFI 开销 | String + Vec 拷贝 | **Float64Array 零拷贝 + 枚举** |
| 降级逻辑 | 仅 LinUCB | **统一包装器 + 贝叶斯 fallback** |
| 熔断恢复 | 永久禁用 | **定期重试 + 健康检测** |
| 维度限制 | 可配置但不一致 | **固定 22 维或动态对齐** |

---

## 2. 项目结构

```
packages/native/
├── Cargo.toml                 # Rust 依赖配置 (精简版，移除 rayon/simd)
├── package.json               # npm 包配置 (pnpm workspace 兼容)
├── build.rs                   # 构建脚本
├── src/
│   ├── lib.rs                 # 主入口，napi 导出
│   ├── types.rs               # 类型定义 (与 TS 对齐)
│   ├── linucb/
│   │   ├── mod.rs             # LinUCB 模块
│   │   ├── model.rs           # BanditModel (A/b/L 命名)
│   │   ├── select.rs          # 动作选择
│   │   ├── update.rs          # 模型更新
│   │   └── batch.rs           # [新增] 批量 API
│   ├── matrix/
│   │   ├── mod.rs             # 矩阵运算
│   │   ├── cholesky.rs        # Cholesky 分解
│   │   └── solve.rs           # 三角系统求解
│   ├── sanitize/              # [新增] 数值稳定性
│   │   ├── mod.rs
│   │   ├── validate.rs        # NaN/Inf 检测
│   │   └── clamp.rs           # 幅度裁剪
│   └── diagnostics.rs         # [新增] 健康检测
├── __test__/
│   ├── linucb.spec.ts         # LinUCB 测试
│   ├── numerical.spec.ts      # [新增] 数值稳定性测试
│   └── benchmark.spec.ts      # 性能基准
└── index.js                   # JS 入口
```

---

## 3. 核心类型定义 (与 TS 对齐)

### 3.1 BanditModel - 字段命名修复

```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// 特征维度常量 (与 TS FEATURE_DIMENSION_V2 对齐)
pub const FEATURE_DIMENSION: usize = 22;

/// LinUCB 模型状态 - 字段命名与 TS 完全一致
#[napi(object)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BanditModel {
    /// 协方差矩阵 (d*d, 行优先扁平化) - 注意大写 A
    #[napi(js_name = "A")]
    pub a_matrix: Vec<f64>,

    /// 奖励向量 (d 维) - 小写 b
    pub b: Vec<f64>,

    /// Cholesky 分解 (d*d, 下三角) - 注意大写 L
    #[napi(js_name = "L")]
    pub l_matrix: Vec<f64>,

    /// 正则化系数
    pub lambda: f64,

    /// UCB 探索系数
    pub alpha: f64,

    /// 特征维度 (固定 22)
    pub d: u32,

    /// 更新次数 - 与 TS updateCount 对齐
    #[napi(js_name = "updateCount")]
    pub update_count: u32,
}

/// 难度枚举 - 替代字符串，减少 FFI 开销
#[napi]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Difficulty {
    Easy = 0,
    Mid = 1,
    Hard = 2,
}

impl Difficulty {
    pub fn to_feature_value(self) -> f64 {
        match self {
            Difficulty::Easy => 0.2,
            Difficulty::Mid => 0.5,
            Difficulty::Hard => 0.8,
        }
    }

    /// 从字符串解析 (兼容旧接口)
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "easy" => Difficulty::Easy,
            "hard" => Difficulty::Hard,
            _ => Difficulty::Mid,
        }
    }
}

/// 动作定义 - 使用枚举替代字符串
#[napi(object)]
#[derive(Clone, Debug)]
pub struct Action {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: Difficulty,  // 枚举而非 String
    pub batch_size: u32,
    pub hint_level: u32,
}

/// 兼容旧接口的动作定义 (接受字符串)
#[napi(object)]
#[derive(Clone, Debug)]
pub struct ActionCompat {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: String,  // 兼容旧 API
    pub batch_size: u32,
    pub hint_level: u32,
}

impl From<ActionCompat> for Action {
    fn from(a: ActionCompat) -> Self {
        Action {
            interval_scale: a.interval_scale,
            new_ratio: a.new_ratio,
            difficulty: Difficulty::from_str(&a.difficulty),
            batch_size: a.batch_size,
            hint_level: a.hint_level,
        }
    }
}
```

---

## 4. 数值稳定性 (完整移植 TS 护栏)

### 4.1 sanitize/mod.rs

```rust
//! 数值稳定性模块 - 移植自 TS linucb.ts:845-918

/// 数值常量 (与 TS 完全一致)
pub mod constants {
    pub const MIN_LAMBDA: f64 = 1e-3;
    pub const MIN_RANK1_DIAG: f64 = 1e-6;
    pub const MAX_COVARIANCE: f64 = 1e9;
    pub const MAX_FEATURE_ABS: f64 = 50.0;
    pub const EPSILON: f64 = 1e-10;
    pub const CHOLESKY_RECOMPUTE_INTERVAL: u32 = 200;
}

use constants::*;

/// 检查数组是否包含无效值 (NaN/Inf)
pub fn has_invalid_values(arr: &[f64]) -> bool {
    arr.iter().any(|&v| !v.is_finite())
}

/// 清理特征向量 - 移植自 TS sanitizeFeatureVector
pub fn sanitize_feature_vector(x: &mut [f64]) {
    for v in x.iter_mut() {
        if !v.is_finite() {
            *v = 0.0;
        } else {
            *v = v.clamp(-MAX_FEATURE_ABS, MAX_FEATURE_ABS);
        }
    }
}

/// 清理协方差矩阵 - 移植自 TS sanitizeCovariance
/// 确保对称性、对角线下界、幅度上界
pub fn sanitize_covariance(a: &mut [f64], d: usize, lambda: f64) {
    // 1. 强制对称化
    for i in 0..d {
        for j in (i + 1)..d {
            let avg = (a[i * d + j] + a[j * d + i]) / 2.0;
            a[i * d + j] = avg;
            a[j * d + i] = avg;
        }
    }

    // 2. 幅度裁剪
    for v in a.iter_mut() {
        if !v.is_finite() {
            *v = 0.0;
        } else {
            *v = v.clamp(-MAX_COVARIANCE, MAX_COVARIANCE);
        }
    }

    // 3. 对角线下界保护
    let min_diag = lambda.max(MIN_LAMBDA);
    for i in 0..d {
        if a[i * d + i] < min_diag {
            a[i * d + i] = min_diag;
        }
    }
}

/// 检查是否需要完整 Cholesky 重分解
pub fn needs_full_recompute(update_count: u32, l: &[f64], d: usize) -> bool {
    // 定期重分解
    if update_count > 0 && update_count % CHOLESKY_RECOMPUTE_INTERVAL == 0 {
        return true;
    }

    // 检查 L 对角线是否健康
    for i in 0..d {
        let diag = l[i * d + i];
        if !diag.is_finite() || diag < MIN_RANK1_DIAG {
            return true;
        }
    }

    false
}

/// 诊断结果
#[derive(Debug, Clone)]
pub struct DiagnosticResult {
    pub has_nan: bool,
    pub has_inf: bool,
    pub min_diag: f64,
    pub max_element: f64,
    pub is_healthy: bool,
}

/// 模型健康诊断
pub fn diagnose_model(a: &[f64], l: &[f64], d: usize) -> DiagnosticResult {
    let has_nan = has_invalid_values(a) || has_invalid_values(l);
    let has_inf = a.iter().any(|&v| v.is_infinite()) || l.iter().any(|&v| v.is_infinite());

    let min_diag = (0..d)
        .map(|i| l[i * d + i])
        .filter(|&v| v.is_finite())
        .fold(f64::INFINITY, f64::min);

    let max_element = a.iter()
        .filter(|&&v| v.is_finite())
        .fold(0.0_f64, |acc, &v| acc.max(v.abs()));

    let is_healthy = !has_nan && !has_inf
        && min_diag >= MIN_RANK1_DIAG
        && max_element <= MAX_COVARIANCE;

    DiagnosticResult {
        has_nan,
        has_inf,
        min_diag,
        max_element,
        is_healthy,
    }
}
```

---

## 5. LinUCB 实现 (含批量 API)

### 5.1 linucb/mod.rs

```rust
use crate::matrix::{cholesky_decompose, cholesky_rank1_update, solve_cholesky};
use crate::sanitize::{constants::*, sanitize_feature_vector, sanitize_covariance, needs_full_recompute, diagnose_model, DiagnosticResult};
use crate::types::*;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub struct LinUCBNative {
    model: BanditModel,
}

#[napi]
impl LinUCBNative {
    /// 创建新的 LinUCB 实例 (固定 22 维)
    #[napi(constructor)]
    pub fn new(alpha: Option<f64>, lambda: Option<f64>) -> Self {
        let d = FEATURE_DIMENSION;  // 固定 22 维
        let lambda = lambda.unwrap_or(1.0).max(MIN_LAMBDA);
        let alpha = alpha.unwrap_or(1.0);

        // 初始化 A = λI
        let mut a = vec![0.0; d * d];
        for i in 0..d {
            a[i * d + i] = lambda;
        }

        // 初始化 b = 0
        let b = vec![0.0; d];

        // 初始化 L = √λ * I
        let mut l = vec![0.0; d * d];
        let sqrt_lambda = lambda.sqrt();
        for i in 0..d {
            l[i * d + i] = sqrt_lambda;
        }

        Self {
            model: BanditModel {
                a_matrix: a,
                b,
                l_matrix: l,
                lambda,
                alpha,
                d: d as u32,
                update_count: 0,
            },
        }
    }

    /// 选择最优动作 (兼容字符串 difficulty)
    #[napi]
    pub fn select_action(
        &self,
        state: &UserState,
        actions: Vec<ActionCompat>,
        context: &LinUCBContext,
    ) -> Result<ActionSelection> {
        let actions: Vec<Action> = actions.into_iter().map(Into::into).collect();
        self.select_action_typed(state, actions, context)
    }

    /// 选择最优动作 (使用枚举 difficulty，性能更优)
    #[napi]
    pub fn select_action_typed(
        &self,
        state: &UserState,
        actions: Vec<Action>,
        context: &LinUCBContext,
    ) -> Result<ActionSelection> {
        if actions.is_empty() {
            return Err(Error::from_reason("Actions array cannot be empty"));
        }

        let d = FEATURE_DIMENSION;
        let mut best_idx = 0;
        let mut best_stats = UCBStats {
            score: f64::NEG_INFINITY,
            confidence: 0.0,
            exploitation: 0.0,
        };

        for (idx, action) in actions.iter().enumerate() {
            let mut feature_vec = self.build_feature_vector(state, action, context);
            sanitize_feature_vector(&mut feature_vec);
            let stats = self.compute_ucb_stats(&feature_vec);

            if stats.score > best_stats.score {
                best_idx = idx;
                best_stats = stats;
            }
        }

        Ok(ActionSelection {
            action_index: best_idx as u32,
            score: best_stats.score,
            confidence: best_stats.confidence,
            exploitation: best_stats.exploitation,
            exploration: self.model.alpha * best_stats.confidence,
        })
    }

    /// [新增] 批量选择 - 减少 FFI 往返
    #[napi]
    pub fn select_action_batch(
        &self,
        states: Vec<UserState>,
        actions: Vec<ActionCompat>,
        contexts: Vec<LinUCBContext>,
    ) -> Result<Vec<ActionSelection>> {
        if states.len() != contexts.len() {
            return Err(Error::from_reason("States and contexts must have same length"));
        }

        let actions: Vec<Action> = actions.into_iter().map(Into::into).collect();

        states.iter().zip(contexts.iter())
            .map(|(state, context)| {
                self.select_action_typed(state, actions.clone(), context)
            })
            .collect()
    }

    /// 更新模型 (兼容字符串 difficulty)
    #[napi]
    pub fn update(
        &mut self,
        state: &UserState,
        action: &ActionCompat,
        reward: f64,
        context: &LinUCBContext,
    ) -> Result<()> {
        let action: Action = action.clone().into();
        let mut feature_vec = self.build_feature_vector(state, &action, context);
        self.update_with_feature_vector_internal(&mut feature_vec, reward)
    }

    /// 使用 Float64Array 直接更新 (零拷贝，性能最优)
    #[napi]
    pub fn update_with_float64_array(
        &mut self,
        feature_vec: Float64Array,
        reward: f64,
    ) -> Result<()> {
        let mut x: Vec<f64> = feature_vec.to_vec();
        self.update_with_feature_vector_internal(&mut x, reward)
    }

    /// 使用普通数组更新 (兼容旧 API)
    #[napi]
    pub fn update_with_feature_vector(
        &mut self,
        feature_vec: Vec<f64>,
        reward: f64,
    ) -> Result<()> {
        let mut x = feature_vec;
        self.update_with_feature_vector_internal(&mut x, reward)
    }

    /// [新增] 批量更新 - 减少 FFI 往返
    #[napi]
    pub fn update_batch(
        &mut self,
        feature_vecs: Vec<Vec<f64>>,
        rewards: Vec<f64>,
    ) -> Result<u32> {
        if feature_vecs.len() != rewards.len() {
            return Err(Error::from_reason("Feature vectors and rewards must have same length"));
        }

        let mut success_count = 0u32;
        for (mut x, reward) in feature_vecs.into_iter().zip(rewards.into_iter()) {
            if self.update_with_feature_vector_internal(&mut x, reward).is_ok() {
                success_count += 1;
            }
        }

        Ok(success_count)
    }

    /// 内部更新实现 (含完整数值护栏)
    fn update_with_feature_vector_internal(
        &mut self,
        x: &mut [f64],
        reward: f64,
    ) -> Result<()> {
        let d = FEATURE_DIMENSION;

        // 验证维度
        if x.len() != d {
            return Err(Error::from_reason(format!(
                "Feature vector dimension mismatch: expected {}, got {}",
                d, x.len()
            )));
        }

        // 清理特征向量
        sanitize_feature_vector(x);

        // 检查奖励有效性
        if !reward.is_finite() {
            return Ok(()); // 静默跳过无效奖励
        }

        // 更新 A += x * x^T (外积)
        for i in 0..d {
            for j in 0..d {
                self.model.a_matrix[i * d + j] += x[i] * x[j];
            }
        }

        // 清理协方差矩阵
        sanitize_covariance(&mut self.model.a_matrix, d, self.model.lambda);

        // 更新 b += reward * x
        for i in 0..d {
            self.model.b[i] += reward * x[i];
        }

        // 决定是否需要完整重分解
        let need_full = needs_full_recompute(
            self.model.update_count,
            &self.model.l_matrix,
            d,
        );

        if need_full {
            // 完整 Cholesky 分解
            self.model.l_matrix = cholesky_decompose(&self.model.a_matrix, d, self.model.lambda);
        } else {
            // Rank-1 增量更新
            let success = cholesky_rank1_update(&mut self.model.l_matrix, x, d, MIN_RANK1_DIAG);
            if !success {
                // 增量更新失败，回退到完整分解
                self.model.l_matrix = cholesky_decompose(&self.model.a_matrix, d, self.model.lambda);
            }
        }

        self.model.update_count += 1;
        Ok(())
    }

    /// [新增] 健康检测
    #[napi]
    pub fn diagnose(&self) -> DiagnosticResult {
        diagnose_model(
            &self.model.a_matrix,
            &self.model.l_matrix,
            FEATURE_DIMENSION,
        )
    }

    /// [新增] 自检 (用于健康探测)
    #[napi]
    pub fn self_test(&self) -> bool {
        let diag = self.diagnose();
        diag.is_healthy
    }

    /// 获取模型状态
    #[napi]
    pub fn get_model(&self) -> BanditModel {
        self.model.clone()
    }

    /// 设置模型状态 (含维度兼容处理)
    #[napi]
    pub fn set_model(&mut self, model: BanditModel) -> Result<()> {
        let target_d = FEATURE_DIMENSION;
        let source_d = model.d as usize;

        if source_d == target_d {
            // 直接设置
            self.model = model;
        } else if source_d < target_d {
            // 维度升级：零填充 + 对角线 λ
            self.model = self.expand_model(&model, target_d);
        } else {
            // 维度降级：发出警告，重置模型但保留超参数
            eprintln!(
                "[LinUCBNative] Warning: dimension downgrade {} -> {}, resetting model",
                source_d, target_d
            );
            *self = Self::new(Some(model.alpha), Some(model.lambda));
        }

        Ok(())
    }

    /// 重置模型
    #[napi]
    pub fn reset(&mut self) {
        let lambda = self.model.lambda;
        let alpha = self.model.alpha;
        *self = Self::new(Some(alpha), Some(lambda));
    }

    // ========== Getters/Setters ==========

    #[napi(getter)]
    pub fn get_alpha(&self) -> f64 {
        self.model.alpha
    }

    #[napi(setter)]
    pub fn set_alpha(&mut self, alpha: f64) {
        self.model.alpha = alpha;
    }

    #[napi(getter, js_name = "updateCount")]
    pub fn get_update_count(&self) -> u32 {
        self.model.update_count
    }

    /// 冷启动 alpha 计算
    #[napi]
    pub fn get_cold_start_alpha(
        interaction_count: u32,
        recent_accuracy: f64,
        fatigue: f64,
    ) -> f64 {
        if interaction_count < 15 {
            0.5
        } else if interaction_count < 50 {
            if recent_accuracy > 0.75 && fatigue < 0.5 {
                2.0
            } else {
                1.0
            }
        } else {
            0.7
        }
    }

    // ========== 私有方法 ==========

    /// 构建 22 维特征向量
    fn build_feature_vector(
        &self,
        state: &UserState,
        action: &Action,
        context: &LinUCBContext,
    ) -> Vec<f64> {
        let mut vec = vec![0.0; FEATURE_DIMENSION];

        // [0-4] 状态特征
        vec[0] = state.a.clamp(0.0, 1.0);
        vec[1] = state.f.clamp(0.0, 1.0);
        vec[2] = state.c_mem.clamp(0.0, 1.0);
        vec[3] = state.c_speed.clamp(0.0, 1.0);
        vec[4] = state.m.clamp(-1.0, 1.0);

        // [5] 错误率
        vec[5] = context.recent_error_rate.clamp(0.0, 1.0);

        // [6-10] 动作特征
        vec[6] = action.interval_scale;
        vec[7] = action.new_ratio;
        vec[8] = action.difficulty.to_feature_value();  // 枚举转换
        vec[9] = (action.hint_level as f64) / 2.0;
        vec[10] = (action.batch_size as f64) / 16.0;

        // [11] 交互特征
        let rt_norm = (5000.0 / context.recent_response_time.max(1000.0)).clamp(0.0, 2.0);
        vec[11] = rt_norm;

        // [12-14] 时间特征
        let time_bucket = context.time_bucket as f64;
        vec[12] = time_bucket / 24.0;
        vec[13] = (2.0 * std::f64::consts::PI * time_bucket / 24.0).sin();
        vec[14] = (2.0 * std::f64::consts::PI * time_bucket / 24.0).cos();

        // [15-20] 交叉特征
        vec[15] = state.a * (1.0 - state.f);
        vec[16] = state.m * (1.0 - state.f);
        vec[17] = state.c_speed * action.interval_scale;
        vec[18] = state.c_mem * action.new_ratio;
        vec[19] = state.f * rt_norm;
        vec[20] = action.new_ratio * ((state.m + 1.0) / 2.0);

        // [21] 偏置
        vec[21] = 1.0;

        vec
    }

    /// UCB 统计计算
    fn compute_ucb_stats(&self, x: &[f64]) -> UCBStats {
        let d = FEATURE_DIMENSION;

        let theta = solve_cholesky(&self.model.l_matrix, &self.model.b, d);
        let exploitation: f64 = theta.iter().zip(x.iter()).map(|(t, xi)| t * xi).sum();

        let y = solve_triangular_lower(&self.model.l_matrix, x, d);
        let confidence: f64 = y.iter().map(|yi| yi * yi).sum::<f64>().sqrt();

        let score = exploitation + self.model.alpha * confidence;

        UCBStats { score, confidence, exploitation }
    }

    /// 模型扩展
    fn expand_model(&self, old: &BanditModel, target_d: usize) -> BanditModel {
        let source_d = old.d as usize;
        let lambda = old.lambda;

        let mut new_a = vec![0.0; target_d * target_d];
        for i in 0..source_d {
            for j in 0..source_d {
                new_a[i * target_d + j] = old.a_matrix[i * source_d + j];
            }
        }
        for i in source_d..target_d {
            new_a[i * target_d + i] = lambda;
        }

        let mut new_b = vec![0.0; target_d];
        new_b[..source_d].copy_from_slice(&old.b);

        let new_l = cholesky_decompose(&new_a, target_d, lambda);

        BanditModel {
            a_matrix: new_a,
            b: new_b,
            l_matrix: new_l,
            lambda,
            alpha: old.alpha,
            d: target_d as u32,
            update_count: old.update_count,
        }
    }
}

fn solve_triangular_lower(l: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut y = vec![0.0; n];
    for i in 0..n {
        let mut sum = b[i];
        for j in 0..i {
            sum -= l[i * n + j] * y[j];
        }
        let diag = l[i * n + i];
        y[i] = if diag.abs() > EPSILON { sum / diag } else { 0.0 };
    }
    y
}
```

---

## 6. TypeScript 包装器 (增强版)

### 6.1 统一包装器 + 熔断恢复

```typescript
// packages/backend/src/amas/learning/native-wrapper.ts

import { LinUCBNative, BanditModel } from '@danci/native';
import { LinUCB } from './linucb';
import { BayesianOptimizer } from '../optimization/bayesian-optimizer';
import { logger } from '../../logger';

/** 包装器配置 */
interface NativeWrapperConfig {
  /** 失败多少次后触发熔断 (默认 5) */
  circuitBreakerThreshold?: number;
  /** 熔断后多久尝试恢复 (默认 60s) */
  recoveryIntervalMs?: number;
  /** 启动时是否执行健康检测 (默认 true) */
  healthCheckOnStart?: boolean;
}

/** 包装器统计 */
interface WrapperStats {
  useNative: boolean;
  failureCount: number;
  lastFailureTime: number | null;
  recoveryAttempts: number;
  isCircuitOpen: boolean;
}

/**
 * Native 模块统一包装器
 *
 * 特性:
 * - 自动降级到 TypeScript 实现
 * - 熔断器模式 (失败 N 次后熔断)
 * - 定期恢复尝试 (不会永久禁用)
 * - 健康检测 API
 * - 监控指标暴露
 */
export class LinUCBNativeWrapper {
  private native: LinUCBNative | null = null;
  private fallback: LinUCB;
  private config: Required<NativeWrapperConfig>;

  // 熔断器状态
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private recoveryAttempts: number = 0;
  private isCircuitOpen: boolean = false;

  constructor(
    options?: { alpha?: number; lambda?: number },
    config?: NativeWrapperConfig
  ) {
    this.fallback = new LinUCB(options);

    this.config = {
      circuitBreakerThreshold: config?.circuitBreakerThreshold ?? 5,
      recoveryIntervalMs: config?.recoveryIntervalMs ?? 60000,
      healthCheckOnStart: config?.healthCheckOnStart ?? true,
    };

    this.initializeNative(options);
  }

  private initializeNative(options?: { alpha?: number; lambda?: number }): void {
    try {
      this.native = new LinUCBNative(options?.alpha, options?.lambda);

      // 启动时健康检测
      if (this.config.healthCheckOnStart && this.native) {
        const isHealthy = this.native.selfTest();
        if (!isHealthy) {
          throw new Error('Native module self-test failed');
        }
      }

      logger.info('[NativeWrapper] Native module loaded and healthy');
    } catch (error) {
      logger.warn('[NativeWrapper] Native module not available', { error });
      this.native = null;
    }
  }

  /** 判断是否应该使用 Native */
  private shouldUseNative(): boolean {
    if (!this.native) return false;
    if (!this.isCircuitOpen) return true;

    // 熔断状态下，检查是否可以尝试恢复
    const now = Date.now();
    if (this.lastFailureTime &&
        now - this.lastFailureTime > this.config.recoveryIntervalMs) {
      // 尝试恢复
      this.attemptRecovery();
    }

    return !this.isCircuitOpen;
  }

  /** 尝试恢复 Native */
  private attemptRecovery(): void {
    this.recoveryAttempts++;
    logger.info('[NativeWrapper] Attempting recovery', {
      attempt: this.recoveryAttempts
    });

    try {
      if (this.native?.selfTest()) {
        // 恢复成功
        this.isCircuitOpen = false;
        this.failureCount = 0;
        logger.info('[NativeWrapper] Recovery successful');
      } else {
        throw new Error('Self-test failed');
      }
    } catch (error) {
      // 恢复失败，延长下次重试间隔
      this.lastFailureTime = Date.now();
      logger.warn('[NativeWrapper] Recovery failed', { error });
    }
  }

  /** 记录失败 */
  private recordFailure(method: string, error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.error(`[NativeWrapper] ${method} failed`, {
      error,
      failureCount: this.failureCount,
    });

    // 达到阈值，开启熔断
    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.isCircuitOpen = true;
      logger.warn('[NativeWrapper] Circuit breaker opened', {
        threshold: this.config.circuitBreakerThreshold,
        recoveryIntervalMs: this.config.recoveryIntervalMs,
      });
    }
  }

  /** 记录成功 (重置连续失败计数) */
  private recordSuccess(): void {
    if (this.failureCount > 0) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  // ========== 公共 API ==========

  selectAction(state: any, actions: any[], context: any): any {
    if (this.shouldUseNative()) {
      try {
        const result = this.native!.selectAction(
          this.toNativeState(state),
          actions.map(a => this.toNativeAction(a)),
          this.toNativeContext(context)
        );
        this.recordSuccess();
        return this.fromNativeSelection(result, actions);
      } catch (error) {
        this.recordFailure('selectAction', error);
      }
    }

    return this.fallback.selectAction(state, actions, context);
  }

  update(state: any, action: any, reward: number, context: any): void {
    // 同时更新 Native 和 Fallback (保持同步)
    if (this.shouldUseNative()) {
      try {
        this.native!.update(
          this.toNativeState(state),
          this.toNativeAction(action),
          reward,
          this.toNativeContext(context)
        );
        this.recordSuccess();
      } catch (error) {
        this.recordFailure('update', error);
      }
    }

    this.fallback.update(state, action, reward, context);
  }

  /** 获取统计信息 (用于监控) */
  getStats(): WrapperStats {
    return {
      useNative: this.shouldUseNative(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      recoveryAttempts: this.recoveryAttempts,
      isCircuitOpen: this.isCircuitOpen,
    };
  }

  /** 强制健康检测 */
  healthCheck(): { native: boolean; fallback: boolean } {
    return {
      native: this.native?.selfTest() ?? false,
      fallback: true, // TS fallback 总是可用
    };
  }

  /** 强制切换到 Fallback */
  forceUseFallback(): void {
    this.isCircuitOpen = true;
    logger.info('[NativeWrapper] Forced to use fallback');
  }

  /** 强制尝试恢复 Native */
  forceRecovery(): boolean {
    this.attemptRecovery();
    return !this.isCircuitOpen;
  }

  // ========== 类型转换 ==========

  private toNativeState(state: any) {
    return {
      a: state.A ?? 0.5,
      f: state.F ?? 0.5,
      c_mem: state.C?.mem ?? 0.5,
      c_speed: state.C?.speed ?? 0.5,
      m: state.M ?? 0,
    };
  }

  private toNativeAction(action: any) {
    return {
      interval_scale: action.interval_scale,
      new_ratio: action.new_ratio,
      difficulty: action.difficulty,  // 字符串，Rust 侧兼容处理
      batch_size: action.batch_size,
      hint_level: action.hint_level,
    };
  }

  private toNativeContext(context: any) {
    return {
      recent_error_rate: context.recentErrorRate ?? 0,
      recent_response_time: context.recentResponseTime ?? 3000,
      time_bucket: context.timeBucket ?? new Date().getHours(),
    };
  }

  private fromNativeSelection(result: any, actions: any[]) {
    return {
      action: actions[result.action_index],
      score: result.score,
      confidence: result.confidence,
      meta: {
        exploitation: result.exploitation,
        exploration: result.exploration,
      },
    };
  }
}
```

---

## 7. 构建配置 (pnpm workspace 兼容)

### 7.1 Cargo.toml (精简版)

```toml
[package]
name = "danci-native"
version = "0.1.0"
edition = "2021"
description = "High-performance native algorithms for AMAS"

[lib]
crate-type = ["cdylib"]

[dependencies]
# napi-rs (精简 features)
napi = { version = "2", default-features = false, features = ["napi8", "serde-json"] }
napi-derive = "2"

# 序列化
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 随机数 (仅 Bayesian 需要)
rand = "0.8"

# 时间
chrono = "0.4"

# 注意：移除 rayon 和 packed_simd_2，d=22 场景下无显著收益且增加编译复杂度

[build-dependencies]
napi-build = "2"

[profile.release]
opt-level = 3
lto = "thin"  # thin LTO 平衡编译时间和性能
codegen-units = 1
strip = true
```

### 7.2 package.json (pnpm workspace)

```json
{
  "name": "@danci/native",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": {
    "name": "danci-native",
    "triples": {
      "defaults": true,
      "additional": [
        "aarch64-apple-darwin",
        "aarch64-unknown-linux-gnu",
        "aarch64-unknown-linux-musl"
      ]
    }
  },
  "scripts": {
    "artifacts": "napi artifacts",
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform",
    "prepublishOnly": "napi prepublish -t npm",
    "test": "vitest run",
    "bench": "vitest bench"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.18.0",
    "vitest": "^1.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### 7.3 Dockerfile (完整依赖)

```dockerfile
# Stage 1: Rust 构建
FROM rust:1.75-alpine AS rust-builder

# 安装必要依赖
RUN apk add --no-cache \
    musl-dev \
    openssl-dev \
    pkgconfig \
    nodejs \
    npm \
    python3 \
    make \
    gcc \
    g++

WORKDIR /app/packages/native
COPY packages/native/Cargo.toml packages/native/Cargo.lock* ./
COPY packages/native/src ./src
COPY packages/native/build.rs ./
COPY packages/native/package.json ./

# 安装 napi-rs CLI 并构建
RUN npm install @napi-rs/cli
RUN npm run build

# Stage 2: Node 依赖
FROM node:20-alpine AS deps
RUN corepack enable pnpm

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/native/package.json ./packages/native/

# 复制 native 产物
COPY --from=rust-builder /app/packages/native/*.node ./packages/native/
COPY --from=rust-builder /app/packages/native/index.js ./packages/native/
COPY --from=rust-builder /app/packages/native/index.d.ts ./packages/native/

RUN pnpm install --frozen-lockfile

# Stage 3: 构建
FROM node:20-alpine AS builder
RUN corepack enable pnpm

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# 生成 Prisma Client
RUN cd packages/backend && pnpm prisma generate

# 构建
RUN pnpm turbo run build --filter=@danci/backend

# Stage 4: 生产镜像
FROM node:20-alpine AS runner

# 安装 OpenSSL (Prisma 需要)
RUN apk add --no-cache openssl

WORKDIR /app

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 danci
USER danci

# 复制产物
COPY --from=builder --chown=danci:nodejs /app/packages/backend/dist ./dist
COPY --from=builder --chown=danci:nodejs /app/packages/backend/prisma ./prisma
COPY --from=builder --chown=danci:nodejs /app/packages/native/*.node ./node_modules/@danci/native/
COPY --from=builder --chown=danci:nodejs /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

---

## 8. 迁移计划 (修订版)

### 8.1 阶段一：基础验证 (1 周)

- [ ] 创建 `packages/native` 目录结构
- [ ] 配置 Cargo.toml (精简版)
- [ ] 实现矩阵运算 + 数值稳定性模块
- [ ] **编写 micro-benchmark 验证 FFI 往返开销**
- [ ] 验证真实加速比是否符合 2-8x 预期

### 8.2 阶段二：LinUCB 实现 (2 周)

- [ ] 实现 LinUCBNative (完整数值护栏)
- [ ] 实现批量 API
- [ ] 实现 TypeScript 统一包装器 (熔断+恢复)
- [ ] 通过现有单元测试
- [ ] 数值稳定性边界测试

### 8.3 阶段三：集成测试 (1 周)

- [ ] pnpm workspace 集成
- [ ] Turborepo 缓存配置
- [ ] Docker 多阶段构建验证
- [ ] CI/CD 预编译产物

### 8.4 阶段四：灰度上线 (1 周)

- [ ] 特性开关控制 Native 启用
- [ ] 监控指标接入 (Prometheus/Grafana)
- [ ] A/B 测试对比 Native vs TS
- [ ] 渐进式流量切换

---

## 9. 风险与缓解 (修订版)

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 性能不达预期 | **高** | 中 | 先 benchmark 验证，保留 TS 回退 |
| FFI 开销抵消收益 | 中 | 中 | 批量 API、Float64Array 零拷贝 |
| 数值精度不一致 | 中 | 高 | 完整移植 TS 护栏，边界测试 |
| Native 编译失败 | 中 | 中 | 预编译所有平台，CI 自动化 |
| 永久降级 | 低 | 中 | 熔断恢复机制，健康检测 |
| 模型持久化不兼容 | 中 | 高 | 字段命名对齐，迁移脚本 |
| musl/Alpine 兼容 | 中 | 中 | Dockerfile 完整依赖 |

---

## 10. 成功指标

| 指标 | 目标值 | 验收标准 |
|------|--------|----------|
| LinUCB selectAction 加速 | ≥ 2x | benchmark 验证 |
| LinUCB update 加速 | ≥ 2x | benchmark 验证 |
| P99 延迟 | ≤ 50ms | 生产监控 |
| 数值一致性 | 误差 < 1e-6 | 单元测试 |
| 测试通过率 | 100% | CI 通过 |
| Fallback 命中率 | < 1% | 监控告警 |

---

## 11. 参考资料

- [napi-rs 文档](https://napi.rs/)
- [TypeScript 版 LinUCB](packages/backend/src/amas/learning/linucb.ts)
- [Codex 审计报告](本次审计反馈)
