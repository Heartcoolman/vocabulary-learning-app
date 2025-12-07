# API 迁移完整指南

**文档版本**: v1.0
**更新日期**: 2025-12-07
**适用阶段**: Month 1 Week 1-2完成后

---

## 📋 目录

1. [迁移概览](#迁移概览)
2. [迁移策略](#迁移策略)
3. [已迁移API列表](#已迁移api列表)
4. [待迁移API列表](#待迁移api列表)
5. [迁移步骤](#迁移步骤)
6. [使用示例](#使用示例)
7. [最佳实践](#最佳实践)
8. [故障排除](#故障排除)

---

## 迁移概览

### 当前状态 (Month 1 Week 2完成)

| 指标 | 数值 |
|------|------|
| **总API方法** | 73个 |
| **已迁移** | 34个 (47%) |
| **待迁移** | 39个 (53%) |
| **Query Hooks** | 22个 |
| **Mutation Hooks** | 5个 |

### 迁移原则

1. **CRUD查询优先** - 适合React Query缓存模型
2. **流程型接口保留** - 保持在原有hooks中
3. **向后兼容** - 不破坏现有代码
4. **渐进式迁移** - 逐步替换旧API

### 不适合迁移的API

⚠️ 以下类型的API**不应该**迁移到React Query：

1. **有状态流程**
   ```typescript
   // ❌ 不迁移
   processLearningEvent() // AMAS学习事件处理
   submitAnswer() // 提交答案（已使用乐观更新）
   ```

2. **WebSocket/SSE**
   ```typescript
   // ❌ 不迁移
   connectRealtimeUpdates() // 实时更新
   ```

3. **文件上传/下载**
   ```typescript
   // ❌ 使用专门的上传hooks
   uploadFile()
   downloadExport()
   ```

4. **需要精确时序控制的操作**
   ```typescript
   // ❌ 不迁移
   syncAnswerToServer() // 异步同步
   triggerQueueAdjustment() // 队列调整
   ```

---

## 迁移策略

### 分类迁移策略

| API类型 | 迁移策略 | 缓存时间 | 优先级 |
|---------|---------|----------|--------|
| **学习进度** | 全部迁移 | 30s-1min | 🔴 高 |
| **词汇管理** | 全部迁移 | 5-10min | 🔴 高 |
| **统计分析** | 全部迁移 | 1-5min | 🟡 中 |
| **用户管理** | 全部迁移 | 5-10min | 🟡 中 |
| **AMAS查询** | 仅查询迁移 | 30s-1min | 🟢 低 |
| **配置管理** | 全部迁移 | 1hour | 🟡 中 |
| **成就系统** | 全部迁移 | 5min | 🟢 低 |
| **音频服务** | 不迁移 | - | - |
| **文件操作** | 不迁移 | - | - |

### 缓存策略设计

```typescript
// 实时数据（频繁变化）
staleTime: 30s
refetchInterval: 1min
示例: useStudyProgress, useAmasState

// 动态数据（偶尔变化）
staleTime: 1-5min
refetchInterval: none
示例: useTodayWords, useStatistics

// 半静态数据（很少变化）
staleTime: 5-10min
refetchInterval: none
示例: useWordBooks, useBadges

// 静态数据（几乎不变）
staleTime: 1hour
refetchInterval: none
示例: useAlgorithmConfig, useStudyConfig
```

---

## 已迁移API列表

### 学习相关 (7/15 = 47%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getStudyProgress()` | `useStudyProgress()` | ✅ | 30s缓存 + 1min自动刷新 |
| `getTodayWords()` | `useTodayWords()` | ✅ | 1min缓存 |
| `getMasteryWords()` | `useMasteryWords()` | ✅ | 5min缓存 |
| `getLearnedWords()` | `useLearnedWords()` | ✅ | 5min缓存 |
| `getWords()` | `useWords()` | ✅ | 5min缓存 + 筛选 |
| `getWordDetail()` | `useWordDetail(id)` | ✅ | 10min缓存 |
| `searchWords()` | `useWordSearch(query)` | ✅ | 300ms防抖 |

### 词汇管理 (11/12 = 92%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getSystemWordBooks()` | `useSystemWordBooks()` | ✅ | 10min缓存 |
| `getUserWordBooks()` | `useUserWordBooks()` | ✅ | 10min缓存 |
| `getAllAvailableWordBooks()` | `useAllAvailableWordBooks()` | ✅ | 10min缓存 |
| `getWordBook(id)` | `useWordBook(id)` | ✅ | 10min缓存 |
| `getWordBookWords(id)` | `useWordBookWords(id)` | ✅ | 5min缓存 |
| `searchWords()` | `useSearchWords(query)` | ✅ | 300ms防抖 |
| `createWord()` | `useWordMutations().create` | ✅ | 乐观更新 |
| `updateWord()` | `useWordMutations().update` | ✅ | 乐观更新 |
| `deleteWord()` | `useWordMutations().delete` | ✅ | 乐观更新 |
| `createWordBook()` | `useWordBookMutations().create` | ✅ | 缓存失效 |
| `deleteWordBook()` | `useWordBookMutations().delete` | ✅ | 乐观删除 |

### 统计分析 (6/18 = 33%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getStatistics()` | `useStatistics()` | ✅ | 1min缓存 + 自动刷新 |
| `getWordMasteryStats()` | `useWordMasteryStats()` | ✅ | 5min缓存 |
| `getTrendAnalysis()` | `useTrendAnalysis()` | ✅ | 5min缓存 |
| `getUserStatistics()` | `useUserStatistics(userId)` | ✅ | 5min缓存 |
| `getLearningRecords()` | `useLearningRecords()` | ✅ | 5min缓存 |
| `getBatchWordMastery()` | `useBatchWordMastery()` | ✅ | 5min缓存 + 预加载 |

### 用户管理 (3/10 = 30%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getAdminUsers()` | `useAdminUsers(page, search)` | ✅ | 分页 + keepPreviousData |
| `getUserDetail(id)` | `useUserDetail(id)` | ✅ | 10min缓存 |
| `getUserStatistics(id)` | `useUserStatistics(id)` | ✅ | 5min缓存 |

### AMAS系统 (2/8 = 25%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getAmasState()` | `useAmasState()` | ✅ | 30s缓存 + 窗口聚焦刷新 |
| `getAmasExplanation()` | `useAmasExplanation()` | ✅ | 5min缓存 |

**不迁移**:
- `processLearningEvent()` - 保留在`hooks/mastery.ts`
- `submitAnswer()` - 使用`useSubmitAnswer()`（mutation）
- `triggerQueueAdjustment()` - 保留在原处

### 配置管理 (3/6 = 50%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getAlgorithmConfig()` | `useAlgorithmConfig()` | ✅ | 1hour长缓存 |
| `getStudyConfig()` | `useStudyConfig()` | ✅ | 1hour长缓存 |
| `updateConfig()` | `useConfigMutations().update` | ✅ | 缓存失效 |

### 成就系统 (2/4 = 50%)

| 旧API | 新Hook | 状态 | 特性 |
|-------|--------|------|------|
| `getBadges()` | `useBadges()` | ✅ | 5min缓存 |
| `getAchievements()` | `useAchievements()` | ✅ | 5min缓存 |

---

## 待迁移API列表

### Week 3-4 优先迁移

#### 学习相关 (8个)

```typescript
// 🔴 高优先级
getStudyWords()          → useStudyWords()
getNextWords()           → useNextWords()
createLearningSession()  → useCreateLearningSession()
getLearningHistory()     → useLearningHistory()
getStudyPlan()           → useStudyPlan()

// 🟡 中优先级
updateStudySettings()    → useUpdateStudySettings()
getUserProgress()        → useUserProgress()
getWeeklyGoals()         → useWeeklyGoals()
```

#### 统计分析 (12个)

```typescript
// 🔴 高优先级
getDailyStatistics()     → useDailyStatistics()
getWeeklyReport()        → useWeeklyReport()
getMonthlyReport()       → useMonthlyReport()
getLearningCurve()       → useLearningCurve()

// 🟡 中优先级
getAttentionTrend()      → useAttentionTrend()
getFatigueTrend()        → useFatigueTrend()
getMotivationTrend()     → useMotivationTrend()
getCognitiveTrend()      → useCognitiveTrend()
getPerformanceMetrics()  → usePerformanceMetrics()
getRetentionAnalysis()   → useRetentionAnalysis()
getWordDifficultyStats() → useWordDifficultyStats()
getHeatmapData()         → useHeatmapData()
```

#### 用户管理 (7个)

```typescript
// 🔴 高优先级
updateUser()             → useUpdateUser()
deleteUser()             → useDeleteUser()
getUserWords()           → useUserWords(userId)

// 🟡 中优先级
getUserActivity()        → useUserActivity(userId)
getUserLearningPath()    → useUserLearningPath(userId)
exportUserData()         → useExportUserData()
bulkUpdateUsers()        → useBulkUpdateUsers()
```

#### AMAS系统 (6个)

```typescript
// 🟡 中优先级（谨慎迁移）
getAmasHistory()         → useAmasHistory()
getAmasRecommendations() → useAmasRecommendations()
getDecisionPipeline()    → useDecisionPipeline()
getModelParameters()     → useModelParameters()
updateAmasConfig()       → useUpdateAmasConfig()
resetAmasState()         → useResetAmasState()
```

#### 配置管理 (3个)

```typescript
// 🟡 中优先级
getAllConfigs()          → useAllConfigs()
getConfigHistory()       → useConfigHistory()
revertConfig()           → useRevertConfig()
```

#### 成就系统 (2个)

```typescript
// 🟢 低优先级
checkAndAwardBadges()    → useCheckAndAwardBadges()
getBadgeProgress()       → useBadgeProgress()
```

#### 音频服务 (不迁移)

```typescript
// ❌ 保持现有实现
playAudio()              // 使用AudioService
preloadAudio()           // 使用AudioService
```

---

## 迁移步骤

### 步骤1: 创建Query Hook

```typescript
// packages/frontend/src/hooks/queries/useExample.ts
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { ApiClient } from '@/services/ApiClient';
import { queryKeys } from '@/lib/queryKeys';

export interface UseExampleOptions {
  // 查询参数
  id?: string;
  filter?: string;
}

export function useExample(
  options: UseExampleOptions = {},
  queryOptions?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.example.list(options),
    queryFn: async () => {
      const response = await ApiClient.getInstance().getExample(options);
      return response;
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    ...queryOptions,
  });
}
```

### 步骤2: 添加Query Key

```typescript
// packages/frontend/src/lib/queryKeys.ts
export const queryKeys = {
  // ... 现有keys
  example: {
    all: ['example'] as const,
    lists: () => [...queryKeys.example.all, 'list'] as const,
    list: (filters: object) => [...queryKeys.example.lists(), filters] as const,
    details: () => [...queryKeys.example.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.example.details(), id] as const,
  },
};
```

### 步骤3: 创建测试

```typescript
// packages/frontend/src/hooks/queries/__tests__/useExample.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExample } from '../useExample';

describe('useExample', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('fetches example data', async () => {
    const { result } = renderHook(() => useExample(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

### 步骤4: 更新组件使用

```typescript
// Before
import { useEffect, useState } from 'react';
import { ApiClient } from '@/services/ApiClient';

function MyComponent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiClient.getInstance().getExample()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  return <div>{data}</div>;
}

// After
import { useExample } from '@/hooks/queries';

function MyComponent() {
  const { data, isLoading } = useExample();

  if (isLoading) return <div>Loading...</div>;
  return <div>{data}</div>;
}
```

### 步骤5: 更新文档

- 在`REACT_QUERY_HOOKS_GUIDE.md`中添加新hook说明
- 更新`API_MIGRATION_GUIDE.md`的已迁移列表
- 更新`API_COMPARISON_TABLE.md`

---

## 使用示例

### 基础查询

```typescript
import { useWords } from '@/hooks/queries';

function WordList() {
  const { data, isLoading, error, refetch } = useWords({
    filter: 'active',
  });

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {data.words.map(word => <WordCard key={word.id} word={word} />)}
      <button onClick={() => refetch()}>刷新</button>
    </div>
  );
}
```

### 分页查询

```typescript
import { useAdminUsers } from '@/hooks/queries';

function UserManagement() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isPlaceholderData } = useAdminUsers({ page });

  return (
    <div>
      {data?.users.map(user => <UserRow key={user.id} user={user} />)}

      <Pagination
        currentPage={page}
        totalPages={data?.totalPages}
        onChange={setPage}
        disabled={isPlaceholderData} // 加载时禁用
      />
    </div>
  );
}
```

### 防抖搜索

```typescript
import { useWordSearch } from '@/hooks/queries';

function WordSearchBox() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useWordSearch({
    query,
    debounceMs: 300 // 300ms防抖
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索单词..."
      />

      {isLoading && <Spinner />}

      {data?.results.map(word => (
        <SearchResult key={word.id} word={word} />
      ))}
    </div>
  );
}
```

### Mutation with 乐观更新

```typescript
import { useSubmitAnswer } from '@/hooks/mutations';

function AnswerButton() {
  const submitAnswer = useSubmitAnswer();

  const handleAnswer = async (isCorrect: boolean) => {
    await submitAnswer.mutateAsync({
      wordId: '123',
      isCorrect,
      responseTime: 1500,
    });

    // UI已立即更新，无需等待
  };

  return (
    <button
      onClick={() => handleAnswer(true)}
      disabled={submitAnswer.isLoading}
    >
      提交答案
    </button>
  );
}
```

### 依赖查询

```typescript
import { useWordBook, useWordBookWords } from '@/hooks/queries';

function WordBookDetail({ id }: { id: string }) {
  // 第一个查询
  const { data: wordBook } = useWordBook(id);

  // 依赖第一个查询的结果
  const { data: words } = useWordBookWords(id, {
    enabled: !!wordBook, // 只有wordBook加载后才查询
  });

  return (
    <div>
      <h1>{wordBook?.name}</h1>
      {words?.map(word => <WordCard key={word.id} word={word} />)}
    </div>
  );
}
```

### 预加载数据

```typescript
import { usePrefetchWordMastery } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';

function WordList() {
  const queryClient = useQueryClient();

  const handleMouseEnter = (wordId: string) => {
    // 鼠标悬停时预加载单词详情
    queryClient.prefetchQuery({
      queryKey: queryKeys.words.detail(wordId),
      queryFn: () => ApiClient.getInstance().getWordDetail(wordId),
    });
  };

  return (
    <div>
      {words.map(word => (
        <div
          key={word.id}
          onMouseEnter={() => handleMouseEnter(word.id)}
        >
          {word.text}
        </div>
      ))}
    </div>
  );
}
```

---

## 最佳实践

### 1. 选择合适的staleTime

```typescript
// ❌ 不好：所有数据都用相同的缓存时间
useQuery({ staleTime: 5 * 60 * 1000 })

// ✅ 好：根据数据特性选择
useQuery({
  staleTime: 30 * 1000,      // 实时数据：30s
  staleTime: 5 * 60 * 1000,  // 动态数据：5min
  staleTime: 60 * 60 * 1000, // 静态数据：1hour
})
```

### 2. 使用enabled条件查询

```typescript
// ❌ 不好：总是查询
useQuery({
  queryKey: ['user', userId],
  queryFn: () => getUser(userId),
})

// ✅ 好：只有userId存在时才查询
useQuery({
  queryKey: ['user', userId],
  queryFn: () => getUser(userId!),
  enabled: !!userId, // 条件查询
})
```

### 3. 分页使用keepPreviousData

```typescript
// ❌ 不好：页面切换时闪烁
useQuery({
  queryKey: ['users', page],
  queryFn: () => getUsers(page),
})

// ✅ 好：保持前页数据，无闪烁
useQuery({
  queryKey: ['users', page],
  queryFn: () => getUsers(page),
  placeholderData: keepPreviousData,
})
```

### 4. 搜索使用防抖

```typescript
// ❌ 不好：每次输入都查询
const [query, setQuery] = useState('');
useQuery({
  queryKey: ['search', query],
  queryFn: () => search(query),
})

// ✅ 好：300ms防抖
const [query, setQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(query), 300);
  return () => clearTimeout(timer);
}, [query]);

useQuery({
  queryKey: ['search', debouncedQuery],
  queryFn: () => search(debouncedQuery),
  enabled: debouncedQuery.length >= 2,
})
```

### 5. Mutation后失效缓存

```typescript
// ❌ 不好：手动刷新
const mutation = useMutation({
  mutationFn: createWord,
  onSuccess: () => {
    // 需要手动触发refetch
  },
})

// ✅ 好：自动失效缓存
const mutation = useMutation({
  mutationFn: createWord,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['words'] });
  },
})
```

### 6. 使用乐观更新

```typescript
// ✅ 好：立即更新UI
const mutation = useMutation({
  mutationFn: deleteWord,
  onMutate: async (wordId) => {
    // 取消进行中的查询
    await queryClient.cancelQueries({ queryKey: ['words'] });

    // 保存快照
    const previousWords = queryClient.getQueryData(['words']);

    // 立即更新
    queryClient.setQueryData(['words'], (old) =>
      old.filter(w => w.id !== wordId)
    );

    return { previousWords };
  },
  onError: (err, wordId, context) => {
    // 错误时回滚
    queryClient.setQueryData(['words'], context.previousWords);
  },
})
```

---

## 故障排除

### 问题1: 数据不刷新

**症状**: 数据一直是旧的，不会更新

**原因**: staleTime太长

**解决**:
```typescript
// 减少staleTime
useQuery({
  staleTime: 30 * 1000, // 改为30秒
})

