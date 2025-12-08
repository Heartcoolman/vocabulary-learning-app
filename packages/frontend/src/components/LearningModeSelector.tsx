import React, { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Lightning,
  Coffee,
  Cards,
  Translate,
  ArrowsLeftRight,
} from '@phosphor-icons/react';
import ApiClient from '../services/client';
import { useToast } from './ui';
import { uiLogger } from '../utils/logger';

interface ModeOption {
  id: string;
  name: string;
  description: string;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  standard: <GraduationCap size={20} weight="fill" />,
  cram: <Lightning size={20} weight="fill" />,
  relaxed: <Coffee size={20} weight="fill" />,
};

interface LearningModeSelectorProps {
  minimal?: boolean;
  learningType?: 'word-to-meaning' | 'meaning-to-word';
  onLearningTypeChange?: (type: 'word-to-meaning' | 'meaning-to-word') => void;
}

const LearningModeSelectorComponent: React.FC<LearningModeSelectorProps> = ({
  minimal = false,
  learningType = 'word-to-meaning',
  onLearningTypeChange,
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentMode, setCurrentMode] = useState('standard');
  const [modes, setModes] = useState<ModeOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCurrentMode = async () => {
      try {
        const result = await ApiClient.getUserRewardProfile();
        if (mounted) {
          setCurrentMode(result.currentProfile);
          setModes(result.availableProfiles);
        }
      } catch (error) {
        if (mounted) {
          uiLogger.error({ err: error }, '加载奖励配置失败');
        }
      }
    };

    loadCurrentMode();

    return () => {
      mounted = false;
    };
  }, []);

  const handleModeChange = async (modeId: string) => {
    if (modeId === currentMode) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      await ApiClient.updateUserRewardProfile(modeId);
      setCurrentMode(modeId);
      setIsOpen(false);
    } catch (error) {
      uiLogger.error({ err: error, modeId }, '更新奖励配置失败');
      toast.error('切换学习模式失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={
          minimal
            ? 'rounded-lg p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600'
            : 'btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-sm'
        }
        aria-label="选择学习模式"
        title="切换学习模式"
      >
        {MODE_ICONS[currentMode]}
        {!minimal && (
          <>
            <span className="hidden sm:inline">模式</span>
            <span className="text-xs text-gray-500">
              {modes.find((m) => m.id === currentMode)?.name}
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 animate-g3-fade-in"
            aria-hidden="true"
          />

          {/* 选择器面板 */}
          <div className="absolute left-0 top-full z-50 mt-2 w-80 animate-g3-scale-in rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">选择学习模式</h3>

            <div className="space-y-2">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  disabled={isLoading}
                  className={`w-full rounded-lg p-3 text-left transition-all ${
                    currentMode === mode.id
                      ? 'border-2 border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-2 border-transparent bg-gray-50 hover:bg-gray-100'
                  } ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {MODE_ICONS[mode.id]}
                    <span className="font-semibold text-gray-900">{mode.name}</span>
                    {currentMode === mode.id && (
                      <span className="ml-auto text-xs font-medium text-blue-600">当前</span>
                    )}
                  </div>
                  <div className="pl-7 text-sm text-gray-600">{mode.description}</div>
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="mt-3 text-center text-sm text-gray-500">正在切换模式...</div>
            )}

            {/* 学习方式选择 */}
            {onLearningTypeChange && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">学习方式</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => onLearningTypeChange('word-to-meaning')}
                    className={`flex-1 rounded-lg p-2 text-center transition-all ${
                      learningType === 'word-to-meaning'
                        ? 'border-2 border-blue-500 bg-blue-50'
                        : 'border-2 border-transparent bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <Translate size={20} className="mx-auto mb-1" />
                    <div className="text-xs font-medium">英译中</div>
                  </button>
                  <button
                    onClick={() => onLearningTypeChange('meaning-to-word')}
                    className={`flex-1 rounded-lg p-2 text-center transition-all ${
                      learningType === 'meaning-to-word'
                        ? 'border-2 border-blue-500 bg-blue-50'
                        : 'border-2 border-transparent bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <ArrowsLeftRight size={20} className="mx-auto mb-1" />
                    <div className="text-xs font-medium">中译英</div>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/flashcard');
                }}
                className="w-full cursor-pointer rounded-lg border-2 border-transparent bg-purple-50 p-3 text-left transition-all hover:border-purple-300 hover:bg-purple-100"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Cards size={20} weight="fill" className="text-purple-600" />
                  <span className="font-semibold text-gray-900">闪记模式</span>
                </div>
                <div className="pl-7 text-sm text-gray-600">快速翻卡复习，自评掌握程度</div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const LearningModeSelector = memo(LearningModeSelectorComponent);
