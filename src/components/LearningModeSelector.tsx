import React, { useState, useEffect } from 'react';
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
  relaxed: <Coffee size={20} weight="fill" />
};

export const LearningModeSelector: React.FC = () => {
  const toast = useToast();
  const [currentMode, setCurrentMode] = useState('standard');
  const [modes, setModes] = useState<ModeOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadCurrentMode();
  }, []);

  const loadCurrentMode = async () => {
    try {
      const result = await ApiClient.getUserRewardProfile();
      setCurrentMode(result.currentProfile);
      setModes(result.availableProfiles);
    } catch (error) {
      uiLogger.error({ err: error }, '加载奖励配置失败');
    }
  };

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
        className="btn-secondary flex items-center gap-2"
        aria-label="选择学习模式"
      >
        {MODE_ICONS[currentMode]}
        <span className="hidden sm:inline">学习模式</span>
        <span className="text-xs text-gray-500">
          {modes.find(m => m.id === currentMode)?.name}
        </span>
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
              className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-lg p-4 w-80 z-50 border border-gray-200"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                选择学习模式
              </h3>

              <div className="space-y-2">
                {modes.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => handleModeChange(mode.id)}
                    disabled={isLoading}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      currentMode === mode.id
                        ? 'bg-blue-50 border-2 border-blue-500 shadow-sm'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {MODE_ICONS[mode.id]}
                      <span className="font-semibold text-gray-900">{mode.name}</span>
                      {currentMode === mode.id && (
                        <span className="ml-auto text-xs text-blue-600 font-medium">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 pl-7">{mode.description}</div>
                  </button>
                ))}
              </div>

              {isLoading && (
                <div className="mt-3 text-center text-sm text-gray-500">
                  正在切换模式...
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
