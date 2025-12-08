# API 文档

## 概述

本文档描述 Danci 项目的前端 API 客户端使用指南。项目采用模块化的 API 客户端架构，通过 React Query 进行状态管理。

## API 客户端架构

### 模块化客户端结构

```
services/client/
├── base/
│   ├── BaseClient.ts      # 基础客户端类（HTTP 请求封装）
│   └── TokenManager.ts    # JWT Token 管理
├── auth/
│   └── AuthClient.ts      # 认证相关 API
├── word/
│   └── WordClient.ts      # 单词相关 API
├── wordbook/
│   └── WordBookClient.ts  # 词书相关 API
├── learning/
│   └── LearningClient.ts  # 学习相关 API
├── amas/
│   └── AmasClient.ts      # AMAS 智能学习 API
├── admin/
│   └── AdminClient.ts     # 管理后台 API
├── llm/
│   └── LLMAdvisorClient.ts # LLM 顾问 API
└── index.ts               # 统一导出
```

### 使用方式

```typescript
// 推荐：从统一入口导入
import {
  authClient,
  wordClient,
  wordBookClient,
  learningClient,
  amasClient,
  adminClient,
  llmAdvisorClient,
} from '@/services/client';

// 示例：用户登录
const { user, token } = await authClient.login(email, password);

// 示例：获取单词列表
const words = await wordClient.getWords();
```

## BaseClient 基类

所有 API 客户端继承自 `BaseClient`，提供统一的请求处理能力。

### 核心功能

```typescript
abstract class BaseClient {
  // HTTP 请求方法
  protected async request<T>(endpoint: string, options?: RequestInit, timeout?: number): Promise<T>;

  // 返回完整响应体（包含分页信息）
  protected async requestFull<T>(
    endpoint: string,
    options?: RequestInit,
    timeout?: number,
  ): Promise<T>;

  // 设置 401 未授权回调
  setOnUnauthorized(callback: (() => void) | null): void;
}
```

### 请求特性

| 特性        | 说明                          |
| ----------- | ----------------------------- |
| 自动认证    | 自动附加 JWT Token 到请求头   |
| 超时控制    | 默认 30 秒超时，支持自定义    |
| 错误处理    | 统一的错误格式和 401 自动处理 |
| 请求取消    | 支持 AbortController 取消请求 |
| Cookie 凭证 | 启用 `credentials: 'include'` |

## 错误处理

### ApiError 类

```typescript
class ApiError extends Error {
  statusCode: number; // HTTP 状态码
  code: string; // 业务错误码
  isNotFound: boolean; // 是否为 404 错误

  constructor(message: string, statusCode: number, code?: string);
}
```

### 错误处理示例

```typescript
import { ApiError } from '@/services/client/base/BaseClient';

try {
  const data = await wordClient.getWordLearningState(wordId);
} catch (error) {
  if (error instanceof ApiError) {
    if (error.isNotFound) {
      // 数据不存在，返回默认值
      return null;
    }
    if (error.statusCode === 401) {
      // 未授权，已自动触发登出
      return;
    }
    // 其他业务错误
    console.error(`API Error [${error.code}]: ${error.message}`);
  }
  throw error;
}
```

### 错误码约定

| 错误码             | 说明                       |
| ------------------ | -------------------------- |
| `UNAUTHORIZED`     | 认证失败，Token 无效或过期 |
| `NOT_FOUND`        | 请求的资源不存在           |
| `VALIDATION_ERROR` | 请求参数验证失败           |
| `FORBIDDEN`        | 无权限访问                 |
| `CONFLICT`         | 资源冲突（如重复创建）     |
| `UNKNOWN_ERROR`    | 未知错误                   |

## 认证机制

### Token 管理

```typescript
// TokenManager 单例模式
const tokenManager = TokenManager.getInstance();

// 获取当前 Token
const token = tokenManager.getToken();

// 设置 Token
tokenManager.setToken(token);

// 清除 Token
tokenManager.clearToken();

// 检查 Token 是否过期
const isExpired = tokenManager.isTokenExpired();
```

### 认证流程

```
1. 用户登录 → authClient.login()
2. 获取 Token → 存储到 localStorage
3. 后续请求 → 自动附加 Authorization header
4. Token 过期 → 401 响应 → 自动清除 Token → 触发 onUnauthorized 回调
5. 用户登出 → authClient.logout() → 清除 Token
```

