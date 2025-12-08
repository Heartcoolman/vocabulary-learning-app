import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createElement, Fragment } from 'react';

// ==================== Global Toast Mock ====================

// Global mock for useToast hook to prevent "useToast must be used within a ToastProvider" errors
const mockToastFns = {
  showToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../components/ui/Toast', () => ({
  useToast: () => mockToastFns,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../components/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/ui')>();
  return {
    ...original,
    useToast: () => mockToastFns,
    ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ==================== Global Auth Mock ====================

// Global mock for useAuth hook to prevent "useAuth必须在AuthProvider内部使用" errors
const mockAuthContext = {
  user: { id: 'test-user', username: 'testuser', email: 'test@example.com' },
  token: 'mock-token',
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateUser: vi.fn(),
  refreshToken: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  AuthContext: {
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children(mockAuthContext),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  default: () => mockAuthContext,
  useAuth: () => mockAuthContext,
}));

// ==================== Global Framer Motion Mock ====================

// Helper function to create motion component mock
const createMotionComponent = (tag: string) => {
  return ({ children, ...props }: any) => {
    // Filter out framer-motion specific props
    const {
      initial,
      animate,
      exit,
      transition,
      variants,
      whileHover,
      whileTap,
      whileFocus,
      whileInView,
      layout,
      layoutId,
      drag,
      dragConstraints,
      onDrag,
      style,
      ...rest
    } = props;
    return createElement(tag, { ...rest, style }, children);
  };
};

vi.mock('framer-motion', () => ({
  motion: {
    div: createMotionComponent('div'),
    span: createMotionComponent('span'),
    p: createMotionComponent('p'),
    button: createMotionComponent('button'),
    li: createMotionComponent('li'),
    ul: createMotionComponent('ul'),
    header: createMotionComponent('header'),
    h1: createMotionComponent('h1'),
    h2: createMotionComponent('h2'),
    h3: createMotionComponent('h3'),
    section: createMotionComponent('section'),
    article: createMotionComponent('article'),
    nav: createMotionComponent('nav'),
    a: createMotionComponent('a'),
    img: createMotionComponent('img'),
    svg: createMotionComponent('svg'),
    path: createMotionComponent('path'),
    input: createMotionComponent('input'),
    form: createMotionComponent('form'),
    label: createMotionComponent('label'),
    tr: createMotionComponent('tr'),
    td: createMotionComponent('td'),
    th: createMotionComponent('th'),
    table: createMotionComponent('table'),
    tbody: createMotionComponent('tbody'),
    thead: createMotionComponent('thead'),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    createElement(Fragment, null, children),
  useAnimation: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    set: vi.fn(),
  }),
  useMotionValue: (initial: number) => ({
    get: () => initial,
    set: vi.fn(),
    onChange: vi.fn(),
  }),
  useTransform: () => ({
    get: () => 0,
    set: vi.fn(),
  }),
  useSpring: () => ({
    get: () => 0,
    set: vi.fn(),
  }),
  useInView: () => true,
  useScroll: () => ({
    scrollY: { get: () => 0 },
    scrollYProgress: { get: () => 0 },
  }),
}));

// ==================== Global Modular API Client Mock ====================

// Mock for new modular client system (/services/client/)
// These mocks provide sensible defaults to prevent test failures

