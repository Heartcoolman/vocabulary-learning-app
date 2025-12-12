/**
 * Tauri API Mock for testing
 * 在非 Tauri 环境下模拟 Tauri API
 */

import { vi } from 'vitest';

// Mock invoke 函数
export const mockInvoke = vi.fn().mockImplementation((cmd: string, args?: any) => {
  switch (cmd) {
    case 'check_permission':
      return Promise.resolve({ status: 'granted', success: true, error: null });
    case 'request_permission':
      return Promise.resolve({ status: 'granted', success: true, error: null });
    case 'is_native_permission_supported':
      return Promise.resolve(false);
    case 'fatigue_initialize':
      return Promise.resolve({ success: false, error: 'Not supported' });
    case 'fatigue_get_capability':
      return Promise.resolve({ supported: false, platform: 'desktop' });
    case 'tts_speak':
      return Promise.resolve({ success: true });
    default:
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
  }
});

// Setup mock
export function setupTauriMock() {
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: mockInvoke,
  }));
}

// Reset mock
export function resetTauriMock() {
  mockInvoke.mockClear();
}