### AuthClient API

```typescript
interface AuthClient {
  // 用户注册
  register(email: string, password: string, username: string): Promise<AuthResponse>;

  // 用户登录
  login(email: string, password: string): Promise<AuthResponse>;

  // 用户登出
  logout(): Promise<void>;

  // 获取当前用户信息
  getCurrentUser(): Promise<User>;

  // Token 管理
  setToken(token: string): void;
  clearToken(): void;
  getToken(): string | null;
}

interface AuthResponse {
  user: User;
  token: string;
}
```

## 各模块 API 说明

### 单词模块 (WordClient)

```typescript
interface WordClient {
  // 获取用户单词列表
  getWords(): Promise<Word[]>;

  // 获取已学���的单词
  getLearnedWords(): Promise<Word[]>;

  // 创建单词
  createWord(wordData: CreateWordInput): Promise<Word>;

  // 更新单词
  updateWord(wordId: string, wordData: UpdateWordInput): Promise<Word>;

  // 删除单词
  deleteWord(wordId: string): Promise<void>;

  // 批量创建单词
  batchCreateWords(words: CreateWordInput[]): Promise<Word[]>;

  // 搜索单词
  searchWords(query: string, limit?: number): Promise<WordWithBook[]>;

  // 获取单词学习状态
  getWordLearningState(wordId: string): Promise<WordLearningState | null>;

  // 批量获取学习状态
  getWordLearningStates(wordIds: string[]): Promise<WordLearningState[]>;

  // 保存学习状态
  saveWordLearningState(state: WordLearningState): Promise<void>;

  // 获取单词得分
  getWordScore(wordId: string): Promise<WordScore | null>;

  // 批量获取得分
  getWordScores(wordIds: string[]): Promise<WordScore[]>;
}
```

### 词书模块 (WordBookClient)

```typescript
interface WordBookClient {
  // 获取用户词书
  getUserWordBooks(): Promise<WordBook[]>;

  // 获取系统词书
  getSystemWordBooks(): Promise<WordBook[]>;

  // 获取所有可用词书
  getAllAvailableWordBooks(): Promise<WordBook[]>;

  // 获取词书详情
  getWordBookById(id: string): Promise<WordBook>;

  // 创建词书
  createWordBook(data: CreateWordBookInput): Promise<WordBook>;

  // 更新词书
  updateWordBook(id: string, data: UpdateWordBookInput): Promise<WordBook>;

  // 删除词书
  deleteWordBook(id: string): Promise<void>;

  // 获取词书中的单词
  getWordBookWords(wordBookId: string): Promise<Word[]>;

  // 添加单词到词书
  addWordToWordBook(wordBookId: string, wordData: CreateWordInput): Promise<Word>;

  // 从词书删除单词
  removeWordFromWordBook(wordBookId: string, wordId: string): Promise<void>;

  // 批量导入单词
  batchImportWords(wordBookId: string, words: CreateWordInput[]): Promise<ImportResult>;
}
```

### 学习模块 (LearningClient)

```typescript
interface LearningClient {
  // 获取学习配置
  getStudyConfig(): Promise<StudyConfig>;

  // 更新学习配置
  updateStudyConfig(data: UpdateStudyConfigInput): Promise<StudyConfig>;

  // 获取今日学习单词
  getTodayWords(): Promise<TodayWordsResponse>;

  // 获取学习进度
  getStudyProgress(): Promise<StudyProgress>;

  // 获取掌握模式学习单词
  getMasteryStudyWords(targetCount?: number): Promise<MasteryStudyResponse>;

  // 动态获取下一批单词
  getNextWords(params: NextWordsParams): Promise<NextWordsResponse>;

  // 创建学习会话
  createMasterySession(targetMasteryCount: number): Promise<{ sessionId: string }>;

  // 同步学习进度
  syncMasteryProgress(data: SyncProgressInput): Promise<void>;

  // 动态调整学习队列
  adjustLearningWords(params: AdjustWordsParams): Promise<AdjustWordsResponse>;

  // 创建学习记录
  createRecord(recordData: CreateRecordInput): Promise<AnswerRecord>;

  // 批量创建记录
  batchCreateRecords(records: CreateRecordInput[]): Promise<AnswerRecord[]>;

  // 获取学习记录（分页）
  getRecords(options?: PaginationOptions): Promise<PaginatedRecords>;
}
```

