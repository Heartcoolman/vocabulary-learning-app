# React Query 快速参考

## 🎯 核心概念

### Query - 获取数据

```typescript
const { data, isLoading, isError, error } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
});
```

### Mutation - 修改数据

```typescript
const mutation = useMutation({
  mutationFn: createTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

## 📝 常用代码片段

### 1. 基础 Query Hook

```typescript
export function useWords() {
  return useQuery({
    queryKey: queryKeys.words.lists(),
    queryFn: async () => {
      const response = await wordService.getWords();
      return response.data;
    },
  });
}
```

### 2. 带参数的 Query Hook

```typescript
export function useWord(id: string) {
  return useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async () => {
      const response = await wordService.getWordById(id);
      return response.data;
    },
    enabled: !!id, // 条件查询
  });
}
```

### 3. 创建 Mutation Hook

```typescript
export function useCreateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWordDto) => {
      const response = await wordService.createWord(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}
```

### 4. 更新 Mutation Hook

```typescript
export function useUpdateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Word> }) => {
      const response = await wordService.updateWord(id, data);
      return response.data;
    },
    onSuccess: (updatedWord) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.words.detail(updatedWord.id),
      });
    },
  });
}
```

### 5. 在组件中使用

```typescript
function MyComponent() {
  // Query
  const { data, isLoading, isError } = useWords();

  // Mutation
  const createWord = useCreateWord();

  const handleCreate = async () => {
    try {
      await createWord.mutateAsync({ word: 'test', translation: '测试' });
    } catch (error) {
      console.error('Failed', error);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error!</div>;

  return (
    <div>
      <button
        onClick={handleCreate}
        disabled={createWord.isPending}
      >
        {createWord.isPending ? 'Creating...' : 'Create'}
      </button>
      {data?.map(item => <div key={item.id}>{item.word}</div>)}
    </div>
  );
}
```

## 🔑 Query Keys 模式

```typescript
export const queryKeys = {
  words: {
    all: ['words'] as const,
    lists: () => [...queryKeys.words.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.words.lists(), filters] as const,
    details: () => [...queryKeys.words.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.words.details(), id] as const,
  },
};

// 使用示例
queryKeys.words.all; // ['words']
queryKeys.words.lists(); // ['words', 'list']
queryKeys.words.list({ page: 1 }); // ['words', 'list', { page: 1 }]
queryKeys.words.detail('123'); // ['words', 'detail', '123']
```

## 🛠️ 常用操作

### 使查询失效（触发重新获取）

```typescript
// 失效所有单词查询
queryClient.invalidateQueries({ queryKey: queryKeys.words.all });

// 只失效列表查询
queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });

// 失效特定单词
queryClient.invalidateQueries({ queryKey: queryKeys.words.detail('123') });
```

### 手动设置查询数据

```typescript
queryClient.setQueryData(queryKeys.words.detail('123'), newWordData);
```

### 获取查询数据

```typescript
const words = queryClient.getQueryData(queryKeys.words.lists());
```

### 预取数据

```typescript
await queryClient.prefetchQuery({
  queryKey: queryKeys.words.lists(),
  queryFn: fetchWords,
});
```

### 清除所有缓存

```typescript
queryClient.clear();
```

## 📊 状态字段

### Query 状态

- `data` - 查询数据
- `error` - 错误对象
- `isLoading` - 首次加载中
- `isFetching` - 正在获取数据（包括后台刷新）
- `isError` - 是否有错误
- `isSuccess` - 是否成功
- `status` - 'pending' | 'error' | 'success'

### Mutation 状态

- `data` - mutation 返回的数据
- `error` - 错误对象
- `isPending` - 是否正在执行
- `isError` - 是否有错误
- `isSuccess` - 是否成功
- `mutate` - 执行 mutation（fire and forget）
- `mutateAsync` - 执行 mutation（返回 Promise）

## ⚙️ 常用配置

### Query 配置

```typescript
useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  staleTime: 5 * 60 * 1000, // 5 分钟内数据不会过期
  gcTime: 10 * 60 * 1000, // 缓存保留 10 分钟
  retry: 1, // 失败重试 1 次
  enabled: true, // 是否启用查询
  refetchOnWindowFocus: false, // 窗口聚焦时不重新获取
  refetchOnMount: true, // 挂载时重新获取（如果过期）
  refetchInterval: 0, // 轮询间隔（0 = 不轮询）
});
```

### Mutation 配置

```typescript
useMutation({
  mutationFn: createTodo,
  retry: 0, // 不重试
  onMutate: async (variables) => {
    // 乐观更新前
    return { previousData };
  },
  onError: (err, variables, context) => {
    // 错误处理，可以回滚乐观更新
  },
  onSuccess: (data, variables, context) => {
    // 成功后的操作
  },
  onSettled: (data, error, variables, context) => {
    // 无论成功或失败都会执行
  },
});
```

## 💡 提示

1. **Query Keys 要唯一**：不同的��询使用不同的 key
2. **使用工厂函数**：通过 queryKeys 对象管理所有 key
3. **合理设置 staleTime**：避免不必要的请求
4. **mutation 后使查询失效**：保持数据同步
5. **使用 enabled**：控制查询执行时机
6. **优先使用 isLoading**：而不是 isFetching（除非需要显示后台刷新）

## 🚫 常见错误

❌ **不要这样**：

```typescript
// 硬编码 query keys
useQuery({ queryKey: ['words'], ... });
useQuery({ queryKey: ['words', 'list'], ... });

// 不同地方可能拼写不一致
queryClient.invalidateQueries({ queryKey: ['word'] }); // 少了 s
```

✅ **应该这样**：

```typescript
// 使用统一的 queryKeys
useQuery({ queryKey: queryKeys.words.lists(), ... });
queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
```

## 📚 更多资源

- 项目文档：`REACT_QUERY_SETUP.md`
- 官方文档：https://tanstack.com/query/latest
- 最佳实践：https://tkdodo.eu/blog/practical-react-query