vi.mock('../services/client', () => {
  const mockRequest = vi.fn(() => Promise.resolve({}));
  const mockRequestFull = vi.fn(() => Promise.resolve({ success: true, data: {} }));

  // Base mock class
  class MockBaseClient {
    protected baseUrl = 'http://localhost:3000';
    protected onUnauthorizedCallback: (() => void) | null = null;
    protected defaultTimeout = 30000;

    setOnUnauthorized = vi.fn();
    protected request = mockRequest;
    protected requestFull = mockRequestFull;
  }

  // ApiError class mock
  class MockApiError extends Error {
    statusCode: number;
    code: string;
    isNotFound: boolean;

    constructor(message: string, statusCode: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code || 'UNKNOWN_ERROR';
      this.isNotFound = statusCode === 404;
    }
  }

  // TokenManager mock
  const MockTokenManager = {
    getInstance: vi.fn(() => ({
      getToken: vi.fn(() => 'mock-token'),
      setToken: vi.fn(),
      clearToken: vi.fn(),
      isTokenExpired: vi.fn(() => false),
    })),
  };

  // Auth Client mock
  const mockAuthClient = {
    setOnUnauthorized: vi.fn(),
    login: vi.fn(() =>
      Promise.resolve({
        user: { id: 'test-user', email: 'test@example.com', username: 'testuser', role: 'USER' },
        token: 'mock-token',
      }),
    ),
    register: vi.fn(() =>
      Promise.resolve({
        user: { id: 'test-user', email: 'test@example.com', username: 'testuser', role: 'USER' },
        token: 'mock-token',
      }),
    ),
    logout: vi.fn(() => Promise.resolve()),
    getCurrentUser: vi.fn(() =>
      Promise.resolve({
        id: 'test-user',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      }),
    ),
    updatePassword: vi.fn(() => Promise.resolve()),
    refreshToken: vi.fn(() => Promise.resolve({ token: 'new-mock-token' })),
  };

  // Word Client mock
  const mockWordClient = {
    setOnUnauthorized: vi.fn(),
    getWords: vi.fn(() => Promise.resolve([])),
    getLearnedWords: vi.fn(() => Promise.resolve([])),
    createWord: vi.fn(() =>
      Promise.resolve({
        id: 'word-1',
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: [],
      }),
    ),
    updateWord: vi.fn(() =>
      Promise.resolve({
        id: 'word-1',
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: [],
      }),
    ),
    deleteWord: vi.fn(() => Promise.resolve()),
    searchWords: vi.fn(() => Promise.resolve([])),
    batchCreateWords: vi.fn(() => Promise.resolve([])),
  };

  // WordBook Client mock
  const mockWordBookClient = {
    setOnUnauthorized: vi.fn(),
    getUserWordBooks: vi.fn(() => Promise.resolve([])),
    getSystemWordBooks: vi.fn(() => Promise.resolve([])),
    getAllAvailableWordBooks: vi.fn(() => Promise.resolve([])),
    getWordBookById: vi.fn(() =>
      Promise.resolve({ id: 'wb-1', name: 'Test WordBook', wordCount: 0 }),
    ),
    createWordBook: vi.fn(() =>
      Promise.resolve({ id: 'wb-1', name: 'Test WordBook', wordCount: 0 }),
    ),
    updateWordBook: vi.fn(() =>
      Promise.resolve({ id: 'wb-1', name: 'Test WordBook', wordCount: 0 }),
    ),
    deleteWordBook: vi.fn(() => Promise.resolve()),
    getWordBookWords: vi.fn(() => Promise.resolve([])),
    addWordToWordBook: vi.fn(() => Promise.resolve({ id: 'word-1', spelling: 'test' })),
    removeWordFromWordBook: vi.fn(() => Promise.resolve()),
    getStudyConfig: vi.fn(() =>
      Promise.resolve({ id: 'config-1', selectedWordBookIds: [], dailyWordCount: 20 }),
    ),
    updateStudyConfig: vi.fn(() =>
      Promise.resolve({ id: 'config-1', selectedWordBookIds: [], dailyWordCount: 20 }),
    ),
    getTodayWords: vi.fn(() =>
      Promise.resolve({
        words: [],
        progress: {
          todayStudied: 0,
          todayTarget: 20,
          totalStudied: 0,
          correctRate: 0,
          weeklyTrend: [],
        },
      }),
    ),
    getStudyProgress: vi.fn(() =>
      Promise.resolve({
        todayStudied: 0,
        todayTarget: 20,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: [],
      }),
    ),
  };

  // Learning Client mock
  const mockLearningClient = {
    setOnUnauthorized: vi.fn(),
    getRecords: vi.fn(() =>
      Promise.resolve({
        records: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    ),
    createRecord: vi.fn(() => Promise.resolve({ id: 'record-1' })),
    batchCreateRecords: vi.fn(() => Promise.resolve([])),
    getUserStatistics: vi.fn(() =>
      Promise.resolve({ totalWords: 0, totalRecords: 0, correctRate: 0 }),
    ),
    getWordLearningState: vi.fn(() => Promise.resolve(null)),
    getWordLearningStates: vi.fn(() => Promise.resolve([])),
    saveWordLearningState: vi.fn(() => Promise.resolve()),
    deleteWordLearningState: vi.fn(() => Promise.resolve()),
    getDueWords: vi.fn(() => Promise.resolve([])),
    getWordsByState: vi.fn(() => Promise.resolve([])),
    getWordScore: vi.fn(() => Promise.resolve(null)),
    getWordScores: vi.fn(() => Promise.resolve([])),
    saveWordScore: vi.fn(() => Promise.resolve()),
    getWordsByScoreRange: vi.fn(() => Promise.resolve([])),
    getMasteryStudyWords: vi.fn(() =>
      Promise.resolve({
        words: [],
        meta: {
          mode: 'mastery',
          targetCount: 20,
          fetchCount: 0,
          masteryThreshold: 0.8,
          maxQuestions: 100,
        },
      }),
    ),
    getNextWords: vi.fn(() =>
      Promise.resolve({
        words: [],
        strategy: {
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 10,
          session_length: 20,
          review_ratio: 0.3,
        },
        reason: 'default',
      }),
    ),
    createMasterySession: vi.fn(() => Promise.resolve({ sessionId: 'session-1' })),
    syncMasteryProgress: vi.fn(() => Promise.resolve()),
    adjustLearningWords: vi.fn(() => Promise.resolve({ words: [], adjustments: [], reason: '' })),
  };

  // AMAS Client mock
  const mockAmasClient = {
    setOnUnauthorized: vi.fn(),
    processLearningEvent: vi.fn(() => Promise.resolve({ strategy: {}, userState: {}, reward: 0 })),
    getAmasState: vi.fn(() => Promise.resolve(null)),
    getAmasStrategy: vi.fn(() => Promise.resolve(null)),
    resetAmasState: vi.fn(() => Promise.resolve()),
    getAmasColdStartPhase: vi.fn(() => Promise.resolve({ phase: 'exploration', progress: 0 })),
    batchProcessEvents: vi.fn(() => Promise.resolve({ processed: 0, errors: [] })),
    getTimePreferences: vi.fn(() => Promise.resolve({ preferences: [], peakHours: [] })),
    getGoldenTime: vi.fn(() => Promise.resolve({ isGoldenTime: false, message: '' })),
    getCurrentTrend: vi.fn(() => Promise.resolve({ trend: 'stable', stateDescription: '' })),
    getTrendHistory: vi.fn(() => Promise.resolve({ daily: [], weekly: [], totalDays: 0 })),
    getTrendReport: vi.fn(() => Promise.resolve({ summary: '', recommendations: [] })),
    getIntervention: vi.fn(() => Promise.resolve({ needsIntervention: false, suggestions: [] })),
    getStateHistory: vi.fn(() =>
      Promise.resolve({
        history: [],
        summary: { recordCount: 0, averages: {} },
        range: 30,
        totalRecords: 0,
      }),
    ),
    getCognitiveGrowth: vi.fn(() =>
      Promise.resolve({ current: {}, past: {}, changes: {}, period: 30, periodLabel: '30 days' }),
    ),
    getSignificantChanges: vi.fn(() =>
      Promise.resolve({ changes: [], range: 30, hasSignificantChanges: false, summary: '' }),
    ),
  };

  // Admin Client mock
  const mockAdminClient = {
    setOnUnauthorized: vi.fn(),
    adminGetUsers: vi.fn(() =>
      Promise.resolve({
        users: [],
        total: 0,
        page: 1,
        pageSize: 20,
        pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
      }),
    ),
    adminGetUserById: vi.fn(() =>
      Promise.resolve({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      }),
    ),
    adminGetUserLearningData: vi.fn(() =>
      Promise.resolve({
        user: {},
        totalRecords: 0,
        correctRecords: 0,
        averageAccuracy: 0,
        totalWordsLearned: 0,
        recentRecords: [],
      }),
    ),
    adminGetUserStatistics: vi.fn(() =>
      Promise.resolve({
        user: {},
        masteryDistribution: {},
        studyDays: 0,
        consecutiveDays: 0,
        totalStudyTime: 0,
        totalWordsLearned: 0,
        averageScore: 0,
        accuracy: 0,
      }),
    ),
    adminGetUserWords: vi.fn(() =>
      Promise.resolve({
        words: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    ),
    adminExportUserWords: vi.fn(() => Promise.resolve()),
    adminUpdateUserRole: vi.fn(() => Promise.resolve({ id: 'user-1', role: 'USER' })),
    adminDeleteUser: vi.fn(() => Promise.resolve()),
    adminGetSystemWordBooks: vi.fn(() => Promise.resolve([])),
    adminCreateSystemWordBook: vi.fn(() =>
      Promise.resolve({ id: 'wb-1', name: 'System WordBook' }),
    ),
    adminUpdateSystemWordBook: vi.fn(() =>
      Promise.resolve({ id: 'wb-1', name: 'System WordBook' }),
    ),
    adminDeleteSystemWordBook: vi.fn(() => Promise.resolve()),
    adminBatchAddWordsToSystemWordBook: vi.fn(() => Promise.resolve([])),
    adminGetStatistics: vi.fn(() =>
      Promise.resolve({
        totalUsers: 0,
        totalWords: 0,
        totalRecords: 0,
        totalWordBooks: 0,
        activeUsers: 0,
        systemWordBooks: 0,
        userWordBooks: 0,
      }),
    ),
    adminGetWordLearningHistory: vi.fn(() =>
      Promise.resolve({ word: {}, wordState: null, wordScore: null, records: [] }),
    ),
    adminGetWordScoreHistory: vi.fn(() => Promise.resolve({ currentScore: 0, scoreHistory: [] })),
    adminGetUserLearningHeatmap: vi.fn(() => Promise.resolve([])),
    adminFlagAnomalyRecord: vi.fn(() => Promise.resolve({ id: 'flag-1' })),
    adminGetAnomalyFlags: vi.fn(() => Promise.resolve([])),
    getAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1', name: 'default' })),
    updateAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1', name: 'default' })),
    resetAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1', name: 'default' })),
    getConfigHistory: vi.fn(() => Promise.resolve([])),
  };

  // LLM Advisor Client mock
  const mockLlmAdvisorClient = {
    setOnUnauthorized: vi.fn(),
    getLLMAdvisorConfig: vi.fn(() =>
      Promise.resolve({ config: { enabled: false }, worker: { enabled: false } }),
    ),
    checkLLMAdvisorHealth: vi.fn(() => Promise.resolve({ status: 'ok', message: '' })),
    getLLMAdvisorSuggestions: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    getLLMAdvisorSuggestion: vi.fn(() => Promise.resolve(null)),
    approveLLMAdvisorSuggestion: vi.fn(() => Promise.resolve({})),
    rejectLLMAdvisorSuggestion: vi.fn(() => Promise.resolve({})),
    triggerLLMAdvisorAnalysis: vi.fn(() => Promise.resolve({ suggestionId: '', message: '' })),
    getLatestLLMAdvisorSuggestion: vi.fn(() => Promise.resolve(null)),
    getLLMAdvisorPendingCount: vi.fn(() => Promise.resolve({ count: 0 })),
  };

  // ApiClient unified object
  const MockApiClient = {
    auth: mockAuthClient,
    word: mockWordClient,
    wordBook: mockWordBookClient,
    learning: mockLearningClient,
    amas: mockAmasClient,
    admin: mockAdminClient,
    llmAdvisor: mockLlmAdvisorClient,
    setOnUnauthorized: vi.fn(),
  };

  return {
    // Classes
    BaseClient: MockBaseClient,
    ApiError: MockApiError,
    TokenManager: MockTokenManager,
    AuthClient: vi.fn(() => mockAuthClient),
    WordClient: vi.fn(() => mockWordClient),
    WordBookClient: vi.fn(() => mockWordBookClient),
    LearningClient: vi.fn(() => mockLearningClient),
    AmasClient: vi.fn(() => mockAmasClient),
    AdminClient: vi.fn(() => mockAdminClient),
    LLMAdvisorClient: vi.fn(() => mockLlmAdvisorClient),

    // Singleton instances
    authClient: mockAuthClient,
    wordClient: mockWordClient,
    wordBookClient: mockWordBookClient,
    learningClient: mockLearningClient,
    amasClient: mockAmasClient,
    adminClient: mockAdminClient,
    llmAdvisorClient: mockLlmAdvisorClient,

    // Unified ApiClient object
    ApiClient: MockApiClient,
    default: MockApiClient,
  };
});

// ==================== Legacy ApiClient Mock (For Test Compatibility) ====================

// Mock for the legacy ApiClient import path ('../services/ApiClient')
// This mock provides compatibility for tests that still use the old import path
// Note: New code should use `import { apiClient } from '@/services/client'`
vi.mock('../services/ApiClient', () => {
  const mockApiClient = {
    // Token management
    setToken: vi.fn(),
    clearToken: vi.fn(),
    getToken: vi.fn(() => 'mock-token'),
    setOnUnauthorized: vi.fn(),

    // Auth
    register: vi.fn(() =>
      Promise.resolve({
        user: { id: 'test-user', email: 'test@example.com', username: 'testuser', role: 'USER' },
        token: 'mock-token',
      }),
    ),
    login: vi.fn(() =>
      Promise.resolve({
        user: { id: 'test-user', email: 'test@example.com', username: 'testuser', role: 'USER' },
        token: 'mock-token',
      }),
    ),
    logout: vi.fn(() => Promise.resolve()),
    getCurrentUser: vi.fn(() =>
      Promise.resolve({
        id: 'test-user',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      }),
    ),
    updatePassword: vi.fn(() => Promise.resolve()),
    getUserStatistics: vi.fn(() =>
      Promise.resolve({ totalWords: 0, totalRecords: 0, correctRate: 0 }),
    ),

    // Words
    getWords: vi.fn(() => Promise.resolve([])),
    getLearnedWords: vi.fn(() => Promise.resolve([])),
    createWord: vi.fn(() => Promise.resolve({ id: 'word-1', spelling: 'test' })),
    updateWord: vi.fn(() => Promise.resolve({ id: 'word-1', spelling: 'test' })),
    deleteWord: vi.fn(() => Promise.resolve()),
    batchCreateWords: vi.fn(() => Promise.resolve([])),
    searchWords: vi.fn(() => Promise.resolve([])),

    // Records
    getRecords: vi.fn(() =>
      Promise.resolve({
        records: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    ),
    createRecord: vi.fn(() => Promise.resolve({ id: 'record-1' })),
    batchCreateRecords: vi.fn(() => Promise.resolve([])),

    // WordBooks
    getUserWordBooks: vi.fn(() => Promise.resolve([])),
    getSystemWordBooks: vi.fn(() => Promise.resolve([])),
    getAllAvailableWordBooks: vi.fn(() => Promise.resolve([])),
    getWordBookById: vi.fn(() => Promise.resolve({ id: 'wb-1', name: 'Test', wordCount: 0 })),
    createWordBook: vi.fn(() => Promise.resolve({ id: 'wb-1', name: 'Test' })),
    updateWordBook: vi.fn(() => Promise.resolve({ id: 'wb-1', name: 'Test' })),
    deleteWordBook: vi.fn(() => Promise.resolve()),
    getWordBookWords: vi.fn(() => Promise.resolve([])),
    addWordToWordBook: vi.fn(() => Promise.resolve({ id: 'word-1' })),
    removeWordFromWordBook: vi.fn(() => Promise.resolve()),

    // Study Config
    getStudyConfig: vi.fn(() =>
      Promise.resolve({ id: 'config-1', selectedWordBookIds: [], dailyWordCount: 20 }),
    ),
    updateStudyConfig: vi.fn(() => Promise.resolve({ id: 'config-1' })),
    getTodayWords: vi.fn(() => Promise.resolve({ words: [], progress: {} })),
    getStudyProgress: vi.fn(() => Promise.resolve({ todayStudied: 0, todayTarget: 20 })),

    // Word States
    getWordLearningState: vi.fn(() => Promise.resolve(null)),
    getWordLearningStates: vi.fn(() => Promise.resolve([])),
    saveWordLearningState: vi.fn(() => Promise.resolve()),
    deleteWordLearningState: vi.fn(() => Promise.resolve()),
    getDueWords: vi.fn(() => Promise.resolve([])),
    getWordsByState: vi.fn(() => Promise.resolve([])),

    // Word Scores
    getWordScore: vi.fn(() => Promise.resolve(null)),
    getWordScores: vi.fn(() => Promise.resolve([])),
    saveWordScore: vi.fn(() => Promise.resolve()),
    getWordsByScoreRange: vi.fn(() => Promise.resolve([])),

    // Algorithm Config
    getAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1', name: 'default' })),
    updateAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1' })),
    resetAlgorithmConfig: vi.fn(() => Promise.resolve({ id: 'config-1' })),
    getConfigHistory: vi.fn(() => Promise.resolve([])),

    // Mastery Learning
    getMasteryStudyWords: vi.fn(() => Promise.resolve({ words: [], meta: {} })),
    getNextWords: vi.fn(() => Promise.resolve({ words: [], strategy: {}, reason: '' })),
    createMasterySession: vi.fn(() => Promise.resolve({ sessionId: 'session-1' })),
    syncMasteryProgress: vi.fn(() => Promise.resolve()),
    adjustLearningWords: vi.fn(() => Promise.resolve({ words: [], adjustments: [], reason: '' })),

    // AMAS
    processLearningEvent: vi.fn(() => Promise.resolve({ strategy: {}, userState: {}, reward: 0 })),
    getAmasState: vi.fn(() => Promise.resolve(null)),
    getAmasStrategy: vi.fn(() => Promise.resolve(null)),
    resetAmasState: vi.fn(() => Promise.resolve()),
    getAmasColdStartPhase: vi.fn(() => Promise.resolve({ phase: 'exploration', progress: 0 })),
    batchProcessEvents: vi.fn(() => Promise.resolve({ processed: 0, errors: [] })),
    getTimePreferences: vi.fn(() => Promise.resolve({ preferences: [], peakHours: [] })),
    getGoldenTime: vi.fn(() => Promise.resolve({ isGoldenTime: false, message: '' })),
    getCurrentTrend: vi.fn(() => Promise.resolve({ trend: 'stable', stateDescription: '' })),
    getTrendHistory: vi.fn(() => Promise.resolve({ daily: [], weekly: [], totalDays: 0 })),
    getTrendReport: vi.fn(() => Promise.resolve({ summary: '', recommendations: [] })),
    getIntervention: vi.fn(() => Promise.resolve({ needsIntervention: false, suggestions: [] })),
    getUserBadges: vi.fn(() => Promise.resolve({ badges: [], count: 0 })),
    getAllBadgesWithStatus: vi.fn(() =>
      Promise.resolve({ badges: [], grouped: {}, totalCount: 0, unlockedCount: 0 }),
    ),
    getBadgeDetails: vi.fn(() => Promise.resolve(null)),
    getBadgeProgress: vi.fn(() => Promise.resolve({ progress: 0 })),
    checkAndAwardBadges: vi.fn(() =>
      Promise.resolve({ newBadges: [], hasNewBadges: false, message: '' }),
    ),
    getLearningPlan: vi.fn(() => Promise.resolve(null)),
    generateLearningPlan: vi.fn(() => Promise.resolve({ plan: {} })),
    getPlanProgress: vi.fn(() => Promise.resolve({ progress: 0, status: 'active' })),
    adjustLearningPlan: vi.fn(() => Promise.resolve({ plan: {} })),
    getStateHistory: vi.fn(() =>
      Promise.resolve({ history: [], summary: {}, range: 30, totalRecords: 0 }),
    ),
    getCognitiveGrowth: vi.fn(() =>
      Promise.resolve({ current: {}, past: {}, changes: {}, period: 30, periodLabel: '30 days' }),
    ),
    getSignificantChanges: vi.fn(() =>
      Promise.resolve({ changes: [], range: 30, hasSignificantChanges: false, summary: '' }),
    ),

    // Admin
    adminGetUsers: vi.fn(() => Promise.resolve({ users: [], total: 0, pagination: {} })),
    adminGetUserById: vi.fn(() => Promise.resolve({ id: 'user-1' })),
    adminGetUserLearningData: vi.fn(() => Promise.resolve({ user: {}, totalRecords: 0 })),
    adminGetUserStatistics: vi.fn(() => Promise.resolve({ user: {}, masteryDistribution: {} })),
    adminGetUserWords: vi.fn(() => Promise.resolve({ words: [], pagination: {} })),
    adminExportUserWords: vi.fn(() => Promise.resolve()),
    adminUpdateUserRole: vi.fn(() => Promise.resolve({ id: 'user-1', role: 'USER' })),
    adminDeleteUser: vi.fn(() => Promise.resolve()),
    adminGetSystemWordBooks: vi.fn(() => Promise.resolve([])),
    adminCreateSystemWordBook: vi.fn(() => Promise.resolve({ id: 'wb-1' })),
    adminUpdateSystemWordBook: vi.fn(() => Promise.resolve({ id: 'wb-1' })),
    adminDeleteSystemWordBook: vi.fn(() => Promise.resolve()),
    adminBatchAddWordsToSystemWordBook: vi.fn(() => Promise.resolve([])),
    adminGetStatistics: vi.fn(() => Promise.resolve({ totalUsers: 0, totalWords: 0 })),
    adminGetWordLearningHistory: vi.fn(() =>
      Promise.resolve({ word: {}, wordState: null, records: [] }),
    ),
    adminGetWordScoreHistory: vi.fn(() => Promise.resolve({ currentScore: 0, scoreHistory: [] })),
    adminGetUserLearningHeatmap: vi.fn(() => Promise.resolve([])),
    adminFlagAnomalyRecord: vi.fn(() => Promise.resolve({ id: 'flag-1' })),
    adminGetAnomalyFlags: vi.fn(() => Promise.resolve([])),

    // Word Mastery
    getWordMasteryStats: vi.fn(() => Promise.resolve({ totalWords: 0 })),
    batchProcessWordMastery: vi.fn(() => Promise.resolve([])),
    getWordMasteryDetail: vi.fn(() => Promise.resolve({ wordId: '', mastery: 0 })),
    getWordMasteryTrace: vi.fn(() => Promise.resolve({ trace: [] })),
    getWordMasteryInterval: vi.fn(() => Promise.resolve({ interval: 1 })),

    // Habit Profile
    getHabitProfile: vi.fn(() => Promise.resolve({ profile: {} })),
    initializeHabitProfile: vi.fn(() => Promise.resolve({ initialized: true })),
    endHabitSession: vi.fn(() => Promise.resolve({ ended: true })),
    persistHabitProfile: vi.fn(() => Promise.resolve({ persisted: true })),

    // Explainability
    getAmasDecisionExplanation: vi.fn(() => Promise.resolve({ explanation: '' })),
    runCounterfactualAnalysis: vi.fn(() => Promise.resolve({ result: {} })),
    getAmasLearningCurve: vi.fn(() => Promise.resolve({ curve: [] })),
    getDecisionTimeline: vi.fn(() => Promise.resolve({ timeline: [], nextCursor: null })),

    // Batch Import
    batchImportWords: vi.fn(() => Promise.resolve({ imported: 0, failed: 0 })),

    // Optimization
    getOptimizationSuggestion: vi.fn(() => Promise.resolve({ params: {}, paramSpace: {} })),
    recordOptimizationEvaluation: vi.fn(() => Promise.resolve({ recorded: true })),
    getBestOptimizationParams: vi.fn(() => Promise.resolve({ params: null, value: null })),
    getOptimizationHistory: vi.fn(() => Promise.resolve([])),
    triggerOptimization: vi.fn(() => Promise.resolve({ triggered: true })),
    resetOptimizer: vi.fn(() => Promise.resolve({ reset: true })),
    getOptimizationDiagnostics: vi.fn(() => Promise.resolve({})),

    // Evaluation
    recordCausalObservation: vi.fn(() => Promise.resolve(null)),
    getCausalATE: vi.fn(() => Promise.resolve({ ate: 0, confidence: 0, sampleSize: 0 })),
    compareStrategies: vi.fn(() =>
      Promise.resolve({ difference: 0, pValue: 1, significant: false }),
    ),
    getCausalDiagnostics: vi.fn(() => Promise.resolve({})),
    getExperimentVariant: vi.fn(() => Promise.resolve(null)),
    recordExperimentMetric: vi.fn(() => Promise.resolve({ recorded: true })),

    // User Config
    getUserRewardProfile: vi.fn(() =>
      Promise.resolve({ currentProfile: 'default', availableProfiles: [] }),
    ),
    updateUserRewardProfile: vi.fn(() =>
      Promise.resolve({ currentProfile: 'default', message: '' }),
    ),

    // Experiments
    createExperiment: vi.fn(() => Promise.resolve({ id: 'exp-1', name: 'Test' })),
    getExperiments: vi.fn(() => Promise.resolve({ experiments: [], total: 0 })),
    getExperiment: vi.fn(() =>
      Promise.resolve({ id: 'exp-1', name: 'Test', variants: [], metrics: [] }),
    ),
    getExperimentStatus: vi.fn(() =>
      Promise.resolve({ status: 'running', pValue: 1, effectSize: 0, isSignificant: false }),
    ),
    startExperiment: vi.fn(() => Promise.resolve({ message: '' })),
    stopExperiment: vi.fn(() => Promise.resolve({ message: '' })),
    deleteExperiment: vi.fn(() => Promise.resolve({ message: '' })),

    // Cognitive Profiling
    getChronotypeProfile: vi.fn(() =>
      Promise.resolve({
        category: 'intermediate',
        peakHours: [],
        confidence: 0,
        learningHistory: [],
      }),
    ),
    getLearningStyleProfile: vi.fn(() =>
      Promise.resolve({ style: 'mixed', confidence: 0, scores: {} }),
    ),
    getCognitiveProfile: vi.fn(() => Promise.resolve({ chronotype: {}, learningStyle: {} })),

    // Learning Objectives
    getLearningObjectives: vi.fn(() =>
      Promise.resolve({ mode: 'daily', primaryObjective: 'accuracy' }),
    ),
    updateLearningObjectives: vi.fn(() => Promise.resolve({})),
    switchLearningMode: vi.fn(() => Promise.resolve({})),
    getLearningObjectiveSuggestions: vi.fn(() =>
      Promise.resolve({ currentMode: 'daily', suggestedModes: [] }),
    ),
    getLearningObjectiveHistory: vi.fn(() => Promise.resolve([])),
    deleteLearningObjectives: vi.fn(() => Promise.resolve()),

    // Admin Decisions
    adminGetUserDecisions: vi.fn(() => Promise.resolve({ decisions: [], total: 0 })),
    adminGetDecisionDetail: vi.fn(() => Promise.resolve(null)),

    // LLM Advisor
    getLLMAdvisorConfig: vi.fn(() =>
      Promise.resolve({ config: { enabled: false }, worker: { enabled: false } }),
    ),
    checkLLMAdvisorHealth: vi.fn(() => Promise.resolve({ status: 'ok', message: '' })),
    getLLMAdvisorSuggestions: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    getLLMAdvisorSuggestion: vi.fn(() => Promise.resolve(null)),
    approveLLMAdvisorSuggestion: vi.fn(() => Promise.resolve({})),
    rejectLLMAdvisorSuggestion: vi.fn(() => Promise.resolve({})),
    triggerLLMAdvisorAnalysis: vi.fn(() => Promise.resolve({ suggestionId: '', message: '' })),
    getLatestLLMAdvisorSuggestion: vi.fn(() => Promise.resolve(null)),
    getLLMAdvisorPendingCount: vi.fn(() => Promise.resolve({ count: 0 })),
  };

  // Export ApiError class as well
  class MockApiError extends Error {
    statusCode: number;
    code: string;
    isNotFound: boolean;

    constructor(message: string, statusCode: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code || 'UNKNOWN_ERROR';
      this.isNotFound = statusCode === 404;
    }
  }

  return {
    default: mockApiClient,
    ApiError: MockApiError,
  };
});

// ==================== Global aboutApi Mock ====================

const defaultPipelineStatus = {
  systemHealth: 'healthy',
  totalThroughput: 150,
  layers: [
    {
      id: 'PERCEPTION',
      name: 'Perception',
      nameCn: '感知层',
      processedCount: 1500,
      avgLatencyMs: 5,
      successRate: 0.99,
      status: 'healthy',
    },
    {
      id: 'MODELING',
      name: 'Modeling',
      nameCn: '建模层',
      processedCount: 1400,
      avgLatencyMs: 8,
      successRate: 0.98,
      status: 'healthy',
    },
    {
      id: 'LEARNING',
      name: 'Learning',
      nameCn: '学习层',
      processedCount: 1300,
      avgLatencyMs: 12,
      successRate: 0.97,
      status: 'healthy',
    },
    {
      id: 'DECISION',
      name: 'Decision',
      nameCn: '决策层',
      processedCount: 1200,
      avgLatencyMs: 10,
      successRate: 0.99,
      status: 'healthy',
    },
    {
      id: 'EVALUATION',
      name: 'Evaluation',
      nameCn: '评估层',
      processedCount: 1100,
      avgLatencyMs: 6,
      successRate: 0.98,
      status: 'healthy',
    },
    {
      id: 'OPTIMIZATION',
      name: 'Optimization',
      nameCn: '优化层',
      processedCount: 1000,
      avgLatencyMs: 15,
      successRate: 0.96,
      status: 'healthy',
    },
  ],
};

vi.mock('../services/aboutApi', () => ({
  getPipelineLayerStatus: vi.fn(() => Promise.resolve(defaultPipelineStatus)),
  getAlgorithmStatus: vi.fn(() =>
    Promise.resolve({ ensembleConsensusRate: 0.85, algorithms: [], coldstartStats: {} }),
  ),
  getUserStateStatus: vi.fn(() => Promise.resolve({ distributions: {}, recentInferences: [] })),
  getMemoryStatus: vi.fn(() =>
    Promise.resolve({
      strengthDistribution: [],
      urgentReviewCount: 0,
      soonReviewCount: 0,
      stableCount: 0,
    }),
  ),
  getFeatureFlags: vi.fn(() => Promise.resolve({ flags: {} })),
  simulate: vi.fn(() =>
    Promise.resolve({ outputStrategy: {}, decisionProcess: {}, explanation: {} }),
  ),
  getOverviewStats: vi.fn(() =>
    Promise.resolve({ todayDecisions: 0, activeUsers: 0, avgResponseTime: 0 }),
  ),
  getDashboardMetrics: vi.fn(() => Promise.resolve({ metrics: [] })),
}));

// ==================== Global Logger Mock ====================

const createMockLogger = () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => createMockLogger()),
  flush: vi.fn(),
  configure: vi.fn(),
});

// Mock Logger class
class MockLogger {
  error = vi.fn();
  warn = vi.fn();
  info = vi.fn();
  debug = vi.fn();
  trace = vi.fn();
  fatal = vi.fn();
  child = vi.fn(() => new MockLogger());
  flush = vi.fn();
  configure = vi.fn();
}

vi.mock('../utils/logger', () => ({
  default: createMockLogger(),
  logger: createMockLogger(),
  authLogger: createMockLogger(),
  apiLogger: createMockLogger(),
  amasLogger: createMockLogger(),
  learningLogger: createMockLogger(),
  storageLogger: createMockLogger(),
  uiLogger: createMockLogger(),
  adminLogger: createMockLogger(),
  trackingLogger: createMockLogger(),
  Logger: MockLogger,
  createLogger: vi.fn(() => createMockLogger()),
}));

// ==================== Global Animation Utils Mock ====================

vi.mock('../utils/animations', () => ({
  fadeInVariants: {},
  staggerContainerVariants: {},
  staggerItemVariants: {},
  slideUpVariants: {},
  scaleInVariants: {},
  pageTransition: {},
  modalTransition: {},
  g3SpringSnappy: {},
  g3SpringStandard: {},
  g3SpringGentle: {},
  g3SpringBouncy: {},
  celebrationVariants: {},
  backdropVariants: {},
  shimmerVariants: {},
  pulseSoftVariants: {},
  G3_DURATION: {
    instant: 120,
    fast: 180,
    normal: 240,
    slow: 320,
    slower: 480,
  },
  G3_EASING: {
    standard: [0.2, 0, 0, 1],
    enter: [0.05, 0.7, 0.1, 1],
    exit: [0.3, 0, 0.8, 0.15],
  },
  getStaggeredTransition: vi.fn(() => ({})),
  createG3Spring: vi.fn(() => ({})),
  createG3Tween: vi.fn(() => ({})),
}));

// ==================== Cleanup ====================

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ==================== LocalStorage Mock ====================

const localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

vi.stubGlobal('localStorage', localStorageMock);

// ==================== SessionStorage Mock ====================

const sessionStorageStore: Record<string, string> = {};

const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(sessionStorageStore).forEach((key) => delete sessionStorageStore[key]);
  }),
  get length() {
    return Object.keys(sessionStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(sessionStorageStore)[index] ?? null),
};

vi.stubGlobal('sessionStorage', sessionStorageMock);

// ==================== Fetch Mock ====================

export const mockFetch: ReturnType<typeof vi.fn> = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ==================== URL Mock ====================

// Mock only the static methods, preserve the constructor
const OriginalURL = globalThis.URL;
vi.spyOn(OriginalURL, 'createObjectURL').mockReturnValue('blob:mock-url');
vi.spyOn(OriginalURL, 'revokeObjectURL').mockImplementation(() => {});

// ==================== Audio Mock ====================

class MockAudio {
  src = '';
  currentTime = 0;
  duration = 0;
  paused = true;
  volume = 1;

  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

vi.stubGlobal('Audio', MockAudio);

// ==================== Speech Synthesis Mock ====================

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice = null;
  onend: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onstart: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onmark: (() => void) | null = null;
  onboundary: (() => void) | null = null;

  constructor(text: string = '') {
    this.text = text;
  }
}

vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);