### AMAS 模块 (AmasClient)

```typescript
interface AmasClient {
  // 处理学习事件
  processLearningEvent(eventData: LearningEventInput): Promise<AmasProcessResult>;

  // 获取用户 AMAS 状态
  getAmasState(): Promise<UserState | null>;

  // 获取学习策略
  getAmasStrategy(): Promise<LearningStrategy | null>;

  // 重置 AMAS 状态
  resetAmasState(): Promise<void>;

  // 获取冷启动阶段
  getAmasColdStartPhase(): Promise<ColdStartPhaseInfo>;

  // 批量处理事件
  batchProcessEvents(events: LearningEventInput[]): Promise<BatchProcessResult>;

  // 时间偏好分析
  getTimePreferences(): Promise<TimePreferenceResponse>;

  // 获取黄金学习时间
  getGoldenTime(): Promise<GoldenTimeResult>;

  // 获取趋势状态
  getCurrentTrend(): Promise<TrendInfo>;

  // 获取趋势历史
  getTrendHistory(days?: number): Promise<TrendHistoryResponse>;

  // 获取趋势报告
  getTrendReport(): Promise<TrendReport>;

  // 获取干预建议
  getIntervention(): Promise<InterventionResult>;

  // 获取状态历史
  getStateHistory(range?: DateRangeOption): Promise<StateHistoryResponse>;

  // 获取认知成长对比
  getCognitiveGrowth(range?: DateRangeOption): Promise<CognitiveGrowthResponse>;

  // 获取决策解释
  getAmasDecisionExplanation(decisionId?: string): Promise<DecisionExplanation>;

  // 反事实分析
  runCounterfactualAnalysis(input: CounterfactualInput): Promise<CounterfactualResult>;

  // 获取学习曲线
  getAmasLearningCurve(days?: number): Promise<LearningCurveData>;
}
```

### 管理模块 (AdminClient)

```typescript
interface AdminClient {
  // 用户管理
  adminGetUsers(params?: AdminUsersParams): Promise<AdminUsersResponse>;
  adminGetUserById(userId: string): Promise<User>;
  adminGetUserStatistics(userId: string): Promise<UserDetailedStatistics>;
  adminUpdateUserRole(userId: string, role: UserRole): Promise<User>;
  adminDeleteUser(userId: string): Promise<void>;

  // 系统统计
  adminGetStatistics(): Promise<AdminStatistics>;

  // 词库管理
  adminGetSystemWordBooks(): Promise<WordBook[]>;
  adminCreateSystemWordBook(data: CreateWordBookInput): Promise<WordBook>;
  adminUpdateSystemWordBook(id: string, data: UpdateWordBookInput): Promise<WordBook>;
  adminDeleteSystemWordBook(id: string): Promise<void>;

  // 用户学习数据
  adminGetUserLearningData(userId: string, limit?: number): Promise<UserLearningData>;
  adminGetUserWords(userId: string, params?: UserWordsParams): Promise<UserWordsResponse>;
  adminExportUserWords(userId: string, format?: 'csv' | 'excel'): Promise<void>;

  // 实验管理
  createExperiment(data: CreateExperimentInput): Promise<Experiment>;
  getExperiments(params?: ExperimentsParams): Promise<ExperimentsResponse>;
  getExperiment(experimentId: string): Promise<ExperimentDetail>;
  getExperimentStatus(experimentId: string): Promise<ExperimentStatus>;
  startExperiment(experimentId: string): Promise<void>;
  stopExperiment(experimentId: string): Promise<void>;
  deleteExperiment(experimentId: string): Promise<void>;

  // 算法配置
  getAlgorithmConfig(): Promise<AlgorithmConfig>;
  updateAlgorithmConfig(
    configId: string,
    config: Partial<AlgorithmConfig>,
    reason?: string,
  ): Promise<AlgorithmConfig>;
  resetAlgorithmConfig(configId: string): Promise<AlgorithmConfig>;
  getConfigHistory(limit?: number): Promise<ConfigHistory[]>;
}
```

