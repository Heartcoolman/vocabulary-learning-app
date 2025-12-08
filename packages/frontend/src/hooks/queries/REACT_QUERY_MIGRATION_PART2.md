# React Query 迁移第二部分 - 完成总结

## 概述

本次迁移将以下 CRUD API 迁移到 React Query：

1. **词书 API** - `useWordBooks.ts`
2. **学习记录 API** - `useLearningRecords.ts`
3. **用户统计 API** - `useUserStats.ts`

---

## 1. 词书 API (useWordBooks.ts)

### 已有 Query Hooks

- `useSystemWordBooks(options?)` - 获取系统词书列表
- `useUserWordBooks(options?)` - 获取用户词书列表
- `useAllAvailableWordBooks(options?)` - 获取所有可用词书
- `useWordBook(id, options?)` - 获取单个词书详情
- `useWordBookWords(wordBookId, options?)` - 获取词书中的单词列表
- `useSearchWords(query, limit?)` - 搜索单词

### 新增 Query Hooks

- `useWordBooks(filters?, options?)` - 通用词书列表查询（支持类型过滤）

### 新增类型

```typescript
interface WordBooksFilterOptions {
  type?: 'system' | 'user' | 'all';
}

interface UseWordBooksOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}
```

### 新增辅助函数

- `prefetchWordBooks(queryClient, filters?)` - 预取词书列表
- `prefetchWordBook(queryClient, id)` - 预取单个词书
- `prefetchWordBookWords(queryClient, wordBookId)` - 预取词书单词
- `invalidateWordBooksCache(queryClient, wordBookId?)` - 使缓存失效

### 使用示例

```tsx
import { useWordBooks, useWordBook } from '@/hooks/queries';

function WordBookList() {
  // 获取所有词书
  const { data: wordBooks, isLoading } = useWordBooks({ type: 'all' });

  // 获取特定词书详情
  const { data: wordBook } = useWordBook('book-123');

  // ...
}
```

---

## 2. 学习记录 API (useLearningRecords.ts)

### Query Hooks

- `useLearningRecords(options?, queryOptions?)` - 获取学习记录（分页）
- `useProgress(queryOptions?)` - 获取学习进度
- `useStudyProgressQuery` - useProgress 的别名

### Mutation Hooks

- `useCreateLearningRecord(options?)` - 创建单条学习记录
- `useBatchCreateRecords(options?)` - 批量创建学习记录
- `useSubmitAnswerMutation(options?)` - 提交答案（简化版，自动添加时间戳）

### 类型定义

```typescript
interface LearningRecordsOptions {
  page?: number;
  pageSize?: number;
}

interface LearningRecordsResult {
  records: AnswerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CreateRecordInput {
  wordId: string;
  timestamp: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTime?: number;
  dwellTime?: number;
  sessionId?: string;
  masteryLevelBefore?: number;
  masteryLevelAfter?: number;
}

interface SubmitAnswerInput {
  wordId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTime?: number;
  dwellTime?: number;
}
```

### 辅助函数

- `prefetchLearningRecords(queryClient, options?)` - 预取学习记录
- `prefetchProgress(queryClient)` - 预取学习进度
- `invalidateLearningRecordsCache(queryClient)` - 使缓存失效
- `learningRecordsKeys` - 查询键工厂

### 使用示例

```tsx
import { useLearningRecords, useProgress, useSubmitAnswerMutation } from '@/hooks/queries';

function LearningPage() {
  // 获取学习记录
  const { data: recordsData, isLoading } = useLearningRecords({ page: 1, pageSize: 20 });

  // 获取学习进度
  const { data: progress } = useProgress();

  // 提交答案
  const { mutate: submitAnswer, isPending } = useSubmitAnswerMutation({
    onSuccess: (record) => {
      console.log('答案已提交', record);
    },
  });

  const handleAnswer = (wordId: string, answer: string, correctAnswer: string) => {
    submitAnswer({
      wordId,
      selectedAnswer: answer,
      correctAnswer,
      isCorrect: answer === correctAnswer,
      responseTime: 2500,
    });
  };

  // ...
}
```

---

## 3. 用户统计 API (useUserStats.ts)

### Query Hooks

