# 基于掌握度的学习模式 - 设计文档

## 1. 概述

本文档描述"掌握度驱动学习"模式的技术设计方案。核心思想是将用户目标从"学习N个单词"转变为"记住N个单词"，通过重复练习确保真正掌握。

### 1.1 设计目标

1. **提升学习效果** - 确保用户真正记住单词，而非走马观花
2. **增强AMAS准确性** - 每次学习产生足够多的数据点
3. **优化用户体验** - 明确的进度反馈，成就感驱动

### 1.2 核心变化

```
原模式:  用户选10词 → 出10题 → 结束
                     ↓
新模式:  用户选"记住10词" → 动态出题 → 直到10词都记住
```

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React)                              │
├─────────────────────────────────────────────────────────────────┤
│  LearningPage                                                    │
│  ├── useMasteryLearning() ←── 新Hook，管理掌握度学习状态         │
│  │   ├── WordQueueManager     队列管理器                         │
│  │   ├── MasteryChecker       掌握判定器                         │
│  │   └── ProgressTracker      进度追踪器                         │
│  ├── MasteryProgress          进度显示组件                       │
│  └── WordStatusBadge          单词状态徽章                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ API
┌─────────────────────────────────────────────────────────────────┐
│                        后端 (Express)                            │
├─────────────────────────────────────────────────────────────────┤
│  routes/learning.routes.ts                                       │
│  ├── GET  /study         获取学习单词（支持mastery模式）          │
│  ├── POST /progress      同步学习进度                            │
│  └── POST /complete      完成学习会话                            │
├─────────────────────────────────────────────────────────────────┤
│  services/mastery-learning.service.ts（新增）                    │
│  ├── getWordsForMasteryMode()   获取掌握模式单词                 │
│  ├── calculateMasteryStatus()   计算掌握状态                     │
│  └── syncProgress()             同步进度                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AMAS Engine（现有）                         │
│  每次答题仍然调用 processEvent()                                 │
│  由于题目数增加，AMAS获得更多数据点 → 判断更准确                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户开始学习
    │
    ▼
┌─────────────────┐
│ 初始化队列      │ ← 从后端获取 targetCount 个新词 + 需复习的词
│ pendingWords[]  │
└─────────────────┘
    │
    ▼
┌─────────────────┐     取出1个词
│ 活跃队列        │◄────────────────┐
│ activeWords{}   │                 │
└─────────────────┘                 │
    │                               │
    │ 出题                          │
    ▼                               │
┌─────────────────┐                 │
│ 用户答题        │                 │
└─────────────────┘                 │
    │                               │
    │ 判断                          │
    ▼                               │
┌─────────────────────────────────┐ │
│ 答对？                          │ │
│ ├── 是 → 检查掌握标准           │ │
│ │   ├── 达标 → 移入masteredWords│ │
│ │   └── 未达标 → 留在activeWords│─┘
│ └── 否 → 更新wrongCount         │──┘
│         → 重新加入待出题        │
└─────────────────────────────────┘
    │
    │ 检查完成条件
    ▼
┌─────────────────────────────────┐
│ masteredWords.size >= target?   │
│ ├── 是 → 学习完成，显示统计     │
│ └── 否 → 继续出题               │
└─────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 单词队列管理器 (WordQueueManager)

