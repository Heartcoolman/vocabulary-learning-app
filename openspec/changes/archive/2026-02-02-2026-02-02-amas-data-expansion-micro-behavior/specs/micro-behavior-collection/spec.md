# 微观行为数据采集规格

## 概述

实现无感采集用户微观行为数据，包括犹豫系数（Indecision Index）和按键特征（Keystroke Dynamics）。

## 用户决策约束

| 决策项               | 决策结果                      | 说明                                                                  |
| -------------------- | ----------------------------- | --------------------------------------------------------------------- |
| 时间戳格式           | 双字段存储                    | 前端提交 epoch ms + relative offset 双字段，后端存储 i64              |
| 移动端适配           | 检测设备类型，条件采集        | 通过 `PointerEvent.pointerType` 检测，touch 设备跳过 hover/trajectory |
| 校准常数             | High=0.6, Normal=1.0, Low=1.4 | 保守校准范围，避免过度调整                                            |
| 蒙题答错处理         | 与普通答错相同                | `is_guess && !is_correct` 不额外惩罚                                  |
| 数据捕获时机         | 点击选项时                    | 用户点击选项时立即快照微行为数据                                      |
| 存储失败处理         | 写入日志后补                  | 失败数据写入日志文件，后续批量补入                                    |
| 事件数组上限         | 500/100/50 + 保留最新         | trajectory=500, hover=100, keystroke=50，超出保留最后 N 条            |
| reactionLatency 定义 | 任何交互                      | 首次 pointer move、hover enter 或 keydown 中最早的                    |
| 高优先级复习机制     | 复用 SWD 优先级               | `is_guess=true` 单词在 SWD 中标记 `priority=high`                     |
| 数据保留策略         | 永久保留                      | 原始事件序列永久存储，不做 TTL                                        |

## 数据结构定义

### 前端类型 (TypeScript)

```typescript
// packages/shared/src/types/microBehavior.ts

/** 单个轨迹点 - 双字段时间戳 */
interface TrajectoryPoint {
  x: number; // 相对于选项容器的 X 坐标
  y: number; // 相对于选项容器的 Y 坐标
  t: number; // 相对时间偏移 (ms，相对于 questionRenderTime)
  epochMs: number; // 绝对时间戳 (Date.now())
}

/** 悬停事件 - 双字段时间戳 */
interface HoverEvent {
  optionId: string;
  enterTime: number; // 相对时间偏移 (ms)
  leaveTime: number; // 相对时间偏移 (ms)
  enterEpochMs: number; // 绝对时间戳
  leaveEpochMs: number; // 绝对时间戳
}

/** 按键事件 - 双字段时间戳 */
interface KeystrokeEvent {
  key: string; // 按键值 ('1', '2', '3', '4')
  downTime: number; // 相对时间偏移 (ms)
  upTime: number | null; // 相对时间偏移 (ms)，未松开时为 null
  downEpochMs: number; // 绝对时间戳
  upEpochMs: number | null; // 绝对时间戳
}

/** 微观交互数据 */
export interface MicroInteractionData {
  // 设备类型（用于条件采集）
  pointerType: 'mouse' | 'touch' | 'pen'; // PointerEvent.pointerType

  // 犹豫系数相关（touch 设备为空数组）
  trajectoryPoints: TrajectoryPoint[]; // 鼠标轨迹（最多 500 点，FIFO 保留最新）
  hoverEvents: HoverEvent[]; // 悬停事件（最多 100 条，FIFO 保留最新）
  tentativeSelections: string[]; // 曾犹豫的选项 ID

  // 按键特征相关
  keystrokeEvents: KeystrokeEvent[]; // 按键序列（最多 50 条，FIFO 保留最新）
  reactionLatencyMs: number | null; // 首次交互延迟（任何交互：pointer move/hover/keydown）

  // 计算指标
  trajectoryLength: number; // 轨迹总长度（像素）
  directDistance: number; // 起点到终点直线距离
  optionSwitchCount: number; // 选项切换次数（区别于页面 switch_count）

  // 时间基准
  questionRenderEpochMs: number; // 题目渲染完成的绝对时间戳
}

/** 提交答案扩展参数 */
export interface SubmitAnswerParams {
  // ... existing fields
  isGuess?: boolean; // 蒙题标记
  microInteraction?: MicroInteractionData; // 微观交互数据
}
```

