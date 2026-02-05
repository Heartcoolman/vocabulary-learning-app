import { useState, useCallback } from 'react';
import { isTauriEnvironment } from '../utils/tauri-bridge';

interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseInfo: ReleaseInfo | null;
}

const GITHUB_REPO = 'Heartcoolman/vocabulary-learning-app';
const CURRENT_VERSION = '0.1.0';

export function useUpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDesktop = isTauriEnvironment();

  const checkForUpdates = useCallback(async () => {
    if (!isDesktop) {
      setError('更新检查仅在桌面版可用');
      return;
    }

    setChecking(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setResult({
            hasUpdate: false,
            currentVersion: CURRENT_VERSION,
            latestVersion: CURRENT_VERSION,
            releaseInfo: null,
          });
          return;
        }
        throw new Error(`GitHub API 返回错误: ${response.status}`);
      }

      const release: ReleaseInfo = await response.json();
      const latestVersion = release.version || release.name?.replace(/^v/, '') || '0.0.0';

      const hasUpdate = compareVersions(latestVersion, CURRENT_VERSION) > 0;

      setResult({
        hasUpdate,
        currentVersion: CURRENT_VERSION,
        latestVersion,
        releaseInfo: hasUpdate ? release : null,
      });
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('当前处于离线状态，无法检查更新');
      } else {
        setError(err instanceof Error ? err.message : '检查更新失败');
      }
    } finally {
      setChecking(false);
    }
  }, [isDesktop]);

  return {
    checking,
    result,
    error,
    checkForUpdates,
    isDesktop,
  };
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}