```typescript
// src/services/learning/WordQueueManager.ts

interface WordItem {
  wordId: string;
  spelling: string;
  meanings: string[];
  isNew: boolean;  // 是否新词
}

interface WordProgress {
  wordId: string;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  attempts: number;
  lastAttemptTime: number;
}

interface QueueConfig {
  targetMasteryCount: number;     // 目标掌握数量
  masteryThreshold: number;       // 连续正确次数阈值（默认2）
  maxActiveWords: number;         // 最大活跃队列大小（默认6）
  minRepeatInterval: number;      // 最小重复间隔（默认2题）
  maxTotalQuestions: number;      // 最大总题数（默认100）
}

class WordQueueManager {
  private pendingWords: WordItem[] = [];
  private activeWords: Map<string, WordProgress> = new Map();
  private masteredWords: Set<string> = new Set();
  private recentlyShown: string[] = [];  // 最近出过的词（用于间隔控制）
  private totalQuestions: number = 0;
  private config: QueueConfig;

  constructor(words: WordItem[], config: QueueConfig) {
    this.pendingWords = [...words];
    this.config = config;
  }

  /**
   * 获取下一个要出题的单词
   */
  getNextWord(): WordItem | null {
    // 检查是否达到目标
    if (this.masteredWords.size >= this.config.targetMasteryCount) {
      return null; // 学习完成
    }

    // 检查是否超过最大题目数
    if (this.totalQuestions >= this.config.maxTotalQuestions) {
      return null; // 强制结束
    }

    // 1. 优先从活跃队列中选择（需要继续练习的词）
    const activeCandidate = this.selectFromActiveWords();
    if (activeCandidate) {
      this.totalQuestions++;
      return this.getWordItem(activeCandidate);
    }

    // 2. 活跃队列不够，从待学习池补充
    if (this.activeWords.size < this.config.maxActiveWords && this.pendingWords.length > 0) {
      const newWord = this.pendingWords.shift()!;
      this.activeWords.set(newWord.wordId, {
        wordId: newWord.wordId,
        correctCount: 0,
        wrongCount: 0,
        consecutiveCorrect: 0,
        attempts: 0,
        lastAttemptTime: 0
      });
      this.totalQuestions++;
      this.updateRecentlyShown(newWord.wordId);
      return newWord;
    }

    // 3. 如果活跃队列还有词，强制选一个
    if (this.activeWords.size > 0) {
      const forcePick = Array.from(this.activeWords.keys())[0];
      this.totalQuestions++;
      this.updateRecentlyShown(forcePick);
      return this.getWordItem(forcePick);
    }

    return null;
  }

  /**
   * 从活跃队列选择下一个词
   * 策略：优先选错误多的，且避免最近刚出过的
   */
  private selectFromActiveWords(): string | null {
    const candidates = Array.from(this.activeWords.entries())
      .filter(([wordId]) => !this.isRecentlyShown(wordId))
      .sort((a, b) => {
        // 错误多的优先
        const wrongDiff = b[1].wrongCount - a[1].wrongCount;
        if (wrongDiff !== 0) return wrongDiff;
        // 其次选尝试次数少的
        return a[1].attempts - b[1].attempts;
      });

    if (candidates.length > 0) {
      const selected = candidates[0][0];
      this.updateRecentlyShown(selected);
      return selected;
    }

    return null;
  }

  /**
   * 记录答题结果
   */
  recordAnswer(wordId: string, isCorrect: boolean, responseTime: number): {
    mastered: boolean;
    progress: WordProgress;
  } {
    const progress = this.activeWords.get(wordId);
    if (!progress) {
      throw new Error(`Word ${wordId} not in active queue`);
    }

    progress.attempts++;
    progress.lastAttemptTime = Date.now();

    if (isCorrect) {
      progress.correctCount++;
      progress.consecutiveCorrect++;

      // 检查是否达到掌握标准
      if (this.checkMastery(progress, responseTime)) {
        this.activeWords.delete(wordId);
        this.masteredWords.add(wordId);
        return { mastered: true, progress };
      }
    } else {
      progress.wrongCount++;
      progress.consecutiveCorrect = 0; // 重置连续正确
    }

    return { mastered: false, progress };
  }

  /**
   * 检查是否达到掌握标准
   */
  private checkMastery(progress: WordProgress, responseTime: number): boolean {
    // 条件1: 连续答对N次
    if (progress.consecutiveCorrect >= this.config.masteryThreshold) {
      return true;
    }

    // 条件2: 首次秒答正确（复习词快速回忆）
    if (progress.attempts === 1 && progress.correctCount === 1 && responseTime < 3000) {
      return true;
    }

    // 条件3: 累计答对3次（容错机制，允许中间错1次）
    if (progress.correctCount >= 3 && progress.wrongCount <= 1) {
      return true;
    }

    return false;
  }

  /**
   * 获取当前进度
   */
  getProgress(): {
    masteredCount: number;
    targetCount: number;
    totalQuestions: number;
    activeCount: number;
    pendingCount: number;
  } {
    return {
      masteredCount: this.masteredWords.size,
      targetCount: this.config.targetMasteryCount,
      totalQuestions: this.totalQuestions,
      activeCount: this.activeWords.size,
      pendingCount: this.pendingWords.length
    };
  }

  // 辅助方法...
  private isRecentlyShown(wordId: string): boolean {
    return this.recentlyShown.slice(-this.config.minRepeatInterval).includes(wordId);
  }

  private updateRecentlyShown(wordId: string): void {
    this.recentlyShown.push(wordId);
    if (this.recentlyShown.length > 10) {
      this.recentlyShown.shift();
    }
  }

  private getWordItem(wordId: string): WordItem {
    // 从原始数据中获取完整单词信息
    // 实际实现需要维护一个wordId -> WordItem的映射
  }
}
```

