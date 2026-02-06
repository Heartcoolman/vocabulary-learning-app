import { useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CircleNotch,
  CloudArrowDown,
  ShieldCheck,
  WifiSlash,
} from './Icon';
import { useDesktopSettings } from '../hooks/useDesktopSettings';
import { useUpdateChecker } from '../hooks/useUpdateChecker';

export function DesktopSettingsPanel() {
  const { settings, updateSetting, resetWindowLayout, isDesktop } = useDesktopSettings();
  const { checking, result, error, checkForUpdates } = useUpdateChecker();
  const [resetSuccess, setResetSuccess] = useState(false);

  if (!isDesktop) {
    return null;
  }

  const handleResetLayout = async () => {
    await resetWindowLayout();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const handleTelemetryChange = async (enabled: boolean) => {
    await updateSetting('telemetryEnabled', enabled);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">桌面版设置</h3>

      {/* 窗口布局 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">窗口布局</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">重置窗口位置和大小为默认值</p>
          </div>
          <button
            onClick={handleResetLayout}
            disabled={resetSuccess}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {resetSuccess ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                已重置
              </>
            ) : (
              <>
                <ArrowCounterClockwise className="h-4 w-4" />
                重置布局
              </>
            )}
          </button>
        </div>
      </div>

      {/* 更新检查 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">检查更新</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {result?.hasUpdate
                ? `有新版本可用: v${result.latestVersion}`
                : result
                  ? `当前版本: v${result.currentVersion} (最新)`
                  : '检查是否有新版本'}
            </p>
          </div>
          <button
            onClick={checkForUpdates}
            disabled={checking}
            className="bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {checking ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin" />
                检查中...
              </>
            ) : (
              <>
                <CloudArrowDown className="h-4 w-4" />
                检查更新
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
            <WifiSlash className="h-4 w-4" />
            {error}
          </div>
        )}

        {result?.hasUpdate && result.releaseInfo && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <h5 className="font-medium text-green-800 dark:text-green-300">
              {result.releaseInfo.name}
            </h5>
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">
              {result.releaseInfo.body?.slice(0, 200)}
              {(result.releaseInfo.body?.length ?? 0) > 200 && '...'}
            </p>
            <a
              href={result.releaseInfo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline dark:text-green-400"
            >
              前往下载
              <ArrowSquareOut className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

      {/* 遥测设置 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">帮助改进应用</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">发送匿名错误报告帮助我们改进</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings.telemetryEnabled}
              onChange={(e) => handleTelemetryChange(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer-checked:bg-primary-600 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 dark:border-gray-600 dark:bg-gray-700"></div>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck className="h-4 w-4" />
          不包含学习内容等隐私数据
        </div>
      </div>
    </div>
  );
}
