import React, { useState, useEffect } from 'react';
import {
  Clock,
  TrendUp,
  Calendar,
  ArrowClockwise,
  FloppyDisk,
  ArrowCounterClockwise,
  Lightbulb,
} from './Icon';
import apiClient from '../services/client';
import HabitHeatmap from './HabitHeatmap';
import ChronotypeCard from './ChronotypeCard';
import LearningStyleCard from './LearningStyleCard';
import type { HabitProfile } from '../types/habit-profile';
import type { CognitiveProfile } from '../types/cognitive';
import { learningLogger } from '../utils/logger';

const HabitProfileTab: React.FC = () => {
  const [profile, setProfile] = useState<HabitProfile | null>(null);
  const [cognitiveProfile, setCognitiveProfile] = useState<CognitiveProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'save' | 'init' | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getHabitProfile();
        if (mounted) {
          setProfile(data.realtime);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '加载习惯数据失败');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const loadCognitive = async () => {
      try {
        const data = await apiClient.getCognitiveProfile();
        if (mounted) {
          setCognitiveProfile(data);
        }
      } catch (err) {
        learningLogger.warn({ err }, '加载认知画像失败');
        if (mounted) {
          setCognitiveProfile(null);
        }
      }
    };

    loadData();
    loadCognitive();

    return () => {
      mounted = false;
    };
  }, []);

  const loadHabitProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getHabitProfile();
      setProfile(data.realtime);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载习惯数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setActionLoading('save');
      setActionMessage(null);
      const result = await apiClient.persistHabitProfile();
      if (result.saved) {
        setActionMessage({ type: 'success', text: '习惯画像已保存' });
      } else {
        setActionMessage({ type: 'error', text: '保存失败，样本数据不足' });
      }
      await loadHabitProfile();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleInitProfile = async () => {
    try {
      setActionLoading('init');
      setActionMessage(null);
      const result = await apiClient.initializeHabitProfile();
      if (result.initialized) {
        setActionMessage({ type: 'success', text: '已从历史数据重新初始化习惯画像' });
      }
      await loadHabitProfile();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : '初始化失败' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error || '数据加载失败'}</p>
          <button
            onClick={loadHabitProfile}
            className="mx-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <ArrowClockwise size={16} weight="bold" />
            重试
          </button>
        </div>
      </div>
    );
  }

  // 防御性检查：确保 preferredTimeSlots 是数组
  const preferredTimeSlotsLabels =
    (profile.preferredTimeSlots || []).map((hour: number) => `${hour}:00-${hour}:59`).join(', ') ||
    '暂无数据';

  return (
    <div className="space-y-6">
      {/* Row 1: Core Statistics */}
      <div className="grid animate-g3-fade-in grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Clock className="text-blue-600" size={24} weight="bold" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">学习时长</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">平均每次</span>
              <span className="text-lg font-bold text-blue-600">
                {profile.rhythmPref.sessionMedianMinutes.toFixed(0)} 分钟
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <TrendUp className="text-green-600" size={24} weight="bold" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">学习节奏</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">平均批次</span>
              <span className="text-lg font-bold text-green-600">
                {profile.rhythmPref.batchMedian.toFixed(0)} 个/次
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Calendar className="text-purple-600" size={24} weight="bold" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">数据样本</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">学习会话</span>
              <span className="font-semibold text-gray-900">{profile.samples.sessions}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">时间事件</span>
              <span className="font-semibold text-gray-900">{profile.samples.timeEvents}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">批次记录</span>
              <span className="font-semibold text-gray-900">{profile.samples.batches}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: AMAS Advanced Profiling (New) */}
      <div
        className="grid animate-g3-fade-in grid-cols-1 gap-6 lg:grid-cols-2"
        style={{ animationDelay: '100ms' }}
      >
        {cognitiveProfile ? (
          <>
            <ChronotypeCard data={cognitiveProfile.chronotype} />
            <LearningStyleCard data={cognitiveProfile.learningStyle} />
          </>
        ) : (
          <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-600">认知画像数据加载中或数据不足...</p>
            <p className="mt-2 text-xs text-gray-500">
              需要至少20条学习记录才能生成Chronotype，50条记录才能生成Learning Style
            </p>
          </div>
        )}
      </div>

      {profile.preferredTimeSlots.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-gray-800">偏好时段</h3>
          <div className="flex flex-wrap gap-2">
            {profile.preferredTimeSlots.map((hour: number) => (
              <span
                key={hour}
                className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700"
              >
                {hour}:00 - {hour}:59
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-gray-500">你最常在 {preferredTimeSlotsLabels} 进行学习</p>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <HabitHeatmap timePref={profile.timePref} />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">数据管理</h3>

        {actionMessage && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ${
              actionMessage.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-700'
                : 'border border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSaveProfile}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLoading === 'save' ? (
              <ArrowClockwise size={16} weight="bold" className="animate-spin" />
            ) : (
              <FloppyDisk size={16} weight="bold" />
            )}
            保存习惯画像
          </button>

          <button
            onClick={handleInitProfile}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLoading === 'init' ? (
              <ArrowClockwise size={16} weight="bold" className="animate-spin" />
            ) : (
              <ArrowCounterClockwise size={16} weight="bold" />
            )}
            从历史重建
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          习惯画像会在每次学习会话结束时自动更新。你也可以手动保存或从历史记录重新初始化。
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold text-blue-900">
          <Lightbulb size={16} weight="fill" className="text-blue-600" /> 关于习惯画像
        </h4>
        <p className="text-sm text-blue-700">
          系统会自动分析你的学习习惯，包括偏好的学习时段、每次学习时长和学习节奏。 这些数据将帮助
          AMAS 为你提供更个性化的学习建议。
        </p>
      </div>
    </div>
  );
};

export default HabitProfileTab;