## React Query Hooks

### 查询 Hooks (queries/)

```typescript
// 单词相关
import { useWords } from '@/hooks/queries/useWords';
import { useLearnedWords } from '@/hooks/queries/useLearnedWords';
import { useWordSearch } from '@/hooks/queries/useWordSearch';
import { useWordDetail } from '@/hooks/queries/useWordDetail';

// 词书相关
import { useWordBooks, useWordBookDetail, useWordBookWords } from '@/hooks/queries/useWordBooks';

// AMAS 相关
import { useAmasState } from '@/hooks/queries/useAmasState';
import { useAmasExplanation } from '@/hooks/queries/useAmasExplanation';

// 统计相关
import { useStatistics } from '@/hooks/queries/useStatistics';
import { useUserStatistics } from '@/hooks/queries/useUserStatistics';
import { useStudyProgress } from '@/hooks/queries/useStudyProgress';

// 成就相关
import { useBadges } from '@/hooks/queries/useBadges';
import { useAchievements } from '@/hooks/queries/useAchievements';

// 管理员
import { useAdminUsers, useAdminStatistics } from '@/hooks/queries';
```

### 变更 Hooks (mutations/)

```typescript
// 答题提交
import { useSubmitAnswer } from '@/hooks/mutations/useSubmitAnswer';

// 单词操作
import { useWordMutations } from '@/hooks/mutations/useWordMutations';

// 词书操作
import { useWordBookMutations } from '@/hooks/mutations/useWordBookMutations';

// 配置操作
import { useConfigMutations } from '@/hooks/mutations/useConfigMutations';

// 批量操作
import { useBatchOperations } from '@/hooks/mutations/useBatchOperations';

// 数据导出
import { useExportData } from '@/hooks/mutations/useExportData';
```

### 使用示例

```typescript
// 查询示例
function WordList() {
  const { data: words, isLoading, error, refetch } = useWords();

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {words?.map(word => (
        <li key={word.id}>{word.spelling}</li>
      ))}
    </ul>
  );
}

// 变更示例
function AnswerButton({ wordId, answer }) {
  const { submitAnswer, isSubmitting } = useSubmitAnswer({
    onSuccess: (result) => {
      console.log('答题成功', result);
    },
    onError: (error) => {
      console.error('答题失败', error);
    },
  });

  return (
    <button
      onClick={() => submitAnswer({ wordId, selectedAnswer: answer })}
      disabled={isSubmitting}
    >
      {isSubmitting ? '提交中...' : answer}
    </button>
  );
}
```

## API 响应格式

### 标准响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
```

### 分页响应格式

```typescript
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

## 最佳实践

### 1. 使用 React Query Hooks

```typescript
// 推荐：使用封装好的 Hook
const { data, isLoading } = useWords();

// 不推荐：直接调用 API
const [words, setWords] = useState([]);
useEffect(() => {
  wordClient.getWords().then(setWords);
}, []);
```

### 2. 错误边界处理

```typescript
// 在组件中处理错误
function WordList() {
  const { data, error, isError } = useWords();

  if (isError) {
    if (error instanceof ApiError && error.statusCode === 403) {
      return <NoPermission />;
    }
    return <ErrorMessage error={error} />;
  }

  return <WordListContent words={data} />;
}
```

### 3. 乐观更新

```typescript
const mutation = useWordMutations();

// 使用乐观更新提升用户体验
mutation.mutate(newWord, {
  onMutate: async (newWord) => {
    await queryClient.cancelQueries(['words']);
    const previousWords = queryClient.getQueryData(['words']);
    queryClient.setQueryData(['words'], (old) => [...old, newWord]);
    return { previousWords };
  },
  onError: (err, newWord, context) => {
    queryClient.setQueryData(['words'], context.previousWords);
  },
});
```

### 4. 请求取消

```typescript
// React Query 自动处理组件卸载时的请求取消
const { data } = useQuery({
  queryKey: ['words'],
  queryFn: ({ signal }) => wordClient.getWords({ signal }),
});
```

## 相关文档

- [架构文档](./ARCHITECTURE.md)
- [状态管理文档](./STATE_MANAGEMENT.md)
- [开发指南](./DEVELOPMENT.md)
