# React Hooks 状态管理最佳实践指南

## 快速决策树：何时使用什么？

```
你的 Hook 有复杂的状态逻辑吗？
    │
    ├─ 否 ──→ 使用 useState
    │         简单、直接、易懂
    │
    └─ 是 ──→ 有多少个相关状态？
              │
              ├─ 2-3 个 ──→ useState 仍然可以
              │             但要注意是否应该组合
              │
              └─ 4+ 个 ──→ 状态之间有复杂的依赖关系吗？
                          │
                          ├─ 否 ──→ 考虑拆分成多个小 Hook
                          │
                          └─ 是 ──→ 是否有明确的状态转换逻辑？
                                    │
                                    ├─ 是 ──→ 使用 useReducer ✅
                                    │         (推荐用于本项目)
                                    │
                                    └─ 否，但非常复杂 ──→ 考虑 XState
                                                        (仅用于极复杂场景)
```

---

## 1. 代码审查检查清单

### 1.1 状态管理检查

#### ⚠️ 警告信号（需要重构）

| 检查项           | 阈值  | 当前值 | 状态    |
| ---------------- | ----- | ------ | ------- |
| useState 数量    | < 5   | 4      | ✅ 健康 |
| useRef 数量      | < 5   | 10+    | ❌ 超标 |
| useCallback 数量 | < 5   | 8      | ⚠️ 边界 |
| useEffect 数量   | < 5   | 5      | ⚠️ 边界 |
| 代码行数         | < 200 | 278    | ❌ 超标 |
| 循环复杂度       | < 15  | 20+    | ❌ 超标 |

#### ✅ 健康指标

- [ ] 单一职责：Hook 只做一件事
- [ ] 清晰命名：函数和变量名能自解释
- [ ] 无循环依赖：A 不依赖 B，B 也不依赖 A
- [ ] 状态最小化：只存储必要的派生状态
- [ ] 副作用隔离：useEffect 职责单一

### 1.2 Ref 使用检查

#### ✅ 合理使用 Ref

```typescript
// 1. 存储 DOM 引用
const inputRef = useRef<HTMLInputElement>(null);

// 2. 存储定时器 ID
const timerRef = useRef<NodeJS.Timeout | null>(null);

// 3. 存储不需要触发渲染的值
const requestIdRef = useRef(0);

// 4. 存储前一个值用于比较
const prevValueRef = useRef(value);
useEffect(() => {
  if (prevValueRef.current !== value) {
    // 值变化了
  }
  prevValueRef.current = value;
}, [value]);

// 5. 存储不可变的实例（如第三方库实例）
const chartRef = useRef<Chart | null>(null);
```

#### ❌ 不合理使用 Ref（需要重构）

```typescript
// ❌ 1. 用 ref 避免依赖循环
const callbackRef = useRef<() => void>(() => {});
const callback = useCallback(() => {
  // 逻辑
}, [dependency]);
callbackRef.current = callback; // 不好！

// 替代方案: 使用 useReducer
const [state, dispatch] = useReducer(reducer, initialState);
const callback = useCallback(() => {
  dispatch({ type: 'ACTION' });
}, []); // dispatch 是稳定的

// ❌ 2. 用 ref 存储应该触发渲染的状态
const dataRef = useRef(data);
dataRef.current = data; // 不好！

// 替代方案: 直接用 state
const [data, setData] = useState(initialData);

// ❌ 3. 用 ref 存储子组件的状态
const childStateRef = useRef(childState);

// 替代方案: 状态提升或使用 Context
```

### 1.3 依赖数组检查

#### ✅ 正确的依赖

```typescript
// 1. 完整的依赖列表
useEffect(() => {
  doSomething(a, b, c);
}, [a, b, c]); // 所有用到的外部变量

// 2. 空依赖数组（确实只需要执行一次）
useEffect(() => {
  const subscription = subscribeToAPI();
  return () => subscription.unsubscribe();
}, []); // 确实不依赖任何外部变量

// 3. 使用 useCallback 稳定函数引用
const stableCallback = useCallback(() => {
  doSomething(value);
}, [value]);

useEffect(() => {
  stableCallback();
}, [stableCallback]); // 依赖稳定的 callback
```

