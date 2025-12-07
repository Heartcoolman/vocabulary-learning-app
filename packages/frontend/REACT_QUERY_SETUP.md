# React Query 设置文档

本文档说明 React Query 在项目中的配置和使用方法。

## 📦 安装

```bash
pnpm add @tanstack/react-query
```

## 🏗️ 项目结构

```
packages/frontend/src/
├── lib/
│   ├── queryClient.ts          # React Query 客户端配置
│   ├── queryKeys.ts            # 查询键统一管理
│   └── index.ts               # 导出文件
├── hooks/
│   └── queries/
│       ├── useWords.ts        # 单词相关 hooks
│       └── index.ts          # 导出文件
├── components/
│   └── examples/
│       └── WordListExample.tsx # 使用示例组件
└── App.tsx                    # 集成 QueryClientProvider
```

## ⚙️ 配置说明

### 1. Query Client 配置 (`lib/queryClient.ts`)

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 数据新鲜期 5 分钟
      gcTime: 10 * 60 * 1000, // 缓存保留 10 分钟
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦不自动重新请求
      refetchOnReconnect: false, // 重连不自动重新请求
      refetchOnMount: true, // 挂载时重新请求（如果过期）
    },
    mutations: {
      retry: 0, // mutation 不重试
    },
  },
});
```

**配置项说明：**

- **staleTime**: 数据被认为是"新鲜"的时间，在此期间不会重新请求
- **gcTime** (原 cacheTime): 未使用的缓存数据保留时间
- **retry**: 请求失败时的重试次数
- **refetchOnWindowFocus**: 窗口重新获得焦点时是否自动重新请求
- **refetchOnReconnect**: 网络重新连接时是否自动重新请求
- **refetchOnMount**: 组件挂载时是否重新请求（如果数据已过期）

### 2. Query Keys 管理 (`lib/queryKeys.ts`)

使用工厂函数模式组织查询键，提供类型安全和层级结构：

```typescript
export const queryKeys = {
  words: {
    all: ['words'] as const,
    lists: () => [...queryKeys.words.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.words.lists(), filters] as const,
    details: () => [...queryKeys.words.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.words.details(), id] as const,
    search: (query: string) => [...queryKeys.words.all, 'search', query] as const,
  },
  // 其他资源...
};
```

**优点：**

- ✅ 类型安全，避免拼写错误
- ✅ 层级结构清晰，便于批量失效
- ✅ 统一管理，易于维护

### 3. App.tsx 集成

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 其他 Provider 和组件 */}
    </QueryClientProvider>
  );
}
```

## 📚 使用示例

### Query Hooks (获取数据)

```typescript
// hooks/queries/useWords.ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';

export function useWords(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.words.list(filters || {}),
    queryFn: async () => {
      const response = await wordService.getWords();
      return response.data;
    },
  });
}

export function useWord(id: string) {
  return useQuery({
    queryKey: queryKeys.words.detail(id),
    queryFn: async () => {
      const response = await wordService.getWordById(id);
      return response.data;
    },
    enabled: !!id, // 只有 id 存在时才执行查询
  });
}
```

### Mutation Hooks (修改数据)

```typescript
export function useCreateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWordDto) => {
      const response = await wordService.createWord(data);
      return response.data;
    },
    onSuccess: () => {
      // 创建成功后，使单词列表查询失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
    },
  });
}

export function useUpdateWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Word> }) => {
      const response = await wordService.updateWord(id, data);
      return response.data;
    },
    onSuccess: (updatedWord) => {
      // 更新成功后，使相关查询失效
      queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.words.detail(updatedWord.id),
      });
    },
  });
}
```

### 在组件中使用

```typescript
import { useWords, useCreateWord } from '../../hooks/queries/useWords';

function WordList() {
  // 获取数据
  const { data: words, isLoading, isError, error } = useWords();

  // 修改数据
  const createWord = useCreateWord();

  const handleCreate = async () => {
    try {
      await createWord.mutateAsync({
        word: 'example',
        translation: '示例',
      });
    } catch (err) {
      console.error('创建失败', err);
    }
  };

  if (isLoading) return <div>加载中...</div>;
  if (isError) return <div>错误: {error.message}</div>;

  return (
    <div>
      <button onClick={handleCreate} disabled={createWord.isPending}>
        {createWord.isPending ? '创建中...' : '创建单词'}
      </button>
      {words?.map(word => (
        <div key={word.id}>{word.word}</div>
      ))}
    </div>
  );
}
```

## 🎯 最佳实践

