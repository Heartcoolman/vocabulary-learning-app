import { useState, useEffect, useCallback } from 'react';

import { wordBookClient, learningClient } from '../services/client';
import StorageService from '../services/StorageService';
import { learningLogger } from '../utils/logger';
import { Milestone } from '../components/progress/MilestoneCard';

import { StudyProgressData } from './useStudyProgress';

export interface ExtendedProgressData extends StudyProgressData {
  weeklyProgress: number;
  weeklyTarget: number;
  milestones: Milestone[];
  masteryDistribution: Array<{
    level: number;
    count: number;
    percentage: number;
  }>;
  estimatedDaysToComplete: number | null;
  monthlyTrend: number[];
  learningStreak: number;
}

interface UseExtendedProgressReturn {
  progress: ExtendedProgressData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useExtendedProgress = (userId: string | undefined): UseExtendedProgressReturn => {
  const [progress, setProgress] = useState<ExtendedProgressData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!userId) {
      setError('用户未登录');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 获取基础进度数据
      const basicProgress = await wordBookClient.getStudyProgress();

      // 获取所有单词和学习状态
      const words = await StorageService.getWords();
      const wordIds = words.map((w) => w.id);
      const wordStates = await StorageService.getWordLearningStates(userId, wordIds);

      // 计算掌握度分布
      const masteryMap = new Map<number, number>();
      for (let level = 0; level <= 5; level++) {
        masteryMap.set(level, 0);
      }

      wordStates.forEach((state) => {
        if (state) {
          const count = masteryMap.get(state.masteryLevel) || 0;
          masteryMap.set(state.masteryLevel, count + 1);
        }
      });

      const masteryDistribution = Array.from(masteryMap.entries()).map(([level, count]) => ({
        level,
        count,
        percentage: words.length > 0 ? (count / words.length) * 100 : 0,
      }));

      // 计算本周学习进度
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // 本周日
      weekStart.setHours(0, 0, 0, 0);

      const records = await learningClient.getRecords({ pageSize: 1000 });
      const weeklyRecordsMap = new Map<string, boolean>();

      records.records.forEach((record) => {
        const recordDate = new Date(record.timestamp);
        if (recordDate >= weekStart) {
          weeklyRecordsMap.set(record.wordId, true);
        }
      });

      const weeklyProgress = weeklyRecordsMap.size;
      const weeklyTarget = basicProgress.todayTarget * 7;

      // 计算连续学习天数
      const studyDates = new Set(records.records.map((r) => new Date(r.timestamp).toDateString()));
      const sortedDates = Array.from(studyDates)
        .map((d) => new Date(d).getTime())
        .sort((a, b) => b - a);

      let learningStreak = 0;
      const today = new Date().setHours(0, 0, 0, 0);
      const yesterday = today - 24 * 60 * 60 * 1000;
      const startDate = sortedDates.length > 0 && sortedDates[0] === today ? today : yesterday;

      for (let i = 0; i < sortedDates.length; i++) {
        const expectedDate = startDate - i * 24 * 60 * 60 * 1000;
        if (sortedDates[i] === expectedDate) {
          learningStreak++;
        } else {
          break;
        }
      }

      // 计算预计完成时间
      const remainingWords = Math.max(0, basicProgress.todayTarget * 7 - weeklyProgress);
      const avgDailyProgress = weeklyProgress / 7;
      const estimatedDaysToComplete =
        avgDailyProgress > 0 ? Math.ceil(remainingWords / avgDailyProgress) : null;

      // 计算月度趋势（最近30天）
      const monthlyTrend: number[] = [];
      const now = new Date();

      for (let i = 29; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setDate(now.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayRecords = records.records.filter((r) => {
          const recordDate = new Date(r.timestamp);
          return recordDate >= dayStart && recordDate <= dayEnd;
        });

        const uniqueWords = new Set(dayRecords.map((r) => r.wordId));
        monthlyTrend.push(uniqueWords.size);
      }

      // 生成学习里程碑
      const milestones: Milestone[] = [
        {
          id: 'daily',
          title: '每日目标',
          description: '完成今天的学习任务',
          target: basicProgress.todayTarget,
          current: basicProgress.todayStudied,
          icon: 'target',
          achieved: basicProgress.todayStudied >= basicProgress.todayTarget,
          color: 'blue',
        },
        {
          id: 'weekly',
          title: '本周目标',
          description: '完成本周学习计划',
          target: weeklyTarget,
          current: weeklyProgress,
          icon: 'trophy',
          achieved: weeklyProgress >= weeklyTarget,
          color: 'purple',
        },
        {
          id: 'streak',
          title: '学习连胜',
          description: '连续学习天数',
          target: 7,
          current: learningStreak,
          icon: 'zap',
          achieved: learningStreak >= 7,
          color: 'amber',
        },
        {
          id: 'mastery',
          title: '词汇掌握',
          description: '达到熟悉及以上等级',
          target: words.length,
          current: wordStates.filter((s) => s && s.masteryLevel >= 3).length,
          icon: 'star',
          achieved: wordStates.filter((s) => s && s.masteryLevel >= 3).length >= words.length * 0.5,
          color: 'green',
        },
      ];

      const extendedProgress: ExtendedProgressData = {
        ...basicProgress,
        weeklyProgress,
        weeklyTarget,
        milestones,
        masteryDistribution,
        estimatedDaysToComplete,
        monthlyTrend,
        learningStreak,
      };

      setProgress(extendedProgress);
    } catch (err) {
      learningLogger.error({ err }, '获取扩展学习进度失败');
      setError('无法加载学习进度，请检查网络连接。');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progress, loading, error, refresh: fetchProgress };
};
