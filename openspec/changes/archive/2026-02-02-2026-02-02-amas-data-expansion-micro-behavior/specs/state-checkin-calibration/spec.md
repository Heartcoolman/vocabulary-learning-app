# 状态打卡与疲劳校准规格

## 概述

实现会话开始时的状态打卡功能，允许用户主动报告精力状态，并将此信息作为 TFM 疲劳模型的校准信号。

## 用户决策约束

| 决策项         | 决策结果                      | 说明                                      |
| -------------- | ----------------------------- | ----------------------------------------- |
| 校准常数       | High=0.6, Normal=1.0, Low=1.4 | 保守校准范围                              |
| 会话创建时机   | 两种路径并存                  | 支持延迟创建（打卡后）和立即创建+后续更新 |
| 无效 energy 值 | 拒绝请求 (400)                | 后端严格校验，不接受非法值                |
| 微行为存储失败 | 写入日志后补                  | 失败数据写入日志文件，后续批量补入        |

## 交互设计

### 状态打卡浮层

**触发时机**：用户进入 LearningPage 且尚未开始当前会话的第一道题时。

**UI 布局**：

```
┌──────────────────────────────────────────┐
│         今天状态如何？                      │
│                                          │
│  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │  🤯    │  │  😐    │  │  😫    │     │
│  │精力充沛 │  │平平淡淡 │  │精疲力尽 │     │
│  └────────┘  └────────┘  └────────┘     │
│                                          │
│          ━━━━━ 或 ━━━━━                  │
│                                          │
│        [ 跳过，使用上次设置 ]               │
└──────────────────────────────────────────┘
```

**交互行为**：

- 点击任一状态卡片 → 立即关闭浮层，应用选择，开始学习
- 点击"跳过" → 使用上次的能量级别设置（首次使用默认 `normal`）
- 3 秒无操作 → 自动使用默认值 `normal`，浮层淡出
- 浮层为非阻塞式，用户仍可看到背景（模糊处理）

### 能量级别定义

| 级别     | 值       | 含义                       | 算法影响                         |
| -------- | -------- | -------------------------- | -------------------------------- |
| 精力充沛 | `high`   | 用户感觉精力旺盛，想要挑战 | 疲劳检测灵敏度降低，允许更高难度 |
| 平平淡淡 | `normal` | 标准状态                   | 无校准，使用默认参数             |
| 精疲力尽 | `low`    | 用户感觉疲倦               | 疲劳检测灵敏度提高，限制难度     |

## 前端实现

### 状态打卡组件

```typescript
// packages/frontend/src/components/StateCheckIn.tsx

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type EnergyLevel = 'high' | 'normal' | 'low';

interface StateCheckInProps {
  isOpen: boolean;
  onSelect: (level: EnergyLevel) => void;
  onSkip: () => void;
  defaultLevel?: EnergyLevel;
  autoCloseDelayMs?: number;
}

const ENERGY_OPTIONS = [
  { level: 'high' as const, emoji: '🤯', label: '精力充沛' },
  { level: 'normal' as const, emoji: '😐', label: '平平淡淡' },
  { level: 'low' as const, emoji: '😫', label: '精疲力尽' },
];

export function StateCheckIn({
  isOpen,
  onSelect,
  onSkip,
  defaultLevel = 'normal',
  autoCloseDelayMs = 3000,
}: StateCheckInProps) {
  const [countdown, setCountdown] = useState(autoCloseDelayMs / 1000);

  // 自动关闭倒计时
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onSelect(defaultLevel);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, defaultLevel, onSelect]);

  // 重置倒计时
  useEffect(() => {
    if (isOpen) {
      setCountdown(autoCloseDelayMs / 1000);
    }
  }, [isOpen, autoCloseDelayMs]);

  const handleSelect = useCallback((level: EnergyLevel) => {
    onSelect(level);
  }, [onSelect]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* 背景模糊遮罩 */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          {/* 打卡卡片 */}
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mx-4 max-w-md w-full"
          >
            <h2 className="text-xl font-semibold text-center mb-6 text-gray-900 dark:text-white">
              今天状态如何？
            </h2>

            {/* 状态选项 */}
            <div className="flex justify-center gap-4 mb-6">
              {ENERGY_OPTIONS.map(({ level, emoji, label }) => (
                <button
                  key={level}
                  onClick={() => handleSelect(level)}
                  className="flex flex-col items-center p-4 rounded-xl border-2 border-transparent
                             hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20
                             transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className="text-4xl mb-2">{emoji}</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-sm text-gray-500">或</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* 跳过按钮 */}
            <button
              onClick={onSkip}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700
                         dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              跳过，使用上次设置
              <span className="ml-2 text-xs text-gray-400">
                ({countdown}s 后自动跳过)
              </span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### LearningPage 集成

```typescript
// packages/frontend/src/pages/LearningPage.tsx 修改要点

