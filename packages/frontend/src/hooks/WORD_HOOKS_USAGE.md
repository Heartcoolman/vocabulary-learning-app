# 单词相关 Hooks 使用指南

本文档介绍如何使用新创建的单词相关 React Query Hooks。

## 目录

- [Hooks 概览](#hooks-概览)
- [Query Hooks](#query-hooks)
  - [useWordSearch - 单词搜索（带防抖）](#usewordsearch---单词搜索带防抖)
  - [useWordDetail - 单词详情](#useworddetail---单词详情)
- [Mutation Hooks](#mutation-hooks)
  - [useCreateWord - 创建单词](#usecreateword---创建单词)
  - [useUpdateWord - 更新单词](#useupdateword---更新单词)
  - [useDeleteWord - 删除单词](#usedeleteword---删除单词)
  - [useBatchCreateWords - 批量创建](#usebatchcreatewords---批量创建)
  - [useWordMutations - 组合 Hook](#usewordmutations---组合-hook)

## Hooks 概览

### 文件结构

```
hooks/
├── queries/
│   ├── useWordSearch.ts      # 搜索单词（带防抖）
│   ├── useWordDetail.ts      # 获取单词详情
│   └── index.ts              # 导出
├── mutations/
│   ├── useWordMutations.ts   # CRUD 操作
│   └── index.ts              # 导出
└── WORD_HOOKS_USAGE.md       # 使用文档（本文件）
```

### 服务层

所有 hooks 都依赖 `services/word.service.ts`，它封装了与 ApiClient 的交互。

## Query Hooks

### useWordSearch - 单词搜索（带防抖）

#### 功能特性

- ✅ 自动防抖（默认 300ms）
- ✅ 最小搜索长度控制
- ✅ 智能缓存管理
- ✅ 加载状态追踪
- ✅ 支持自定义配置

#### 基本用法

```tsx
import { useState } from 'react';
import { useWordSearch } from '@/hooks/queries';

function SearchComponent() {
  const [query, setQuery] = useState('');

  const { results, isLoading, hasResults, debouncedQuery } = useWordSearch({
    query,
    debounceMs: 300,
    limit: 20,
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索单词..."
      />

      {isLoading && <div>搜索中...</div>}

      {hasResults && (
        <ul>
          {results.map(word => (
            <li key={word.id}>{word.spelling} - {word.meanings.join('；')}</li>
          ))}
        </ul>
      )}

      {!isLoading && !hasResults && debouncedQuery && (
        <div>未找到匹配的单词</div>
      )}
    </div>
  );
}
```

#### 高级配置

```tsx
const { results, isLoading, error } = useWordSearch({
  query: searchTerm,
  debounceMs: 500,           // 自定义防抖延迟
  limit: 50,                  // 返回结果数量
  minSearchLength: 2,         // 最小搜索长度
  enabled: isAuthenticated,   // 条件查询
});
```

#### 简化版本

```tsx
// 如果只需要基本功能
const { results, isLoading } = useSimpleWordSearch('hello');
```

### useWordDetail - 单词详情

#### 功能特性

- ✅ 按需加载（enabled 配置）
- ✅ 自动缓存管理（默认 10 分钟）
- ✅ 支持手动刷新
- ✅ 错误处理

#### 基本用法

```tsx
import { useWordDetail } from '@/hooks/queries';

function WordDetailComponent({ wordId }: { wordId: string }) {
  const { word, isLoading, error, refetch } = useWordDetail({ id: wordId });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  if (!word) return <div>单词不存在</div>;

  return (
    <div>
      <h1>{word.spelling}</h1>
      <p>{word.phonetic}</p>
      <ul>
        {word.meanings.map((meaning, i) => (
          <li key={i}>{meaning}</li>
        ))}
      </ul>
      <button onClick={() => refetch()}>刷新</button>
    </div>
  );
}
```

#### 条件查询

```tsx
// 只有当 ID 存在且用户已登录时才查询
const { word, isLoading } = useWordDetail({
  id: wordId,
  enabled: Boolean(wordId && isAuthenticated),
  staleTime: 5 * 60 * 1000, // 自定义缓存时间
});
```

#### 批量获取

```tsx
// 批量获取多个单词详情
const wordIds = ['id1', 'id2', 'id3'];
const words = useWordDetails(wordIds);

return (
  <div>
    {words.map(({ word, isLoading }, index) => (
      <div key={wordIds[index]}>
        {isLoading ? '加载中...' : word?.spelling}
      </div>
    ))}
  </div>
);
```

## Mutation Hooks

### useCreateWord - 创建单词

```tsx
import { useCreateWord } from '@/hooks/mutations';

function CreateWordForm() {
  const { mutate, isPending } = useCreateWord({
    onSuccess: (word) => {
      toast.success(`创建成功: ${word.spelling}`);
      navigate(`/words/${word.id}`);
    },
    onError: (error) => {
      toast.error(`创建失败: ${error.message}`);
    },
  });

  const handleSubmit = (data: CreateWordDto) => {
    mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 表单内容 */}
      <button type="submit" disabled={isPending}>
        {isPending ? '创建中...' : '创建'}
      </button>
    </form>
  );
}
```

### useUpdateWord - 更新单词

```tsx
import { useUpdateWord } from '@/hooks/mutations';

function EditWordForm({ wordId }: { wordId: string }) {
  const { mutate, isPending } = useUpdateWord({
    onSuccess: () => {
      toast.success('更新成功');
    },
  });

  const handleUpdate = (data: UpdateWordDto) => {
    mutate({ id: wordId, data });
  };

  return (
    <form>
      {/* 表单内容 */}
      <button onClick={() => handleUpdate(formData)} disabled={isPending}>
        保存
      </button>
    </form>
  );
}
```

### useDeleteWord - 删除单词

```tsx
import { useDeleteWord } from '@/hooks/mutations';

function DeleteWordButton({ wordId }: { wordId: string }) {
  const { mutate, isPending } = useDeleteWord({
    onSuccess: () => {
      toast.success('删除成功');
      navigate('/words');
    },
  });

  const handleDelete = () => {
    if (confirm('确定要删除这个单词吗？')) {
      mutate(wordId);
    }
  };

  return (
    <button onClick={handleDelete} disabled={isPending}>
      {isPending ? '删除中...' : '删除'}
    </button>
  );
}
```

### useBatchCreateWords - 批量创建

```tsx
import { useBatchCreateWords } from '@/hooks/mutations';

function BatchImportComponent() {
  const { mutate, isPending } = useBatchCreateWords({
    onSuccess: (words) => {
      toast.success(`成功导入 ${words.length} 个单词`);
    },
  });

  const handleImport = (words: CreateWordDto[]) => {
    mutate(words);
  };

  return (
    <div>
      {/* 导入界面 */}
      <button onClick={() => handleImport(wordList)} disabled={isPending}>
        {isPending ? '导入中...' : '开始导入'}
      </button>
    </div>
  );
}
```

### useWordMutations - 组合 Hook

如果需要在一个组件中使用多个 mutation 操作：

```tsx
import { useWordMutations } from '@/hooks/mutations';

function WordManager() {
  const {
    createWord,
    updateWord,
    deleteWord,
    batchCreate,
    isCreating,
    isUpdating,
    isDeleting,
    isAnyPending,
  } = useWordMutations({
    onCreateSuccess: (word) => console.log('Created:', word),
    onUpdateSuccess: (word) => console.log('Updated:', word),
    onDeleteSuccess: (id) => console.log('Deleted:', id),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div>
      <button
        onClick={() => createWord(newWordData)}
        disabled={isAnyPending}
      >
        {isCreating ? '创建中...' : '创建单词'}
      </button>

      <button
        onClick={() => updateWord({ id: '1', data: updates })}
        disabled={isAnyPending}
      >
        {isUpdating ? '更新中...' : '更新单词'}
      </button>

      <button
        onClick={() => deleteWord('1')}
        disabled={isAnyPending}
      >
        {isDeleting ? '删除中...' : '删除单词'}
      </button>
    </div>
  );
}
```

## 实际应用示例

### 完整的搜索和详情页面

```tsx
import { useState } from 'react';
import { useWordSearch, useWordDetail } from '@/hooks/queries';
import { useWordMutations } from '@/hooks/mutations';

function WordExplorer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

  // 搜索
  const { results, isLoading: isSearching } = useWordSearch({
    query: searchQuery,
    debounceMs: 300,
  });

  // 详情
  const { word, isLoading: isLoadingDetail } = useWordDetail({
    id: selectedWordId || '',
    enabled: Boolean(selectedWordId),
  });

  // 操作
  const { updateWord, deleteWord } = useWordMutations({
    onUpdateSuccess: () => toast.success('更新成功'),
    onDeleteSuccess: () => {
      setSelectedWordId(null);
      toast.success('删除成功');
    },
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* 搜索面板 */}
      <div>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索单词..."
        />

        {isSearching && <div>搜索中...</div>}

        <ul>
          {results.map(word => (
            <li
              key={word.id}
              onClick={() => setSelectedWordId(word.id)}
              className={selectedWordId === word.id ? 'selected' : ''}
            >
              {word.spelling}
            </li>
          ))}
        </ul>
      </div>

      {/* 详情面板 */}
      <div>
        {isLoadingDetail && <div>加载中...</div>}

        {word && (
          <>
            <h1>{word.spelling}</h1>
            <p>{word.phonetic}</p>
            <ul>
              {word.meanings.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>

            <button onClick={() => updateWord({ id: word.id, data: updates })}>
              编辑
            </button>
            <button onClick={() => deleteWord(word.id)}>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

## 最佳实践

### 1. 防抖搜索

使用 `useWordSearch` 时，合理设置 `debounceMs`：
- 快速搜索场景：200-300ms
- 复杂查询场景：500-800ms

### 2. 缓存策略

根据数据更新频率设置 `staleTime`：
- 静态数据：`10 * 60 * 1000` (10分钟)
- 动态数据：`2 * 60 * 1000` (2分钟)
- 实时数据：`0` (不缓存)

### 3. 错误处理

始终提供错误回调：

```tsx
const { mutate } = useCreateWord({
  onError: (error) => {
    console.error('Create failed:', error);
    toast.error(error.message);
    // 可选：上报错误到监控系统
  },
});
```

### 4. 加载状态

正确处理加载状态，提供良好的用户体验：

```tsx
if (isLoading) return <Skeleton />;
if (error) return <ErrorMessage error={error} />;
if (!data) return <EmptyState />;

return <DataDisplay data={data} />;
```

### 5. 乐观更新

对于更新操作，可以考虑乐观更新：

```tsx
const queryClient = useQueryClient();

const { mutate } = useUpdateWord({
  onMutate: async (variables) => {
    // 取消正在进行的查询
    await queryClient.cancelQueries({ queryKey: ['words', variables.id] });

    // 保存旧数据
    const previousWord = queryClient.getQueryData(['words', variables.id]);

    // 乐观更新
    queryClient.setQueryData(['words', variables.id], (old) => ({
      ...old,
      ...variables.data,
    }));

    return { previousWord };
  },
  onError: (err, variables, context) => {
    // 回滚
    if (context?.previousWord) {
      queryClient.setQueryData(['words', variables.id], context.previousWord);
    }
  },
});
```

## 测试

所有 hooks 都有相应的测试文件：

```
hooks/
├── queries/
│   └── __tests__/
│       ├── useWordSearch.test.ts
│       └── useWordDetail.test.ts
└── mutations/
    └── __tests__/
        └── useWordMutations.test.ts
```

运行测试：

```bash
npm test -- hooks/queries/__tests__/useWordSearch.test.ts
npm test -- hooks/queries/__tests__/useWordDetail.test.ts
npm test -- hooks/mutations/__tests__/useWordMutations.test.ts
```

## 总结

这套 hooks 提供了完整的单词管理能力：

- ✅ **搜索**：带防抖的智能搜索
- ✅ **查询**：灵活的单词详情获取
- ✅ **创建**：单个和批量创建
- ✅ **更新**：单词信息更新
- ✅ **删除**：单词删除

所有操作都与 React Query 深度集成，提供自动缓存、加载状态、错误处理等特性。
