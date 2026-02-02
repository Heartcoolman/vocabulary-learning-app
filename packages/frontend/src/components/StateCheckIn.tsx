import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { EnergyLevel } from '@danci/shared';

const ENERGY_LEVELS: { level: EnergyLevel; label: string; emoji: string; desc: string }[] = [
  { level: 'high', label: '精力充沛', emoji: '💪', desc: '今天状态很好，可以多学点' },
  { level: 'normal', label: '平平淡淡', emoji: '😐', desc: '一般般，正常学习' },
  { level: 'low', label: '精疲力尽', emoji: '😴', desc: '有点累，轻松学习' },
];

const STORAGE_KEY = 'lastEnergyLevel';
const AUTO_SKIP_DELAY_MS = 3000;

interface StateCheckInProps {
  onSelect: (level: EnergyLevel) => void;
  onSkip: () => void;
}

function StateCheckIn({ onSelect, onSkip }: StateCheckInProps) {
  const [selected, setSelected] = useState<EnergyLevel | null>(null);
  const [countdown, setCountdown] = useState(AUTO_SKIP_DELAY_MS / 1000);
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
          onSelect(fallback);
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
      setTimeout(() => onSelect(level), 200);
    },
    [onSelect],
  );

  const handleSkip = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onSkip();
  }, [onSkip]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <h2 className="mb-2 text-center text-xl font-bold text-gray-900 dark:text-white">
          今天状态如何？
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          帮助我们为你调整学习强度
          {countdown > 0 && (
            <span className="ml-2 text-xs text-gray-400">({countdown}秒后自动跳过)</span>
          )}
        </p>

        <div className="space-y-3">
          {ENERGY_LEVELS.map(({ level, label, emoji, desc }) => (
            <button
              key={level}
              onClick={() => handleSelect(level)}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all duration-200 ${
                selected === level
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-600'
              }`}
            >
              <span className="text-3xl">{emoji}</span>
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
