/**
 * Learning Objectives Configuration Page
 * 学习目标配置页面
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ApiClient from '../services/client';
import { LearningObjectives, LearningObjectiveMode } from '../types/learning-objectives';
import { NotePencil, Books, Globe, Gear, Warning, CheckCircle } from '../components/Icon';
import { IconProps } from '@phosphor-icons/react';
import {
  ModeCard,
  WeightSlider,
  ConfigDisplay,
  LearningObjectivesSkeleton,
} from '../components/learning-objectives';

interface ModeConfig {
  label: string;
  description: string;
  Icon: React.ComponentType<IconProps>;
}

const MODE_CONFIGS: Record<LearningObjectiveMode, ModeConfig> = {
  exam: {
    label: '考试模式',
    description: '提升准确率，适合备考冲刺',
    Icon: NotePencil,
  },
  daily: {
    label: '日常模式',
    description: '平衡学习，适合长期记忆',
    Icon: Books,
  },
  travel: {
    label: '旅行模式',
    description: '快速学习，适合时间有限',
    Icon: Globe,
  },
  custom: {
    label: '自定义模式',
    description: '自定义配置，灵活调整',
    Icon: Gear,
  },
};

export const LearningObjectivesPage: React.FC = () => {
  const [objectives, setObjectives] = useState<LearningObjectives | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理定时器的辅助函数
  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  // 设置成功消息并自动清除
  const showSuccessMessage = useCallback(
    (message: string) => {
      clearSuccessTimer();
      setSuccessMessage(message);
      successTimerRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimerRef.current = null;
      }, 3000);
    },
    [clearSuccessTimer],
  );

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearSuccessTimer();
    };
  }, [clearSuccessTimer]);

  useEffect(() => {
    loadObjectives();
  }, []);

  const loadObjectives = async () => {
    try {
      setLoading(true);
      const response = await ApiClient.getLearningObjectives();
      // Handle both direct response and wrapped response
      const data =
        (response as { data?: LearningObjectives }).data || (response as LearningObjectives);
      setObjectives(data);
      setError(null);
    } catch (err: unknown) {
      const httpErr = err as { response?: { status?: number } };
      if (httpErr?.response?.status === 404) {
        setObjectives({
          userId: '',
          mode: 'daily',
          primaryObjective: 'accuracy',
          weightShortTerm: 0.4,
          weightLongTerm: 0.4,
          weightEfficiency: 0.2,
        });
      } else {
        setError('加载配置失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: LearningObjectiveMode) => {
    try {
      setSaving(true);
      setError(null);
      const response = await ApiClient.switchLearningMode(mode, 'manual');
      // Handle both direct response and wrapped response
      const data =
        (response as { data?: LearningObjectives }).data || (response as LearningObjectives);
      setObjectives(data);
      showSuccessMessage(`已切换到${MODE_CONFIGS[mode].label}`);
    } catch (_err) {
      setError('切换模式失败');
    } finally {
      setSaving(false);
    }
  };

  const handleWeightChange = (
    field: 'weightShortTerm' | 'weightLongTerm' | 'weightEfficiency',
    value: number,
  ) => {
    if (!objectives) return;
    setObjectives({ ...objectives, [field]: value });
  };

  const handleSaveCustom = async () => {
    if (!objectives) return;

    const total =
      objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency;
    if (Math.abs(total - 1.0) > 0.01) {
      setError('权重总和必须为 1.0');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.updateLearningObjectives(objectives);
      showSuccessMessage('配置已保存');
      setError(null);
    } catch (_err) {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 加载状态 - 显示骨架屏
  if (loading) {
    return <LearningObjectivesSkeleton />;
  }

  // 无数据状态
  if (!objectives) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Warning size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">无法加载配置</p>
        </div>
      </div>
    );
  }

  const weightSum =
    objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency;
  const isWeightValid = Math.abs(weightSum - 1.0) <= 0.01;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-gray-900 md:text-3xl">学习目标配置</h1>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-button border border-red-200 bg-red-50 p-4 text-red-700">
          <Warning size={20} weight="bold" className="flex-shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* 成功提示 */}
      {successMessage && (
        <div className="mb-4 flex items-center gap-3 rounded-button border border-green-200 bg-green-50 p-4 text-green-700">
          <CheckCircle size={20} weight="bold" className="flex-shrink-0" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      {/* 学习模式选择 */}
      <section className="mb-8 rounded-card border border-gray-100 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-bold text-gray-900">学习模式</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {(Object.keys(MODE_CONFIGS) as LearningObjectiveMode[]).map((mode) => (
            <ModeCard
              key={mode}
              mode={mode}
              label={MODE_CONFIGS[mode].label}
              description={MODE_CONFIGS[mode].description}
              Icon={MODE_CONFIGS[mode].Icon}
              isActive={objectives.mode === mode}
              disabled={saving}
              onClick={() => handleModeChange(mode)}
            />
          ))}
        </div>
      </section>

      {/* 自定义权重配置 */}
      {objectives.mode === 'custom' && (
        <section className="mb-8 rounded-card border border-gray-100 bg-white p-6 shadow-soft">
          <h2 className="mb-6 text-xl font-bold text-gray-900">权重配置</h2>

          <WeightSlider
            label="短期记忆"
            value={objectives.weightShortTerm}
            onChange={(value) => handleWeightChange('weightShortTerm', value)}
            colorClass="blue"
          />

          <WeightSlider
            label="长期记忆"
            value={objectives.weightLongTerm}
            onChange={(value) => handleWeightChange('weightLongTerm', value)}
            colorClass="purple"
          />

          <WeightSlider
            label="学习效率"
            value={objectives.weightEfficiency}
            onChange={(value) => handleWeightChange('weightEfficiency', value)}
            colorClass="green"
          />

          {/* 权重总和提示 */}
          <div
            className={`mb-6 rounded-button p-3 text-center font-semibold ${
              isWeightValid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            权重总和: {weightSum.toFixed(2)}
            {!isWeightValid && ' (需要等于 1.0)'}
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleSaveCustom}
            disabled={saving || !isWeightValid}
            className={`w-full rounded-button px-6 py-3 text-base font-bold text-white transition-all ${
              saving || !isWeightValid
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98]'
            } `}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </section>
      )}

      {/* 当前配置展示 */}
      <ConfigDisplay objectives={objectives} modeLabel={MODE_CONFIGS[objectives.mode].label} />
    </div>
  );
};

export default LearningObjectivesPage;
