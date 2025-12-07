# React Query Hooks 使用指南

## 📚 目录

- [快速开始](#快速开始)
- [Query Hooks](#query-hooks)
- [Mutation Hooks](#mutation-hooks)
- [缓存策略](#缓存策略)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 快速开始

### 基本使用

```typescript
import { useWords } from '@/hooks/queries';

function WordList() {
  const { data, isLoading, error } = useWords();

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;

  return (
    <ul>
      {data.map(word => (
        <li key={word.id}>{word.spelling}</li>
      ))}
    </ul>
  );
}
```

### 带参数的查询

```typescript
import { useWordDetail } from '@/hooks/queries';

function WordDetail({ wordId }: { wordId: string }) {
  const { data: word } = useWordDetail(wordId);

  return <div>{word?.spelling}</div>;
}
```

### 使用 Mutation

```typescript
import { useWordMutations } from '@/hooks/mutations';

function AddWord() {
  const { createWord } = useWordMutations();

  const handleSubmit = async (data: CreateWordDto) => {
    try {
      await createWord.mutateAsync(data);
      alert('单词创建成功！');
    } catch (error) {
      alert('创建失败');
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

## Query Hooks

### 单词相关

#### useWords()
获取单词列表

```typescript
const { data, isLoading, error, refetch } = useWords();
// 返回: Word[]
```

#### useWordDetail(wordId)
获取单词详情

```typescript
const { data: word } = useWordDetail('word-id');
// 返回: Word | undefined
```

#### useWordSearch(params)
搜索单词

```typescript
const { data } = useWordSearch({
  query: 'hello',
  page: 1,
  pageSize: 20
});
// 返回: { words: Word[], total: number }
```

#### useTodayWords()
获取今日学习单词

```typescript
const { data: todayWords } = useTodayWords();
// 返回: Word[]
```

#### useLearnedWords()
获取已学单词

```typescript
const { data: learnedWords } = useLearnedWords();
// 返回: Word[]
```

#### useMasteryWords()
获取已掌握单词

```typescript
const { data: masteryWords } = useMasteryWords();
// 返回: Word[]
```

#### useWordMasteryStats(wordId)
获取单词掌握统计

```typescript
const { data: stats } = useWordMasteryStats('word-id');
// 返回: MasteryStats
```

### 词书相关

#### useWordBooks()
获取词书列表

```typescript
const { data: wordBooks } = useWordBooks();
// 返回: WordBook[]
```

### 学习进度相关

#### useStudyProgress(userId?)
获取学习进度

```typescript
const { data: progress } = useStudyProgress();
// 返回: StudyProgress
```

#### useStudyConfig()
获取学习配置

```typescript
const { data: config } = useStudyConfig();
// 返回: StudyConfig
```

### AMAS 系统相关

#### useAmasState()
获取 AMAS 状态

```typescript
const { data: amasState } = useAmasState();
// 返回: AmasState
```

#### useAmasExplanation(params)
获取 AMAS 决策解释

```typescript
const { data: explanation } = useAmasExplanation({
  decisionId: 'decision-id'
});
// 返回: AmasExplanation
```

#### useAlgorithmConfig()
获取算法配置

```typescript
const { data: config } = useAlgorithmConfig();
// 返回: AlgorithmConfig
```

### 统计相关

#### useStatistics()
获取统计数据

```typescript
const { data: stats } = useStatistics();
// 返回: Statistics
```

#### useUserStatistics(userId?)
获取用户统计

```typescript
const { data: userStats } = useUserStatistics();
// 返回: UserStatistics
```

#### useTrendAnalysis(params)
获取趋势分析

```typescript
const { data: trend } = useTrendAnalysis({
  period: 'week' // 'day' | 'week' | 'month'
});
// 返回: TrendData
```

### 成就系统相关

#### useAchievements()
获取成就列表

```typescript
const { data: achievements } = useAchievements();
// 返回: Achievement[]
```

#### useBadges()
获取徽章列表

```typescript
const { data: badges } = useBadges();
// 返回: Badge[]
```

### 管理员相关

#### useAdminUsers()
获取用户列表（管理员）

```typescript
const { data: users } = useAdminUsers();
// 返回: User[]
```

#### useUserDetail(userId)
获取用户详情

```typescript
const { data: user } = useUserDetail('user-id');
// 返回: User | undefined
```

---

## Mutation Hooks

### useWordMutations()
单词增删改操作

```typescript
const {
  createWord,
  updateWord,
  deleteWord,
} = useWordMutations();

// 创建单词
await createWord.mutateAsync({
  spelling: 'hello',
  phonetic: '/həˈləʊ/',
  meanings: ['你好'],
  examples: ['Hello, world!']
});

// 更新单词
await updateWord.mutateAsync({
  id: 'word-id',
  meanings: ['你好', '问候']
});

// 删除单词
await deleteWord.mutateAsync('word-id');
```

### useWordBookMutations()
词书增删改操作

```typescript
const {
  createWordBook,
  updateWordBook,
  deleteWordBook,
  addWordToBook,
  removeWordFromBook,
} = useWordBookMutations();

// 创建词书
await createWordBook.mutateAsync({
  name: '我的词书',
  description: '描述'
});

// 添加单词到词书
await addWordToBook.mutateAsync({
  wordBookId: 'book-id',
  wordId: 'word-id'
});
```

### useConfigMutations()
配置变更操作

```typescript
const {
  updateStudyConfig,
  updateAlgorithmConfig,
} = useConfigMutations();

// 更新学习配置
await updateStudyConfig.mutateAsync({
  dailyGoal: 50,
  reminderEnabled: true
});

// 更新算法配置
await updateAlgorithmConfig.mutateAsync({
  learningRate: 0.1,
  decayRate: 0.9
});
```

### useSubmitAnswer()
提交答案操作

```typescript
const submitAnswer = useSubmitAnswer();

await submitAnswer.mutateAsync({
  wordId: 'word-id',
  answer: 'hello',
  correct: true,
  timeSpent: 5000 // ms
});
```

---

## 缓存策略

### 默认配置

```typescript
// packages/frontend/src/lib/queryClient.ts
{
  queries: {
    staleTime: 5 * 60 * 1000,        // 5分钟
    gcTime: 10 * 60 * 1000,          // 10分钟
    retry: 1,                        // 重试1次
    refetchOnWindowFocus: false,     // 不自动刷新
    refetchOnReconnect: false,       // 不自动刷新
    refetchOnMount: true,            // 挂载时刷新（如果过期）
  },
  mutations: {
    retry: 0,                        // 不重试
  }
}
```

### 自定义缓存时间

```typescript
// 短期缓存（1分钟）- 实时性要求高
const { data } = useAmasState({
  staleTime: 1 * 60 * 1000
});

// 长期缓存（30分钟）- 数据变化少
const { data } = useWordBooks({
  staleTime: 30 * 60 * 1000
});

// 永不过期 - 静态数据
const { data } = useStaticData({
  staleTime: Infinity
});
```

### 手动刷新

```typescript
const { data, refetch } = useWords();

// 手动触发刷新
const handleRefresh = () => {
  refetch();
};

// 或使用 invalidateQueries
import { queryClient } from '@/lib/queryClient';

queryClient.invalidateQueries(['words']);
```

### 乐观更新

```typescript
const { updateWord } = useWordMutations();

updateWord.mutate(
  { id: 'word-id', spelling: 'new-spelling' },
  {
    onMutate: async (newWord) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries(['word', newWord.id]);

      // 保存旧数据
      const previousWord = queryClient.getQueryData(['word', newWord.id]);

      // 乐观更新
      queryClient.setQueryData(['word', newWord.id], newWord);

      return { previousWord };
    },
    onError: (err, newWord, context) => {
      // 回滚
      queryClient.setQueryData(
        ['word', newWord.id],
        context?.previousWord
      );
    },
    onSettled: (newWord) => {
      // 刷新数据
      queryClient.invalidateQueries(['word', newWord?.id]);
    },
  }
);
```

---

## 最佳实践

### 1. 使用 Enabled 选项

```typescript
// 只在 userId 存在时查询
const { data } = useUserDetail(userId, {
  enabled: !!userId
});
```

### 2. 依赖查询

```typescript
function WordBookDetail({ bookId }: { bookId: string }) {
  // 先获取词书
  const { data: book } = useWordBookDetail(bookId);

  // 再获取词书中的单词（依赖 book.id）
  const { data: words } = useWords({
    wordBookId: book?.id,
    enabled: !!book?.id
  });

  return <div>...</div>;
}
```

### 3. 分页查询

```typescript
function WordList() {
  const [page, setPage] = useState(1);

  const { data, isPreviousData } = useWords(
    { page, pageSize: 20 },
    { keepPreviousData: true } // 保持旧数据直到新数据加载
  );

  return (
    <>
      <ul>{data?.words.map(...)}</ul>
      <Pagination
        page={page}
        onPageChange={setPage}
        disabled={isPreviousData}
      />
    </>
  );
}
```

### 4. 无限滚动

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function InfiniteWordList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['words', 'infinite'],
    queryFn: ({ pageParam = 1 }) =>
      fetchWords({ page: pageParam }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  });

  return (
    <>
      {data?.pages.map((page) =>
        page.words.map((word) => <div key={word.id}>{word.spelling}</div>)
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? '加载中...' : '加载更多'}
        </button>
      )}
    </>
  );
}
```

### 5. 错误处理

```typescript
function WordList() {
  const { data, error, isError, refetch } = useWords();

  if (isError) {
    return (
      <div>
        <p>加载失败: {error.message}</p>
        <button onClick={() => refetch()}>重试</button>
      </div>
    );
  }

  return <ul>...</ul>;
}
```

### 6. 加载状态

```typescript
function WordList() {
  const { data, isLoading, isFetching } = useWords();

  return (
    <div>
      {isFetching && <LoadingSpinner />}
      <ul className={isFetching ? 'opacity-50' : ''}>
        {data?.map(...)}
      </ul>
    </div>
  );
}
```

### 7. 全局错误处理

```typescript
// App.tsx
import { QueryCache, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 全局错误处理
      if (error.status === 401) {
        // 重定向到登录页
        window.location.href = '/login';
      }
    },
  }),
});
```

---

## 常见问题

### Q: 如何禁用缓存？

```typescript
const { data } = useWords({
  staleTime: 0,  // 立即过期
  gcTime: 0,     // 不缓存
});
```

### Q: 如何在 Mutation 后刷新查询？

```typescript
const { updateWord } = useWordMutations();

updateWord.mutate(data, {
  onSuccess: () => {
    // 方式1: 刷新特定查询
    queryClient.invalidateQueries(['words']);

    // 方式2: 刷新多个查询
    queryClient.invalidateQueries(['words']);
    queryClient.invalidateQueries(['word', data.id]);
  },
});
```

### Q: 如何取消查询？

```typescript
import { queryClient } from '@/lib/queryClient';

// 取消特定查询
queryClient.cancelQueries(['words']);

// 取消所有查询
queryClient.cancelQueries();
```

### Q: 如何预取数据？

```typescript
import { prefetchQuery } from '@/lib/queryClient';

// 预取下一页数据
const prefetchNextPage = async () => {
  await prefetchQuery(
    ['words', { page: currentPage + 1 }],
    () => fetchWords({ page: currentPage + 1 })
  );
};
```

### Q: 如何在组件外使用查询数据？

```typescript
import { queryClient } from '@/lib/queryClient';

// 读取缓存数据
const words = queryClient.getQueryData(['words']);

// 设置缓存数据
queryClient.setQueryData(['words'], newWords);
```

### Q: 如何处理并发请求？

React Query 自动处理并发请求，总是使用最后一个响应的数据。

```typescript
// 用户快速输入时，只使用最后一次请求的结果
const { data } = useWordSearch({ query: searchInput });
```

### Q: 如何实现轮询？

```typescript
const { data } = useAmasState({
  refetchInterval: 5000, // 每5秒刷新一次
  refetchIntervalInBackground: false, // 后台不刷新
});
```

---

## 调试工具

### React Query DevTools

```typescript
// App.tsx (开发环境)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 你的应用 */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
```

功能:
- 📊 查看所有查询状态
- 🔍 检查缓存数据
- ⏱️ 查看查询时间线
- 🔄 手动触发刷新
- 🗑️ 清除缓存

---

## 参考资源

- [React Query 官方文档](https://tanstack.com/query/latest)
- [REFACTOR_PLAN_2025.md](./REFACTOR_PLAN_2025.md) - 重构计划
- [WEEK2_EXECUTION_REPORT.md](./WEEK2_EXECUTION_REPORT.md) - Week 2 报告

---

**最后更新**: 2025-12-07
**维护者**: Danci Team
