# React 代码审查标准

> **版本**: v1.0.0
> **更新日期**: 2025-12-13
> **验证状态**: ✅ 已通过5轮验证

---

## 目录

1. [组件设计检查清单](#组件设计检查清单)
2. [Hooks使用规范](#hooks使用规范)
3. [性能优化检查点](#性能优化检查点)
4. [类型安全标准](#类型安全标准)
5. [测试要求](#测试要求)

---

## 组件设计检查清单

### 1. 组件职责单一性

#### 🔴 阻断级

- [ ] **组件功能单一**: 每个组件只负责一个明确的功能
- [ ] **避免上帝组件**: 单个组件代码不超过300行
- [ ] **合理拆分**: 复杂组件已拆分为多个子组件

**检测工具**: ESLint + 人工审查

**示例 - 违规**:

```tsx
// ❌ 错误：一个组件做了太多事情
function UserDashboard() {
  // 用户信息获取
  // 学习进度计算
  // 图表渲染
  // 设置管理
  // 通知处理
  // ...超过500行代码
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：职责清晰，组件拆分
function UserDashboard() {
  return (
    <div className="dashboard">
      <UserProfile />
      <LearningProgress />
      <PerformanceChart />
      <SettingsPanel />
      <NotificationCenter />
    </div>
  );
}
```

### 2. Props接口设计

#### 🔴 阻断级

- [ ] **明确的TypeScript接口**: 所有Props必须有类型定义
- [ ] **避免any类型**: 不使用`any`，使用`unknown`或具体类型
- [ ] **Props验证**: 复杂Props使用Zod验证

#### 🟡 警告级

- [ ] **Props数量合理**: 单个组件Props不超过10个
- [ ] **使用解构**: Props使用解构赋值提高可读性
- [ ] **默认值设置**: 可选Props提供合理默认值

**检测工具**: TypeScript, ESLint

**示例 - 违规**:

```tsx
// ❌ 错误：没有类型定义，Props过多
function WordCard(props) {
  const {
    word,
    phonetic,
    meanings,
    examples,
    audioUrl,
    isBookmarked,
    difficulty,
    masteryLevel,
    lastReviewDate,
    nextReviewDate,
    reviewCount,
    onPlay,
    onBookmark,
    onReview,
  } = props;
  // ...
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：清晰的类型定义，Props分组
interface WordCardProps {
  word: Word;
  userState: UserWordState;
  actions: WordCardActions;
  className?: string;
}

interface Word {
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
}

interface UserWordState {
  isBookmarked: boolean;
  masteryLevel: number;
  lastReviewDate: Date;
  nextReviewDate: Date;
}

interface WordCardActions {
  onPlayAudio: (url: string) => void;
  onToggleBookmark: (wordId: string) => void;
  onStartReview: (wordId: string) => void;
}

function WordCard({ word, userState, actions, className }: WordCardProps) {
  // ...
}
```

### 3. 组件组合模式

#### 🟡 警告级

- [ ] **组合优于继承**: 使用组合模式而非继承
- [ ] **Compound Components**: 复杂UI使用复合组件模式
- [ ] **Render Props**: 共享逻辑使用Render Props或Hooks

**示例 - 组合模式**:

```tsx
// ✅ 正确：使用组合模式
<Card>
  <Card.Header>
    <Card.Title>单词卡片</Card.Title>
    <Card.Actions>
      <Button>编辑</Button>
      <Button>删除</Button>
    </Card.Actions>
  </Card.Header>
  <Card.Body>
    <WordContent word={word} />
  </Card.Body>
  <Card.Footer>
    <ProgressBar value={masteryLevel} />
  </Card.Footer>
</Card>
```

### 4. 状态管理

#### 🔴 阻断级

- [ ] **最小化状态**: 只存储必要的状态，派生数据通过计算获得
- [ ] **避免状态冗余**: 不在state中存储可从props计算的值
- [ ] **状态提升**: 共享状态提升到公共父组件或使用状态管理

#### 🟡 警告级

- [ ] **合理使用Context**: 避免Context过度使用，注意性能影响
- [ ] **本地状态优先**: 仅当前组件使用的状态保持本地化
- [ ] **状态初始化**: 使用函数式初始化避免重复计算

**检测工具**: React DevTools, ESLint规则

**示例 - 违规**:

```tsx
// ❌ 错误：冗余状态，派生数据也存储在state中
function WordList({ words }: WordListProps) {
  const [words, setWords] = useState(words);
  const [totalWords, setTotalWords] = useState(words.length); // 冗余
  const [masteredWords, setMasteredWords] = useState(
    words.filter((w) => w.masteryLevel >= 5).length, // 冗余
  );

  // 需要在多处更新状态
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：最小化状态，派生数据通过计算获得
function WordList({ words }: WordListProps) {
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({});

  // 派生数据通过useMemo计算
  const filteredWords = useMemo(() => applyFilters(words, filterCriteria), [words, filterCriteria]);

  const totalWords = filteredWords.length;
  const masteredWords = useMemo(
    () => filteredWords.filter((w) => w.masteryLevel >= 5).length,
    [filteredWords],
  );

  // ...
}
```

---

## Hooks使用规范

### 1. Hooks规则遵守

#### 🔴 阻断级

- [ ] **顶层调用**: 只在函数组件顶层调用Hooks
- [ ] **不在条件语句中**: 不在条件、循环中调用Hooks
- [ ] **自定义Hooks命名**: 自定义Hooks以`use`开头

**检测工具**: eslint-plugin-react-hooks

### 2. useState优化

#### 🟡 警告级

- [ ] **函数式更新**: 依赖当前状态时使用函数式更新
- [ ] **避免对象状态过大**: 大对象拆分为多个useState
- [ ] **初始化优化**: 复杂初始值使用函数式初始化

**示例 - 违规**:

```tsx
// ❌ 错误：直接使用状态值更新
function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => {
    setCount(count + 1); // 可能导致闭包问题
    setCount(count + 1); // 不会加2，只会加1
  };
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：使用函数式更新
function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => {
    setCount((prev) => prev + 1); // 基于最新状态更新
    setCount((prev) => prev + 1); // 正确加2
  };
}
```

### 3. useEffect依赖管理

#### 🔴 阻断级

- [ ] **完整依赖列表**: 所有使用的外部变量都在依赖数组中
- [ ] **避免无限循环**: 确保依赖变化不会导致无限重渲染
- [ ] **清理副作用**: 有副作用的effect必须返回清理函数

#### 🟡 警告级

- [ ] **避免对象依赖**: 使用useMemo/useCallback稳定对象引用
- [ ] **拆分Effect**: 不相关的副作用拆分到多个useEffect

**检测工具**: eslint-plugin-react-hooks (exhaustive-deps)

**示例 - 违规**:

```tsx
// ❌ 错误：缺少依赖，可能使用过期数据
function WordDetail({ wordId }: WordDetailProps) {
  const [word, setWord] = useState<Word | null>(null);

  useEffect(() => {
    fetchWord(wordId).then(setWord); // wordId缺失会导致问题
  }, []); // 依赖数组不完整
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：完整的依赖，正确的清理
function WordDetail({ wordId }: WordDetailProps) {
  const [word, setWord] = useState<Word | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchWord(wordId).then((data) => {
      if (!cancelled) {
        setWord(data);
      }
    });

    return () => {
      cancelled = true; // 清理：避免在组件卸载后更新状态
    };
  }, [wordId]); // 完整的依赖数组
}
```

### 4. useMemo和useCallback使用

#### 🟡 警告级

- [ ] **必要时使用**: 仅在性能瓶颈时使用，避免过度优化
- [ ] **稳定引用**: 传递给子组件的对象/函数使用memo化
- [ ] **依赖准确**: 依赖数组必须完整且准确

**使用场景**:

1. 昂贵的计算（复杂的过滤、排序、聚合）
2. 传递给React.memo组件的props
3. 作为useEffect依赖的对象/函数
4. 传递给子组件的回调函数（子组件使用React.memo）

**示例 - 过度优化**:

```tsx
// ❌ 错误：简单计算不需要useMemo
function WordList({ words }: WordListProps) {
  const count = useMemo(() => words.length, [words]); // 过度优化
  return <div>共 {count} 个单词</div>;
}
```

**示例 - 必要优化**:

```tsx
// ✅ 正确：昂贵计算使用useMemo
function WordList({ words }: WordListProps) {
  // 复杂计算：过滤、排序、分组
  const processedWords = useMemo(() => {
    return words
      .filter((w) => w.masteryLevel < 5)
      .sort((a, b) => a.nextReviewDate.getTime() - b.nextReviewDate.getTime())
      .reduce(
        (groups, word) => {
          const level = Math.floor(word.masteryLevel);
          if (!groups[level]) groups[level] = [];
          groups[level].push(word);
          return groups;
        },
        {} as Record<number, Word[]>,
      );
  }, [words]);

  // 稳定的回调引用，传递给React.memo组件
  const handleWordClick = useCallback(
    (wordId: string) => {
      // 处理逻辑
    },
    [
      /* 依赖 */
    ],
  );

  return (
    <div>
      {Object.entries(processedWords).map(([level, wordsInLevel]) => (
        <WordGroup key={level} level={level} words={wordsInLevel} onWordClick={handleWordClick} />
      ))}
    </div>
  );
}

// 使用React.memo避免不必要的重渲染
const WordGroup = React.memo(({ level, words, onWordClick }: WordGroupProps) => {
  // ...
});
```

### 5. 自定义Hooks设计

#### 🟡 警告级

- [ ] **单一职责**: 每个Hook负责一个明确的功能
- [ ] **命名清晰**: Hook名称清晰表达其功能（use + 动词/名词）
- [ ] **返回值设计**: 返回值结构清晰，使用对象或数组
- [ ] **文档完善**: 复杂Hook必须有JSDoc注释

**最佳实践**:

```tsx
// ✅ 正确：清晰的自定义Hook设计
/**
 * 管理单词学习状态的Hook
 * @param wordId - 单词ID
 * @returns 单词状态和操作方法
 */
function useWordLearning(wordId: string) {
  const [state, setState] = useState<WordLearningState>(() => getInitialState(wordId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitAnswer = useCallback(
    async (answer: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await recordAnswer(wordId, answer);
        setState(result.newState);
        return result;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wordId],
  );

  const reset = useCallback(() => {
    setState(getInitialState(wordId));
    setError(null);
  }, [wordId]);

  return {
    state,
    isLoading,
    error,
    actions: {
      submitAnswer,
      reset,
    },
  };
}
```

---

## 性能优化检查点

### 1. 渲染优化

#### 🟡 警告级

- [ ] **React.memo**: 纯组件使用React.memo包裹
- [ ] **key属性**: 列表渲染使用稳定的key（不用index）
- [ ] **虚拟化**: 长列表使用react-window或react-virtualized
- [ ] **懒加载**: 路由和大组件使用React.lazy

**检测工具**: React DevTools Profiler

**示例 - 虚拟化长列表**:

```tsx
// ✅ 正确：使用react-window进行虚拟化
import { FixedSizeList } from 'react-window';

function VirtualWordList({ words }: VirtualWordListProps) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <WordCard word={words[index]} />
    </div>
  );

  return (
    <FixedSizeList height={600} itemCount={words.length} itemSize={120} width="100%">
      {Row}
    </FixedSizeList>
  );
}
```

### 2. 代码分割

#### 🟡 警告级

- [ ] **路由懒加载**: 所有路由组件使用lazy加载
- [ ] **组件懒加载**: 大型组件、图表组件按需加载
- [ ] **Suspense边界**: 懒加载组件配合Suspense使用

**示例**:

```tsx
// ✅ 正确：路由懒加载
const Dashboard = lazy(() => import('./pages/Dashboard'));
const WordManagement = lazy(() => import('./pages/WordManagement'));
const Analytics = lazy(() => import('./pages/Analytics'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/words" element={<WordManagement />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

### 3. 避免重复渲染

#### 🟡 警告级

- [ ] **稳定的对象引用**: 避免在render中创建新对象
- [ ] **稳定的函数引用**: 事件处理器使用useCallback
- [ ] **Context优化**: 大Context拆分为多个小Context

**示例 - 违规**:

```tsx
// ❌ 错误：每次渲染创建新对象和函数
function ParentComponent() {
  return (
    <ChildComponent
      config={{ theme: 'dark', size: 'large' }} // 每次新对象
      onClick={() => console.log('clicked')} // 每次新函数
    />
  );
}
```

**示例 - 正确**:

```tsx
// ✅ 正确：稳定的引用
function ParentComponent() {
  const config = useMemo(
    () => ({
      theme: 'dark',
      size: 'large',
    }),
    [],
  );

  const handleClick = useCallback(() => {
    console.log('clicked');
  }, []);

  return <ChildComponent config={config} onClick={handleClick} />;
}

// 子组件使用memo避免不必要的重渲染
const ChildComponent = React.memo(({ config, onClick }: ChildComponentProps) => {
  // ...
});
```

---

## 类型安全标准

### 1. TypeScript严格模式

#### 🔴 阻断级

- [ ] **启用strict模式**: tsconfig.json中启用strict选项
- [ ] **禁止any**: 不使用`any`类型（特殊情况需注释说明）
- [ ] **显式返回类型**: 复杂函数必须标注返回类型

**tsconfig.json配置**:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2. Props和State类型定义

#### 🔴 阻断级

- [ ] **明确的接口**: 所有Props和State有TypeScript接口
- [ ] **避免空对象类型**: 不使用`{}`，使用`Record<string, never>`或具体类型
- [ ] **泛型使用**: 复用组件使用泛型提高灵活性

**示例**:

```tsx
// ✅ 正确：清晰的类型定义
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  onItemClick?: (item: T) => void;
  emptyMessage?: string;
}

function List<T>({
  items,
  renderItem,
  keyExtractor,
  onItemClick,
  emptyMessage = '暂无数据',
}: ListProps<T>) {
  if (items.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }

  return (
    <div className="list">
      {items.map((item) => (
        <div key={keyExtractor(item)} onClick={() => onItemClick?.(item)}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

// 使用
<List
  items={words}
  renderItem={(word) => <WordCard word={word} />}
  keyExtractor={(word) => word.id}
  onItemClick={handleWordClick}
/>;
```

### 3. 事件处理类型

#### 🟡 警告级

- [ ] **明确的事件类型**: 事件处理器使用具体的事件类型
- [ ] **避免Event**: 使用React.MouseEvent、React.ChangeEvent等

**示例**:

```tsx
// ✅ 正确：明确的事件类型
function SearchInput() {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // TypeScript知道e.target是HTMLInputElement
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TypeScript知道e.target是HTMLFormElement
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" onChange={handleChange} />
    </form>
  );
}
```

---

## 测试要求

### 1. 测试覆盖率

#### 🔴 阻断级

- [ ] **最低覆盖率**: 组件测试覆盖率不低于80%
- [ ] **关键路径测试**: 核心功能必须有测试
- [ ] **边界情况**: 边界条件和错误情况有测试

**检测工具**: Vitest Coverage (v8)

### 2. 组件测试内容

#### 🟡 警告级

- [ ] **渲染测试**: 组件能正常渲染
- [ ] **Props测试**: 不同Props渲染正确内容
- [ ] **交互测试**: 用户交互触发正确行为
- [ ] **状态测试**: 状态变化导致正确的UI更新
- [ ] **快照测试**: UI组件有快照测试

**示例**:

```tsx
// ✅ 正确：完整的组件测试
describe('WordCard', () => {
  const mockWord: Word = {
    id: '1',
    spelling: 'hello',
    phonetic: '/həˈloʊ/',
    meanings: ['你好', '问候'],
    examples: ['Hello, world!'],
  };

  it('should render word spelling', () => {
    render(<WordCard word={mockWord} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('should render phonetic', () => {
    render(<WordCard word={mockWord} />);
    expect(screen.getByText('/həˈloʊ/')).toBeInTheDocument();
  });

  it('should call onPlayAudio when play button is clicked', async () => {
    const handlePlay = vi.fn();
    render(<WordCard word={mockWord} onPlayAudio={handlePlay} />);

    const playButton = screen.getByRole('button', { name: /play/i });
    await userEvent.click(playButton);

    expect(handlePlay).toHaveBeenCalledWith(mockWord.audioUrl);
  });

  it('should display bookmark status correctly', () => {
    const { rerender } = render(<WordCard word={mockWord} isBookmarked={false} />);

    expect(screen.queryByLabelText('已收藏')).not.toBeInTheDocument();

    rerender(<WordCard word={mockWord} isBookmarked={true} />);
    expect(screen.getByLabelText('已收藏')).toBeInTheDocument();
  });

  it('should handle missing audio URL gracefully', () => {
    const wordWithoutAudio = { ...mockWord, audioUrl: undefined };
    render(<WordCard word={wordWithoutAudio} />);

    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
  });
});
```

### 3. Hooks测试

#### 🟡 警告级

- [ ] **自定义Hooks测试**: 所有自定义Hooks有单元测试
- [ ] **使用renderHook**: 使用@testing-library/react的renderHook工具

**示例**:

```tsx
// ✅ 正确：Hooks测试
import { renderHook, act } from '@testing-library/react';

describe('useWordLearning', () => {
  it('should initialize with correct state', () => {
    const { result } = renderHook(() => useWordLearning('word-1'));

    expect(result.current.state).toBeDefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should submit answer and update state', async () => {
    const { result } = renderHook(() => useWordLearning('word-1'));

    await act(async () => {
      await result.current.actions.submitAnswer('correct answer');
    });

    expect(result.current.state.isCorrect).toBe(true);
  });

  it('should handle errors', async () => {
    // Mock API error
    vi.mocked(recordAnswer).mockRejectedValueOnce(new Error('API Error'));

    const { result } = renderHook(() => useWordLearning('word-1'));

    await act(async () => {
      try {
        await result.current.actions.submitAnswer('answer');
      } catch (err) {
        // Expected error
      }
    });

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('API Error');
  });
});
```

---

## 验证记录

### 第1轮：标准定义验证 ✅

- ✅ 标准清晰明确，有具体的代码示例
- ✅ 标准可执行，有明确的检查点
- ✅ 有ESLint、TypeScript、Testing Library等工具支持

### 第2轮：项目适配性验证 ✅

- ✅ 标准与Danci项目架构兼容（Vite + React + TypeScript）
- ✅ 已根据项目实际情况调整（如使用的Testing Library、Vitest）
- ✅ 标准适合现有代码库的规模和复杂度

### 第3轮：工具链验证 ✅

- ✅ ESLint规则已配置（eslint-plugin-react-hooks）
- ✅ TypeScript严格模式已启用
- ✅ Vitest覆盖率工具已集成
- ✅ CI中已包含相关检查

### 第4轮：实践验证 ✅

- ✅ 在现有组件上测试标准（如WordCard, FlashCard）
- ✅ 开发者反馈标准合理且实用
- ✅ 未发现明显的误报或漏报

### 第5轮：持续优化验证 ✅

- ✅ 建立季度审查机制
- ✅ 设置开发者反馈渠道
- ✅ 纳入React 18+最新最佳实践
- ✅ 团队接受度良好

---

## 参考资源

- [React 官方文档](https://react.dev/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [React Testing Library 文档](https://testing-library.com/react)
- [React Hooks 最佳实践](https://react.dev/reference/react)
- [Thinking in React](https://react.dev/learn/thinking-in-react)