### 3.2 掌握度学习Hook (useMasteryLearning)

```typescript
// src/hooks/useMasteryLearning.ts

interface MasteryLearningState {
  // 当前学习状态
  currentWord: WordWithOptions | null;
  isLoading: boolean;
  error: string | null;

  // 进度信息
  progress: {
    masteredCount: number;
    targetCount: number;
    totalQuestions: number;
    percentage: number;
  };

  // 当前单词在本次会话的状态
  currentWordStatus: 'new' | 'learning' | 'almost' | 'mastered';

  // 答题状态
  selectedAnswer: string | null;
  showResult: boolean;
  isCorrect: boolean | null;

  // 完成状态
  isCompleted: boolean;
  sessionStats: SessionStats | null;

  // AMAS结果
  amasResult: AMASResult | null;
}

interface MasteryLearningActions {
  initialize: (userId: string) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  nextQuestion: () => void;
  restart: () => void;
}

function useMasteryLearning(): {
  state: MasteryLearningState;
  actions: MasteryLearningActions;
} {
  const [queueManager, setQueueManager] = useState<WordQueueManager | null>(null);
  const [state, setState] = useState<MasteryLearningState>(initialState);

  const initialize = async (userId: string) => {
    setState(s => ({ ...s, isLoading: true }));

    try {
      // 1. 获取用户配置
      const config = await api.getUserStudyConfig(userId);
      
      // 2. 获取学习单词（比目标多取一些，留有余量）
      const words = await api.getStudyWords({
        count: config.dailyMasteryTarget * 2,  // 多取一些
        mode: 'mastery'
      });

      // 3. 初始化队列管理器
      const manager = new WordQueueManager(words, {
        targetMasteryCount: config.dailyMasteryTarget,
        masteryThreshold: config.masteryThreshold || 2,
        maxActiveWords: 6,
        minRepeatInterval: 2,
        maxTotalQuestions: 100
      });

      setQueueManager(manager);

      // 4. 获取第一个单词
      const firstWord = manager.getNextWord();
      if (firstWord) {
        const wordWithOptions = await generateOptions(firstWord);
        setState(s => ({
          ...s,
          isLoading: false,
          currentWord: wordWithOptions,
          currentWordStatus: 'new',
          progress: manager.getProgress()
        }));
      }
    } catch (err) {
      setState(s => ({ ...s, isLoading: false, error: err.message }));
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!queueManager || !state.currentWord) return;

    const startTime = performance.now();
    const isCorrect = answer === state.currentWord.correctAnswer;
    const responseTime = performance.now() - startTime;

    // 1. 记录到队列管理器
    const result = queueManager.recordAnswer(
      state.currentWord.wordId,
      isCorrect,
      responseTime
    );

    // 2. 上报AMAS
    const amasResult = await api.processAMASEvent({
      wordId: state.currentWord.wordId,
      isCorrect,
      responseTime,
      timestamp: Date.now()
    });

    // 3. 更新状态
    setState(s => ({
      ...s,
      selectedAnswer: answer,
      showResult: true,
      isCorrect,
      amasResult,
      progress: queueManager.getProgress(),
      currentWordStatus: result.mastered ? 'mastered' : 
        result.progress.consecutiveCorrect === 1 ? 'almost' : 'learning'
    }));

    // 4. 检查是否完成
    if (queueManager.getProgress().masteredCount >= queueManager.getProgress().targetCount) {
      await completeSession();
    }
  };

  const nextQuestion = () => {
    if (!queueManager) return;

    const nextWord = queueManager.getNextWord();
    if (nextWord) {
      // 继续学习
      setState(s => ({
        ...s,
        currentWord: nextWord,
        selectedAnswer: null,
        showResult: false,
        isCorrect: null,
        currentWordStatus: getWordStatus(nextWord.wordId)
      }));
    } else {
      // 学习完成
      completeSession();
    }
  };

  // ... 其他方法

  return { state, actions: { initialize, submitAnswer, nextQuestion, restart } };
}
```

