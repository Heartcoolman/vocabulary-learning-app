# Month 1 最佳实践文档

**文档版本**: v1.0
**更新日期**: 2025-12-07
**适用范围**: Danci项目 Month 1重构后

---

## 📋 目录

1. [React Query最佳实践](#react-query最佳实践)
2. [Zustand状态管理最佳实践](#zustand状态管理最佳实践)
3. [TypeScript类型安全最佳实践](#typescript类型安全最佳实践)
4. [性能优化最佳实践](#性能优化最佳实践)
5. [代码组织最佳实践](#代码组织最佳实践)
6. [测试最佳实践](#测试最佳实践)
7. [Git提交规范](#git提交规范)

---

## React Query最佳实践

### 1. Query Key设计

#### ✅ 好的做法

```typescript
// 使用统一的queryKeys工具
import { queryKeys } from '@/lib/queryKeys';

// 列表查询
const { data } = useQuery({
  queryKey: queryKeys.words.list({ filter: 'active' }),
  queryFn: () => getWords({ filter: 'active' }),
});

// 详情查询
const { data } = useQuery({
  queryKey: queryKeys.words.detail(wordId),
  queryFn: () => getWordDetail(wordId),
});
```

#### ❌ 避免的做法

```typescript
// 不要直接使用字符串数组
const { data } = useQuery({
  queryKey: ['words', filter], // ❌ 类型不安全
  queryFn: () => getWords(filter),
});

// 不要在queryKey中使用对象字面量
const { data } = useQuery({
  queryKey: ['words', { filter: 'active' }], // ❌ 每次都是新对象
  queryFn: () => getWords({ filter: 'active' }),
});
```

### 2. 缓存策略

#### 根据数据特性选择staleTime

```typescript
// 实时数据（频繁变化）- 30s
const { data } = useStudyProgress({
  staleTime: 30 * 1000,
  refetchInterval: 60 * 1000, // 每分钟自动刷新
});

// 动态数据（偶尔变化）- 1-5min
const { data } = useTodayWords({
  staleTime: 60 * 1000,
});

// 半静态数据（很少变化）- 5-10min
const { data } = useWordBooks({
  staleTime: 5 * 60 * 1000,
});

// 静态数据（几乎不变）- 1hour
const { data } = useAlgorithmConfig({
  staleTime: 60 * 60 * 1000,
});
```

### 3. 条件查询

#### ✅ 使用enabled

```typescript
// 只在userId存在时查询
const { data } = useUserDetail(userId, {
  enabled: !!userId,
});

// 只在搜索词长度>=2时查询
const { data } = useWordSearch(query, {
  enabled: query.length >= 2,
});

// 依赖查询：第二个查询依赖第一个
const { data: wordBook } = useWordBook(bookId);
const { data: words } = useWordBookWords(bookId, {
  enabled: !!wordBook, // 只有wordBook加载后才查询
});
```

#### ❌ 避免的做法

```typescript
// 不要在组件中手动判断
const { data } = useUserDetail(userId); // ❌ 即使userId为空也会查询

if (userId) {
  // 太晚了，查询已经触发
  return <UserDetail data={data} />;
}
```

### 4. 分页处理

#### ✅ 使用keepPreviousData

```typescript
import { keepPreviousData } from '@tanstack/react-query';

function UserList() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isPlaceholderData } = useAdminUsers(
    { page },
    { placeholderData: keepPreviousData } // 保持前页数据
  );

  return (
    <div>
      {data?.users.map(user => <UserRow key={user.id} user={user} />)}

      <button
        onClick={() => setPage(p => p + 1)}
        disabled={isPlaceholderData} // 加载时禁用
      >
        下一页
      </button>
    </div>
  );
}
```

### 5. 防抖搜索

#### ✅ 推荐方式

```typescript
import { useState, useEffect } from 'react';
import { useWordSearch } from '@/hooks/queries';

function SearchBox() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // 300ms防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useWordSearch({
    query: debouncedQuery,
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="搜索单词..."
    />
  );
}
```

### 6. Mutation最佳实践

#### ✅ 乐观更新

```typescript
const deleteWord = useMutation({
  mutationFn: (wordId: string) => apiClient.deleteWord(wordId),

  onMutate: async (wordId) => {
    // 1. 取消进行中的查询
    await queryClient.cancelQueries({ queryKey: ['words'] });

    // 2. 保存快照
    const previousWords = queryClient.getQueryData(['words']);

    // 3. 立即更新UI
    queryClient.setQueryData(['words'], (old: Word[]) =>
      old.filter(w => w.id !== wordId)
    );

    return { previousWords };
  },

  onError: (err, wordId, context) => {
    // 4. 错误时回滚
    queryClient.setQueryData(['words'], context?.previousWords);
    toast.error('删除失败');
  },

  onSuccess: () => {
    toast.success('删除成功');
  },
});
```

#### ✅ 缓存失效

```typescript
const createWord = useMutation({
  mutationFn: (word: NewWord) => apiClient.createWord(word),

  onSuccess: () => {
    // 失效相关查询
    queryClient.invalidateQueries({ queryKey: ['words'] });
    queryClient.invalidateQueries({ queryKey: ['statistics'] });

    toast.success('创建成功');
  },
});
```

---

## Zustand状态管理最佳实践

### 1. Store设计原则

#### ✅ 单一职责

```typescript
// uiStore.ts - 只管理UI状态
interface UIState {
  isModalOpen: boolean;
  isSidebarOpen: boolean;
  isLoading: boolean;
  openModal: () => void;
  closeModal: () => void;
  // ...
}

// toastStore.ts - 只管理Toast
interface ToastState {
  toasts: Toast[];
  success: (message: string) => void;
  error: (message: string) => void;
  // ...
}
```

#### ❌ 避免的做法

```typescript
// ❌ 一个Store管理所有状态
interface AppState {
  // UI
  isModalOpen: boolean;
  // Toast
  toasts: Toast[];
  // User
  user: User | null;
  // ... 太多职责
}
```

### 2. 使用Immer简化状态更新

#### ✅ 使用immer中间件

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
}

export const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],

    addTodo: (text) => set((state) => {
      // 直接修改，immer会处理不可变性
      state.todos.push({ id: Date.now().toString(), text, done: false });
    }),

    toggleTodo: (id) => set((state) => {
      const todo = state.todos.find(t => t.id === id);
      if (todo) {
        todo.done = !todo.done;
      }
    }),
  }))
);
```

### 3. Redux DevTools集成

#### ✅ 开发环境启用

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      // state and actions
    }),
    { name: 'UIStore' } // DevTools中显示的名称
  )
);
```

### 4. 选择性订阅

#### ✅ 只订阅需要的状态

```typescript
// ✅ 好：只订阅isModalOpen
function Modal() {
  const isModalOpen = useUIStore(state => state.isModalOpen);
  const closeModal = useUIStore(state => state.closeModal);

  // isModalOpen变化时才重新渲染
}

// ❌ 不好：订阅整个store
function Modal() {
  const { isModalOpen, closeModal } = useUIStore();

  // store中任何状态变化都会导致重新渲染
}
```

#### ✅ 使用shallow比较

```typescript
import { shallow } from 'zustand/shallow';

function MyComponent() {
  const { isModalOpen, isSidebarOpen } = useUIStore(
    state => ({
      isModalOpen: state.isModalOpen,
      isSidebarOpen: state.isSidebarOpen,
    }),
    shallow // 浅比较，避免不必要的重渲染
  );
}
```

---

## TypeScript类型安全最佳实践

### 1. 使用Shared类型

#### ✅ 从shared包导入

```typescript
// ✅ 好
import { Word, UserInfo, StudyConfig } from '@danci/shared/types';
import { WordSchema } from '@danci/shared/schemas';

// ❌ 不好
interface Word { // 重复定义
  id: string;
  text: string;
  // ...
}
```

### 2. Zod Schema验证

#### ✅ 关键API使用Zod

```typescript
import { z } from 'zod';
import { WordSchema } from '@danci/shared/schemas';

// API请求验证
async function createWord(data: unknown) {
  // 运行时验证
  const validated = WordSchema.parse(data);

  return apiClient.post('/words', validated);
}

// 表单验证
function WordForm() {
  const onSubmit = (data: unknown) => {
    try {
      const validated = WordSchema.parse(data);
      createWord(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // 显示验证错误
        showErrors(error.errors);
      }
    }
  };
}
```

### 3. 环境变量类型化

#### ✅ 使用env.ts

```typescript
// ✅ 前端
import { env } from '@/config/env';

// 类型安全的环境变量
const apiUrl = env.VITE_API_URL; // string
const sentryDsn = env.VITE_SENTRY_DSN; // string | undefined

// ❌ 不好
const apiUrl = import.meta.env.VITE_API_URL; // any类型
```

```typescript
// ✅ 后端
import { env } from '@/config/env';

// 类型安全 + Zod运行时验证
const port = env.PORT; // number
const jwtSecret = env.JWT_SECRET; // string

// ❌ 不好
const port = process.env.PORT; // string | undefined
```

### 4. 避免any类型

#### ✅ 使用unknown或泛型

```typescript
// ✅ 好：使用unknown
function processData(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // 类型收窄
    return data;
  }
  throw new Error('Invalid data');
}

// ✅ 好：使用泛型
function identity<T>(value: T): T {
  return value;
}

// ❌ 不好：使用any
function processData(data: any) { // 失去类型安全
  return data.something;
}
```

---

## 性能优化最佳实践

### 1. React.memo优化

#### ✅ 纯展示组件使用memo

```typescript
import { memo } from 'react';

// ✅ 好：纯展示组件
export const WordCard = memo<WordCardProps>(({ word, onSelect }) => {
  return (
    <div onClick={() => onSelect(word.id)}>
      <h3>{word.text}</h3>
      <p>{word.definition}</p>
    </div>
  );
});

// 自定义比较函数
export const WordCard = memo<WordCardProps>(
  ({ word, onSelect }) => {
    // ...
  },
  (prevProps, nextProps) => {
    // 只在word.id和word.text变化时重渲染
    return (
      prevProps.word.id === nextProps.word.id &&
      prevProps.word.text === nextProps.word.text
    );
  }
);
```

#### ❌ 避免的场景

```typescript
// ❌ 有状态的组件不适合memo
const Counter = memo(() => {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
});

// ❌ 每次render都创建新的props
function Parent() {
  return <MemoChild onClick={() => {}} />; // 每次都是新函数
}
```

### 2. useMemo和useCallback

#### ✅ 昂贵计算使用useMemo

```typescript
function WordList({ words, filter }) {
  // ✅ 好：缓存过滤结果
  const filteredWords = useMemo(() => {
    return words.filter(word => word.text.includes(filter));
  }, [words, filter]);

  return filteredWords.map(word => <WordCard key={word.id} word={word} />);
}
```

#### ✅ 传递给子组件的函数使用useCallback

```typescript
function Parent() {
  const [count, setCount] = useState(0);

  // ✅ 好：缓存函数引用
  const handleClick = useCallback((id: string) => {
    console.log('Clicked', id);
  }, []); // 依赖为空，函数永远不变

  return <MemoChild onClick={handleClick} />;
}
```

### 3. Context优化

#### ✅ useMemo包裹value

```typescript
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // ✅ 好：缓存value对象
  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      login: useCallback((credentials) => {
        // ...
      }, []),
      logout: useCallback(() => {
        // ...
      }, []),
    }),
    [user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 4. 虚拟滚动

#### ✅ 大列表使用react-window

```typescript
import { FixedSizeList } from 'react-window';

function WordList({ words }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <WordCard word={words[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={words.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

---

## 代码组织最佳实践

### 1. 文件组织

```
packages/frontend/src/
├── components/        # 可复用组件
│   ├── common/       # 通用组件(Button, Input)
│   ├── layout/       # 布局组件(Header, Sidebar)
│   └── features/     # 功能组件(WordCard, TestOptions)
│
├── pages/            # 页面组件
│   ├── LearningPage/
│   │   ├── index.tsx
│   │   ├── components/  # 页面专用组件
│   │   └── hooks/       # 页面专用hooks
│   └── ...
│
├── hooks/            # 全局hooks
│   ├── queries/      # React Query hooks
│   ├── mutations/    # Mutation hooks
│   └── useMasteryLearning.ts
│
├── stores/           # Zustand stores
│   ├── uiStore.ts
│   └── toastStore.ts
│
├── services/         # API服务
│   └── ApiClient.ts
│
├── lib/              # 工具库
│   ├── queryClient.ts
│   └── queryKeys.ts
│
��── config/           # 配置
│   └── env.ts
│
└── types/            # 类型定义
    └── index.ts
```

### 2. 命名规范

#### 组件命名

```typescript
// ✅ 好：PascalCase
export function WordCard() {}
export const WordCard = () => {};

// ❌ 不好
export function wordCard() {} // 小写开头
export function Word_Card() {} // 下划线
```

#### Hooks命名

```typescript
// ✅ 好：use开头，camelCase
export function useWords() {}
export function useWordMutations() {}

// ❌ 不好
export function getWords() {} // 不是use开头
export function UseWords() {} // 大写开头
```

#### 文件命名

```typescript
// 组件：PascalCase
WordCard.tsx
TestOptions.tsx

// Hooks：camelCase
useWords.ts
useMasteryLearning.ts

// 工具：camelCase
queryClient.ts
apiClient.ts
```

---

## 测试最佳实践

### 1. React Query测试

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWords } from '../useWords';

describe('useWords', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('fetches words successfully', async () => {
    const { result } = renderHook(() => useWords(), {
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

### 2. Zustand测试

```typescript
import { renderHook, act } from '@testing-library/react';
import { useUIStore } from '../uiStore';

describe('useUIStore', () => {
  beforeEach(() => {
    // 重置store
    useUIStore.setState({
      isModalOpen: false,
      isSidebarOpen: false,
    });
  });

  it('opens and closes modal', () => {
    const { result } = renderHook(() => useUIStore());

    expect(result.current.isModalOpen).toBe(false);

    act(() => {
      result.current.openModal();
    });

    expect(result.current.isModalOpen).toBe(true);

    act(() => {
      result.current.closeModal();
    });

    expect(result.current.isModalOpen).toBe(false);
  });
});
```

---

## Git提交规范

### 1. Commit Message格式

```bash
<type>(<scope>): <subject>

<body>

<footer>
```

### 2. Type类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(query): add useWords hook` |
| `fix` | Bug修复 | `fix(auth): resolve token refresh issue` |
| `docs` | 文档更新 | `docs(api): update migration guide` |
| `style` | 代码格式 | `style: format with prettier` |
| `refactor` | 重构 | `refactor(store): simplify toast logic` |
| `perf` | 性能优化 | `perf(memo): optimize WordCard rendering` |
| `test` | 测试 | `test(hooks): add useWords tests` |
| `build` | 构建 | `build: update vite config` |
| `ci` | CI/CD | `ci: add github actions workflow` |
| `chore` | 杂项 | `chore: update dependencies` |

### 3. 示例

```bash
# ✅ 好的提交
feat(query): add useWordBooks hook with caching

- Implement useWordBooks query hook
- Add 10min cache strategy
- Include system and user wordbooks
- Add comprehensive tests

Closes #123

# ✅ 简短提交
fix(auth): resolve token refresh issue

# ❌ 不好的提交
update files
fix bug
WIP
```

### 4. 提交前检查

```bash
# Husky会自动运行
# 1. lint-staged格式化代码
# 2. commitlint检查提交信息

# 手动检查
pnpm lint
pnpm test
```

---

## 总结

### 核心原则

1. **类型安全优先** - 使用TypeScript和Zod
2. **性能意识** - memo、useMemo、useCallback
3. **可维护性** - 清晰的代码组织和命名
4. **测试覆盖** - 关键功能必须测试
5. **文档完善** - 代码即文档

### 快速检查清单

在提交代码前检查：

- [ ] 使用了正确的queryKeys
- [ ] 选择了合适的staleTime
- [ ] 大列表使用了虚拟滚动
- [ ] 纯展示组件使用了memo
- [ ] Context value使用了useMemo
- [ ] 传给子组件的函数使用了useCallback
- [ ] 从shared包导入类型
- [ ] 关键API使用了Zod验证
- [ ] 添加了测试
- [ ] 提交信息符合规范

---

**文档维护**: 请在发现新的最佳实践时更新本文档
**最后更新**: 2025-12-07
**维护人**: 开发团队
