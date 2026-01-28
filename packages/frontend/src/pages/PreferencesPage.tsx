import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CircleNotch,
  Warning,
  GearSix,
  BookOpen,
  Bell,
  PaintBrush,
  Check,
  ArrowCounterClockwise,
} from '../components/Icon';
import { preferencesClient } from '../services/client';
import type {
  UserPreferences,
  LearningPreferences,
  NotificationPreferences,
  UiPreferences,
} from '../services/client';

type TabType = 'learning' | 'notification' | 'ui';

export default function PreferencesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('learning');
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await preferencesClient.getPreferences();
      setPreferences(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载偏好设置失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLearning = async (updates: Partial<LearningPreferences>) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      const updated = await preferencesClient.updateLearningPreferences(updates);
      setPreferences({ ...preferences, learning: updated });
      showSaveSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateNotification = async (updates: Partial<NotificationPreferences>) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      const updated = await preferencesClient.updateNotificationPreferences(updates);
      setPreferences({ ...preferences, notification: updated });
      showSaveSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUi = async (updates: Partial<UiPreferences>) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      const updated = await preferencesClient.updateUiPreferences(updates);
      setPreferences({ ...preferences, ui: updated });
      showSaveSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置所有偏好设置吗？此操作不可撤销。')) return;
    setIsSaving(true);
    try {
      const data = await preferencesClient.resetPreferences();
      setPreferences(data);
      showSaveSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const showSaveSuccess = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="text-center">
          <CircleNotch
            className="mx-auto mb-4 animate-spin"
            size={48}
            weight="bold"
            color="#3b82f6"
          />
          <p className="text-gray-600 dark:text-gray-400">正在加载偏好设置...</p>
        </div>
      </div>
    );
  }

  if (error && !preferences) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <Warning size={64} color="#ef4444" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">加载失败</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 active:scale-95"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (!preferences) return null;

  const tabs: { key: TabType; label: string; icon: typeof BookOpen }[] = [
    { key: 'learning', label: '学习', icon: BookOpen },
    { key: 'notification', label: '通知', icon: Bell },
    { key: 'ui', label: '界面', icon: PaintBrush },
  ];

  return (
    <div className="min-h-screen animate-g3-fade-in bg-gray-50 px-4 py-8 dark:bg-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label="返回"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <GearSix size={28} className="text-blue-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">偏好设置</h1>
            </div>
          </div>
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-button border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <ArrowCounterClockwise size={16} />
            重置
          </button>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-2 rounded-button bg-green-50 px-4 py-3 text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <Check size={20} />
            保存成功
          </div>
        )}

        {error && preferences && (
          <div className="rounded-button bg-red-50 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mb-6 flex gap-2 rounded-button border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-button px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
              }`}
            >
              <tab.icon size={18} weight={activeTab === tab.key ? 'fill' : 'regular'} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-card border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          {activeTab === 'learning' && (
            <LearningTab
              preferences={preferences.learning}
              onUpdate={handleUpdateLearning}
              disabled={isSaving}
            />
          )}
          {activeTab === 'notification' && (
            <NotificationTab
              preferences={preferences.notification}
              onUpdate={handleUpdateNotification}
              disabled={isSaving}
            />
          )}
          {activeTab === 'ui' && (
            <UiTab preferences={preferences.ui} onUpdate={handleUpdateUi} disabled={isSaving} />
          )}
        </div>
      </div>
    </div>
  );
}

function LearningTab({
  preferences,
  onUpdate,
  disabled,
}: {
  preferences: LearningPreferences;
  onUpdate: (updates: Partial<LearningPreferences>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">每日目标</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">启用每日目标</span>
            <input
              type="checkbox"
              checked={preferences.dailyGoalEnabled}
              onChange={(e) => onUpdate({ dailyGoalEnabled: e.target.checked })}
              disabled={disabled}
              className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
          {preferences.dailyGoalEnabled && (
            <div className="flex items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">每日学习单词数</span>
              <input
                type="number"
                min={1}
                max={200}
                value={preferences.dailyGoalWords}
                onChange={(e) => onUpdate({ dailyGoalWords: parseInt(e.target.value) || 10 })}
                disabled={disabled}
                className="w-24 rounded-button border border-gray-200 bg-white px-3 py-2 text-center dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">学习时间偏好</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">开始时间</label>
            <input
              type="time"
              value={preferences.preferredStudyTimeStart || '08:00'}
              onChange={(e) => onUpdate({ preferredStudyTimeStart: e.target.value })}
              disabled={disabled}
              className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">结束时间</label>
            <input
              type="time"
              value={preferences.preferredStudyTimeEnd || '22:00'}
              onChange={(e) => onUpdate({ preferredStudyTimeEnd: e.target.value })}
              disabled={disabled}
              className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">难度偏好</h3>
        <select
          value={preferences.preferredDifficulty || 'medium'}
          onChange={(e) => onUpdate({ preferredDifficulty: e.target.value })}
          disabled={disabled}
          className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          <option value="easy">简单 - 更多复习，较少新词</option>
          <option value="medium">中等 - 平衡复习与新词</option>
          <option value="hard">困难 - 更多新词，较少复习</option>
        </select>
      </div>
    </div>
  );
}

function NotificationTab({
  preferences,
  onUpdate,
  disabled,
}: {
  preferences: NotificationPreferences;
  onUpdate: (updates: Partial<NotificationPreferences>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">通知开关</h3>
        <div className="space-y-3">
          {[
            { key: 'enableForgettingAlerts', label: '遗忘提醒' },
            { key: 'enableAchievements', label: '成就通知' },
            { key: 'enableReminders', label: '学习提醒' },
            { key: 'enableSystemNotif', label: '系统通知' },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
              <input
                type="checkbox"
                checked={preferences[item.key as keyof NotificationPreferences] as boolean}
                onChange={(e) => onUpdate({ [item.key]: e.target.checked })}
                disabled={disabled}
                className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">提醒频率</h3>
        <select
          value={preferences.reminderFrequency}
          onChange={(e) => onUpdate({ reminderFrequency: e.target.value })}
          disabled={disabled}
          className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="never">从不</option>
        </select>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">免打扰时段</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">开始时间</label>
            <input
              type="time"
              value={preferences.quietHoursStart || '22:00'}
              onChange={(e) => onUpdate({ quietHoursStart: e.target.value })}
              disabled={disabled}
              className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">结束时间</label>
            <input
              type="time"
              value={preferences.quietHoursEnd || '08:00'}
              onChange={(e) => onUpdate({ quietHoursEnd: e.target.value })}
              disabled={disabled}
              className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function UiTab({
  preferences,
  onUpdate,
  disabled,
}: {
  preferences: UiPreferences;
  onUpdate: (updates: Partial<UiPreferences>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">主题</h3>
        <div className="flex gap-3">
          {[
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
            { value: 'system', label: '跟随系统' },
          ].map((theme) => (
            <button
              key={theme.value}
              onClick={() => onUpdate({ theme: theme.value })}
              disabled={disabled}
              className={`flex-1 rounded-button border px-4 py-3 text-sm font-medium transition-all ${
                preferences.theme === theme.value
                  ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">语言</h3>
        <select
          value={preferences.language}
          onChange={(e) => onUpdate({ language: e.target.value })}
          disabled={disabled}
          className="w-full rounded-button border border-gray-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          <option value="zh-CN">简体中文</option>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-700">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">效果</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">音效</span>
            <input
              type="checkbox"
              checked={preferences.soundEnabled}
              onChange={(e) => onUpdate({ soundEnabled: e.target.checked })}
              disabled={disabled}
              className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">动画效果</span>
            <input
              type="checkbox"
              checked={preferences.animationEnabled}
              onChange={(e) => onUpdate({ animationEnabled: e.target.checked })}
              disabled={disabled}
              className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
