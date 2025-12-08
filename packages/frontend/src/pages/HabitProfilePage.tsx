import React, { useEffect, useState } from 'react';
import apiClient from '../services/client';
import { HabitProfileResponse, HabitProfile, StoredHabitProfile } from '../types/habit-profile';
import ChronotypeCard from '../components/ChronotypeCard';
import { RhythmCard } from '../components/profile/RhythmCard';
import { MotivationCard } from '../components/profile/MotivationCard';
import { HabitHeatmap } from '../components/profile/HabitHeatmap';
import { ChartBar, ArrowsClockwise, FloppyDisk, Warning } from '@phosphor-icons/react';
import { useToast } from '../components/ui';
import { learningLogger } from '../utils/logger';

const HabitProfilePage: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<HabitProfileResponse | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const profile = await apiClient.getHabitProfile();
      setProfileData(profile);
    } catch (err) {
      setError('加载习惯数据失败，请稍后重试');
      learningLogger.error({ err }, '加载习惯数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInitialize = async () => {
    try {
      setIsRefetching(true);
      await apiClient.initializeHabitProfile();
      await fetchData();
    } catch (err) {
      toast.error('初始化失败');
    } finally {
      setIsRefetching(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await apiClient.persistHabitProfile();
      toast.success('保存成功');
      fetchData();
    } catch (err) {
      toast.error('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const activeProfile = profileData?.realtime || profileData?.stored;
  const samples = profileData?.realtime?.samples;

  const getChronotype = (pref: number[]) => {
    if (!pref || pref.length === 0)
      return { type: 'neutral' as const, confidence: 0, peakHours: [] };

    const sortedIndices = pref.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const peakHours = sortedIndices
      .slice(0, 3)
      .map((x) => x.i)
      .sort((a, b) => a - b);

    const morningWeight = pref.slice(5, 12).reduce((a, b) => a + b, 0);
    const eveningWeight =
      pref.slice(19, 24).reduce((a, b) => a + b, 0) + pref.slice(0, 4).reduce((a, b) => a + b, 0);
    const total = pref.reduce((a, b) => a + b, 0) || 1;

    let type: 'morning' | 'evening' | 'neutral' = 'neutral';
    let confidence = 0.5;

    if (morningWeight > eveningWeight * 1.5) {
      type = 'morning';
      confidence = morningWeight / total;
    } else if (eveningWeight > morningWeight * 1.5) {
      type = 'evening';
      confidence = eveningWeight / total;
    }

    return { type, confidence, peakHours };
  };

  const getRhythm = (profile: HabitProfile | StoredHabitProfile | null | undefined) => {
    const median = profile?.rhythmPref?.sessionMedianMinutes || 0;
    let type: 'fast' | 'slow' | 'mixed' = 'mixed';
    if (median > 0 && median < 15) type = 'fast';
    if (median > 40) type = 'slow';

    return {
      type,
      avgDuration: median,
      preferredPace: 0,
    };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Warning size={48} className="mx-auto mb-4 text-red-400" />
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-white"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const chronotype = getChronotype(activeProfile?.timePref || []);
  const rhythm = getRhythm(activeProfile);
  const hasData = (samples?.sessions || 0) > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
              <ChartBar className="text-indigo-500" weight="duotone" />
              我的学习习惯画像
            </h1>
            <p className="mt-1 text-sm text-gray-500">基于您的历史学习行为分析生成的个性化报告</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleInitialize}
              disabled={isRefetching}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowsClockwise className={isRefetching ? 'animate-spin' : ''} />
              重新计算
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasData}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FloppyDisk />
              保存画像
            </button>
          </div>
        </div>

        {!hasData ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
              <ChartBar size={32} className="text-indigo-400" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-800">暂无画像数据</h3>
            <p className="mb-6 text-gray-500">点击"重新计算"从您的历史学习记录中初始化分析。</p>
            <button
              onClick={handleInitialize}
              className="rounded-lg bg-indigo-500 px-6 py-2 text-white hover:bg-indigo-600"
            >
              开始分析
            </button>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ChronotypeCard
                type={chronotype.type}
                confidence={chronotype.confidence}
                peakHours={chronotype.peakHours}
              />

              <RhythmCard
                type={rhythm.type}
                avgDuration={rhythm.avgDuration}
                preferredPace={rhythm.preferredPace}
              />

              <MotivationCard streak={0} level={50} trend="stable" />
            </div>

            {/* Heatmap Section */}
            <HabitHeatmap data={activeProfile?.timePref || []} />

            {/* Stats Footer */}
            <div className="flex flex-wrap gap-6 border-t border-gray-200 pt-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <span>
                  已分析会话:{' '}
                  <span className="font-mono text-gray-600">{samples?.sessions || 0}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <span>
                  数据采样点:{' '}
                  <span className="font-mono text-gray-600">{samples?.timeEvents || 0}</span>
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span>
                  上次更新:{' '}
                  {profileData?.stored?.updatedAt
                    ? new Date(profileData.stored.updatedAt).toLocaleString()
                    : '实时预览'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HabitProfilePage;
