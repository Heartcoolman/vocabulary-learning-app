/**
 * ControlPanel - 控制面板组件
 *
 * 提供故障注入、暂停/播放、速度调节等控制功能
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Lightning,
  Warning,
  Pulse,
  CaretDown,
  CircleNotch,
} from '@phosphor-icons/react';
import { g3SpringSnappy } from '@/utils/animations';
import { FAULT_OPTIONS } from './constants';
import type { FaultInjectionRequest, FaultInjectionResponse } from './types';

interface ControlPanelProps {
  isPaused: boolean;
  onTogglePause: () => void;
  onInjectFault: (request: FaultInjectionRequest) => Promise<FaultInjectionResponse>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPaused,
  onTogglePause,
  onInjectFault,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInjecting, setIsInjecting] = useState(false);
  const [lastInjection, setLastInjection] = useState<FaultInjectionResponse | null>(null);

  const handleInjectFault = async (faultType: FaultInjectionRequest['faultType']) => {
    if (isInjecting) return;

    setIsInjecting(true);
    try {
      const result = await onInjectFault({ faultType });
      setLastInjection(result);
    } catch (error) {
      console.error('故障注入失败:', error);
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <div className="absolute top-4 right-4 z-20">
      <motion.div
        layout
        className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl overflow-hidden"
        transition={g3SpringSnappy}
      >
        {/* 头部控制栏 */}
        <div className="flex items-center gap-2 p-3">
          {/* 暂停/播放按钮 */}
          <button
            onClick={onTogglePause}
            className={`
              p-2 rounded-lg transition-colors
              ${isPaused
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }
            `}
            title={isPaused ? '继续' : '暂停'}
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>

          {/* 故障注入下拉 */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
              ${isExpanded
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }
            `}
          >
            <Lightning size={16} weight="fill" />
            <span className="text-sm font-medium">故障注入</span>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <CaretDown size={14} />
            </motion.div>
          </button>
        </div>

        {/* 故障注入选项 */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={g3SpringSnappy}
              className="border-t border-slate-700"
            >
              <div className="p-3 space-y-2">
                <p className="text-xs text-slate-500 mb-3">
                  选择故障类型，观察系统如何响应
                </p>

                {FAULT_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleInjectFault(option.type)}
                    disabled={isInjecting}
                    className={`
                      w-full flex items-center gap-3 p-2.5 rounded-lg
                      bg-slate-800/50 hover:bg-slate-800 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${option.color}20` }}
                    >
                      {isInjecting ? (
                        <CircleNotch size={16} className="animate-spin" style={{ color: option.color }} />
                      ) : option.type === 'anomaly' ? (
                        <Warning size={16} style={{ color: option.color }} />
                      ) : (
                        <Pulse size={16} style={{ color: option.color }} />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-slate-200">
                        {option.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {option.description}
                      </div>
                    </div>
                  </button>
                ))}

                {/* 最近注入结果 */}
                {lastInjection && (
                  <div className="mt-3 p-2.5 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="text-xs text-slate-400 mb-1">最近注入结果</div>
                    <div className="text-sm text-amber-400">
                      {lastInjection.expectedOutcome}
                    </div>
                    {lastInjection.guardRailTriggers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {lastInjection.guardRailTriggers.map((trigger: string) => (
                          <span
                            key={trigger}
                            className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default ControlPanel;
