import React, { useState, useEffect } from 'react';
import { Clock, TrendingUp, Calendar, RefreshCw, Save, RotateCcw } from 'lucide-react';
import apiClient from '../services/ApiClient';
import HabitHeatmap from './HabitHeatmap';
import ChronotypeCard from './ChronotypeCard';
import LearningStyleCard from './LearningStyleCard';
import type { HabitProfile } from '../types/habit-profile';

const HabitProfileTab: React.FC = () => {
  const [profile, setProfile] = useState<HabitProfile | null>(null);
  const [cognitiveProfile, setCognitiveProfile] = useState<{
    chronotype: any;
    learningStyle: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'save' | 'init' | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadHabitProfile();
    loadCognitiveProfile();
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

  const loadCognitiveProfile = async () => {
    try {
      const data = await apiClient.getCognitiveProfile();
      setCognitiveProfile(data);
    } catch (err) {
      console.warn('Failed to load cognitive profile:', err);
      // Don't set error - cognitive profile is optional/supplementary
      setCognitiveProfile(null);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '数据加载失败'}</p>
          <button
            onClick={loadHabitProfile}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      </div>
    );
  }

  // 防御性检查：确保 preferredTimeSlots 是数组
  const preferredTimeSlotsLabels = (profile.preferredTimeSlots || [])
    .map(hour => `${hour}:00-${hour}:59`)
    .join(', ') || '暂无数据';

  return (
    <div className="space-y-6">
      {/* Row 1: Core Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-g3-fade-in">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="text-blue-600" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">学习时长</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均每次</span>
              <span className="text-lg font-bold text-blue-600">
                {profile.rhythmPref.sessionMedianMinutes.toFixed(0)} 分钟
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">学习节奏</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均批次</span>
              <span className="text-lg font-bold text-green-600">
                {profile.rhythmPref.batchMedian.toFixed(0)} 个/次
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="text-purple-600" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">数据样本</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">学习会话</span>
              <span className="font-semibold text-gray-900">{profile.samples.sessions}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">时间事件</span>
              <span className="font-semibold text-gray-900">{profile.samples.timeEvents}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">批次记录</span>
              <span className="font-semibold text-gray-900">{profile.samples.batches}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: AMAS Advanced Profiling (New) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-g3-fade-in" style={{ animationDelay: '100ms' }}>
        {cognitiveProfile ? (
          <>
            <ChronotypeCard data={cognitiveProfile.chronotype} />
            <LearningStyleCard data={cognitiveProfile.learningStyle} />
          </>
        ) : (
          <div className="col-span-2 bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
            <p className="text-gray-600 text-sm">认知画像数据加载中或数据不足...</p>
            <p className="text-gray-500 text-xs mt-2">需要至少20条学习记录才能生成Chronotype，50条记录才能生成Learning Style</p>
          </div>
        )}</div>

      {profile.preferredTimeSlots.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">偏好时段</h3>
          <div className="flex flex-wrap gap-2">
            {profile.preferredTimeSlots.map((hour) => (
              <span
                key={hour}
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
              >
                {hour}:00 - {hour}:59
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-3">
            你最常在 {preferredTimeSlotsLabels} 进行学习
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <HabitHeatmap timePref={profile.timePref} />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">数据管理</h3>
        
        {actionMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            actionMessage.type === 'success' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {actionMessage.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSaveProfile}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'save' ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            保存习惯画像
          </button>
          
          <button
            onClick={handleInitProfile}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'init' ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}
            从历史重建
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-3">
          习惯画像会在每次学习会话结束时自动更新。你也可以手动保存或从历史记录重新初始化。
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 关于习惯画像</h4>
        <p className="text-sm text-blue-700">
          系统会自动分析你的学习习惯，包括偏好的学习时段、每次学习时长和学习节奏。
          这些数据将帮助 AMAS 为你提供更个性化的学习建议。
        </p>
      </div>
    </div>
  );
};

export default HabitProfileTab;
