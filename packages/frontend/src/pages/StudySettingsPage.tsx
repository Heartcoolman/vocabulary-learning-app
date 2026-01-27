import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/client';
import { WordBook } from '../types/models';
import {
  CircleNotch,
  Eye,
  EyeSlash,
  Camera,
  Warning,
  ArrowCounterClockwise,
  SlidersHorizontal,
  Brain,
} from '../components/Icon';
import { useToast, Spinner, ConfirmModal } from '../components/ui';
import { uiLogger } from '../utils/logger';
import { useStudyConfig } from '../hooks/queries';
import { useUpdateStudyConfig } from '../hooks/mutations';
import { useVisualFatigueStore } from '../stores/visualFatigueStore';
import {
  useAmasSettingsStore,
  getDifficultyLabel,
  FATIGUE_SENSITIVITY_THRESHOLDS,
  type FatigueSensitivity,
  type FatigueAlertMode,
  type DifficultyAdjustSpeed,
} from '../stores/amasSettingsStore';
import { CameraPermissionRequest } from '../components/visual-fatigue';
import {
  DifficultyRangeSlider,
  ConfigPreview,
  type ConfigPreviewItem,
} from '../components/amas-settings';

// 默认设置值
const DEFAULT_SETTINGS = {
  dailyWordCount: 20,
  visualFatigueEnabled: false,
};

