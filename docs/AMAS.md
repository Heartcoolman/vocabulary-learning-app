# AMAS 引擎

AMAS (Adaptive Multi-dimensional Awareness System) 是系统的核心学习引擎。

## 核心算法

### 决策层算法

| 算法                     | 功能         | 特点                                 |
| ------------------------ | ------------ | ------------------------------------ |
| **IGE (信息增益探索)**   | 信息论决策   | 基于信息熵的词汇选择，最大化学习收益 |
| **SWD (相似度加权决策)** | 语义相似决策 | 利用词汇语义相似度优化决策路径       |
| **FSRS**                 | 间隔重复调度 | 17 参数个性化，贝叶斯自适应          |
| **Heuristic**            | 启发式规则   | 基于专家经验的快速决策               |
| **Ensemble**             | 集成投票     | EMA 权重自适应，多算法融合           |

### 建模层算法

| 算法                   | 功能       | 输出                       |
| ---------------------- | ---------- | -------------------------- |
| **Attention Monitor**  | 注意力监测 | 实时追踪学习专注度         |
| **Fatigue Estimator**  | 疲劳估计   | 多源融合（行为+视觉+时长） |
| **Cognitive Profiler** | 认知画像   | 记忆/速度/稳定性建模       |
| **Motivation Tracker** | 动机追踪   | 情绪识别与动机波动         |
| **TrendAnalyzer**      | 趋势分析   | 学习趋势与掌握度预测       |
| **VARK Classifier**    | 学习风格   | 视觉/听觉/读写/动觉分类    |

### 记忆层算法 (UMM 通用记忆模型)

| 算法                      | 功能       | 特点                     |
| ------------------------- | ---------- | ------------------------ |
| **MDM (记忆动力学模型)**  | 记忆激活度 | 动态记忆强度衰减曲线     |
| **MSMT (多尺度记忆痕迹)** | 多尺度追踪 | 多时间尺度记忆强度建模   |
| **FSRS**                  | 间隔调度   | 稳定性/难度/可提取性计算 |
| **ELO Rating**            | 能力评分   | 量化学习能力成长         |
| **ZPD Analysis**          | 最近发展区 | 精准匹配学习难度         |

## 模块结构

```
amas/
├── types.rs        # 核心数据类型
├── config.rs       # 配置模块
├── modeling/       # 用户建模
│   └── vark/       # VARK 学习风格分类
├── decision/       # 决策算法
├── engine.rs       # 主引擎
└── persistence.rs  # 持久化

umm/                # UMM 通用记忆模型
├── mdm.rs          # 记忆动力学模型
├── msmt.rs         # 多尺度记忆痕迹
├── ige.rs          # 信息增益探索
├── swd.rs          # 相似度加权决策
└── engine.rs       # UMM 引擎
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

---

## 工作原理（用户向说明）

AMAS 像一位 24 小时在线的私人教练，实时观察每一次答题：

**选词策略**：动态平衡复习旧词（优先快要忘记/反复出错的词）和学习新词（根据状态调整比例，匹配"最近发展区"难度）。

**实时调整**：每答一题重新计算，连续出错立刻降低难度，状态好则自动加码。

**掌握度判定**：不仅看对错，还综合反应速度、连续正确、疲劳/注意力状态、是否首次正确等因素。掌握分超过动态及格线（因人因词而异）才判定为"学会"。

---

## 数据采集拓展（规划）

### 微观行为数据（无感采集）

- **犹豫系数**：鼠标/手指轨迹（悬停时长、路径偏离、犹豫切换），答对但犹豫则降低掌握分
- **按键特征**：反应潜伏期 + 按键保持时间，极短延迟表示肌肉记忆级熟练

### 主动元认知交互

- **"蒙题"标记**：用户自述不确定时，即使答对也不判定掌握，加入高优先复习队列
- **状态打卡**：Session 开始时自评精力状态（充沛/正常/疲惫），直接初始化策略参数并校准疲劳模型