#### ❌ 错误的依赖

```typescript
// ❌ 1. 遗漏依赖
useEffect(() => {
  doSomething(a, b, c);
}, [a]); // 忘记了 b 和 c

// ❌ 2. 故意遗漏依赖来避免问题
useEffect(() => {
  doSomething(value);
}, []); // eslint-disable-next-line react-hooks/exhaustive-deps
// 不好！应该解决根本问题

// ❌ 3. 包含不必要的依赖
useEffect(() => {
  doSomething();
}, [value]); // value 没有在 effect 中使用
```

---

## 2. 常见模式与反模式

### 2.1 状态更新模式

#### ✅ 不可变更新

```typescript
// 对象
setState({
  ...state,
  nested: {
    ...state.nested,
    value: newValue,
  },
});

// 数组
setArray([...array, newItem]);
setArray(array.filter((item) => item.id !== id));
setArray(array.map((item) => (item.id === id ? { ...item, ...updates } : item)));
```

#### ❌ 可变更新

```typescript
// ❌ 直接修改
state.value = newValue; // 不会触发渲染
setState(state);

// ❌ 直接修改数组
array.push(newItem); // 不会触发渲染
setArray(array);
```

### 2.2 异步更新模式

#### ✅ 使用函数式更新

```typescript
// 当新状态依赖旧状态时
setCount((prev) => prev + 1);

// 在异步回调中
setTimeout(() => {
  setCount((prev) => prev + 1); // 总是获取最新值
}, 1000);
```

#### ❌ 直接使用状态值

```typescript
// ❌ 可能使用过期的值
setTimeout(() => {
  setCount(count + 1); // count 可能是旧值
}, 1000);
```

### 2.3 派生状态模式

#### ✅ 计算派生状态

```typescript
function TodoList({ todos }) {
  // 不需要存储 completedCount，直接计算
  const completedCount = todos.filter((todo) => todo.completed).length;

  return <div>已完成: {completedCount}</div>;
}
```

#### ❌ 存储派生状态

```typescript
// ❌ 不必要的状态
function TodoList({ todos }) {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    setCompletedCount(todos.filter((todo) => todo.completed).length);
  }, [todos]);

  return <div>已完成: {completedCount}</div>;
}
```

### 2.4 条件 Effect 模式

#### ✅ 在 Effect 内部判断

```typescript
useEffect(() => {
  if (shouldRun) {
    doSomething();
  }
}, [shouldRun, dependency]);
```

#### ❌ 条件 Hook

```typescript
// ❌ 违反 Hooks 规则
if (shouldRun) {
  useEffect(() => {
    doSomething();
  }, [dependency]);
}
```

---

## 3. 性能优化检查清单

### 3.1 避免不必要的渲染

#### ✅ 使用 React.memo

```typescript
const ExpensiveComponent = React.memo(({ data }) => {
  // 只在 data 变化时重渲染
  return <div>{/* 复杂的渲染逻辑 */}</div>;
});
```

#### ✅ 使用 useMemo

```typescript
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);
```

#### ✅ 使用 useCallback

```typescript
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

return <ChildComponent onClick={handleClick} />;
```

### 3.2 批量更新

#### ✅ 使用 useReducer

```typescript
// 多个相关状态一次更新
dispatch({
  type: 'UPDATE_ALL',
  payload: { session, queue, ui },
});
```

#### ❌ 多次 setState

```typescript
// ❌ 触发 3 次渲染
setSession(newSession);
setQueue(newQueue);
setUi(newUi);
```

---

## 4. 测试检查清单

### 4.1 Reducer 测试

```typescript
describe('reducer', () => {
  it('应该处理每个 action', () => {
    // ✅ 测试所有分支
    const state = reducer(initialState, action);
    expect(state).toEqual(expectedState);
  });

  it('应该保持状态不可变', () => {
    // ✅ 确保不修改原状态
    const state = reducer(initialState, action);
    expect(initialState).toEqual(originalInitialState);
  });

  it('应该处理未知 action', () => {
    // ✅ 测试默认情况
    const state = reducer(initialState, { type: 'UNKNOWN' });
    expect(state).toBe(initialState);
  });
});
```