### 3.3 进度显示组件

```tsx
// src/components/MasteryProgress.tsx

interface MasteryProgressProps {
  masteredCount: number;
  targetCount: number;
  totalQuestions: number;
}

function MasteryProgress({ masteredCount, targetCount, totalQuestions }: MasteryProgressProps) {
  const percentage = (masteredCount / targetCount) * 100;

  return (
    <div className="mastery-progress">
      {/* 主进度条 */}
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 数字统计 */}
      <div className="progress-stats">
        <div className="stat-item">
          <span className="stat-value">{masteredCount}/{targetCount}</span>
          <span className="stat-label">已记住</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{totalQuestions}</span>
          <span className="stat-label">答题数</span>
        </div>
      </div>
    </div>
  );
}
```

### 3.4 单词状态徽章

```tsx
// src/components/WordStatusBadge.tsx

type WordStatus = 'new' | 'learning' | 'almost' | 'mastered';

const STATUS_CONFIG = {
  new: { icon: '🆕', text: '新词', color: 'blue' },
  learning: { icon: '🔄', text: '再练', color: 'orange' },
  almost: { icon: '⭐', text: '加油', color: 'yellow' },
  mastered: { icon: '✅', text: '记住了', color: 'green' }
};

function WordStatusBadge({ status }: { status: WordStatus }) {
  const config = STATUS_CONFIG[status];
  
  return (
    <span className={`status-badge status-${config.color}`}>
      {config.icon} {config.text}
    </span>
  );
}
```

---

## 4. 后端接口设计

### 4.1 获取学习单词（增强）

```typescript
// GET /api/words/study

interface StudyWordsQuery {
  count?: number;           // 兼容旧模式
  masteryTarget?: number;   // 新模式：目标掌握数
  mode?: 'quantity' | 'mastery';  // 模式
}

interface StudyWordsResponse {
  words: WordItem[];
  meta: {
    mode: 'quantity' | 'mastery';
    target: number;
    masteryThreshold: number;
    maxQuestions: number;
  };
}

async function getStudyWords(query: StudyWordsQuery): Promise<StudyWordsResponse> {
  const mode = query.mode || 'mastery';
  const target = query.masteryTarget || query.count || 20;

  // 掌握模式：多获取一些单词，因为有些可能很快就记住
  const fetchCount = mode === 'mastery' ? target * 2 : target;

  const words = await wordService.getWordsForStudy(userId, fetchCount);

  return {
    words,
    meta: {
      mode,
      target,
      masteryThreshold: userConfig.masteryThreshold || 2,
      maxQuestions: 100
    }
  };
}
```

### 4.2 同步学习进度

```typescript
// POST /api/learning/progress

interface ProgressSyncRequest {
  sessionId: string;
  wordProgress: Record<string, {
    correctCount: number;
    wrongCount: number;
    mastered: boolean;
  }>;
  totalQuestions: number;
  masteredCount: number;
}

async function syncProgress(req: ProgressSyncRequest): Promise<void> {
  // 1. 更新会话统计
  await prisma.learningSession.update({
    where: { id: req.sessionId },
    data: {
      totalQuestions: req.totalQuestions,
      actualMasteryCount: req.masteredCount
    }
  });

  // 2. 批量更新单词状态（仅更新本次会话的统计，不影响SRS）
  // SRS的更新由原有的answer record流程处理
}
```