### 后端类型 (Rust)

```rust
// packages/backend-rust/src/amas/types.rs

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MicroInteractions {
    pub pointer_type: Option<String>,  // "mouse" | "touch" | "pen"
    pub trajectory_points: Option<Vec<TrajectoryPoint>>,
    pub hover_events: Option<Vec<HoverEvent>>,
    pub tentative_selections: Option<Vec<String>>,
    pub keystroke_events: Option<Vec<KeystrokeEvent>>,
    pub reaction_latency_ms: Option<i64>,
    pub trajectory_length: Option<f64>,
    pub direct_distance: Option<f64>,
    pub option_switch_count: Option<i32>,  // 重命名，区别于 RawEvent.switch_count
    pub question_render_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub t: i64,           // 相对时间偏移 (ms)
    pub epoch_ms: i64,    // 绝对时间戳
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoverEvent {
    pub option_id: String,
    pub enter_time: i64,       // 相对时间偏移 (ms)
    pub leave_time: i64,       // 相对时间偏移 (ms)
    pub enter_epoch_ms: i64,   // 绝对时间戳
    pub leave_epoch_ms: i64,   // 绝对时间戳
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokeEvent {
    pub key: String,
    pub down_time: i64,         // 相对时间偏移 (ms)
    pub up_time: Option<i64>,   // 相对时间偏移 (ms)
    pub down_epoch_ms: i64,     // 绝对时间戳
    pub up_epoch_ms: Option<i64>,
}
```

## 前端采集实现

### MicroBehaviorTracker 类

