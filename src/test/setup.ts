import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

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

vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn()
});

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