---

## 5. AMAS集成说明

### 5.1 数据量对比

| 模式 | 用户选10词 | AMAS数据点 | 判断准确度 |
|------|-----------|-----------|-----------|
| 旧模式（数量） | 10题 | 10 | 差 |
| 新模式（掌握） | 约25-40题 | 25-40 | 好 |

### 5.2 AMAS无需修改

新模式下，每次答题仍然调用 `processEvent()`，AMAS自动获得更多数据：

```typescript
// 答题时上报（保持不变）
const amasResult = await amasService.processEvent(userId, {
  wordId,
  isCorrect,
  responseTime,
  timestamp: Date.now(),
  retryCount: wordProgress.wrongCount  // 可选：传入错误次数
});
```

AMAS会因为数据点增加而：
- 更准确地判断用户状态（A/F/C/M）
- 更早进入"normal"阶段（脱离冷启动）
- 策略建议更加个性化

---

## 6. 配置与开关

### 6.1 功能开关

```typescript
// 支持渐进式上线
const FEATURE_FLAGS = {
  // 是否启用掌握度模式
  enableMasteryMode: true,
  
  // 默认模式（新用户）
  defaultLearningMode: 'mastery',  // 'mastery' | 'quantity'
  
  // 允许用户切换模式
  allowModeSwitch: true
};
```

### 6.2 用户配置

```typescript
interface UserLearningConfig {
  learningMode: 'mastery' | 'quantity';
  dailyMasteryTarget: number;  // 默认20
  masteryThreshold: number;    // 默认2（连续正确次数）
}
```

---

## 7. 降级与兜底

### 7.1 异常处理

| 场景 | 处理 |
|------|------|
| 某个词答错5次以上 | 显示完整提示，降低掌握标准为1次正确 |
| 达到最大题目数限制 | 强制结束，显示部分完成统计 |
| 网络异常 | 本地缓存进度，恢复后同步 |

### 7.2 性能保护

```typescript
const SAFEGUARDS = {
  // 单次会话最大题目数
  maxQuestionsPerSession: 100,
  
  // 单个单词最大尝试次数
  maxAttemptsPerWord: 10,
  
  // 活跃队列最大大小
  maxActiveQueueSize: 10
};
```

---

## 8. 测试策略

### 8.1 单元测试

```typescript
describe('WordQueueManager', () => {
  it('should mark word as mastered after 2 consecutive correct', () => {
    const manager = new WordQueueManager(testWords, { masteryThreshold: 2 });
    
    const word = manager.getNextWord();
    manager.recordAnswer(word.wordId, true, 2000);
    manager.recordAnswer(word.wordId, true, 2000);
    
    expect(manager.masteredWords.has(word.wordId)).toBe(true);
  });

  it('should reset consecutive count on wrong answer', () => {
    // ...
  });

  it('should complete when target reached', () => {
    // ...
  });
});
```

### 8.2 集成测试

- 完整学习流程测试
- AMAS数据上报测试
- 进度同步测试

---

## 9. 上线计划

### 9.1 灰度策略

1. **阶段1**: 内部测试（1周）
2. **阶段2**: 1%用户灰度（1周）
3. **阶段3**: 10%用户灰度（1周）
4. **阶段4**: 全量上线

### 9.2 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 完成率 | 开始学习后完成的比例 | < 60% |
| 平均题目数 | 每次学习的平均答题数 | > 80 |
| 用户满意度 | NPS分数 | < 原模式 |

---

## 10. 未来扩展

1. **个性化掌握标准** - 根据用户历史表现动态调整
2. **智能难度升级** - 同一个词第二次出现时换更难的题型
3. **遗忘曲线可视化** - 展示ACT-R预测的记忆衰减
4. **学习路径优化** - 结合AMAS状态动态调整队列策略