```typescript
// packages/frontend/src/services/MicroBehaviorTracker.ts

export class MicroBehaviorTracker {
  private trajectoryPoints: TrajectoryPoint[] = [];
  private hoverEvents: HoverEvent[] = [];
  private keystrokeEvents: KeystrokeEvent[] = [];
  private tentativeSelections: Set<string> = new Set();

  private questionRenderTime: number = 0;
  private questionRenderEpochMs: number = 0;
  private firstInteractionTime: number | null = null;
  private containerRect: DOMRect | null = null;
  private lastSampleTime: number = 0;
  private currentHover: { optionId: string; enterTime: number; enterEpochMs: number } | null = null;
  private pointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  private isTouchDevice: boolean = false;

  // 硬编码常量 - 禁止配置化
  private static readonly SAMPLE_INTERVAL_MS = 50;
  private static readonly MAX_TRAJECTORY_POINTS = 500;
  private static readonly MAX_HOVER_EVENTS = 100;
  private static readonly MAX_KEYSTROKE_EVENTS = 50;
  private static readonly TENTATIVE_HOVER_THRESHOLD_MS = 500;

  /** 初始化追踪器，在题目渲染完成时调用 */
  init(containerElement: HTMLElement): void {
    this.reset();
    this.questionRenderTime = performance.now();
    this.questionRenderEpochMs = Date.now();
    this.containerRect = containerElement.getBoundingClientRect();
  }

  /** 重置所有状态 */
  reset(): void {
    this.trajectoryPoints = [];
    this.hoverEvents = [];
    this.keystrokeEvents = [];
    this.tentativeSelections.clear();
    this.firstInteractionTime = null;
    this.currentHover = null;
    this.lastSampleTime = 0;
    this.pointerType = 'mouse';
    this.isTouchDevice = false;
  }

  /** 处理鼠标/触摸移动事件 - 条件采集 */
  handlePointerMove(event: PointerEvent): void {
    // 检测设备类型
    this.pointerType = event.pointerType as 'mouse' | 'touch' | 'pen';
    if (event.pointerType === 'touch') {
      this.isTouchDevice = true;
      return; // touch 设备跳过 trajectory 采集
    }

    const now = performance.now();
    if (now - this.lastSampleTime < MicroBehaviorTracker.SAMPLE_INTERVAL_MS) {
      return;
    }

    this.recordFirstInteraction(now);
    this.lastSampleTime = now;

    if (this.containerRect) {
      const point: TrajectoryPoint = {
        x: event.clientX - this.containerRect.left,
        y: event.clientY - this.containerRect.top,
        t: Math.round(now - this.questionRenderTime),
        epochMs: Date.now(),
      };

      // FIFO 策略：超出上限时移除最早的点
      if (this.trajectoryPoints.length >= MicroBehaviorTracker.MAX_TRAJECTORY_POINTS) {
        this.trajectoryPoints.shift();
      }
      this.trajectoryPoints.push(point);
    }
  }

  /** 处理选项悬停进入 - 条件采集 */
  handleOptionEnter(optionId: string, event?: PointerEvent): void {
    if (event?.pointerType === 'touch') {
      this.isTouchDevice = true;
      return; // touch 设备跳过 hover 采集
    }

    const now = performance.now();
    this.recordFirstInteraction(now);

    if (this.currentHover) {
      this.finalizeHover(now);
    }

    this.currentHover = {
      optionId,
      enterTime: now - this.questionRenderTime,
      enterEpochMs: Date.now(),
    };
  }

  /** 处理选项悬停离开 */
  handleOptionLeave(): void {
    if (this.currentHover && !this.isTouchDevice) {
      this.finalizeHover(performance.now());
    }
  }

  /** 处理按键按下 - 带 FIFO 限制 */
  handleKeyDown(key: string): void {
    const now = performance.now();
    this.recordFirstInteraction(now);

    const event: KeystrokeEvent = {
      key,
      downTime: Math.round(now - this.questionRenderTime),
      upTime: null,
      downEpochMs: Date.now(),
      upEpochMs: null,
    };

    // FIFO 策略
    if (this.keystrokeEvents.length >= MicroBehaviorTracker.MAX_KEYSTROKE_EVENTS) {
      this.keystrokeEvents.shift();
    }
    this.keystrokeEvents.push(event);
  }

  /** 处理按键松开 */
  handleKeyUp(key: string): void {
    const now = performance.now();
    const event = this.keystrokeEvents.find((e) => e.key === key && e.upTime === null);
    if (event) {
      event.upTime = Math.round(now - this.questionRenderTime);
      event.upEpochMs = Date.now();
    }
  }

  /** 获取采集的数据 - 在点击选项时调用 */
  getData(): MicroInteractionData {
    // 完成当前悬停
    if (this.currentHover && !this.isTouchDevice) {
      this.finalizeHover(performance.now());
    }

    const trajectoryLength = this.calculateTrajectoryLength();
    const directDistance = this.calculateDirectDistance();
    const optionSwitchCount = this.calculateSwitchCount();

    return {
      pointerType: this.pointerType,
      trajectoryPoints: this.trajectoryPoints,
      hoverEvents: this.hoverEvents,
      tentativeSelections: Array.from(this.tentativeSelections),
      keystrokeEvents: this.keystrokeEvents,
      reactionLatencyMs: this.firstInteractionTime
        ? Math.round(this.firstInteractionTime - this.questionRenderTime)
        : null,
      trajectoryLength,
      directDistance,
      optionSwitchCount,
      questionRenderEpochMs: this.questionRenderEpochMs,
    };
  }

  private recordFirstInteraction(time: number): void {
    if (this.firstInteractionTime === null) {
      this.firstInteractionTime = time;
    }
  }

  private finalizeHover(endTime: number): void {
    if (!this.currentHover) return;

    const relativeEnd = Math.round(endTime - this.questionRenderTime);
    const duration = relativeEnd - this.currentHover.enterTime;

    const event: HoverEvent = {
      optionId: this.currentHover.optionId,
      enterTime: Math.round(this.currentHover.enterTime),
      leaveTime: relativeEnd,
      enterEpochMs: this.currentHover.enterEpochMs,
      leaveEpochMs: Date.now(),
    };

    // FIFO 策略
    if (this.hoverEvents.length >= MicroBehaviorTracker.MAX_HOVER_EVENTS) {
      this.hoverEvents.shift();
    }
    this.hoverEvents.push(event);

    if (duration >= MicroBehaviorTracker.TENTATIVE_HOVER_THRESHOLD_MS) {
      this.tentativeSelections.add(this.currentHover.optionId);
    }

    this.currentHover = null;
  }

  private calculateTrajectoryLength(): number {
    if (this.trajectoryPoints.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < this.trajectoryPoints.length; i++) {
      const dx = this.trajectoryPoints[i].x - this.trajectoryPoints[i - 1].x;
      const dy = this.trajectoryPoints[i].y - this.trajectoryPoints[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  private calculateDirectDistance(): number {
    if (this.trajectoryPoints.length < 2) return 0;

    const first = this.trajectoryPoints[0];
    const last = this.trajectoryPoints[this.trajectoryPoints.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateSwitchCount(): number {
    if (this.hoverEvents.length < 2) return 0;

    let switches = 0;
    for (let i = 1; i < this.hoverEvents.length; i++) {
      if (this.hoverEvents[i].optionId !== this.hoverEvents[i - 1].optionId) {
        switches++;
      }
    }
    return switches;
  }
}
```