### 1. Query Keys 层级设计

```typescript
// ✅ 推荐：使用层级结构
queryKeys.words.all; // ['words']
queryKeys.words.lists(); // ['words', 'list']
queryKeys.words.list(filters); // ['words', 'list', filters]
queryKeys.words.detail(id); // ['words', 'detail', id]

// 这样可以方便地批量失效：
// 失效所有单词相关查询
queryClient.invalidateQueries({ queryKey: queryKeys.words.all });

// 只失效单词列表查询
queryClient.invalidateQueries({ queryKey: queryKeys.words.lists() });
```

### 2. 条件查询

使用 `enabled` 选项控制查询执行：

```typescript
// 只有 id 存在时才查询
const { data } = useQuery({
  queryKey: ['word', id],
  queryFn: () => fetchWord(id),
  enabled: !!id,
});

// 只有搜索词不为空时才搜索
const { data } = useQuery({
  queryKey: ['search', query],
  queryFn: () => searchWords(query),
  enabled: query.length > 0,
});
```

### 3. 错误处理

```typescript
const { data, isError, error } = useWords();

if (isError) {
  // error 是 Error 类型
  return <div>错误: {error.message}</div>;
}
```

### 4. 乐观更新

```typescript
const updateWord = useMutation({
  mutationFn: updateWordApi,
  onMutate: async (newWord) => {
    // 取消相关的查询，避免覆盖乐观更新
    await queryClient.cancelQueries({ queryKey: ['words'] });

    // 保存之前的值
    const previousWords = queryClient.getQueryData(['words']);

    // 乐观更新
    queryClient.setQueryData(['words'], (old) => [...old, newWord]);

    // 返回上下文对象，用于回滚
    return { previousWords };
  },
  onError: (err, newWord, context) => {
    // 发生错误时回滚
    queryClient.setQueryData(['words'], context.previousWords);
  },
  onSettled: () => {
    // 无论成功或失败，都重新获取数据
    queryClient.invalidateQueries({ queryKey: ['words'] });
  },
});
```

### 5. 数据预取

```typescript
import { prefetchQuery } from '../../lib/queryClient';

// 在需要之前预取数据
const prefetchWords = async () => {
  await prefetchQuery(
    queryKeys.words.lists(),
    () => wordService.getWords()
  );
};

// 例如在路由跳转前预取
<Link to="/words" onMouseEnter={prefetchWords}>
  单词列表
</Link>
```

## 🔧 工具函数

```typescript
// 清除所有查询缓存
import { clearAllQueries } from '../../lib/queryClient';
clearAllQueries();

// 使指定查询失效
import { invalidateQueries } from '../../lib/queryClient';
invalidateQueries(queryKeys.words.all);

// 预取数据
import { prefetchQuery } from '../../lib/queryClient';
prefetchQuery(queryKeys.words.lists(), fetchWords);
```

## 📊 开发工具

推荐安装 React Query DevTools：

```bash
pnpm add @tanstack/react-query-devtools
```

在 App.tsx 中添加：

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 应用组件 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## 🚀 迁移指南

### 从现有代码迁移

1. **识别数据获取逻辑**：找到使用 `useEffect` + `fetch` 的组件
2. **创建 Query Hook**：将数据获取逻辑移到自定义 hook
3. **使用 Query Hook**：在组件中替换原有逻辑
4. **清理副作用**：移除不必要的 state 和 effect

**迁移前：**

```typescript
function WordList() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWords = async () => {
      try {
        setLoading(true);
        const response = await wordService.getWords();
        setWords(response.data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchWords();
  }, []);

  // ...
}
```

**迁移后：**

```typescript
function WordList() {
  const { data: words, isLoading, error } = useWords();
  // 逻辑更简洁！
}
```

## 📖 参考资源

- [React Query 官方文档](https://tanstack.com/query/latest/docs/react/overview)
- [React Query 最佳实践](https://tkdodo.eu/blog/practical-react-query)
- [查询键工厂模式](https://tkdodo.eu/blog/effective-react-query-keys)

## ✅ 验证清单

- [x] 安装 @tanstack/react-query
- [x] 创建 queryClient.ts 配置文件
- [x] 创建 queryKeys.ts 管理文件
- [x] 在 App.tsx 中集成 QueryClientProvider
- [x] 创建示例 hooks (useWords)
- [x] 创建示例组件 (WordListExample)
- [x] 项目能够正常编译

## 🎉 完成！

React Query 已成功集成到项目中，你可以开始在其他组件中使用它了。