import { StateCheckIn, EnergyLevel } from '../components/StateCheckIn';
import { useLocalStorage } from '../hooks/useLocalStorage';

// 在组件内部
const [showCheckIn, setShowCheckIn] = useState(false);
const [lastEnergyLevel, setLastEnergyLevel] = useLocalStorage<EnergyLevel>(
  'amas_last_energy_level',
  'normal'
);

// 检查是否需要显示打卡
useEffect(() => {
  // 仅在会话开始前、第一道题渲染前显示
  if (!sessionStarted && !sessionId && wordQueue.length > 0) {
    setShowCheckIn(true);
  }
}, [sessionStarted, sessionId, wordQueue.length]);

// 处理状态选择
const handleEnergySelect = useCallback(async (level: EnergyLevel) => {
  setShowCheckIn(false);
  setLastEnergyLevel(level);

  // 创建会话时传递能量级别
  await createSession({
    targetMasteryCount,
    selfReportedEnergy: level,
  });
}, [createSession, targetMasteryCount, setLastEnergyLevel]);

// 处理跳过
const handleSkip = useCallback(() => {
  handleEnergySelect(lastEnergyLevel);
}, [handleEnergySelect, lastEnergyLevel]);

// 渲染
return (
  <>
    <StateCheckIn
      isOpen={showCheckIn}
      onSelect={handleEnergySelect}
      onSkip={handleSkip}
      defaultLevel={lastEnergyLevel}
    />
    {/* ... existing content */}
  </>
);
```

## 后端实现

### API 扩展

```rust
// packages/backend-rust/src/routes/learning_sessions.rs

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub session_type: Option<String>,
    pub target_mastery_count: Option<i32>,
    #[serde(default)]
    pub self_reported_energy: Option<String>,  // "high" | "normal" | "low"
}

async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    // 验证能量级别 - 严格校验，无效值返回 400
    let energy_level = match body.self_reported_energy.as_deref() {
        Some("high") => Some("high"),
        Some("normal") => Some("normal"),
        Some("low") => Some("low"),
        Some(invalid) => {
            return Err(AppError::BadRequest(format!(
                "Invalid energy level: '{}'. Must be 'high', 'normal', or 'low'",
                invalid
            )));
        }
        None => None,
    };

    // 创建会话
    let session = create_learning_session(
        proxy.pool(),
        &user.id,
        body.session_type.as_deref(),
        body.target_mastery_count,
        energy_level,
    ).await?;

    // 如果有能量级别，初始化 TFM 校准
    if let Some(level) = energy_level {
        initialize_fatigue_calibration(proxy.as_ref(), &user.id, &session.id, level).await?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: session,
    }))
}
```

### 疲劳模型校准

```rust
// packages/backend-rust/src/amas/modeling/tfm.rs

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EnergyLevel {
    High,
    Normal,
    Low,
}

impl EnergyLevel {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "high" => Some(Self::High),
            "normal" => Some(Self::Normal),
            "low" => Some(Self::Low),
            _ => None,
        }
    }

    /// 获取疲劳检测的校准因子（用户决策确定）
    /// - High: 0.6 (降低检测灵敏度，用户自认为精力充沛)
    /// - Normal: 1.0 (无校准)
    /// - Low: 1.4 (提高检测灵敏度，用户自认为疲倦)
    pub fn fatigue_calibration_factor(&self) -> f64 {
        match self {
            Self::High => 0.6,
            Self::Normal => 1.0,
            Self::Low => 1.4,
        }
    }

    /// 获取难度上限约束
    /// - High: None (无限制)
    /// - Normal: None (无限制)
    /// - Low: Some(DifficultyLevel::Easy) (限制为简单难度)
    pub fn difficulty_ceiling(&self) -> Option<DifficultyLevel> {
        match self {
            Self::High | Self::Normal => None,
            Self::Low => Some(DifficultyLevel::Easy),
        }
    }

    /// 获取新词比例上限
    /// - High: 0.4 (允许更多新词)
    /// - Normal: 0.3 (标准)
    /// - Low: 0.0 (不引入新词)
    pub fn new_ratio_ceiling(&self) -> f64 {
        match self {
            Self::High => 0.4,
            Self::Normal => 0.3,
            Self::Low => 0.0,
        }
    }
}