### TestOptions 组件集成

```typescript
// packages/frontend/src/components/TestOptions.tsx 修改要点

import { MicroBehaviorTracker } from '../services/MicroBehaviorTracker';

// 在组件内部
const trackerRef = useRef(new MicroBehaviorTracker());
const containerRef = useRef<HTMLDivElement>(null);

// 题目渲染完成时初始化
useEffect(() => {
  if (containerRef.current && options.length > 0) {
    trackerRef.current.init(containerRef.current);
  }
}, [options, questionIndex]);

// 绑定 pointer move 事件
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const handleMove = (e: PointerEvent) => trackerRef.current.handlePointerMove(e);
  container.addEventListener('pointermove', handleMove);

  return () => container.removeEventListener('pointermove', handleMove);
}, []);

// 选项按钮添加悬停处理
<button
  onPointerEnter={() => trackerRef.current.handleOptionEnter(option.id)}
  onPointerLeave={() => trackerRef.current.handleOptionLeave()}
  // ...
>

// 提交时获取数据
const handleSubmit = (selectedOptionId: string) => {
  const microData = trackerRef.current.getData();
  submitAnswer({
    // ... existing params
    microInteraction: microData,
  });
};
```

## 犹豫系数计算

### 算法定义

```
indecision_index = (trajectory_length / direct_distance - 1) * switch_penalty

其中:
- trajectory_length: 鼠标轨迹总长度（像素）
- direct_distance: 起点到终点直线距离（像素）
- switch_penalty: 1.0 + 0.2 * switch_count

特殊情况:
- direct_distance < 10px: 返回 0（几乎无移动）
- trajectory_length / direct_distance < 1.5: 返回 0（正常直线移动）
- 最大值: 截断到 1.0
```

### 后端实现

```rust
// packages/backend-rust/src/amas/memory/adaptive_mastery.rs

pub fn calculate_indecision_index(micro: &MicroInteractions) -> f64 {
    let trajectory_length = micro.trajectory_length.unwrap_or(0.0);
    let direct_distance = micro.direct_distance.unwrap_or(0.0);
    let switch_count = micro.switch_count.unwrap_or(0);

    if direct_distance < 10.0 {
        return 0.0;
    }

    let ratio = trajectory_length / direct_distance;
    if ratio < 1.5 {
        return 0.0;
    }

    let switch_penalty = 1.0 + 0.2 * switch_count as f64;
    let index = (ratio - 1.0) * switch_penalty;

    index.clamp(0.0, 1.0)
}
```

## 按键特征评分

### 算法定义

```
keystroke_fluency = sigmoid((expected_latency - actual_latency) / scale)
                  * sigmoid((expected_hold - actual_hold) / scale)

其中:
- expected_latency: 2500ms（预期反应时间）
- expected_hold: 150ms（预期按键保持时间）
- scale: 500（sigmoid 缩放因子）

输出范围: [0.0, 1.0]
- 接近 1.0: 快速、果断的按键（高熟练度）
- 接近 0.0: 缓慢、犹豫的按键（低熟练度）
```

### 后端实现

```rust
pub fn calculate_keystroke_fluency(micro: &MicroInteractions) -> f64 {
    let reaction_latency = micro.reaction_latency_ms.unwrap_or(5000) as f64;

    let avg_hold_time = if let Some(events) = &micro.keystroke_events {
        let valid_events: Vec<_> = events.iter()
            .filter_map(|e| e.up_time.map(|up| up - e.down_time))
            .collect();
        if valid_events.is_empty() {
            300.0
        } else {
            valid_events.iter().sum::<i64>() as f64 / valid_events.len() as f64
        }
    } else {
        300.0
    };

    let latency_score = sigmoid((2500.0 - reaction_latency) / 500.0);
    let hold_score = sigmoid((150.0 - avg_hold_time) / 50.0);

    (latency_score * hold_score).clamp(0.0, 1.0)
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}
```

