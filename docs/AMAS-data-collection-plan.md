# AMAS 六维用户状态建模 - 数据采集方案

**版本**: 1.0  
**日期**: 2025-11-24  
**项目**: 词汇学习应用  

---

## 目录

1. [现有数据基础](#一现有数据基础)
2. [六维数据采集详细方案](#二六维数据采集详细方案)
3. [技术实现方案](#三技术实现方案)
4. [数据存储方案](#四数据存储方案)
5. [实施优先级](#五实施优先级)

---

## 一、现有数据基础

### 1.1 已有的核心数据结构

从现有代码分析，目前已有的数据采集点：

```typescript
// AnswerRecord - 答题记录
interface AnswerRecord {
  id: string;
  wordId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;            // ✅ 正确性
  timestamp: number;             // ✅ 时间戳
  responseTime: number;          // ✅ 响应时间（毫秒）
  dwellTime: number;             // ✅ 停留时长（毫秒）
  sessionId: string;             // ✅ 会话ID
  masteryLevelBefore: number;    // ✅ 答题前掌握程度
  masteryLevelAfter: number;     // ✅ 答题后掌握程度
}

// LearningSession - 学习会话
interface LearningSession {
  id: string;
  wordIds: string[];
  currentIndex: number;
  startTime: number;             // ✅ 会话开始时间
  endTime?: number;              // ✅ 会话结束时间
}

// WordScore - 单词评分
interface WordScore {
  totalScore: number;            // ✅ 总分
  accuracyScore: number;         // ✅ 正确率得分
  speedScore: number;            // ✅ 速度得分
  totalAttempts: number;         // ✅ 总答题次数
  correctAttempts: number;       // ✅ 正确次数
  averageResponseTime: number;   // ✅ 平均响应时间
  recentAccuracy: number;        // ✅ 最近正确率
}
```

### 1.2 数据覆盖度评估

| AMAS维度 | 现有数据支持度 | 缺失数据 |
|---------|--------------|---------|
| 注意力（Attention） | 40% | 暂停、切屏、微交互、失焦 |
| 疲劳度（Fatigue） | 60% | 重复错误标记 |
| 认知能力（Cognitive） | 80% | 基本完整 |
| 学习习惯（Habit） | 50% | 时间分布、批量偏好 |
| 动机（Motivation） | 30% | 退出事件、显式反馈 |
| 长期趋势（Trend） | 70% | 历史聚合数据 |

---

## 二、六维数据采集详细方案

### 🎯 维度1：注意力监测（Attention Monitor）

**目标**：实时评估用户的专注程度（0 = 完全分心，1 = 高度专注）

#### 2.1.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **反应时间均值** | ✅ 已有 | `AnswerRecord.responseTime` | 已实现 | P0 |
| **反应时间变异系数 (CV)** | ⚠️ 需计算 | 窗口统计：`std(RT) / mean(RT)` | 实时计算 | P0 |
| **答题节奏变异系数** | ⚠️ 需计算 | 相邻答题间隔时间的CV | 实时计算 | P1 |
| **暂停次数** | ❌ 缺失 | 监听用户暂停操作 | 需新增 | P1 |
| **切屏次数** | ❌ 缺失 | `document.visibilitychange` | 需新增 | P0 |
| **速度漂移** | ⚠️ 需计算 | `(最近RT - 基线RT) / 基线RT` | 实时计算 | P1 |
| **微交互密度** | ❌ 缺失 | 鼠标/键盘事件率 | 需新增 | P2 |
| **失焦累计时长** | ❌ 缺失 | `window.blur/focus` 事件 | 需新增 | P0 |

#### 2.1.2 数据采集代码示例

```typescript
// 新增：会话级别的注意力追踪器
interface AttentionTracker {
  pauseCount: number;              // 暂停次数
  switchCount: number;             // 切屏次数
  focusLossDuration: number;       // 失焦累计时长（毫秒）
  mouseEventCount: number;         // 鼠标事件计数
  keyboardEventCount: number;      // 键盘事件计数
  lastActivityTime: number;        // 最后活动时间
}

// 在 LearningSession 中新增字段
interface LearningSession {
  // ... 现有字段
  attentionTracker?: AttentionTracker;  // 注意力追踪数据
}

// 实现示例
class AttentionMonitor {
  private tracker: AttentionTracker;
  private isDocumentHidden: boolean = false;
  private hiddenStartTime: number = 0;

  constructor() {
    this.tracker = {
      pauseCount: 0,
      switchCount: 0,
      focusLossDuration: 0,
      mouseEventCount: 0,
      keyboardEventCount: 0,
      lastActivityTime: Date.now()
    };

    this.setupListeners();
  }

  private setupListeners(): void {
    // 监听切屏
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isDocumentHidden = true;
        this.hiddenStartTime = Date.now();
        this.tracker.switchCount++;
      } else {
        if (this.isDocumentHidden) {
          this.tracker.focusLossDuration += Date.now() - this.hiddenStartTime;
          this.isDocumentHidden = false;
        }
      }
    });

    // 监听窗口失焦
    window.addEventListener('blur', () => {
      this.hiddenStartTime = Date.now();
    });

    window.addEventListener('focus', () => {
      if (this.hiddenStartTime > 0) {
        this.tracker.focusLossDuration += Date.now() - this.hiddenStartTime;
        this.hiddenStartTime = 0;
      }
    });

    // 监听微交互（采样，避免性能问题）
    let mouseThrottle = 0;
    document.addEventListener('mousemove', () => {
      const now = Date.now();
      if (now - mouseThrottle > 500) {  // 500ms采样一次
        this.tracker.mouseEventCount++;
        this.tracker.lastActivityTime = now;
        mouseThrottle = now;
      }
    });

    document.addEventListener('keydown', () => {
      this.tracker.keyboardEventCount++;
      this.tracker.lastActivityTime = Date.now();
    });
  }

  // 记录暂停事件
  recordPause(): void {
    this.tracker.pauseCount++;
  }

  // 获取当前追踪数据
  getTracker(): AttentionTracker {
    return { ...this.tracker };
  }

  // 计算微交互密度（每分钟事件数）
  getInteractionDensity(duration: number): number {
    const totalEvents = this.tracker.mouseEventCount + this.tracker.keyboardEventCount;
    return (totalEvents / duration) * 60000;  // 转换为每分钟
  }
}
```

---

### 💤 维度2：疲劳度评估（Fatigue Estimator）

**目标**：评估用户当前的疲劳程度（0 = 精力充沛，1 = 极度疲劳）

#### 2.2.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **会话时长** | ✅ 已有 | `endTime - startTime` | `LearningSession` | P0 |
| **错误率趋势** | ⚠️ 需计算 | 滑动窗口错误率变化 | 实时计算 | P0 |
| **反应时上升率** | ⚠️ 需计算 | 最近RT vs 初始RT | 实时计算 | P0 |
| **重复错误次数** | ❌ 缺失 | 同一单词多次答错 | 需新增 | P1 |
| **距上次休息时长** | ⚠️ 需计算 | 基于会话间隔 | 实时计算 | P1 |

#### 2.2.2 数据采集代码示例

```typescript
// 新增：疲劳度追踪器
interface FatigueTracker {
  sessionStartTime: number;        // 会话开始时间
  lastBreakTime: number;           // 最后休息时间
  initialErrorRate: number;        // 初始错误率（前5题）
  currentErrorRate: number;        // 当前错误率（最近10题）
  initialAvgRT: number;            // 初始平均反应时
  currentAvgRT: number;            // 当前平均反应时
  repeatErrorWords: Set<string>;   // 重复答错的单词ID
}

// 扩展 AnswerRecord
interface AnswerRecordExtended extends AnswerRecord {
  isRepeatError?: boolean;         // 是否为重复错误
  errorRateTrend?: number;         // 错误率变化趋势
  rtIncreaseTrend?: number;        // 反应时增长趋势
}

class FatigueEstimator {
  private tracker: FatigueTracker;
  private recentRecords: AnswerRecord[] = [];  // 保留最近20条记录
  private wordErrorMap: Map<string, number> = new Map();  // 单词错误次数

  constructor() {
    this.tracker = {
      sessionStartTime: Date.now(),
      lastBreakTime: Date.now(),
      initialErrorRate: 0,
      currentErrorRate: 0,
      initialAvgRT: 0,
      currentAvgRT: 0,
      repeatErrorWords: new Set()
    };
  }

  // 提交答题记录
  onAnswerSubmitted(record: AnswerRecord): void {
    this.recentRecords.push(record);
    if (this.recentRecords.length > 20) {
      this.recentRecords.shift();
    }

    // 记录单词错误次数
    if (!record.isCorrect) {
      const errorCount = (this.wordErrorMap.get(record.wordId) || 0) + 1;
      this.wordErrorMap.set(record.wordId, errorCount);
      
      if (errorCount > 1) {
        this.tracker.repeatErrorWords.add(record.wordId);
      }
    }

    // 更新初始基线（前5题）
    if (this.recentRecords.length === 5) {
      this.tracker.initialErrorRate = this.calculateErrorRate(this.recentRecords);
      this.tracker.initialAvgRT = this.calculateAvgRT(this.recentRecords);
    }

    // 更新当前指标（最近10题）
    if (this.recentRecords.length >= 10) {
      const recent10 = this.recentRecords.slice(-10);
      this.tracker.currentErrorRate = this.calculateErrorRate(recent10);
      this.tracker.currentAvgRT = this.calculateAvgRT(recent10);
    }
  }

  // 计算错误率趋势（上升 > 0，下降 < 0）
  getErrorRateTrend(): number {
    if (this.tracker.initialErrorRate === 0) return 0;
    return (this.tracker.currentErrorRate - this.tracker.initialErrorRate) / this.tracker.initialErrorRate;
  }

  // 计算反应时上升率
  getRTIncreaseTrend(): number {
    if (this.tracker.initialAvgRT === 0) return 0;
    return (this.tracker.currentAvgRT - this.tracker.initialAvgRT) / this.tracker.initialAvgRT;
  }

  // 获取重复错误次数
  getRepeatErrorCount(): number {
    return this.tracker.repeatErrorWords.size;
  }

  // 记录休息
  recordBreak(): void {
    this.tracker.lastBreakTime = Date.now();
  }

  // 获取距上次休息时长（分钟）
  getTimeSinceLastBreak(): number {
    return (Date.now() - this.tracker.lastBreakTime) / 60000;
  }

  private calculateErrorRate(records: AnswerRecord[]): number {
    if (records.length === 0) return 0;
    const errors = records.filter(r => !r.isCorrect).length;
    return errors / records.length;
  }

  private calculateAvgRT(records: AnswerRecord[]): number {
    if (records.length === 0) return 0;
    const sum = records.reduce((acc, r) => acc + (r.responseTime || 0), 0);
    return sum / records.length;
  }
}
```

---

### 🧠 维度3：认知能力评估（Cognitive Profiler）

**目标**：评估用户的记忆力、速度、稳定性

#### 2.3.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **正确率（记忆力）** | ✅ 已有 | `WordScore.recentAccuracy` | 已实现 | P0 |
| **平均反应时（速度）** | ✅ 已有 | `WordScore.averageResponseTime` | 已实现 | P0 |
| **错误率方差（稳定性）** | ❌ 缺失 | 需计算历史错误率的方差 | 需新增 | P1 |
| **历史正确率趋势** | ⚠️ 需计算 | 长期EMA | 需新增 | P1 |

#### 2.3.2 数据采集代码示例

```typescript
// 新增：认知能力画像
interface CognitiveProfile {
  mem: number;         // 记忆力 [0, 1]
  speed: number;       // 速度 [0, 1]
  stability: number;   // 稳定性 [0, 1]
  
  // 长期统计
  longTermAccuracy: number;      // 长期正确率（EMA）
  longTermSpeed: number;         // 长期速度（EMA）
  
  // 短期统计
  shortTermAccuracy: number;     // 短期正确率（最近20次）
  shortTermSpeed: number;        // 短期速度
  
  sampleCount: number;           // 样本数量
  createdAt: number;
  updatedAt: number;
}

class CognitiveProfiler {
  private profile: CognitiveProfile;
  private beta: number = 0.98;   // EMA系数
  private k0: number = 50;       // 自适应融合参数
  private recentAccuracies: number[] = [];  // 最近20次正确率

  update(record: AnswerRecord, wordScore: WordScore): CognitiveProfile {
    this.profile.sampleCount++;

    // 更新长期统计（EMA）
    const accuracy = record.isCorrect ? 1 : 0;
    this.profile.longTermAccuracy = 
      this.beta * this.profile.longTermAccuracy + (1 - this.beta) * accuracy;

    const normalizedSpeed = this.normalizeSpeed(record.responseTime || 5000);
    this.profile.longTermSpeed = 
      this.beta * this.profile.longTermSpeed + (1 - this.beta) * normalizedSpeed;

    // 更新短期统计
    this.recentAccuracies.push(accuracy);
    if (this.recentAccuracies.length > 20) {
      this.recentAccuracies.shift();
    }
    this.profile.shortTermAccuracy = 
      this.recentAccuracies.reduce((a, b) => a + b, 0) / this.recentAccuracies.length;

    // 计算稳定性（1 - 方差归一化）
    const variance = this.calculateVariance(this.recentAccuracies);
    this.profile.stability = 1 - Math.min(1, variance / 0.25);

    // 自适应融合
    const lambda = 1 - Math.exp(-this.profile.sampleCount / this.k0);
    this.profile.mem = lambda * this.profile.longTermAccuracy + 
                       (1 - lambda) * this.profile.shortTermAccuracy;
    this.profile.speed = lambda * this.profile.longTermSpeed + 
                         (1 - lambda) * normalizedSpeed;

    this.profile.updatedAt = Date.now();
    return this.profile;
  }

  private normalizeSpeed(rt: number): number {
    // 速度越快分数越高，基准5000ms
    return Math.max(0, Math.min(1, 5000 / Math.max(rt, 1000)));
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}
```

---

### 🕐 维度4：学习习惯识别（Habit Recognizer）

**目标**：识别用户的学习时间偏好、节奏偏好、批量偏好

#### 2.4.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **学习时间分布** | ❌ 缺失 | 24小时直方图统计 | 需新增 | P2 |
| **会话时长偏好** | ⚠️ 需计算 | 历史会话时长分布 | 需新增 | P2 |
| **单次学习量偏好** | ⚠️ 需计算 | 历史单词数分布 | 需新增 | P2 |
| **学习频率** | ⚠️ 需计算 | 会话间隔统计 | 需新增 | P2 |

#### 2.4.2 数据采集代码示例

```typescript
// 新增：学习习惯画像
interface HabitProfile {
  timePref: number[];          // 24小时时间偏好（活跃度）
  pacePref: number;            // 会话时长偏好（分钟，中位数）
  batchPref: number;           // 单次学习量偏好（单词数，中位数）
  frequencyPref: number;       // 学习频率（天/次）
  
  sessionLengths: number[];    // 历史会话时长（保留最近30次）
  sessionWordCounts: number[]; // 历史单词数量（保留最近30次）
  
  createdAt: number;
  updatedAt: number;
}

class HabitRecognizer {
  private profile: HabitProfile;

  constructor() {
    this.profile = {
      timePref: new Array(24).fill(0),
      pacePref: 15,  // 初始默认15分钟
      batchPref: 20, // 初始默认20个单词
      frequencyPref: 1, // 初始默认每天1次
      sessionLengths: [],
      sessionWordCounts: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  // 记录会话结束
  onSessionEnd(session: LearningSession): void {
    // 更新时间偏好
    const hour = new Date(session.startTime).getHours();
    this.profile.timePref[hour]++;

    // 记录会话时长
    if (session.endTime) {
      const duration = (session.endTime - session.startTime) / 60000;  // 分钟
      this.profile.sessionLengths.push(duration);
      if (this.profile.sessionLengths.length > 30) {
        this.profile.sessionLengths.shift();
      }
      this.profile.pacePref = this.calculateMedian(this.profile.sessionLengths);
    }

    // 记录单词数量
    this.profile.sessionWordCounts.push(session.wordIds.length);
    if (this.profile.sessionWordCounts.length > 30) {
      this.profile.sessionWordCounts.shift();
    }
    this.profile.batchPref = this.calculateMedian(this.profile.sessionWordCounts);

    this.profile.updatedAt = Date.now();
  }

  // 获取活跃时间段
  getPreferredTimeSlots(): number[] {
    const mean = this.profile.timePref.reduce((a, b) => a + b, 0) / 24;
    return this.profile.timePref
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count > mean * 1.5)
      .map(item => item.hour);
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }
}
```

---

### 😊 维度5：动机追踪（Motivation Tracker）

**目标**：追踪用户的学习动机和情绪状态（-1 = 极度受挫，1 = 高度积极）

#### 2.5.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **连续成功/失败** | ✅ 已有 | `WordLearningState.consecutiveCorrect/Wrong` | 已实现 | P0 |
| **中途退出事件** | ❌ 缺失 | 监听页面关闭/返回 | 需新增 | P1 |
| **重试次数** | ❌ 缺失 | 同一题多次作答 | 需新增 | P1 |
| **显式反馈** | ❌ 缺失 | 用户评分/反馈按钮（可选）| 需新增 | P3 |

#### 2.5.2 数据采集代码示例

```typescript
// 新增：动机追踪器
interface MotivationState {
  M: number;                   // 当前动机值 [-1, 1]
  consecutiveSuccess: number;  // 连续成功次数
  consecutiveFailure: number;  // 连续失败次数
  quitCount: number;           // 中途退出次数
  lowMotivationStreak: number; // 低动机持续次数
  
  // 历史记录
  history: {
    timestamp: number;
    value: number;
    event: 'success' | 'failure' | 'quit';
  }[];
  
  createdAt: number;
  updatedAt: number;
}

class MotivationTracker {
  private state: MotivationState;
  
  // 参数
  private rho: number = 0.85;      // 记忆系数
  private kappa: number = 0.3;     // 成功奖励
  private lambda: number = 0.4;    // 失败惩罚
  private mu: number = 0.6;        // 退出惩罚

  constructor() {
    this.state = {
      M: 0.5,  // 初始为中性
      consecutiveSuccess: 0,
      consecutiveFailure: 0,
      quitCount: 0,
      lowMotivationStreak: 0,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.setupQuitDetection();
  }

  // 答题事件
  onAnswer(isCorrect: boolean, retryCount: number = 0): number {
    const success = isCorrect ? 1 : 0;
    const failure = isCorrect ? 0 : 1;
    
    // 更新连续计数
    if (isCorrect) {
      this.state.consecutiveSuccess++;
      this.state.consecutiveFailure = 0;
    } else {
      this.state.consecutiveFailure++;
      this.state.consecutiveSuccess = 0;
    }

    // 重试次数惩罚（重试越多，挫败感越强）
    const retryPenalty = Math.min(retryCount * 0.1, 0.3);

    // 更新动机值
    this.state.M = 
      this.rho * this.state.M + 
      this.kappa * success - 
      this.lambda * failure - 
      retryPenalty;

    // 限幅
    this.state.M = Math.max(-1, Math.min(1, this.state.M));

    // 追踪低动机持续时长
    if (this.state.M < 0) {
      this.state.lowMotivationStreak++;
    } else {
      this.state.lowMotivationStreak = 0;
    }

    // 记录历史
    this.state.history.push({
      timestamp: Date.now(),
      value: this.state.M,
      event: isCorrect ? 'success' : 'failure'
    });

    if (this.state.history.length > 100) {
      this.state.history.shift();
    }

    this.state.updatedAt = Date.now();
    return this.state.M;
  }

  // 退出事件
  onQuit(): void {
    this.state.quitCount++;
    this.state.M = Math.max(-1, this.state.M - this.mu);
    
    this.state.history.push({
      timestamp: Date.now(),
      value: this.state.M,
      event: 'quit'
    });

    this.state.updatedAt = Date.now();
  }

  // 检测长期低动机
  isLongTermLowMotivation(): boolean {
    return this.state.lowMotivationStreak > 10;
  }

  // 监听退出事件
  private setupQuitDetection(): void {
    let isLearning = false;

    // 开始学习时标记
    window.addEventListener('session-start', () => {
      isLearning = true;
    });

    // 正常结束时取消标记
    window.addEventListener('session-end', () => {
      isLearning = false;
    });

    // 页面关闭时检测
    window.addEventListener('beforeunload', () => {
      if (isLearning) {
        this.onQuit();
      }
    });
  }
}
```

---

### 📈 维度6：长期趋势分析（Trend Analyzer）

**目标**：分析用户能力的长期变化趋势

#### 2.6.1 所需数据

| 数据项 | 状态 | 采集方式 | 代码位置 | 优先级 |
|-------|------|---------|---------|--------|
| **历史能力指标** | ⚠️ 需聚合 | 定期快照用户能力 | 需新增 | P2 |
| **时间序列数据** | ⚠️ 需聚合 | 按天聚合正确率、速度等 | 需新增 | P2 |
| **学习曲线** | ⚠️ 需计算 | 线性回归斜率 | 实时计算 | P2 |

#### 2.6.2 数据采集代码示例

```typescript
// 新增：趋势分析器
type TrendState = 'up' | 'flat' | 'stuck' | 'down';

interface TrendSnapshot {
  date: number;              // 日期（天级别）
  ability: number;           // 综合能力指标（0-1）
  accuracy: number;          // 正确率
  speed: number;             // 速度得分
  wordCount: number;         // 学习单词数
}

interface TrendProfile {
  state: TrendState;         // 当前趋势状态
  slope: number;             // 线性回归斜率
  variance: number;          // 波动方差
  snapshots: TrendSnapshot[]; // 历史快照（最近30天）
  
  createdAt: number;
  updatedAt: number;
}

class TrendAnalyzer {
  private profile: TrendProfile;
  private windowDays: number = 30;

  // 每日更新快照
  async updateDailySnapshot(
    userId: string,
    cognitiveProfile: CognitiveProfile
  ): Promise<void> {
    const today = this.getDayTimestamp(Date.now());
    
    // 检查今天是否已有快照
    const existingIndex = this.profile.snapshots.findIndex(s => s.date === today);
    
    const snapshot: TrendSnapshot = {
      date: today,
      ability: (cognitiveProfile.mem + cognitiveProfile.speed + cognitiveProfile.stability) / 3,
      accuracy: cognitiveProfile.mem,
      speed: cognitiveProfile.speed,
      wordCount: cognitiveProfile.sampleCount
    };

    if (existingIndex >= 0) {
      this.profile.snapshots[existingIndex] = snapshot;
    } else {
      this.profile.snapshots.push(snapshot);
    }

    // 保留最近30天
    const cutoff = today - this.windowDays * 24 * 3600 * 1000;
    this.profile.snapshots = this.profile.snapshots.filter(s => s.date > cutoff);

    // 更新趋势状态
    if (this.profile.snapshots.length >= 10) {
      this.profile.slope = this.calculateSlope();
      this.profile.variance = this.calculateVariance();
      this.profile.state = this.determineTrendState();
    }

    this.profile.updatedAt = Date.now();
  }

  private calculateSlope(): number {
    const n = this.profile.snapshots.length;
    const x = this.profile.snapshots.map((_, i) => i);
    const y = this.profile.snapshots.map(s => s.ability);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private calculateVariance(): number {
    const abilities = this.profile.snapshots.map(s => s.ability);
    const mean = abilities.reduce((a, b) => a + b, 0) / abilities.length;
    const squaredDiffs = abilities.map(a => Math.pow(a - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / abilities.length;
  }

  private determineTrendState(): TrendState {
    const slope = this.profile.slope;
    const variance = this.profile.variance;

    if (slope > 0.01) {
      return 'up';
    } else if (slope < -0.005) {
      return 'down';
    } else if (Math.abs(slope) < 0.002 && variance < 0.01) {
      return 'flat';
    } else {
      return 'stuck';
    }
  }

  private getDayTimestamp(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
}
```

---

## 三、技术实现方案

### 3.1 数据采集架构

```
用户交互事件
    ↓
┌─────────────────────────────────────┐
│  事件监听层                          │
│  - 答题事件                          │
│  - 窗口事件（blur/focus/visibility） │
│  - 鼠标/键盘事件（采样）             │
│  - 会话事件（start/end/pause）       │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│  数据处理层                          │
│  - AttentionMonitor                 │
│  - FatigueEstimator                 │
│  - CognitiveProfiler                │
│  - HabitRecognizer                  │
│  - MotivationTracker                │
│  - TrendAnalyzer                    │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│  聚合计算层                          │
│  - 实时计算特征向量                  │
│  - 滑动窗口统计                      │
│  - EMA更新                          │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│  存储层                              │
│  - LocalStorage (会话数据)          │
│  - IndexedDB (历史数据)             │
│  - Backend API (持久化)             │
└─────────────────────────────────────┘
```

### 3.2 性能优化策略

```typescript
// 1. 事件采样 - 避免高频事件影响性能
class EventSampler {
  private lastTime: number = 0;
  private interval: number;

  constructor(intervalMs: number) {
    this.interval = intervalMs;
  }

  shouldSample(): boolean {
    const now = Date.now();
    if (now - this.lastTime >= this.interval) {
      this.lastTime = now;
      return true;
    }
    return false;
  }
}

// 使用示例
const mouseSampler = new EventSampler(500);  // 500ms采样一次
document.addEventListener('mousemove', () => {
  if (mouseSampler.shouldSample()) {
    // 处理事件
  }
});

// 2. 批量更新 - 减少存储写入次数
class BatchUpdater {
  private queue: any[] = [];
  private batchSize: number = 10;
  private timer: number | null = null;

  add(data: any): void {
    this.queue.push(data);
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => this.flush(), 5000);
    }
  }

  private flush(): void {
    if (this.queue.length > 0) {
      // 批量写入
      StorageService.batchSave(this.queue);
      this.queue = [];
    }
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// 3. Web Worker - 计算密集任务离线处理
// worker.ts
self.addEventListener('message', (e) => {
  const { type, data } = e.data;
  
  if (type === 'calculate_trend') {
    const result = calculateTrendSlope(data);
    self.postMessage({ type: 'trend_result', result });
  }
});

// main.ts
const worker = new Worker('/workers/trend-worker.js');
worker.postMessage({ 
  type: 'calculate_trend', 
  data: snapshots 
});
```

---

## 四、数据存储方案

### 4.1 存储层级设计

```typescript
// 1. 会话级别（内存）- 实时计算，不持久化
interface SessionData {
  attentionTracker: AttentionTracker;
  fatigueTracker: FatigueTracker;
  motivationState: MotivationState;
  recentRecords: AnswerRecord[];  // 最近20条
}

// 2. 用户级别（LocalStorage）- 轻量持久化
interface UserAMASState {
  cognitiveProfile: CognitiveProfile;
  habitProfile: HabitProfile;
  trendProfile: TrendProfile;
  lastUpdated: number;
}

// 3. 历史级别（IndexedDB + Backend）- 长期存储
interface HistoricalData {
  dailySnapshots: TrendSnapshot[];
  sessionSummaries: SessionSummary[];
  aggregatedMetrics: AggregatedMetrics[];
}

interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  wordCount: number;
  avgAttention: number;
  avgFatigue: number;
  finalMotivation: number;
  pauseCount: number;
  switchCount: number;
}
```

### 4.2 数据Schema扩展

```typescript
// 扩展 AnswerRecord
interface AnswerRecordAMAS extends AnswerRecord {
  // 注意力相关
  attentionScore?: number;       // 答题时的注意力得分
  pauseCountBefore?: number;     // 答题前的暂停次数
  switchCountBefore?: number;    // 答题前的切屏次数
  
  // 疲劳度相关
  fatigueScore?: number;         // 答题时的疲劳度
  sessionDuration?: number;      // 会话已持续时长（分钟）
  
  // 动机相关
  motivationScore?: number;      // 答题时的动机得分
  consecutiveStreak?: number;    // 当前连续答对/错次数
  
  // 元数据
  AMASVersion?: string;          // AMAS算法版本
}

// 新增：会话摘要表
interface SessionSummaryRecord {
  id: string;
  userId: string;
  sessionId: string;
  
  // 时间信息
  startTime: number;
  endTime: number;
  duration: number;
  
  // 学习信息
  wordCount: number;
  correctCount: number;
  accuracy: number;
  
  // AMAS指标
  avgAttention: number;
  avgFatigue: number;
  finalMotivation: number;
  cognitiveSnapshot: CognitiveProfile;
  
  // 行为信息
  pauseCount: number;
  switchCount: number;
  focusLossDuration: number;
  
  createdAt: number;
}
```

---

## 五、实施优先级

### 阶段1：MVP核心数据采集（2周）

**优先级 P0 - 必须实现**

- ✅ 保持现有数据：`responseTime`, `dwellTime`, `isCorrect`, `timestamp`
- 🆕 注意力：切屏次数、失焦时长
- 🆕 疲劳度：错误率趋势、反应时趋势
- 🆕 认知能力：基于现有 `WordScore` 计算
- 🆕 动机：基于连续答对/错计算

**技术工作**：
1. 添加 `visibilitychange` 和 `blur/focus` 监听
2. 实现 `AttentionMonitor` 和 `FatigueEstimator` 基础版
3. 实现 `MotivationTracker` 基础版
4. 扩展 `AnswerRecord` schema，添加 AMAS 字段

### 阶段2：习惯和趋势数据（4周）

**优先级 P1 - 重要增强**

- 🆕 注意力：暂停次数、微交互密度
- 🆕 疲劳度：重复错误标记
- 🆕 学习习惯：时间偏好、会话时长偏好
- 🆕 长期趋势：每日快照、线性回归

**技术工作**：
1. 实现 `HabitRecognizer`
2. 实现 `TrendAnalyzer`
3. 添加 `SessionSummary` 记录
4. 实现每日快照任务

### 阶段3：完整AMAS系统（8周）

**优先级 P2 - 完善优化**

- 🆕 微交互密度详细采集
- 🆕 用户显式反馈收集
- 🆕 多维度特征交叉项
- 🆕 Contextual Bandit 集成

**技术工作**：
1. 实现 LinUCB 算法
2. 完整的特征工程管道
3. 自动化 A/B 测试
4. 数据可视化面板

---

## 六、数据隐私保护

### 6.1 本地优先策略

```typescript
class PrivacyManager {
  // 仅保存聚合统计，不上传原始行为
  async syncToBackend(userId: string): Promise<void> {
    const aggregated = {
      avgAccuracy: this.calculateAverage('accuracy'),
      avgSessionLength: this.calculateAverage('sessionLength'),
      totalWordsLearned: this.getTotal('words'),
      // 不包含具体单词、时间、详细行为
    };
    
    await ApiClient.syncAMASStats(userId, aggregated);
  }
  
  // 敏感数据加密存储
  async saveLocal(data: UserAMASState): Promise<void> {
    const encrypted = await this.encrypt(JSON.stringify(data));
    localStorage.setItem('amas_state', encrypted);
  }
}
```

### 6.2 用户知情同意

```typescript
// 用户首次使用AMAS时显示说明
interface AMASConsent {
  userId: string;
  consentGiven: boolean;
  consentDate: number;
  version: string;  // 隐私协议版本
}
```

---

## 七、总结

### 数据完整性评估

| 维度 | 核心数据可得性 | 所需新增工作 | 难度 |
|-----|--------------|------------|------|
| 注意力 | 60% | 切屏、失焦、微交互监听 | 中 |
| 疲劳度 | 70% | 重复错误标记 | 低 |
| 认知能力 | 90% | 基本完整 | 低 |
| 学习习惯 | 40% | 时间统计、会话聚合 | 中 |
| 动机 | 50% | 退出监听、重试计数 | 中 |
| 长期趋势 | 60% | 每日快照、线性回归 | 中 |

### 关键建议

1. **优先完成 P0 数据采集**：切屏、失焦、基础动机追踪
2. **复用现有数据**：充分利用 `AnswerRecord`, `WordScore`, `WordLearningState`
3. **渐进式实施**：MVP → 扩展版 → 完整版
4. **性能优先**：事件采样、批量更新、Web Worker
5. **隐私保护**：本地优先、聚合上传、加密存储

---

**附录**：完整的数据字典和API接口设计见后续文档。