impl TriPoolFatigue {
    /// 使用用户报告的能量级别校准疲劳状态
    pub fn calibrate_with_energy_level(
        &self,
        state: &mut TriPoolFatigueState,
        energy_level: EnergyLevel,
    ) {
        let factor = energy_level.fatigue_calibration_factor();

        // 应用校准因子到当前疲劳水平
        // 这会影响后续所有基于当前状态的疲劳检测
        state.cognitive.fast *= factor;
        state.cognitive.slow *= factor;
        state.mental.fast *= factor;
        state.mental.slow *= factor;

        // 视觉疲劳不受主观报告影响（基于客观检测）
        // state.visual 保持不变

        // 确保值在有效范围内
        state.cognitive.fast = state.cognitive.fast.clamp(0.0, 1.0);
        state.cognitive.slow = state.cognitive.slow.clamp(0.0, 1.0);
        state.mental.fast = state.mental.fast.clamp(0.0, 1.0);
        state.mental.slow = state.mental.slow.clamp(0.0, 1.0);
    }
}
```

### 策略约束应用

```rust
// packages/backend-rust/src/amas/decision/ensemble.rs

impl EnsembleDecision {
    pub fn post_filter_with_calibration(
        &self,
        strategy: &mut StrategyParams,
        user_state: &UserState,
        session_info: Option<&SessionInfo>,
        energy_level: Option<EnergyLevel>,
    ) {
        // 原有安全过滤...
        self.post_filter(strategy, user_state, session_info);

        // 应用能量级别约束
        if let Some(level) = energy_level {
            // 难度上限约束
            if let Some(ceiling) = level.difficulty_ceiling() {
                if strategy.difficulty > ceiling {
                    strategy.difficulty = ceiling;
                }
            }

            // 新词比例上限约束
            let new_ratio_ceiling = level.new_ratio_ceiling();
            if strategy.new_ratio > new_ratio_ceiling {
                strategy.new_ratio = new_ratio_ceiling;
            }

            // Low 能量特殊处理：增加提示级别
            if level == EnergyLevel::Low && strategy.hint_level < 2 {
                strategy.hint_level = 2;
            }
        }
    }
}
```

### 会话状态存储

```rust
// packages/backend-rust/src/services/learning_session.rs

