import React, { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Lightning, Coffee } from '@phosphor-icons/react';
import ApiClient from '../services/ApiClient';
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
}

const LearningModeSelectorComponent: React.FC<LearningModeSelectorProps> = ({
  minimal = false,
}) => {
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

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
              aria-hidden="true"
            />

            {/* 选择器面板 */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
            >
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export const LearningModeSelector = memo(LearningModeSelectorComponent);
