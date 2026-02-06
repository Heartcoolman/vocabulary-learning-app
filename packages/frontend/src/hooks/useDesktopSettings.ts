import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isTauriEnvironment,
  getTauriAppSettings,
  updateTauriAppSettings,
  resetTauriWindowLayout,
  type TauriAppSettings,
} from '../utils/tauri-bridge';
import { initSentry, setSentryEnabled } from '../services/sentry';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

interface DesktopSettings {
  onboardingCompleted: boolean;
  windowState: WindowState | null;
  telemetryEnabled: boolean;
}

const DEFAULT_SETTINGS: DesktopSettings = {
  onboardingCompleted: false,
  windowState: null,
  telemetryEnabled: false,
};

const DESKTOP_STORAGE_KEYS = {
  onboardingCompleted: 'danci.desktop.onboarding_completed',
  windowState: 'danci.desktop.window_state',
  telemetryEnabled: 'danci.desktop.telemetry_enabled',
} as const;

function readBooleanFromLocalStorage(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

function readJsonFromLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeBooleanToLocalStorage(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function writeJsonToLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function removeLocalStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function mapTauriSettings(settings: TauriAppSettings): DesktopSettings {
  return {
    onboardingCompleted: settings.onboarding_completed,
    windowState: readJsonFromLocalStorage<WindowState>(DESKTOP_STORAGE_KEYS.windowState),
    telemetryEnabled: settings.telemetry_enabled,
  };
}

export function useDesktopSettings() {
  const [settings, setSettings] = useState<DesktopSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const isDesktop = isTauriEnvironment();
  const tauriSettingsRef = useRef<TauriAppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      if (!isDesktop) {
        setLoading(false);
        return;
      }

      try {
        const tauriSettings = await getTauriAppSettings();
        if (cancelled) return;

        tauriSettingsRef.current = tauriSettings;
        const mapped = mapTauriSettings(tauriSettings);
        setSettings(mapped);

        if (mapped.telemetryEnabled) {
          initSentry();
        }
      } catch {
        if (cancelled) return;

        const onboardingCompleted = readBooleanFromLocalStorage(
          DESKTOP_STORAGE_KEYS.onboardingCompleted,
          false,
        );
        const windowState = readJsonFromLocalStorage<WindowState>(DESKTOP_STORAGE_KEYS.windowState);
        const telemetryEnabled = readBooleanFromLocalStorage(
          DESKTOP_STORAGE_KEYS.telemetryEnabled,
          false,
        );

        setSettings({
          onboardingCompleted,
          windowState,
          telemetryEnabled,
        });

        if (telemetryEnabled) {
          initSentry();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  const updateSetting = useCallback(
    async <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => {
      if (!isDesktop) return;

      if (key === 'windowState') {
        if (value === null) {
          removeLocalStorageItem(DESKTOP_STORAGE_KEYS.windowState);
        } else {
          writeJsonToLocalStorage(DESKTOP_STORAGE_KEYS.windowState, value);
        }
        setSettings((prev) => ({ ...prev, windowState: value as WindowState | null }));
        return;
      }

      const currentTauriSettings = tauriSettingsRef.current;
      if (currentTauriSettings) {
        const nextTauriSettings: TauriAppSettings = {
          ...currentTauriSettings,
          onboarding_completed:
            key === 'onboardingCompleted'
              ? Boolean(value)
              : currentTauriSettings.onboarding_completed,
          telemetry_enabled:
            key === 'telemetryEnabled' ? Boolean(value) : currentTauriSettings.telemetry_enabled,
        };

        await updateTauriAppSettings(nextTauriSettings);
        tauriSettingsRef.current = nextTauriSettings;
      } else if (key === 'onboardingCompleted') {
        writeBooleanToLocalStorage(DESKTOP_STORAGE_KEYS.onboardingCompleted, Boolean(value));
      } else if (key === 'telemetryEnabled') {
        writeBooleanToLocalStorage(DESKTOP_STORAGE_KEYS.telemetryEnabled, Boolean(value));
      }

      setSettings((prev) => ({ ...prev, [key]: value }));

      if (key === 'telemetryEnabled') {
        if (value) {
          initSentry();
        } else {
          setSentryEnabled(false);
        }
      }
    },
    [isDesktop],
  );

  const resetWindowLayout = useCallback(async () => {
    if (!isDesktop) return;

    try {
      await resetTauriWindowLayout();
    } finally {
      removeLocalStorageItem(DESKTOP_STORAGE_KEYS.windowState);
      setSettings((prev) => ({ ...prev, windowState: null }));
    }
  }, [isDesktop]);

  return {
    settings,
    loading,
    isDesktop,
    updateSetting,
    resetWindowLayout,
  };
}