## 掌握度惩罚集成

### 修改 compute_adaptive_mastery

```rust
pub fn compute_adaptive_mastery_with_micro(
    mdm: &MdmState,
    user_state: &UserState,
    context: &MasteryContext,
    difficulty: DifficultyLevel,
    is_correct: bool,
    history: Option<&MasteryHistory>,
    micro: Option<&MicroInteractions>,
    is_guess: bool,
) -> AdaptiveMasteryResult {
    // 蒙题一票否决
    if is_guess && is_correct {
        return AdaptiveMasteryResult {
            is_mastered: false,
            confidence: 0.0,
            score: 0.0,
            threshold: 100.0, // 人为设高阈值
            factors: MasteryFactors {
                mdm_contribution: 0.0,
                cognitive_contribution: 0.0,
                performance_contribution: 0.0,
                context_contribution: -100.0, // 标记为蒙题否决
            },
        };
    }

    // 原有计算...
    let mut result = compute_adaptive_mastery_with_history(
        mdm, user_state, context, difficulty, is_correct, history
    );

    // 应用犹豫惩罚
    if let Some(m) = micro {
        let indecision = calculate_indecision_index(m);
        let fluency = calculate_keystroke_fluency(m);

        // 犹豫惩罚: 最多降低 30% 的 performance_contribution
        let hesitation_penalty = 1.0 - 0.3 * indecision;
        result.factors.performance_contribution *= hesitation_penalty;

        // 熟练度加成: 最多增加 10% 的 context_contribution
        let fluency_bonus = fluency * 0.1 * result.factors.context_contribution.max(5.0);
        result.factors.context_contribution += fluency_bonus;

        // 重算分数
        result.score = result.factors.mdm_contribution
            + result.factors.cognitive_contribution
            + result.factors.performance_contribution
            + result.factors.context_contribution;

        result.is_mastered = result.score >= result.threshold;
        result.confidence = sigmoid((result.score - result.threshold) / 10.0);
    }

    result
}
```

## 数据库持久化

### SQL 迁移脚本

```sql
-- packages/backend-rust/sql/048_add_micro_behavior_tables.sql

-- 扩展 answer_records 表
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS is_guess BOOLEAN DEFAULT FALSE;
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS indecision_index REAL;
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS reaction_latency_ms INTEGER;
ALTER TABLE answer_records ADD COLUMN IF NOT EXISTS keystroke_fluency REAL;

-- 原始事件序列存储表
CREATE TABLE IF NOT EXISTS micro_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_record_id UUID NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_answer_record
        FOREIGN KEY (answer_record_id)
        REFERENCES answer_records(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mbe_answer_record
    ON micro_behavior_events(answer_record_id);

CREATE INDEX IF NOT EXISTS idx_mbe_event_type
    ON micro_behavior_events(event_type);

COMMENT ON TABLE micro_behavior_events IS
    '存储原始微观行为事件序列，用于后续分析和模型训练';

COMMENT ON COLUMN micro_behavior_events.event_type IS
    '事件类型: trajectory, hover, keystroke';

COMMENT ON COLUMN micro_behavior_events.event_data IS
    '事件数据 JSON，结构取决于 event_type';
```

## 测试用例

### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_indecision_index_straight_line() {
        let micro = MicroInteractions {
            trajectory_length: Some(100.0),
            direct_distance: Some(95.0),
            switch_count: Some(0),
            ..Default::default()
        };
        let index = calculate_indecision_index(&micro);
        assert!(index < 0.1, "Straight line should have low indecision");
    }

    #[test]
    fn test_indecision_index_with_hesitation() {
        let micro = MicroInteractions {
            trajectory_length: Some(300.0),
            direct_distance: Some(100.0),
            switch_count: Some(3),
            ..Default::default()
        };
        let index = calculate_indecision_index(&micro);
        assert!(index > 0.5, "Wandering path with switches should have high indecision");
    }

    #[test]
    fn test_guess_flag_veto() {
        let result = compute_adaptive_mastery_with_micro(
            &MdmState::default(),
            &UserState::default(),
            &MasteryContext::default(),
            DifficultyLevel::Mid,
            true,  // is_correct
            None,
            None,
            true,  // is_guess
        );
        assert!(!result.is_mastered, "Guess flag should veto mastery");
        assert_eq!(result.factors.context_contribution, -100.0);
    }
}
```

## Property-Based Testing 规格

### 犹豫系数 (Indecision Index) PBT 属性

| 属性名                            | 类型          | 不变量定义                                                                                           | 伪造策略                                                                                                                  |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `indecision_bounds`               | Bounds        | `indecision_index ∈ [0, 1]` 对任意有限输入                                                           | 生成极端值：`direct_distance ∈ {0, 1e-12, 9.999, 10, 1e9}`, `trajectory_length` 极大, `switch_count` 极大；断言无 NaN/Inf |
| `indecision_monotonic_trajectory` | Monotonicity  | 固定 `direct_distance >= 10` 和 `switch_count`，增加 `trajectory_length` 不会降低 `indecision_index` | 在 `ratio≈1.5` 边界和 clamp 饱和附近采样 `trajectory_length1 <= trajectory_length2`，断言 `idx1 <= idx2`                  |
| `indecision_monotonic_switch`     | Monotonicity  | 固定 `direct_distance >= 10` 和 `ratio >= 1.5`，增加 `switch_count` 不会降低 `indecision_index`      | 固定 ratio，fuzz `switch_count ∈ {0,1,2,5,50,500}`，验证单调非递减直到 clamp=1.0                                          |
| `indecision_zero_small_distance`  | Invariant     | `direct_distance < 10` → `indecision_index = 0`                                                      | 随机 `trajectory_length`/`switch_count`，`direct_distance ∈ (0, 10)`，确认输出恒为 0                                      |
| `indecision_zero_straight_line`   | Invariant     | `ratio < 1.5` 且 `direct_distance >= 10` → `indecision_index = 0`                                    | 生成 `trajectory_length = direct_distance * u`，`u ∈ (1.0, 1.5±ε)`，验证边界行为                                          |
| `trajectory_length_associative`   | Associativity | `len(P) = len(P[0..k]) + len(P[k..])` 在边界点正确处理                                               | 随机游走点云，随机分割点计算两种方式的长度，尝试用极端坐标和重复点破坏                                                    |

### 按键流畅度 (Keystroke Fluency) PBT 属性

| 属性名                          | 类型          | 不变量定义                                                                    | 伪造策略                                                                                        |
| ------------------------------- | ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sigmoid_bounds`                | Bounds        | `sigmoid(x) ∈ (0,1)` 对任意有限 x，无 NaN                                     | 生成 `x ∈ {-1e6, -1, 0, 1, 1e6}` 及特殊浮点数，断言 `0 < s < 1` 且 `is_finite(s)`               |
| `sigmoid_monotonic`             | Monotonicity  | 固定 `scale > 0`，`sigmoid((expected - actual)/scale)` 对 `actual` 单调非递增 | 采样 `actual1 <= actual2`，验证 score 不增加                                                    |
| `fluency_bounds`                | Bounds        | `keystroke_fluency ∈ [0,1]`                                                   | Fuzz `reaction_latency_ms` 和 `hold_time`（含缺失 `up_time`），确保默认值生效，断言边界和无 NaN |
| `fluency_permutation_invariant` | Commutativity | `avg_hold_time` 计算与事件顺序无关                                            | 生成按键事件集合，随机排列顺序，确认 `avg_hold_time` 和最终 fluency 不变                        |
| `fluency_idempotent`            | Idempotency   | 相同 `MicroInteractions` 输入，`calculate_keystroke_fluency` 返回相同输出     | 克隆输入，多次调用，比较结果                                                                    |

### 蒙题否决 (Guess Veto) PBT 属性

| 属性名                         | 类型        | 不变量定义                                                          | 伪造策略                                                                           |
| ------------------------------ | ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `guess_veto_invariant`         | Invariant   | `is_guess && is_correct` → `is_mastered = false` 无论其他输入       | 生成随机 MDM/user/context 组合（含会导致强掌握的参数），断言 veto 始终生效         |
| `guess_veto_idempotent`        | Idempotency | 对相同 `(is_guess=true, is_correct=true)`，重复计算结果相同         | 随机化其他输入，调用两次，比较 `is_mastered/confidence/score`                      |
| `guess_wrong_no_extra_penalty` | Invariant   | `is_guess && !is_correct` 与普通 `!is_correct` 结果相同（用户决策） | 生成相同上下文，分别计算 `is_guess=true/false` 且 `is_correct=false`，断言结果一致 |