### 4.2 Hook 测试

```typescript
describe('useMyHook', () => {
  it('应该正确初始化', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(initialValue);
  });

  it('应该处理异步操作', async () => {
    const { result } = renderHook(() => useMyHook());

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.data).toBeDefined();
  });

  it('应该清理副作用', () => {
    const { unmount } = renderHook(() => useMyHook());
    unmount();
    // 验证清理逻辑
  });
});
```

---

## 5. 重构步骤清单

### 阶段 1: 识别问题

- [ ] 运行代码复杂度分析工具
- [ ] 统计 useState/useRef/useCallback 数量
- [ ] 绘制状态依赖图
- [ ] 识别循环依赖
- [ ] 评估测试覆盖率

### 阶段 2: 设计方案

- [ ] 选择合适的状态管理方案
- [ ] 设计新的状态结构
- [ ] 定义 action types
- [ ] 设计 reducer 函数
- [ ] 评审设计文档

### 阶段 3: 编写测试

- [ ] 编写 reducer 单元测试
- [ ] 达到 100% 分支覆盖率
- [ ] 编写 Hook 集成测试
- [ ] 编写 E2E 测试

### 阶段 4: 实施重构

- [ ] 创建新的目录结构
- [ ] 实现 reducer
- [ ] 重构主 Hook
- [ ] 保持 API 向后兼容
- [ ] 代码审查

### 阶段 5: 灰度发布

- [ ] 使用 Feature Flag
- [ ] 5% 用户测试 (3 天)
- [ ] 25% 用户测试 (1 周)
- [ ] 100% 全量发布
- [ ] 监控指标

### 阶段 6: 清理

- [ ] 移除旧代码
- [ ] 移除 Feature Flag
- [ ] 更新文档
- [ ] 团队培训
- [ ] 发布 Release Notes

---

## 6. 监控指标

### 6.1 性能指标

| 指标              | 目标    | 当前  | 状态      |
| ----------------- | ------- | ----- | --------- |
| 首次渲染时间      | < 100ms | 150ms | ⚠️ 需优化 |
| 答案提交延迟      | < 50ms  | 80ms  | ⚠️ 需优化 |
| 平均渲染次数/操作 | < 3     | 5     | ❌ 超标   |
| 内存占用          | < 3MB   | 5MB   | ⚠️ 需优化 |

### 6.2 质量指标

| 指标              | 目标  | 当前 | 状态      |
| ----------------- | ----- | ---- | --------- |
| 测试覆盖率        | > 85% | 70%  | ⚠️ 需提升 |
| TypeScript 覆盖率 | 100%  | 95%  | ⚠️ 需提升 |
| ESLint 警告       | 0     | 5    | ⚠️ 需修复 |
| 循环复杂度        | < 15  | 20+  | ❌ 超标   |

### 6.3 业务指标

| 指标       | 目标    | 当前  | 状态      |
| ---------- | ------- | ----- | --------- |
| 错误率     | < 0.1%  | 0.3%  | ⚠️ 需降低 |
| 会话完成率 | > 90%   | 85%   | ⚠️ 需提升 |
| 用户满意度 | > 4.5/5 | 4.2/5 | ⚠️ 需提升 |

---

## 7. 常见问题 FAQ

### Q1: 何时应该使用 useReducer 而不是 useState？

**A:** 当满足以下任一条件时：

1. 有 4+ 个相关的 state
2. 下一个 state 依赖前一个 state
3. 状态更新逻辑复杂（多个条件）
4. 状态在多个 event handler 中更新
5. 想要测试状态逻辑（reducer 是纯函数）

### Q2: useReducer 会影响性能吗？

**A:** 不会。实际上可能更好：

- 减少重渲染次数（批量更新）
- dispatch 是稳定的，不会导致依赖变化
- 更容易优化（使用 useMemo/useCallback）

### Q3: 如何决定什么应该放在 state，什么应该放在 ref？