// Create persistent mock functions that won't lose their implementation on clearAllMocks
const speechSynthesisSpeakImpl = (utterance: MockSpeechSynthesisUtterance) => {
  // Simulate successful speech by triggering onend
  queueMicrotask(() => {
    if (utterance.onend) utterance.onend();
  });
};

const mockSpeechSynthesisSpeak = vi.fn(speechSynthesisSpeakImpl);
const mockSpeechSynthesisCancel = vi.fn();

const mockSpeechSynthesis = {
  speak: mockSpeechSynthesisSpeak,
  cancel: mockSpeechSynthesisCancel,
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn().mockReturnValue([]),
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null,
};

// Set on both window and global
Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
  configurable: true,
});

vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);

// Export for tests to restore default behavior
export const resetSpeechSynthesisMock = () => {
  mockSpeechSynthesisSpeak.mockImplementation(speechSynthesisSpeakImpl);
};

// ==================== IntersectionObserver Mock ====================

const intersectionObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('IntersectionObserver', intersectionObserverMock);

// ==================== ResizeObserver Mock ====================

const resizeObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', resizeObserverMock);

// ==================== matchMedia Mock ====================

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ==================== Scroll Mock ====================

window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// ==================== Console Suppression ====================

beforeEach(() => {
  // Suppress console.error and console.warn in tests
  // Comment out these lines if you need to debug
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ==================== Test Utilities ====================

export function clearStorageMocks(): void {
  Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);
  Object.keys(sessionStorageStore).forEach((key) => delete sessionStorageStore[key]);
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
}

export function mockSuccessfulFetch<T>(data: T): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  });
}

export function mockFailedFetch(error: string, status = 400): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ success: false, error }),
  });
}

export function mockNetworkError(): void {
  mockFetch.mockRejectedValueOnce(new Error('Network error'));
}

// ==================== Timer Utilities ====================

export function advanceTimersByTime(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  return Promise.resolve();
}

export function runAllTimers(): Promise<void> {
  vi.runAllTimers();
  return Promise.resolve();
}

// ==================== Wait Utilities ====================

export function waitFor(callback: () => boolean | Promise<boolean>, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = async () => {
      try {
        if (await callback()) {
          resolve();
          return;
        }
      } catch {
        // Continue waiting
      }

      if (Date.now() - start > timeout) {
        reject(new Error('waitFor timeout'));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
