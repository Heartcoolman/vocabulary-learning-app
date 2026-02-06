/**
 * Tauri Bridge Unit Tests
 *
 * Tests for the Tauri desktop environment detection and API mode switching.
 * These tests verify:
 * 1. Environment detection (isTauriEnvironment)
 * 2. API mode switching (getApiMode)
 * 3. Tauri invoke wrapper (tauriInvoke)
 * 4. API call routing (apiCall)
 * 5. Desktop local user constants
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauriEnvironment,
  tauriInvoke,
  getApiMode,
  apiCall,
  getDesktopLocalUser,
  getTauriAppSettings,
  updateTauriAppSettings,
  resetTauriWindowLayout,
  DESKTOP_LOCAL_USER_ID,
  DESKTOP_LOCAL_USERNAME,
} from '../tauri-bridge';

describe('Tauri Bridge', () => {
  const originalWindow = { ...window };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.__TAURI__ before each test
    delete (window as unknown as Record<string, unknown>).__TAURI__;
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isTauriEnvironment', () => {
    it('should return false when __TAURI__ is not present', () => {
      expect(isTauriEnvironment()).toBe(false);
    });

    it('should return true when __TAURI__ is present', () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      expect(isTauriEnvironment()).toBe(true);
    });

    it('should return false when __TAURI__ is falsy', () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = null;
      expect(isTauriEnvironment()).toBe(false);

      (window as unknown as Record<string, unknown>).__TAURI__ = undefined;
      expect(isTauriEnvironment()).toBe(false);
    });
  });

  describe('getApiMode', () => {
    it('should return "http" when not in Tauri environment', () => {
      expect(getApiMode()).toBe('http');
    });

    it('should return "tauri" when in Tauri environment', () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      expect(getApiMode()).toBe('tauri');
    });
  });

  describe('tauriInvoke', () => {
    it('should throw error when not in Tauri environment', async () => {
      await expect(tauriInvoke('test_command')).rejects.toThrow('Not running in Tauri environment');
    });

    it('should call window.__TAURI__.core.invoke when in Tauri environment', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ data: 'test' });
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const result = await tauriInvoke<{ data: string }>('test_command', {
        arg1: 'value1',
      });

      expect(mockInvoke).toHaveBeenCalledWith('test_command', { arg1: 'value1' });
      expect(result).toEqual({ data: 'test' });
    });

    it('should propagate errors from Tauri invoke', async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error('Tauri error'));
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      await expect(tauriInvoke('failing_command')).rejects.toThrow('Tauri error');
    });
  });

  describe('desktop settings commands', () => {
    it('should invoke get_settings command', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        daily_goal: 20,
        reminder_enabled: false,
        reminder_time: null,
        theme: 'system',
        telemetry_enabled: false,
        onboarding_completed: true,
      });
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const settings = await getTauriAppSettings();

      expect(mockInvoke).toHaveBeenCalledWith('get_settings', undefined);
      expect(settings.onboarding_completed).toBe(true);
    });

    it('should invoke update_settings with settings payload', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      await updateTauriAppSettings({
        daily_goal: 10,
        reminder_enabled: false,
        reminder_time: null,
        theme: 'system',
        telemetry_enabled: true,
        onboarding_completed: true,
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        settings: {
          daily_goal: 10,
          reminder_enabled: false,
          reminder_time: null,
          theme: 'system',
          telemetry_enabled: true,
          onboarding_completed: true,
        },
      });
    });

    it('should invoke reset_window_layout command', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      await resetTauriWindowLayout();

      expect(mockInvoke).toHaveBeenCalledWith('reset_window_layout', undefined);
    });
  });

  describe('apiCall', () => {
    it('should call httpCall when not in Tauri environment', async () => {
      const mockHttpCall = vi.fn().mockResolvedValue({ data: 'http' });
      const mockTauriCall = vi.fn().mockResolvedValue({ data: 'tauri' });

      const result = await apiCall(mockHttpCall, mockTauriCall);

      expect(mockHttpCall).toHaveBeenCalled();
      expect(mockTauriCall).not.toHaveBeenCalled();
      expect(result).toEqual({ data: 'http' });
    });

    it('should call tauriCall when in Tauri environment and tauriCall is provided', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      const mockHttpCall = vi.fn().mockResolvedValue({ data: 'http' });
      const mockTauriCall = vi.fn().mockResolvedValue({ data: 'tauri' });

      const result = await apiCall(mockHttpCall, mockTauriCall);

      expect(mockTauriCall).toHaveBeenCalled();
      expect(mockHttpCall).not.toHaveBeenCalled();
      expect(result).toEqual({ data: 'tauri' });
    });

    it('should fall back to httpCall when tauriCall is not provided', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      const mockHttpCall = vi.fn().mockResolvedValue({ data: 'http' });

      const result = await apiCall(mockHttpCall);

      expect(mockHttpCall).toHaveBeenCalled();
      expect(result).toEqual({ data: 'http' });
    });

    it('should fall back to httpCall when tauriCall throws "Not implemented"', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      const mockHttpCall = vi.fn().mockResolvedValue({ data: 'http fallback' });
      const mockTauriCall = vi.fn().mockRejectedValue(new Error('Not implemented'));

      const result = await apiCall(mockHttpCall, mockTauriCall);

      expect(mockTauriCall).toHaveBeenCalled();
      expect(mockHttpCall).toHaveBeenCalled();
      expect(result).toEqual({ data: 'http fallback' });
    });

    it('should propagate non-"Not implemented" errors from tauriCall', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {
        core: {
          invoke: vi.fn(),
        },
      };

      const mockHttpCall = vi.fn().mockResolvedValue({ data: 'http' });
      const mockTauriCall = vi.fn().mockRejectedValue(new Error('Some other error'));

      await expect(apiCall(mockHttpCall, mockTauriCall)).rejects.toThrow('Some other error');
      expect(mockHttpCall).not.toHaveBeenCalled();
    });
  });

  describe('Desktop Local User Constants', () => {
    it('should have correct local user ID', () => {
      expect(DESKTOP_LOCAL_USER_ID).toBe('1');
    });

    it('should have correct local username', () => {
      expect(DESKTOP_LOCAL_USERNAME).toBe('local_user');
    });
  });

  describe('getDesktopLocalUser', () => {
    it('should return valid local user object', () => {
      const user = getDesktopLocalUser();

      expect(user.id).toBe('1');
      expect(user.email).toBe('local@localhost');
      expect(user.username).toBe('local_user');
      expect(user.role).toBe('USER');
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should return ISO date strings for timestamps', () => {
      const user = getDesktopLocalUser();

      // Verify ISO format (basic check)
      expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(user.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
