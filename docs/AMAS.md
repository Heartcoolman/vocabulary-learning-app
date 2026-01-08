# AMAS 引擎

AMAS (Adaptive Multi-dimensional Awareness System) 是系统的核心学习引擎。

## 模块结构

```
amas/
├── types.rs        # 核心数据类型
├── config.rs       # 配置模块
├── modeling/       # 用户建模
├── decision/       # 决策算法
├── engine.rs       # 主引擎
└── persistence.rs  # 持久化
```

## 核心类型

### UserState (用户状态)

```rust
struct UserState {
    attention: f64,      // A: 注意力 [0, 1]
    fatigue: f64,        // F: 疲劳度 [0, 1]
    motivation: f64,     // M: 动机 [-1, 1]
    cognitive: CognitiveProfile,  // C: 认知画像
    conf: f64,           // 置信度
    ts: i64,             // 时间戳
}

struct CognitiveProfile {
    mem: f64,       // 记忆能力
    speed: f64,     // 反应速度
    stability: f64, // 稳定性
}
```

### RawEvent (原始事件)

```rust
struct RawEvent {
    word_id: Option<String>,
    is_correct: bool,
    response_time: i64,
    dwell_time: Option<i64>,
    pause_count: i32,
    switch_count: i32,
    retry_count: i32,
    focus_loss_duration: Option<i64>,
    interaction_density: Option<f64>,
    paused_time_ms: Option<i64>,
    hint_used: bool,
    timestamp: i64,
}
```

### StrategyParams (策略参数)

```rust
struct StrategyParams {
    interval_scale: f64,  // 间隔系数
    new_ratio: f64,       // 新词比例
    difficulty: Difficulty,  // 难度 (easy/medium/hard)
    batch_size: i32,      // 批次大小
    hint_level: i32,      // 提示等级
}
```

## 冷启动阶段

系统根据用户交互次数自动判断阶段：

| 阶段       | 条件       | 说明                   |
| ---------- | ---------- | ---------------------- |
| `classify` | < 5次交互  | 分类阶段：了解学习特点 |
| `explore`  | 5-7次交互  | 探索阶段：尝试不同策略 |
| `normal`   | >= 8次交互 | 正常运行：定制最优策略 |

## 主要API

### POST /api/amas/process

处理单个学习事件，返回：

- `strategy`: 调整后的学习策略
- `explanation`: 决策解释 (因素、变化、文本)
- `state`: 用户当前状态
- `word_mastery_decision`: 单词精熟度决策
- `reward`: 奖励值
- `should_break`: 是否建议休息
- `suggestion`: 建议信息

### GET /api/amas/state

获取当前用户状态 (A/F/M/C)。

### GET /api/amas/strategy

获取当前学习策略。

### GET /api/amas/trend

获取学习趋势 (up/flat/stuck/down)。

### GET /api/amas/learning-curve

获取学习曲线数据 (7-90天)。

## 干预机制

当检测到以下情况时触发干预：

- 疲劳度 > 0.7: 建议休息
- 注意力 < 0.3: 建议调整
- 动机 < -0.3: 建议简化内容
- 连续下降 > 3天: 警告并提供调整建议