export default function StudySettingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [dailyCount, setDailyCount] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [showCameraPermission, setShowCameraPermission] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 使用 React Query hooks
  const { data: studyConfig, isLoading: configLoading } = useStudyConfig();
  const updateConfigMutation = useUpdateStudyConfig();

  // 视觉疲劳检测状态
  const {
    enabled: visualFatigueEnabled,
    setEnabled: setVisualFatigueEnabled,
    cameraPermission,
    setCameraPermission,
  } = useVisualFatigueStore();

  // AMAS 设置状态
  const {
    difficultyRange,
    adjustSpeed,
    fatigueSensitivity,
    fatigueAlertMode,
    setDifficultyRange,
    setAdjustSpeed,
    setFatigueSensitivity,
    setFatigueAlertMode,
    reset: resetAmasSettings,
  } = useAmasSettingsStore();

  // 本地编辑状态（用于预览）
  const [localDifficultyRange, setLocalDifficultyRange] = useState(difficultyRange);
  const [localAdjustSpeed, setLocalAdjustSpeed] = useState(adjustSpeed);
  const [localFatigueSensitivity, setLocalFatigueSensitivity] = useState(fatigueSensitivity);
  const [localFatigueAlertMode, setLocalFatigueAlertMode] = useState(fatigueAlertMode);

  // 同步本地状态
  useEffect(() => {
    setLocalDifficultyRange(difficultyRange);
    setLocalAdjustSpeed(adjustSpeed);
    setLocalFatigueSensitivity(fatigueSensitivity);
    setLocalFatigueAlertMode(fatigueAlertMode);
  }, [difficultyRange, adjustSpeed, fatigueSensitivity, fatigueAlertMode]);

  // 配置变更预览
  const configPreviewItems = useMemo<ConfigPreviewItem[]>(() => {
    const items: ConfigPreviewItem[] = [];
    if (
      localDifficultyRange.min !== difficultyRange.min ||
      localDifficultyRange.max !== difficultyRange.max
    ) {
      items.push({
        label: '难度范围',
        before: `${difficultyRange.min.toFixed(1)}-${difficultyRange.max.toFixed(1)}`,
        after: `${localDifficultyRange.min.toFixed(1)}-${localDifficultyRange.max.toFixed(1)}`,
        changed: true,
      });
    }
    if (localAdjustSpeed !== adjustSpeed) {
      const speedLabels: Record<DifficultyAdjustSpeed, string> = {
        conservative: '保守',
        normal: '正常',
        aggressive: '激进',
      };
      items.push({
        label: '调整速度',
        before: speedLabels[adjustSpeed],
        after: speedLabels[localAdjustSpeed],
        changed: true,
      });
    }
    if (localFatigueSensitivity !== fatigueSensitivity) {
      const sensitivityLabels: Record<FatigueSensitivity, string> = {
        low: '低',
        medium: '中',
        high: '高',
      };
      items.push({
        label: '疲劳灵敏度',
        before: sensitivityLabels[fatigueSensitivity],
        after: sensitivityLabels[localFatigueSensitivity],
        changed: true,
      });
    }
    if (localFatigueAlertMode !== fatigueAlertMode) {
      const modeLabels: Record<FatigueAlertMode, string> = { modal: '弹窗', statusbar: '状态栏' };
      items.push({
        label: '提醒方式',
        before: modeLabels[fatigueAlertMode],
        after: modeLabels[localFatigueAlertMode],
        changed: true,
      });
    }
    return items;
  }, [
    localDifficultyRange,
    localAdjustSpeed,
    localFatigueSensitivity,
    localFatigueAlertMode,
    difficultyRange,
    adjustSpeed,
    fatigueSensitivity,
    fatigueAlertMode,
  ]);

  // 保存 AMAS 设置
  const saveAmasSettings = () => {
    setDifficultyRange(localDifficultyRange);
    setAdjustSpeed(localAdjustSpeed);
    setFatigueSensitivity(localFatigueSensitivity);
    setFatigueAlertMode(localFatigueAlertMode);
    toast.success('AMAS 设置已保存');
  };

  // 加载词书列表
  useEffect(() => {
    loadWordBooks();
  }, []);

  // 当配置加载后，初始化表单
  useEffect(() => {
    if (studyConfig) {
      setSelectedBookIds(studyConfig.selectedWordBookIds || []);
      setDailyCount(studyConfig.dailyWordCount || 20);
    }
  }, [studyConfig]);

  const loadWordBooks = async () => {
    try {
      const booksData = await apiClient.getAllAvailableWordBooks();
      setWordBooks(booksData);
    } catch (err) {
      uiLogger.error({ err }, '加载词书列表失败');
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId],
    );
  };

  const handleSave = async () => {
    if (selectedBookIds.length === 0) {
      setError('请至少选择一个词书');
      return;
    }

    if (dailyCount < 10 || dailyCount > 100) {
      setError('每日学习量必须在10-100之间');
      return;
    }

    try {
      setError(null);

      await updateConfigMutation.mutateAsync({
        selectedWordBookIds: selectedBookIds,
        dailyWordCount: dailyCount,
        studyMode: 'sequential',
      });

      // 保存成功后返回学习页面（根路径）
      toast.success('学习设置已保存');
      navigate('/');
    } catch (err) {
      uiLogger.error({ err, selectedBookIds, dailyCount }, '保存学习设置失败');
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 恢复默认设置
  const handleResetToDefault = () => {
    setDailyCount(DEFAULT_SETTINGS.dailyWordCount);
    setVisualFatigueEnabled(DEFAULT_SETTINGS.visualFatigueEnabled);
    resetAmasSettings();
    setShowResetConfirm(false);
    toast.success('已恢复默认设置');
  };

  // 合并 loading 状态
  const isLoading = configLoading;
  const isSaving = updateConfigMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex min-h-screen animate-g3-fade-in items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" size="xl" color="primary" />
          <p className="text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
            正在加载...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl animate-g3-fade-in px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">学习设置</h1>

        {error && (
          <div className="mb-6 rounded-button border border-red-200 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* 左右分栏布局 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左侧 - 词书选择 */}
          <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">选择学习词书</h2>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              选中的词书将用于每日学习，支持多选
            </p>

            {wordBooks.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                暂无可用词书，请先创建或添加词书
              </div>
            ) : (
              <div className="max-h-[500px] space-y-3 overflow-y-auto pr-2">
                {wordBooks.map((book) => (
                  <label
                    key={book.id}
                    className={`flex cursor-pointer items-center rounded-button border p-4 transition-all duration-g3-fast ${
                      selectedBookIds.includes(book.id)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700'
                    } `}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBookIds.includes(book.id)}
                      onChange={() => toggleBook(book.id)}
                      className="h-5 w-5 rounded text-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900 dark:text-white">{book.name}</div>
                        {book.type === 'SYSTEM' && (
                          <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                            系统词库
                          </span>
                        )}
                      </div>
                      {book.description && (
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {book.description}
                        </div>
                      )}
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {book.wordCount} 个单词
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 右侧 - 设置选项 */}
          <div className="space-y-6">
            {/* 每日学习量 */}
            <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">每日学习量</h2>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={dailyCount}
                  onChange={(e) => setDailyCount(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-button bg-gray-200 accent-blue-500 dark:bg-slate-700"
                />
                <div className="w-20 text-right text-2xl font-bold text-blue-500">{dailyCount}</div>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                预计学习时长：约 {Math.ceil(dailyCount * 0.5)} 分钟
              </p>
            </div>

            {/* 视觉疲劳检测 */}
            <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Camera size={24} className="text-gray-600 dark:text-gray-400" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      视觉疲劳检测
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      使用摄像头检测眼睛疲劳，智能提醒休息
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!visualFatigueEnabled && cameraPermission !== 'granted') {
                      setShowCameraPermission(true);
                    } else {
                      setVisualFatigueEnabled(!visualFatigueEnabled);
                    }
                  }}
                  className={`relative h-7 w-12 rounded-full transition-colors duration-g3-fast ${
                    visualFatigueEnabled ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                  aria-label={visualFatigueEnabled ? '关闭视觉疲劳检测' : '开启视觉疲劳检测'}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-g3-fast ${
                      visualFatigueEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 状态指示 */}
              <div className="mt-4 flex items-center gap-2 text-sm">
                {visualFatigueEnabled ? (
                  <>
                    <Eye size={16} className="text-green-500" />
                    <span className="text-green-600 dark:text-green-400">检测已开启</span>
                  </>
                ) : (
                  <>
                    <EyeSlash size={16} className="text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">检测已关闭</span>
                  </>
                )}
                {cameraPermission === 'denied' && (
                  <span className="ml-2 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Warning size={14} />
                    摄像头权限被拒绝
                  </span>
                )}
              </div>

              {/* 隐私说明 */}
              <div className="mt-3 rounded-button bg-gray-50 p-3 text-xs text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                <p>所有检测在本地完成，视频数据不会上传到服务器。</p>
              </div>

              {/* 疲劳检测高级配置 (C9, C11) */}
              {visualFatigueEnabled && (
                <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">高级配置</h3>

                  {/* 疲劳灵敏度 */}
                  <div>
                    <label className="mb-2 block text-sm text-gray-600 dark:text-gray-400">
                      疲劳灵敏度 (EAR阈值: {FATIGUE_SENSITIVITY_THRESHOLDS[localFatigueSensitivity]}
                      )
                    </label>
                    <div className="flex gap-2">
                      {(['low', 'medium', 'high'] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => setLocalFatigueSensitivity(level)}
                          className={`flex-1 rounded-button px-3 py-2 text-sm transition-colors ${
                            localFatigueSensitivity === level
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 提醒方式 */}
                  <div>
                    <label className="mb-2 block text-sm text-gray-600 dark:text-gray-400">
                      提醒方式
                    </label>
                    <div className="flex gap-2">
                      {(['modal', 'statusbar'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setLocalFatigueAlertMode(mode)}
                          className={`flex-1 rounded-button px-3 py-2 text-sm transition-colors ${
                            localFatigueAlertMode === mode
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {mode === 'modal' ? '弹窗提醒' : '状态栏提示'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 自适应难度配置 (C10, C11) */}
            <div className="rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
              <div className="mb-4 flex items-center gap-3">
                <Brain size={24} className="text-gray-600 dark:text-gray-400" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">自适应难度</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    配置 AMAS 系统的难度调整范围和速度
                  </p>
                </div>
              </div>

              {/* 难度范围滑块 */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  难度范围
                </label>
                <DifficultyRangeSlider
                  min={localDifficultyRange.min}
                  max={localDifficultyRange.max}
                  onChange={(range) => setLocalDifficultyRange((prev) => ({ ...prev, ...range }))}
                />
              </div>

              {/* 调整速度 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  调整速度
                </label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'conservative', label: '保守', desc: '变化缓慢，稳定优先' },
                      { value: 'normal', label: '正常', desc: '平衡调整' },
                      { value: 'aggressive', label: '激进', desc: '快速响应表现' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setLocalAdjustSpeed(option.value)}
                      className={`flex-1 rounded-button px-3 py-3 transition-colors ${
                        localAdjustSpeed === option.value
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      <div className="text-sm font-medium">{option.label}</div>
                      <div
                        className={`mt-0.5 text-xs ${localAdjustSpeed === option.value ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        {option.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 配置变更预览 */}
              {configPreviewItems.length > 0 && (
                <div className="mt-4">
                  <ConfigPreview items={configPreviewItems} title="待保存的变更" />
                  <button
                    onClick={saveAmasSettings}
                    className="mt-3 w-full rounded-button bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                  >
                    保存 AMAS 设置
                  </button>
                </div>
              )}
            </div>

            {/* 学习统计 */}
            {selectedBookIds.length > 0 && (
              <div className="rounded-card border border-blue-200 bg-blue-50 p-6 shadow-soft dark:border-blue-800 dark:bg-blue-900/30">
                <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">当前选择</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">已选择词书</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {selectedBookIds.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">总单词数</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {wordBooks
                        .filter((b) => selectedBookIds.includes(b.id))
                        .reduce((sum, b) => sum + b.wordCount, 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-blue-200 pt-3 dark:border-blue-800">
                    <span className="text-gray-700 dark:text-gray-300">预计学习天数</span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {Math.ceil(
                        wordBooks
                          .filter((b) => selectedBookIds.includes(b.id))
                          .reduce((sum, b) => sum + b.wordCount, 0) / dailyCount,
                      )}{' '}
                      天
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || selectedBookIds.length === 0}
                className="w-full rounded-button bg-blue-500 px-6 py-3 font-medium text-white transition-all duration-g3-fast hover:scale-105 hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700"
              >
                {isSaving ? '保存中...' : '保存设置'}
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-button border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700"
                >
                  <ArrowCounterClockwise size={18} />
                  恢复默认
                </button>

                <button
                  onClick={() => navigate(-1)}
                  className="flex-1 rounded-button bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-95 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 摄像头权限请求弹窗 */}
      {showCameraPermission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="m-4 max-w-md">
            <CameraPermissionRequest
              permissionStatus={cameraPermission}
              onRequestPermission={async () => {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  stream.getTracks().forEach((track) => track.stop());
                  setCameraPermission('granted');
                  setVisualFatigueEnabled(true);
                  setShowCameraPermission(false);
                  return 'granted';
                } catch {
                  setCameraPermission('denied');
                  return 'denied';
                }
              }}
              onSkip={() => setShowCameraPermission(false)}
            />
          </div>
        </div>
      )}

      {/* 恢复默认确认弹窗 */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetToDefault}
        title="恢复默认设置"
        message="确定要将所有设置恢复为默认值吗？已选择的词书不会改变。"
        confirmText="确认恢复"
        cancelText="取消"
        variant="warning"
      />
    </div>
  );
}
