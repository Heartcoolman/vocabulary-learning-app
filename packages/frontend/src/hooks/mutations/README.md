# Mutation Hooks

提供基于 React Query 的 mutation hooks，用于处理数据变更操作。

## 目录

- [useSubmitAnswer](#usesubmitanswer) - 答题提交 mutation
- [特性](#特性)
- [使用示例](#使用示例)

---

## useSubmitAnswer

答题提交的 Mutation Hook，提供乐观更新、错误回滚和自动重试功能。

### 特性

✅ **乐观更新**：立即更新本地状态，提供即时反馈
✅ **错误回滚**：请求失败时自动回滚到之前的状态
✅ **自动重试**：网络错误时自动重试，支持指数退避
✅ **AMAS集成**：自动处理AMAS事件并更新学习状态
✅ **类型安全**：完整的 TypeScript 类型定义

### API

```typescript
interface UseSubmitAnswerOptions {
  /** 乐观更新回调 */
  onOptimisticUpdate?: (decision: LocalWordDecision) => void;
  /** AMAS结果更新回调 */
  onAmasResult?: (result: AmasProcessResult) => void;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
  /** 成功处理回调 */
  onSuccess?: (result: AmasProcessResult) => void;
  /** 是否启用乐观更新（默认：true） */
  enableOptimisticUpdate?: boolean;
  /** 重试次数（默认：3） */
  retryCount?: number;
  /** 重试延迟（毫秒，默认：1000） */
  retryDelay?: number;
}

interface SubmitAnswerParams {
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  sessionId: string;
  pausedTimeMs?: number;
  latestAmasState?: {
    fatigue: number;
    attention: number;
    motivation: number;
  };
}
```

### 基础使用

```typescript
import { useSubmitAnswer } from '@/hooks/mutations';

function LearningComponent() {
  const { mutate: submitAnswer, isPending, isError } = useSubmitAnswer({
    onSuccess: (result) => {
      console.log('答题成功', result);
    },
    onError: (error) => {
      console.error('答题失败', error);
    },
  });

  const handleAnswer = (isCorrect: boolean) => {
    submitAnswer({
      wordId: 'word-123',
      isCorrect,
      responseTime: 2500,
      sessionId: 'session-456',
    });
  };

  return (
    <div>
      <button onClick={() => handleAnswer(true)} disabled={isPending}>
        正确
      </button>
      <button onClick={() => handleAnswer(false)} disabled={isPending}>
        错误
      </button>
      {isError && <div>提交失败，请重试</div>}
    </div>
  );
}
```

### 乐观更新

```typescript
import { useSubmitAnswer } from '@/hooks/mutations';

function LearningComponent() {
  const [localProgress, setLocalProgress] = useState(0);

  const { mutate: submitAnswer } = useSubmitAnswer({
    // 乐观更新：立即更新本地UI
    onOptimisticUpdate: (decision) => {
      setLocalProgress((prev) => prev + (decision.isMastered ? 1 : 0));
    },
    // 服务器确认后更新
    onAmasResult: (result) => {
      if (result.wordMasteryDecision?.isMastered) {
        // 服务器确认已掌握
        console.log('单词已掌握');
      }
    },
    // 错误时自动回滚
    onError: (error) => {
      console.error('提交失败，已回滚', error);
    },
  });

  return <div>已掌握: {localProgress}</div>;
}
```

### 集成到现有Hook

在 `useMasteryLearning` 或其他学习 hooks 中集成：

```typescript
import { useSubmitAnswer, extractAmasState } from '@/hooks/mutations';

export function useMasteryLearning() {
  const [latestAmasResult, setLatestAmasResult] = useState<AmasProcessResult | null>(null);

  const submitAnswerMutation = useSubmitAnswer({
    onOptimisticUpdate: (decision) => {
      // 更新本地队列
      queueManager.updateLocalState(decision);
    },
    onAmasResult: (result) => {
      // 更新AMAS状态
      setLatestAmasResult(result);
    },
    enableOptimisticUpdate: true,
    retryCount: 3,
  });

  const submitAnswer = useCallback(
    async (isCorrect: boolean, responseTime: number) => {
      const word = getCurrentWord();
      if (!word) return;

      // 提交答题
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

### 错误处理

```typescript
const { mutate: submitAnswer, error, reset } = useSubmitAnswer({
  onError: (error) => {
    // 自定义错误处理
    if (error.message.includes('network')) {
      showToast('网络连接失败，请检查网络');
    } else if (error.message.includes('timeout')) {
      showToast('请求超时，请重试');
    } else {
      showToast('提交失败');
    }
  },
  retryCount: 3, // 自动重试3次
  retryDelay: 1000, // 重试延迟1秒
});

// 手动重置错误状态
const handleRetry = () => {
  reset();
  submitAnswer(params);
};
```

### 辅助函数

#### extractAmasState

从完整的 AMAS 结果中提取核心状态：

```typescript
import { extractAmasState } from '@/hooks/mutations';

const amasResult: AmasProcessResult = {
  /* ... */
};
const state = extractAmasState(amasResult);
// => { fatigue: 0.3, attention: 0.8, motivation: 0.7 }
```

#### shouldTakeBreak

判断是否应该建议用户休息：

```typescript
import { shouldTakeBreak } from '@/hooks/mutations';

const amasResult: AmasProcessResult = {
  /* ... */
};

if (shouldTakeBreak(amasResult)) {
  showBreakSuggestion();
}
```

---

## 测试

完整的测试覆盖：

```bash
# 运行测试
pnpm test src/hooks/mutations/__tests__/useSubmitAnswer.test.ts

# 测试覆盖
pnpm test:coverage
```

测试场景包括：

- ✅ 正常提交答题
- ✅ 乐观更新
- ✅ 错误回滚
- ✅ 自动重试
- ✅ AMAS结果更新
- ✅ 辅助函数

---

## 最佳实践

### 1. 使用乐观更新提升体验

```typescript
// ✅ 推荐：启用乐观更新
const { mutate } = useSubmitAnswer({
  enableOptimisticUpdate: true,
  onOptimisticUpdate: updateLocalUI,
});

// ❌ 不推荐：禁用乐观更新会导致UI延迟
const { mutate } = useSubmitAnswer({
  enableOptimisticUpdate: false,
});
```

### 2. 合理配置重试策略

```typescript
// ✅ 推荐：根据场景配置重试
const { mutate } = useSubmitAnswer({
  retryCount: 3, // 网络不稳定时适当增加
  retryDelay: 1000, // 指数退避：1s, 2s, 4s
});

// ❌ 不推荐：过多重试可能导致性能问题
const { mutate } = useSubmitAnswer({
  retryCount: 10, // 太多了
});
```

### 3. 提供友好的错误反馈

```typescript
// ✅ 推荐：提供清晰的错误信息
const { mutate, isError, error } = useSubmitAnswer({
  onError: (error) => {
    const message = getErrorMessage(error);
    showToast(message, { type: 'error' });
  },
});

// ❌ 不推荐：忽略错误
const { mutate } = useSubmitAnswer(); // 没有错误处理
```

### 4. 使用 isPending 状态

```typescript
// ✅ 推荐：禁用按钮防止重复提交
const { mutate, isPending } = useSubmitAnswer();

<button disabled={isPending} onClick={handleSubmit}>
  {isPending ? '提交中...' : '提交'}
</button>;

// ❌ 不推荐：可能导致重复提交
<button onClick={handleSubmit}>提交</button>;
```

---

## 常见问题

### Q: 乐观更新失败后如何回滚？

A: Hook 会自动回滚到之前的状态，你只需要在 `onError` 中更新UI即可：

```typescript
const { mutate } = useSubmitAnswer({
  onError: () => {
    // 自动回滚，只需要显示错误提示
    showToast('提交失败，已回滚');
  },
});
```

### Q: 如何自定义重试逻辑？

A: 通过 `retryCount` 和 `retryDelay` 配置：

```typescript
const { mutate } = useSubmitAnswer({
  retryCount: 5,
  retryDelay: (attemptIndex) => {
    // 自定义退避策略
    return Math.min(1000 * Math.pow(2, attemptIndex), 10000);
  },
});
```

### Q: 如何在多个组件间共享AMAS状态？

A: 使用 React Context 或全局状态管理：

```typescript
// 在上层组件中
const [amasResult, setAmasResult] = useState<AmasProcessResult | null>(null);

const { mutate } = useSubmitAnswer({
  onAmasResult: setAmasResult,
});

// 通过 Context 共享给子组件
<AmasContext.Provider value={amasResult}>{children}</AmasContext.Provider>;
```

---

## 更新日志

### v1.0.0 (2024-12-07)

- ✨ 初始版本
- ✅ 乐观更新支持
- ✅ 错误回滚机制
- ✅ 自动重试策略
- ✅ AMAS事件集成
- ✅ 完整测试覆盖

---

## 相关资源

- [React Query 文档](https://tanstack.com/query/latest)
- [AMAS 算法说明](../../docs/amas.md)
- [学习系统架构](../../docs/learning-system.md)