// 或手动失效缓存
queryClient.invalidateQueries({ queryKey: ['myData'] });
```

### 问题2: 请求太频繁

**症状**: 网络请求过多

**原因**: staleTime太短或没有使用防抖

**解决**:
```typescript
// 增加staleTime
useQuery({
  staleTime: 5 * 60 * 1000, // 5分钟
})

// 搜索使用防抖
const [debouncedQuery] = useDebounce(query, 300);
useQuery({
  queryKey: ['search', debouncedQuery],
})
```

### 问题3: 分页切换闪烁

**症状**: 切换页面时出现白屏

**原因**: 没有使用keepPreviousData

**解决**:
```typescript
useQuery({
  queryKey: ['users', page],
  queryFn: () => getUsers(page),
  placeholderData: keepPreviousData, // 添加这行
})
```

### 问题4: 无限循环

**症状**: 请求不断重复

**原因**: queryKey依赖对象引用变化

**解决**:
```typescript
// ❌ 不好：每次render都创建新对象
useQuery({
  queryKey: ['words', { filter: 'active' }],
})

// ✅ 好：使用稳定的key
const filter = useMemo(() => ({ filter: 'active' }), []);
useQuery({
  queryKey: ['words', filter],
})

// 或使用queryKeys工具
useQuery({
  queryKey: queryKeys.words.list({ filter: 'active' }),
})
```

### 问题5: 缓存不失效

**症状**: Mutation后数据没更新

**原因**: 忘记失效缓存

**解决**:
```typescript
const mutation = useMutation({
  mutationFn: createWord,
  onSuccess: () => {
    // 失效相关查询
    queryClient.invalidateQueries({ queryKey: ['words'] });
  },
})
```

---

## 附录

### Query Key命名规范

```typescript
// 资源 → 操作 → 参数
queryKeys.words.list(filters)      // words-list-{filters}
queryKeys.words.detail(id)         // words-detail-{id}
queryKeys.users.statistics(userId) // users-statistics-{userId}
```

### 缓存策略速查表

| 数据类型 | staleTime | gcTime | refetchInterval | 示例 |
|---------|-----------|--------|-----------------|------|
| 实时 | 30s | 2min | 1min | 学习进度 |
| 动态 | 1-5min | 10min | - | 今日单词 |
| 半静态 | 5-10min | 30min | - | 词书列表 |
| 静态 | 1hour | 2hour | - | 算法配置 |

### 相关文档

- [REACT_QUERY_SETUP.md](./REACT_QUERY_SETUP.md) - React Query配置
- [REACT_QUERY_QUICK_REFERENCE.md](./REACT_QUERY_QUICK_REFERENCE.md) - 快速参考
- [REACT_QUERY_HOOKS_GUIDE.md](./REACT_QUERY_HOOKS_GUIDE.md) - Hooks指南
- [MONTH1_COMPLETE_REPORT.md](./MONTH1_COMPLETE_REPORT.md) - Month 1报告

---

**文档维护**: 请在每次迁移新API后更新本文档
**最后更新**: 2025-12-07
**维护人**: 开发团队