**A:** 简单规则：

- **需要触发渲染** → useState/useReducer
- **不需要触发渲染** → useRef
- **派生数据** → 直接计算，不存储

### Q4: 为什么要避免在依赖数组中遗漏依赖？

**A:**

- 会导致闭包陷阱（使用过期的值）
- 导致 bug 难以追踪
- 违反 React Hooks 规则

**正确做法**：

1. 安装 `eslint-plugin-react-hooks`
2. 不要禁用警告
3. 如果警告，重构代码而不是忽略

### Q5: 如何测试使用 useReducer 的组件？

**A:** 分层测试：

1. **Reducer 单元测试**（纯函数，最容易）
2. **Hook 集成测试**（使用 @testing-library/react-hooks）
3. **组件测试**（使用 @testing-library/react）

---

## 8. 工具推荐

### 8.1 代码质量工具

```bash
# 安装依赖
npm install -D eslint-plugin-react-hooks
npm install -D @typescript-eslint/eslint-plugin

# ESLint 配置
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

### 8.2 性能分析工具

```typescript
// React DevTools Profiler
import { Profiler } from 'react';

<Profiler id="MasteryLearning" onRender={onRenderCallback}>
  <MasteryLearningComponent />
</Profiler>;

function onRenderCallback(
  id, // "MasteryLearning"
  phase, // "mount" 或 "update"
  actualDuration // 本次渲染耗时
) {
  console.log(`${id} ${phase} took ${actualDuration}ms`);
}
```

### 8.3 测试工具

```typescript
// @testing-library/react-hooks
import { renderHook, act } from '@testing-library/react-hooks';

// Vitest
import { describe, it, expect, vi } from 'vitest';
```

---

## 9. 快速参考卡片

### Hook 使用决策表

| 需求         | 使用          |
| ------------ | ------------- |
| 简单值状态   | `useState`    |
| 复杂状态逻辑 | `useReducer`  |
| 副作用       | `useEffect`   |
| 昂贵计算     | `useMemo`     |
| 稳定回调     | `useCallback` |
| DOM 引用     | `useRef`      |
| 跨组件状态   | `Context`     |

### 常用代码片段

```typescript
// 1. useReducer 模板
const [state, dispatch] = useReducer(
  (state, action) => {
    switch (action.type) {
      case 'ACTION_NAME':
        return { ...state, ...action.payload };
      default:
        return state;
    }
  },
  { initialValue: 'value' },
);

// 2. 清理副作用
useEffect(() => {
  const cleanup = setupSomething();
  return () => cleanup();
}, [dependency]);

// 3. 防止内存泄漏
useEffect(() => {
  let isMounted = true;

  fetchData().then((data) => {
    if (isMounted) {
      setData(data);
    }
  });

  return () => {
    isMounted = false;
  };
}, []);

// 4. 防抖/节流
const debouncedValue = useMemo(() => debounce(value, 500), [value]);

// 5. 前一个值
const prevValue = useRef(value);
useEffect(() => {
  if (prevValue.current !== value) {
    // 值变化了
  }
  prevValue.current = value;
}, [value]);
```

---

## 10. 总结

### 核心原则

1. **简单优先**：能用 useState 就用 useState
2. **职责单一**：一个 Hook 只做一件事
3. **无副作用**：Reducer 必须是纯函数
4. **不可变更新**：永远不要直接修改 state
5. **完整依赖**：不要遗漏 useEffect 的依赖
6. **测试驱动**：重构前先写测试

### 何时重构

出现以下信号时考虑重构：

- ⚠️ 5+ 个 useState
- ⚠️ 5+ 个 useRef（避免依赖）
- ⚠️ 循环依赖
- ⚠️ 测试覆盖率 < 80%
- ⚠️ 代码行数 > 200

### 推荐阅读

- [React 官方文档 - Hooks](https://react.dev/reference/react)
- [useReducer vs useState](https://react.dev/reference/react/useReducer#comparing-usestate-and-usereducer)
- [React Hooks 最佳实践](https://react.dev/learn/reusing-logic-with-custom-hooks)
