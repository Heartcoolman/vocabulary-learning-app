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
  AuthContext: { Provider: ({ children }: any) => children, Consumer: ({ children }: any) => children(mockAuthContext) },
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
      initial, animate, exit, transition, variants,
      whileHover, whileTap, whileFocus, whileInView,
      layout, layoutId, drag, dragConstraints, onDrag,
      style, ...rest
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
  AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
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

// ==================== Global aboutApi Mock ====================

const defaultPipelineStatus = {
  systemHealth: 'healthy',
  totalThroughput: 150,
  layers: [
    { id: 'PERCEPTION', name: 'Perception', nameCn: '感知层', processedCount: 1500, avgLatencyMs: 5, successRate: 0.99, status: 'healthy' },
    { id: 'MODELING', name: 'Modeling', nameCn: '建模层', processedCount: 1400, avgLatencyMs: 8, successRate: 0.98, status: 'healthy' },
    { id: 'LEARNING', name: 'Learning', nameCn: '学习层', processedCount: 1300, avgLatencyMs: 12, successRate: 0.97, status: 'healthy' },
    { id: 'DECISION', name: 'Decision', nameCn: '决策层', processedCount: 1200, avgLatencyMs: 10, successRate: 0.99, status: 'healthy' },
    { id: 'EVALUATION', name: 'Evaluation', nameCn: '评估层', processedCount: 1100, avgLatencyMs: 6, successRate: 0.98, status: 'healthy' },
    { id: 'OPTIMIZATION', name: 'Optimization', nameCn: '优化层', processedCount: 1000, avgLatencyMs: 15, successRate: 0.96, status: 'healthy' },
  ],
};

vi.mock('../services/aboutApi', () => ({
  getPipelineLayerStatus: vi.fn(() => Promise.resolve(defaultPipelineStatus)),
  getAlgorithmStatus: vi.fn(() => Promise.resolve({ ensembleConsensusRate: 0.85, algorithms: [], coldstartStats: {} })),
  getUserStateStatus: vi.fn(() => Promise.resolve({ distributions: {}, recentInferences: [] })),
  getMemoryStatus: vi.fn(() => Promise.resolve({ strengthDistribution: [], urgentReviewCount: 0, soonReviewCount: 0, stableCount: 0 })),
  getFeatureFlags: vi.fn(() => Promise.resolve({ flags: {} })),
  simulate: vi.fn(() => Promise.resolve({ outputStrategy: {}, decisionProcess: {}, explanation: {} })),
  getOverviewStats: vi.fn(() => Promise.resolve({ todayDecisions: 0, activeUsers: 0, avgResponseTime: 0 })),
  getDashboardMetrics: vi.fn(() => Promise.resolve({ metrics: [] })),
}));

// ==================== Global Logger Mock ====================

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  amasLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  adminLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  learningLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ==================== Global Animation Utils Mock ====================

vi.mock('../utils/animations', () => ({
  fadeInVariants: {},
  staggerContainerVariants: {},
  slideUpVariants: {},
  scaleInVariants: {},
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
    Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]);
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null)
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
    Object.keys(sessionStorageStore).forEach(key => delete sessionStorageStore[key]);
  }),
  get length() {
    return Object.keys(sessionStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(sessionStorageStore)[index] ?? null)
};

vi.stubGlobal('sessionStorage', sessionStorageMock);

// ==================== Fetch Mock ====================

export const mockFetch = vi.fn();
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
  disconnect: vi.fn()
}));

vi.stubGlobal('IntersectionObserver', intersectionObserverMock);

// ==================== ResizeObserver Mock ====================

const resizeObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
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
    dispatchEvent: vi.fn()
  }))
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
  Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]);
  Object.keys(sessionStorageStore).forEach(key => delete sessionStorageStore[key]);
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
}

export function mockSuccessfulFetch<T>(data: T): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data })
  });
}

export function mockFailedFetch(error: string, status = 400): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ success: false, error })
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

export function waitFor(
  callback: () => boolean | Promise<boolean>,
  timeout = 5000
): Promise<void> {
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
  return new Promise(resolve => setTimeout(resolve, ms));
}
