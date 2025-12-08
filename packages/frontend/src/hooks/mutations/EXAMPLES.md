# useSubmitAnswer 使用示例

本文档展示如何在实际场景中使用 `useSubmitAnswer` hook。

## 目录

- [基础集成](#基础集成)
- [在现有Hook中使用](#在现有hook中使用)
- [高级场景](#高级场景)
- [完整示例：LearningPage](#完整示例learningpage)

---

## 基础集成

### 1. 最简单的使用

```typescript
import { useSubmitAnswer } from '@/hooks/mutations';

function LearningCard({ word, sessionId }) {
  const { mutate: submitAnswer, isPending } = useSubmitAnswer();

  const handleAnswer = (isCorrect: boolean) => {
    submitAnswer({
      wordId: word.id,
      isCorrect,
      responseTime: Date.now() - startTime,
      sessionId,
    });
  };

  return (
    <div>
      <h3>{word.spelling}</h3>
      <button onClick={() => handleAnswer(true)} disabled={isPending}>
        ✅ 认识
      </button>
      <button onClick={() => handleAnswer(false)} disabled={isPending}>
        ❌ 不认识
      </button>
    </div>
  );
}
```

### 2. 带反馈的使用

```typescript
import { useSubmitAnswer } from '@/hooks/mutations';
import { toast } from 'react-hot-toast';

function LearningCard({ word, sessionId }) {
  const { mutate: submitAnswer, isPending, isError, error } = useSubmitAnswer({
    onSuccess: (result) => {
      toast.success('提交成功！');
      console.log('AMAS状态:', result.state);
    },
    onError: (error) => {
      toast.error(`提交失败: ${error.message}`);
    },
  });

  return (
    <div>
      {/* ... */}
      {isError && <div className="error">{error?.message}</div>}
    </div>
  );
}
```

---

## 在现有Hook中使用

### 重构 useMasteryLearning

#### 原始版本（不使用 useSubmitAnswer）

```typescript
// useMasteryLearning.ts (原始版本)
export function useMasteryLearning() {
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  const submitAnswer = useCallback(
    async (isCorrect: boolean, responseTime: number) => {
      const word = getCurrentWord();
      if (!word) return;

      try {
        // 乐观更新（手动实现）
        const localDecision = optimisticUpdate(word.id, isCorrect);

        // 发送请求
        const result = await processLearningEvent({
          wordId: word.id,
          isCorrect,
          responseTime,
          sessionId: currentSessionId,
        });

        // 更新状态
        setLatestAmasResult(result);
      } catch (error) {
        // 手动回滚
        rollbackOptimisticUpdate(word.id);
        console.error('提交失败:', error);
      }
    },
    [],
  );

  return { submitAnswer, latestAmasResult };
}
```

#### 改进版本（使用 useSubmitAnswer）

```typescript
// useMasteryLearning.ts (改进版本)
import { useSubmitAnswer, extractAmasState } from '@/hooks/mutations';

export function useMasteryLearning() {
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  // 使用 useSubmitAnswer，获得自动的乐观更新、错误回滚、重试
  const submitAnswerMutation = useSubmitAnswer({
    onOptimisticUpdate: (decision) => {
      // 自动乐观更新
      queueManager.updateLocalState(decision);
    },
    onAmasResult: (result) => {
      // 自动更新AMAS状态
      setLatestAmasResult(result);
    },
    onError: (error) => {
      // 自动回滚，只需要显示错误
      console.error('提交失败:', error);
    },
    enableOptimisticUpdate: true,
    retryCount: 3,
  });

  const submitAnswer = useCallback(
    async (isCorrect: boolean, responseTime: number) => {
      const word = getCurrentWord();
      if (!word) return;

      // 简化：只需调用 mutate
      submitAnswerMutation.mutate({
        wordId: word.id,
        isCorrect,
        responseTime,
        sessionId: currentSessionId,
        latestAmasState: extractAmasState(latestAmasResult),
      });
    },
    [submitAnswerMutation, latestAmasResult],
  );

  return {
    submitAnswer,
    isSubmitting: submitAnswerMutation.isPending,
    latestAmasResult,
  };
}
```

**优势：**
- ✅ 代码量减少 50%
- ✅ 自动处理乐观更新和回滚
- ✅ 内置重试机制
- ✅ 更好的类型安全
- ✅ 更容易测试

---

## 高级场景

### 1. 自定义重试逻辑

```typescript
const { mutate: submitAnswer } = useSubmitAnswer({
  retryCount: 5,
  retryDelay: (attemptIndex) => {
    // 自定义指数退避策略
    const baseDelay = 1000;
    const maxDelay = 10000;
    const delay = Math.min(baseDelay * Math.pow(2, attemptIndex), maxDelay);

    // 添加随机抖动，避免惊群效应
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  },
});
```

### 2. 条件性乐观更新

```typescript
function LearningComponent() {
  const [enableOptimistic, setEnableOptimistic] = useState(true);

  const { mutate: submitAnswer } = useSubmitAnswer({
    enableOptimisticUpdate: enableOptimistic,
    onOptimisticUpdate: (decision) => {
      // 只在网络状况良好时使用乐观更新
      if (navigator.connection?.effectiveType === '4g') {
        updateLocalUI(decision);
      }
    },
  });

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={enableOptimistic}
          onChange={(e) => setEnableOptimistic(e.target.checked)}
        />
        启用乐观更新
      </label>
    </div>
  );
}
```

### 3. 批量操作追踪

```typescript
function BatchLearningComponent() {
  const [pendingSubmissions, setPendingSubmissions] = useState<string[]>([]);

  const { mutate: submitAnswer } = useSubmitAnswer({
    onMutate: (params) => {
      // 记录开始的提交
      setPendingSubmissions((prev) => [...prev, params.wordId]);
    },
    onSuccess: (_result, params) => {
      // 移除已完成的提交
      setPendingSubmissions((prev) => prev.filter((id) => id !== params.wordId));
    },
    onError: (_error, params) => {
      // 移除失败的提交
      setPendingSubmissions((prev) => prev.filter((id) => id !== params.wordId));
    },
  });

  return (
    <div>
      <div>待提交: {pendingSubmissions.length}</div>
      {pendingSubmissions.map((id) => (
        <div key={id}>正在提交: {id}</div>
      ))}
    </div>
  );
}
```

### 4. 与Analytics集成

```typescript
import { analytics } from '@/services/analytics';

const { mutate: submitAnswer } = useSubmitAnswer({
  onSuccess: (result, params) => {
    // 追踪成功的答题
    analytics.track('answer_submitted', {
      wordId: params.wordId,
      isCorrect: params.isCorrect,
      responseTime: params.responseTime,
      fatigueLevel: result.state.fatigue,
      attentionLevel: result.state.attention,
    });
  },
  onError: (error, params) => {
    // 追踪错误
    analytics.track('answer_submission_failed', {
      wordId: params.wordId,
      error: error.message,
    });
  },
});
```

---

## 完整示例：LearningPage

下面是一个完整的学习页面示例，展示如何集成所有功能：

```typescript
import { useState, useCallback, useEffect } from 'react';
import { useSubmitAnswer, extractAmasState, shouldTakeBreak } from '@/hooks/mutations';
import { useWordQueue } from '@/hooks/mastery';

function LearningPage() {
  // 状态管理
  const [sessionId, setSessionId] = useState<string>('');
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [responseStartTime, setResponseStartTime] = useState(Date.now());

  // 队列管理
  const wordQueue = useWordQueue();
  const currentWord = wordQueue.currentWord;

  // 答题提交
  const {
    mutate: submitAnswer,
    isPending: isSubmitting,
    isError,
    error,
  } = useSubmitAnswer({
    onOptimisticUpdate: (decision) => {
      // 乐观更新：立即更新本地进度
      wordQueue.updateLocalProgress(decision);

      // 显示即时反馈
      if (decision.isMastered) {
        showConfetti();
      }
    },
    onAmasResult: (result) => {
      // 更新AMAS状态
      setLatestAmasResult(result);

      // 检查是否需要休息
      if (shouldTakeBreak(result)) {
        setShowBreakModal(true);
      }

      // 记录到分析
      trackLearningProgress(result);
    },
    onError: (error) => {
      // 显示友好的错误信息
      const message = getErrorMessage(error);
      toast.error(message);

      // 记录错误到监控系统
      Sentry.captureException(error);
    },
    enableOptimisticUpdate: true,
    retryCount: 3,
    retryDelay: 1000,
  });

  // 处理答题
  const handleAnswer = useCallback(
    (isCorrect: boolean) => {
      if (!currentWord || isSubmitting) return;

      const responseTime = Date.now() - responseStartTime;

      submitAnswer({
        wordId: currentWord.id,
        isCorrect,
        responseTime,
        sessionId,
        latestAmasState: extractAmasState(latestAmasResult),
      });
    },
    [currentWord, isSubmitting, responseStartTime, submitAnswer, sessionId, latestAmasResult],
  );

  // 自动进入下一题
  useEffect(() => {
    if (!isSubmitting && latestAmasResult) {
      const timer = setTimeout(() => {
        wordQueue.advanceToNext();
        setResponseStartTime(Date.now());
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isSubmitting, latestAmasResult, wordQueue]);

  if (!currentWord) {
    return <div>加载中...</div>;
  }

  return (
    <div className="learning-page">
      {/* 进度显示 */}
      <ProgressBar
        current={wordQueue.progress.masteredCount}
        total={wordQueue.progress.targetCount}
      />

      {/* AMAS状态指示器 */}
      {latestAmasResult && (
        <AmasIndicator
          attention={latestAmasResult.state.attention}
          fatigue={latestAmasResult.state.fatigue}
          motivation={latestAmasResult.state.motivation}
        />
      )}

      {/* 单词卡片 */}
      <WordCard word={currentWord} />

      {/* 答题按钮 */}
      <div className="answer-buttons">
        <button
          onClick={() => handleAnswer(true)}
          disabled={isSubmitting}
          className="btn-correct"
        >
          {isSubmitting ? '提交中...' : '✅ 认识'}
        </button>
        <button
          onClick={() => handleAnswer(false)}
          disabled={isSubmitting}
          className="btn-wrong"
        >
          {isSubmitting ? '提交中...' : '❌ 不认识'}
        </button>
      </div>

      {/* 错误提示 */}
      {isError && (
        <div className="error-banner">
          <p>{error?.message}</p>
          <button onClick={() => handleAnswer(true)}>重试</button>
        </div>
      )}

      {/* AMAS建议 */}
      {latestAmasResult?.suggestion && (
        <div className="amas-suggestion">
          <p>{latestAmasResult.suggestion}</p>
        </div>
      )}

      {/* 休息建议弹窗 */}
      <BreakModal
        isOpen={showBreakModal}
        onClose={() => setShowBreakModal(false)}
        reason={latestAmasResult?.explanation || '建议休息'}
      />
    </div>
  );
}

// 辅助函数
function getErrorMessage(error: Error): string {
  if (error.message.includes('network')) {
    return '网络连接失败，请检查网络后重试';
  }
  if (error.message.includes('timeout')) {
    return '请求超时，请重试';
  }
  if (error.message.includes('server')) {
    return '服��器错误，请稍后重试';
  }
  return '提交失败，请重试';
}

function showConfetti() {
  // 显示庆祝动画
  const confetti = new Confetti();
  confetti.show();
}

function trackLearningProgress(result: AmasProcessResult) {
  // 记录学习进度到分析系统
  analytics.track('learning_progress', {
    sessionId: result.sessionId,
    attention: result.state.attention,
    fatigue: result.state.fatigue,
    motivation: result.state.motivation,
  });
}

export default LearningPage;
```

---

## 组件示例

### ProgressBar 组件

```typescript
interface ProgressBarProps {
  current: number;
  total: number;
}

function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = (current / total) * 100;

  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
      <span className="progress-text">
        {current} / {total}
      </span>
    </div>
  );
}
```

### AmasIndicator 组件

```typescript
interface AmasIndicatorProps {
  attention: number;
  fatigue: number;
  motivation: number;
}

function AmasIndicator({ attention, fatigue, motivation }: AmasIndicatorProps) {
  return (
    <div className="amas-indicator">
      <div className="indicator-item">
        <span className="label">注意力</span>
        <div className="meter">
          <div className="meter-fill" style={{ width: `${attention * 100}%` }} />
        </div>
        <span className="value">{(attention * 100).toFixed(0)}%</span>
      </div>

      <div className="indicator-item">
        <span className="label">疲劳度</span>
        <div className="meter">
          <div
            className="meter-fill danger"
            style={{ width: `${fatigue * 100}%` }}
          />
        </div>
        <span className="value">{(fatigue * 100).toFixed(0)}%</span>
      </div>

      <div className="indicator-item">
        <span className="label">动机</span>
        <div className="meter">
          <div
            className="meter-fill"
            style={{ width: `${(motivation + 1) * 50}%` }}
          />
        </div>
        <span className="value">{motivation.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

### BreakModal 组件

```typescript
interface BreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
}

function BreakModal({ isOpen, onClose, reason }: BreakModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>💆 建议休息</h2>
        <p>{reason}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="btn-primary">
            好的，休息一下
          </button>
          <button onClick={onClose} className="btn-secondary">
            继续学习
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 样式示例

```css
/* LearningPage.css */
.learning-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.progress-bar {
  position: relative;
  height: 30px;
  background: #f0f0f0;
  border-radius: 15px;
  overflow: hidden;
  margin-bottom: 20px;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  color: #333;
}

.amas-indicator {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.indicator-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.meter {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  background: #2196f3;
  transition: width 0.3s ease;
}

.meter-fill.danger {
  background: #f44336;
}

.answer-buttons {
  display: flex;
  gap: 20px;
  margin-top: 30px;
}

.btn-correct,
.btn-wrong {
  flex: 1;
  padding: 15px;
  font-size: 18px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-correct {
  background: #4caf50;
  color: white;
}

.btn-correct:hover {
  background: #45a049;
}

.btn-wrong {
  background: #f44336;
  color: white;
}

.btn-wrong:hover {
  background: #da190b;
}

.btn-correct:disabled,
.btn-wrong:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  background: #ffebee;
  border: 1px solid #f44336;
  border-radius: 4px;
  padding: 10px;
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.amas-suggestion {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  padding: 15px;
  margin-top: 20px;
  border-radius: 4px;
}
```

---

## 总结

使用 `useSubmitAnswer` hook 可以：

1. **简化代码**：减少 50% 的样板代码
2. **提升体验**：乐观更新提供即时反馈
3. **增强可靠性**：自动重试和错误回滚
4. **易于测试**：分离的逻辑更容易测试
5. **类型安全**：完整的 TypeScript 支持

建议在所有涉及答题提交的场景中使用此 hook！
