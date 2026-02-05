import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { EnergyLevel } from '@danci/shared';

import { Lightning, SmileyMeh, Bed, X, type IconProps } from '@phosphor-icons/react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { StateChangeTrigger } from '../hooks/useStateCheckInTrigger';

const ENERGY_LEVELS: {
  level: EnergyLevel;
  label: string;
  Icon: React.ComponentType<IconProps>;
  desc: string;
}[] = [
  { level: 'high', label: '精力充沛', Icon: Lightning, desc: '今天状态很好，可以多学点' },
  { level: 'normal', label: '平平淡淡', Icon: SmileyMeh, desc: '一般般，正常学习' },
  { level: 'low', label: '精疲力尽', Icon: Bed, desc: '有点累，轻松学习' },
];

const STORAGE_KEY = 'lastEnergyLevel';
const AUTO_SKIP_DELAY_MS = 3000;
const INLINE_AUTO_DISMISS_MS = 5000;

const TRIGGER_TITLES: Record<StateChangeTrigger, string> = {
  time: '今天状态如何？',
  fatigue: '感觉有点累了？',
  struggling: '学习遇到挑战？',
};

interface StateCheckInProps {
  onSelect: (level: EnergyLevel) => void;
  onSkip: () => void;
  trigger?: StateChangeTrigger | null;
  inline?: boolean;
}

function StateCheckIn({ onSelect, onSkip, trigger, inline }: StateCheckInProps) {
  const [selected, setSelected] = useState<EnergyLevel | null>(null);
  const autoDelayMs = inline ? INLINE_AUTO_DISMISS_MS : AUTO_SKIP_DELAY_MS;
  const [countdown, setCountdown] = useState(autoDelayMs / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLevelRef = useRef<EnergyLevel | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as EnergyLevel | null;
    if (stored && ENERGY_LEVELS.some((e) => e.level === stored)) {
      lastLevelRef.current = stored;
    }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          const fallback = lastLevelRef.current ?? 'normal';
          localStorage.setItem(STORAGE_KEY, fallback);
          localStorage.setItem(STORAGE_KEYS.STATE_CHECKIN_TIMESTAMP, Date.now().toString());
          // 确保在下一个事件循环tick中调用回调，避免在渲染过程中触发父组件更新
          setTimeout(() => onSelect(fallback), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onSelect]);

  const handleSelect = useCallback(
    (level: EnergyLevel) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setSelected(level);
      localStorage.setItem(STORAGE_KEY, level);
      localStorage.setItem(STORAGE_KEYS.STATE_CHECKIN_TIMESTAMP, Date.now().toString());
      setTimeout(() => onSelect(level), 200);
    },
    [onSelect],
  );

  const handleSkip = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onSkip();
  }, [onSkip]);

  // 小窗模式 UI（学习中触发）
  if (inline) {
    return (
      <div className="animate-in slide-in-from-right fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-elevated dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {TRIGGER_TITLES[trigger ?? 'time']}
          </h3>
          <button
            onClick={handleSkip}
            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-center gap-3">
          {ENERGY_LEVELS.map(({ level, label, Icon }) => (
            <button
              key={level}
              onClick={() => handleSelect(level)}
              className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
                selected === level
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700'
              }`}
              title={label}
            >
              <Icon size={24} weight={selected === level ? 'fill' : 'regular'} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
          {countdown}秒后自动消失
        </div>
      </div>
    );
  }

  // 全屏模式 UI（首次/时间触发）
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <h2 className="mb-2 text-center text-xl font-bold text-gray-900 dark:text-white">
          {TRIGGER_TITLES[trigger ?? 'time']}
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          帮助我们为你调整学习强度
          {countdown > 0 && (
            <span className="ml-2 text-xs text-gray-400">({countdown}秒后自动跳过)</span>
          )}
        </p>

        <div className="space-y-3">
          {ENERGY_LEVELS.map(({ level, label, Icon, desc }) => (
            <button
              key={level}
              onClick={() => handleSelect(level)}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all duration-200 ${
                selected === level
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-600'
              }`}
            >
              <span className="text-3xl text-blue-500 dark:text-blue-400">
                <Icon size={32} weight="fill" />
              </span>
              <div className="text-left">
                <div className="font-medium text-gray-900 dark:text-white">{label}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{desc}</div>
              </div>
              {lastLevelRef.current === level && (
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">上次选择</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleSkip}
          className="mt-4 w-full rounded-lg py-2 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          跳过
        </button>
      </div>
    </div>
  );
}

export default memo(StateCheckIn);