### 数据采集限制 PBT 属性

| 属性名                  | 类型        | 不变量定义                                            | 伪造策略                                                                       |
| ----------------------- | ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `trajectory_cap`        | Bounds      | `len(trajectoryPoints) <= 500` 在提交时               | 模拟超长会话（>500 个移动事件），断言数组不超上限                              |
| `hover_cap`             | Bounds      | `len(hoverEvents) <= 100` 在提交时                    | 模拟快速选项切换（>100 次），断言数组不超上限                                  |
| `keystroke_cap`         | Bounds      | `len(keystrokeEvents) <= 50` 在提交时                 | 模拟大量按键（>50 次），断言数组不超上限                                       |
| `getData_idempotent`    | Idempotency | 无新事件时多次调用 `getData()` 返回相同长度和计算指标 | 生成含活跃 hover 的序列，调用两次 `getData()`，确保 `finalizeHover` 不重复追加 |
| `fifo_preserves_newest` | Invariant   | 超出限制后保留的是最新的 N 条记录                     | 生成带时间戳的事件序列，验证保留的是时间戳最大的 N 条                          |

### 数据序列化 PBT 属性

| 属性名                   | 类型       | 不变量定义                                                       | 伪造策略                                                          |
| ------------------------ | ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `isGuess_roundtrip`      | Round-trip | JSON `encode→decode` 保留 `isGuess` 字段；缺失字段解码为 `false` | 生成省略/null/错误类型/错误大小写的 payload，确保解码行为符合契约 |
| `timestamp_dual_storage` | Round-trip | `epochMs` 和相对时间 `t` 同时存储，两者可独立使用                | 生成带两种时间戳的数据，分别验证两种读取路径                      |

## ADDED Requirements

### Requirement: 微行为数据采集服务 (REQ-MICRO-001)

前端 SHALL 提供 `MicroBehaviorTracker` 服务类，采集用户答题过程中的微观行为数据。

#### Scenario: 初始化并采集轨迹数据

- Given 用户进入答题页面
- When 题目选项渲染完成
- Then 调用 `microBehaviorTracker.init(containerElement)` 初始化采集
- And 采集 pointer move 事件并记录轨迹点 (x, y, t, epochMs)
- And 轨迹点数量不超过 500 条 (FIFO 策略)

### Requirement: 犹豫系数计算 (REQ-MICRO-002)

后端 SHALL 根据轨迹长度和直线距离计算犹豫系数，用于掌握度惩罚。

#### Scenario: 计算犹豫系数并应用惩罚

- Given 用户提交答案时包含微行为数据
- When 后端计算 `indecision_index = (trajectory_length / direct_distance - 1) * switch_penalty`
- Then 对 `direct_distance < 10` 或 `ratio < 1.5` 返回 None (视为无犹豫)
- And 在 `compute_adaptive_mastery` 中应用最大 30% 的惩罚

### Requirement: 按键熟练度计算 (REQ-MICRO-003)

后端 SHALL 根据反应延迟和按键保持时间计算熟练度加权。

#### Scenario: 计算按键熟练度并应用加成

- Given 用户通过键盘选择答案
- When 后端计算 `keystroke_fluency` (sigmoid 映射)
- Then 反应快 + 保持时间短 = 高熟练度
- And 在 `compute_adaptive_mastery` 中应用最大 10% 的加成

### Requirement: 蒙题标记一票否决 (REQ-MICRO-004)

系统 MUST 在用户标记 "不确定/蒙的" 且答对时，强制 `is_mastered = false`。

#### Scenario: 蒙题正确触发否决

- Given 用户勾选 "不确定/蒙的" 复选框
- When 用户选择正确答案
- Then 后端设置 `is_mastered = false` 无论得分多高
- And 该单词进入高优先级复习队列

### Requirement: 原始事件序列持久化 (REQ-MICRO-005)

后端 SHALL 将原始微行为事件序列存入 `micro_behavior_events` 表。

#### Scenario: 存储原始轨迹/悬停/按键事件

- Given 答案记录创建成功
- When 请求包含 `micro_interaction` 数据
- Then 将 trajectory_points 存为 eventType='trajectory'
- And 将 hover_events 存为 eventType='hover'
- And 将 keystroke_events 存为 eventType='keystroke'