- `useUserStats(options?)` - 获取用户基础统计
- `useFullUserStats(options?)` - 获取完整用户统计（包含趋势和热力图）
- `useDailyStats(date, options?)` - 获取指定日期的统计
- `useDailyStatsRange(startDate, endDate, options?)` - 获取日期范围统计
- `useWeeklyTrend(options?)` - 获取最近一周趋势

### 类型定义

```typescript
interface UserStats {
  totalWords: number;
  totalRecords: number;
  correctRate: number;
}

interface DailyStats {
  date: string;
  wordsStudied: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  studyDuration?: number;
}

interface UserLearningStats extends UserStats {
  studyDays: number;
  consecutiveDays: number;
  masteryDistribution: Array<{
    level: number;
    count: number;
  }>;
}

interface FullUserStats extends UserLearningStats {
  dailyAccuracy: DailyAccuracyPoint[];
  weekdayHeat: number[];
}

interface UseUserStatsOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
}
```

### 辅助函数

- `prefetchUserStats(queryClient)` - 预取用户统计
- `prefetchDailyStats(queryClient, date)` - 预取每日统计
- `invalidateUserStatsCache(queryClient)` - 使缓存失效
- `userStatsKeys` - 查询键工厂

### 使用示例

```tsx
import { useUserStats, useFullUserStats, useDailyStats, useWeeklyTrend } from '@/hooks/queries';

function StatisticsPage() {
  // 获取基础统计
  const { data: stats } = useUserStats();

  // 获取完整统计（包含图表数��）
  const { data: fullStats, isLoading } = useFullUserStats();

  // 获取今日统计
  const today = new Date().toISOString().split('T')[0];
  const { data: todayStats } = useDailyStats(today);

  // 获取一周趋势
  const { data: weeklyTrend } = useWeeklyTrend();

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <p>总单词数: {stats?.totalWords}</p>
      <p>连续学习: {fullStats?.consecutiveDays} 天</p>
      <MasteryChart data={fullStats?.masteryDistribution} />
      <TrendChart data={weeklyTrend} />
    </div>
  );
}
```

---

## 缓存策略

| Hook     | staleTime | gcTime | refetchInterval |
| -------- | --------- | ------ | --------------- |
| 词书列表 | 10分钟    | 15分钟 | -               |
| 词书详情 | 10分钟    | 15分钟 | -               |
| 学习记录 | 5分钟     | 30分钟 | -               |
| 学习进度 | 1分钟     | -      | 1分钟           |
| 用户统计 | 5分钟     | -      | -               |
| 完整统计 | 1分钟     | -      | 1分钟           |

---

## 缓存失效策略

### 创建学习记录后自动失效

- `learningRecordsKeys.lists()` - 学习记录列表
- `learningRecordsKeys.progress()` - 学习进度
- `queryKeys.statistics.all` - 所有统计
- `queryKeys.user.statistics()` - 用户统计

### 创建/更新词书后自动失效

- `queryKeys.wordbooks.lists()` - 词书列表
- `queryKeys.wordbooks.detail(id)` - 特定词书详情

---

## 导入方式

所有 hooks 都可以从统一入口导入：

```tsx
import {
  // 词书相关
  useWordBooks,
  useWordBook,
  useWordBookWords,
  useSystemWordBooks,
  useUserWordBooks,
  prefetchWordBooks,
  invalidateWordBooksCache,

  // 学习记录相关
  useLearningRecords,
  useProgress,
  useCreateLearningRecord,
  useSubmitAnswerMutation,
  prefetchLearningRecords,
  invalidateLearningRecordsCache,

  // 用户统计相关
  useUserStats,
  useFullUserStats,
  useDailyStats,
  useWeeklyTrend,
  prefetchUserStats,
  invalidateUserStatsCache,
} from '@/hooks/queries';
```

---

## 已有的相关 Mutation Hooks（在 mutations 目录）

词书 Mutations（`useWordBookMutations.ts`）：

- `useCreateWordBook()` - 创建词书
- `useUpdateWordBook()` - 更新词书
- `useDeleteWordBook()` - 删除词书（带乐观更新）
- `useAddWordToWordBook()` - 向词书添加单词
- `useRemoveWordFromWordBook()` - 从词书删除单词
- `useBatchImportWords()` - 批量导入单词

答题提交 Mutations（`useSubmitAnswer.ts`）：

- `useSubmitAnswer(options)` - 完整的 AMAS 集成答题提交