pub async fn create_learning_session(
    pool: &PgPool,
    user_id: &str,
    session_type: Option<&str>,
    target_mastery_count: Option<i32>,
    energy_level: Option<&str>,
) -> Result<LearningSession, AppError> {
    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query!(
        r#"
        INSERT INTO learning_sessions (
            id, user_id, session_type, target_mastery_count,
            self_reported_energy, started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        session_id,
        user_id,
        session_type.unwrap_or("NORMAL"),
        target_mastery_count.unwrap_or(10),
        energy_level,
        now
    )
    .execute(pool)
    .await?;

    Ok(LearningSession {
        id: session_id,
        user_id: user_id.to_string(),
        session_type: session_type.unwrap_or("NORMAL").to_string(),
        target_mastery_count: target_mastery_count.unwrap_or(10),
        self_reported_energy: energy_level.map(String::from),
        started_at: now,
        ended_at: None,
    })
}
```

## 数据库 Schema

```sql
-- 扩展 learning_sessions 表
ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS self_reported_energy VARCHAR(16);

COMMENT ON COLUMN learning_sessions.self_reported_energy IS
    '用户自报告的精力状态: high, normal, low';

-- 校准历史表（可选，用于长期学习用户偏好）
CREATE TABLE IF NOT EXISTS fatigue_calibration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    reported_energy VARCHAR(16) NOT NULL,
    detected_fatigue_before REAL,
    detected_fatigue_after REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fch_user ON fatigue_calibration_history(user_id);

COMMENT ON TABLE fatigue_calibration_history IS
    '记录用户自报告能量与系统检测疲劳的对应关系，用于长期校准';
```

## 分析与校准学习

### 长期校准机制（P2 功能）

系统可以通过收集 `fatigue_calibration_history` 数据，学习每个用户的主观报告与客观疲劳检测之间的映射关系：

```rust
/// 计算用户个人的校准系数
/// 基于历史数据学习用户的主观感知与客观检测的偏差
pub async fn compute_personal_calibration(
    pool: &PgPool,
    user_id: &str,
) -> Result<PersonalCalibration, AppError> {
    let history = sqlx::query_as!(
        CalibrationRecord,
        r#"
        SELECT reported_energy, detected_fatigue_before, detected_fatigue_after
        FROM fatigue_calibration_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
        user_id
    )
    .fetch_all(pool)
    .await?;

    if history.len() < 10 {
        // 数据不足，使用默认校准
        return Ok(PersonalCalibration::default());
    }

    // 计算每个能量级别的平均检测偏差
    let high_samples: Vec<_> = history.iter()
        .filter(|r| r.reported_energy == "high")
        .collect();
    let low_samples: Vec<_> = history.iter()
        .filter(|r| r.reported_energy == "low")
        .collect();

    // 学习用户的感知偏差
    // 如果用户报告 "high" 但系统频繁检测到高疲劳，说明用户对疲劳不敏感
    // 如果用户报告 "low" 但系统检测到低疲劳，说明用户对疲劳过度敏感

    Ok(PersonalCalibration {
        high_factor: compute_factor_from_samples(&high_samples),
        low_factor: compute_factor_from_samples(&low_samples),
        sample_count: history.len(),
    })
}
```

## 测试用例

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_level_parsing() {
        assert_eq!(EnergyLevel::from_str("high"), Some(EnergyLevel::High));
        assert_eq!(EnergyLevel::from_str("normal"), Some(EnergyLevel::Normal));
        assert_eq!(EnergyLevel::from_str("low"), Some(EnergyLevel::Low));
        assert_eq!(EnergyLevel::from_str("invalid"), None);
    }

    #[test]
    fn test_fatigue_calibration() {
        let tfm = TriPoolFatigue::default();
        let mut state = TriPoolFatigueState {
            cognitive: FatiguePool { fast: 0.5, slow: 0.3 },
            visual: FatiguePool { fast: 0.4, slow: 0.2 },
            mental: FatiguePool { fast: 0.6, slow: 0.4 },
        };

        // 用户报告精力充沛
        tfm.calibrate_with_energy_level(&mut state, EnergyLevel::High);

        // 认知和心理疲劳应该降低
        assert!(state.cognitive.fast < 0.5);
        assert!(state.mental.fast < 0.6);
        // 视觉疲劳保持不变
        assert_eq!(state.visual.fast, 0.4);
    }

    #[test]
    fn test_strategy_constraint_low_energy() {
        let ensemble = EnsembleDecision::default();
        let mut strategy = StrategyParams {
            difficulty: DifficultyLevel::Hard,
            new_ratio: 0.3,
            batch_size: 10,
            interval_scale: 1.0,
            hint_level: 0,
        };

        ensemble.post_filter_with_calibration(
            &mut strategy,
            &UserState::default(),
            None,
            Some(EnergyLevel::Low),
        );

        // Low 能量应该限制难度和新词
        assert_eq!(strategy.difficulty, DifficultyLevel::Easy);
        assert_eq!(strategy.new_ratio, 0.0);
        assert_eq!(strategy.hint_level, 2);
    }
}
```

## 成功标准

1. **打卡浮层正常显示**：进入 LearningPage 时浮层出现，选择后消失
2. **能量级别正确传递**：`learning_sessions` 表记录 `self_reported_energy`
3. **疲劳校准生效**：报告 `low` 后系统更快触发疲劳警告
4. **策略约束生效**：报告 `low` 后不出现 Hard 难度题目，不引入新词
5. **自动跳过正常工作**：3 秒无操作后使用默认值
6. **上次设置记忆**：刷新页面后仍能使用上次的能量级别

## Property-Based Testing 规格

### 能量级别校准 PBT 属性

| 属性名                          | 类型             | 不变量定义                                                                                  | 伪造策略                                                                                  |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `calibration_visual_unchanged`  | Invariant        | 应用任意校准因子后，`visual.fast` 和 `visual.slow` 保持不变                                 | 生成随机 `TriPoolFatigueState`，应用校准，断言 visual 池未变                              |
| `calibration_bounds`            | Bounds           | 校准后每个池组件保持在 `[0, 1]` 范围内                                                      | 生成越界输入（负数、>1）和极端因子，断言输出 clamp 到范围内且无 NaN/Inf                   |
| `calibration_monotonic`         | Monotonicity     | 对于 `0 < f1 <= f2` 且值未触及 clamp，`calibrate(x, f1) <= calibrate(x, f2)`                | 生成 `x ∈ (0, 1)` 和因子 `{0.0+, 0.6, 1.0, 1.4, huge}`，过滤 clamp 饱和情况，断言单调缩放 |
| `calibration_composable`        | Compositionality | 两次校准乘法可组合：`calibrate(calibrate(x, f1), f2) == calibrate(x, f1*f2)`（未 clamp 时） | 生成 `x` 和 `(f1, f2)` 使得 `x*f1*f2 ∈ (0, 1)`，断言在浮点容差内相等                      |
| `calibration_idempotent_normal` | Idempotency      | `EnergyLevel::Normal` (factor=1.0) 应用后状态不变                                           | 生成随机状态，应用 Normal 校准，断言所有字段相等                                          |

### 策略约束 PBT 属性

| 属性名                          | 类型      | 不变量定义                                                           | 伪造策略                                                                           |
| ------------------------------- | --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `low_energy_difficulty_ceiling` | Invariant | `EnergyLevel::Low` 后 `strategy.difficulty <= DifficultyLevel::Easy` | 生成初始 strategy 为任意 difficulty，应用 Low 约束，断言 difficulty 不超过 Easy    |
| `low_energy_new_ratio_zero`     | Invariant | `EnergyLevel::Low` 后 `strategy.new_ratio == 0.0`                    | 生成初始 strategy 为任意 new_ratio，应用 Low 约束，断言 new_ratio 为 0             |
| `low_energy_hint_minimum`       | Invariant | `EnergyLevel::Low` 后 `strategy.hint_level >= 2`                     | 生成初始 hint_level ∈ {0, 1, 2, 3}，应用 Low 约束，断言 hint_level >= 2            |
| `high_normal_no_ceiling`        | Invariant | `EnergyLevel::High/Normal` 不强制降低 difficulty                     | 生成 strategy 为 Hard difficulty，应用 High/Normal 约束，断言 difficulty 保持 Hard |

### API 校验 PBT 属性

| 属性名                    | 类型      | 不变量定义                                              | 伪造策略                                                                             |
| ------------------------- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `invalid_energy_rejected` | Invariant | 非 `high/normal/low` 的 `self_reported_energy` 返回 400 | 生成随机字符串（含 "High", "LOW", "", "medium", null 字符串等），断言返回 BadRequest |
| `valid_energy_accepted`   | Invariant | `high/normal/low` 总是被接受                            | 生成这三个值的随机选择，断言请求成功                                                 |
| `missing_energy_optional` | Invariant | `self_reported_energy` 缺失时请求成功，使用 None        | 生成无 energy 字段的请求，断言成功且 session.energy 为 None                          |

### 前端状态 PBT 属性

| 属性名                   | 类型         | 不变量定义                                         | 伪造策略                                                   |
| ------------------------ | ------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| `countdown_decreases`    | Monotonicity | 倒计时从初始值单调递减直到 0                       | 模拟时间流逝，断言 countdown 值单调递减                    |
| `auto_select_on_zero`    | Invariant    | 倒计时到 0 时触发 `onSelect(defaultLevel)`         | 模拟 3 秒无操作，断言 onSelect 被调用且参数为 defaultLevel |
| `localStorage_roundtrip` | Round-trip   | `setLastEnergyLevel(x)` 后 `lastEnergyLevel === x` | 对三个有效值分别存储和读取，断言相等                       |

## ADDED Requirements

### Requirement: 状态打卡组件 (REQ-CHECKIN-001)

前端 SHALL 提供 `StateCheckIn` 组件，在会话开始时询问用户当前精力状态。

#### Scenario: 用户选择精力状态

- Given 用户进入 LearningPage
- When 题目列表加载完成且尚未作答
- Then 显示状态打卡浮层
- And 用户点击 "精力充沛"/"平平淡淡"/"精疲力尽" 中任一选项
- And 浮层关闭，记录选择到 localStorage，开始学习

### Requirement: 自动跳过与默认值 (REQ-CHECKIN-002)

打卡组件 SHALL 支持 3 秒自动跳过，使用上次选择或默认值 `normal`。

#### Scenario: 3 秒无操作自动跳过

- Given 打卡浮层显示
- When 用户 3 秒内无任何操作
- Then 自动使用默认值 `normal` 关闭浮层
- And 开始学习

### Requirement: TFM 疲劳校准 (REQ-CHECKIN-003)

后端 SHALL 根据用户报告的精力状态校准 TFM 疲劳模型。

#### Scenario: Low 能量校准

- Given 用户选择 "精疲力尽" (low)
- When 创建学习会话时传递 `selfReportedEnergy: "low"`
- Then TFM 应用校准因子 1.4 (提高疲劳检测灵敏度)
- And 难度上限约束为 Easy
- And 新词比例上限约束为 0

### Requirement: API 严格校验 (REQ-CHECKIN-004)

后端 MUST 对 energy level 进行严格校验，拒绝非法值。

#### Scenario: 非法 energy 值返回 400

- Given 请求包含 `selfReportedEnergy: "medium"`
- When 调用创建会话 API
- Then 返回 400 Bad Request
- And 错误消息说明有效值为 'high', 'normal', 'low'
