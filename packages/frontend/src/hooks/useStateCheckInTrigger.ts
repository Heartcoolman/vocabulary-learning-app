import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export type StateChangeTrigger = 'time' | 'fatigue' | 'struggling';

interface UseStateCheckInTriggerReturn {
  shouldShow: boolean;
  trigger: StateChangeTrigger | null;
  triggerFromLearningState: (reason: 'fatigue' | 'struggling') => void;
  dismiss: () => void;
}

export function useStateCheckInTrigger(): UseStateCheckInTriggerReturn {
  const [shouldShow, setShouldShow] = useState(false);
  const [trigger, setTrigger] = useState<StateChangeTrigger | null>(null);

  useEffect(() => {
    const lastTimestamp = localStorage.getItem(STORAGE_KEYS.STATE_CHECKIN_TIMESTAMP);
    if (!lastTimestamp) {
      setShouldShow(true);
      setTrigger('time');
      return;
    }

    const elapsed = Date.now() - parseInt(lastTimestamp, 10);
    if (elapsed >= THREE_HOURS_MS) {
      setShouldShow(true);
      setTrigger('time');
    }
  }, []);

  const triggerFromLearningState = useCallback((reason: 'fatigue' | 'struggling') => {
    setShouldShow(true);
    setTrigger(reason);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.STATE_CHECKIN_TIMESTAMP, Date.now().toString());
    setShouldShow(false);
    setTrigger(null);
  }, []);

  return { shouldShow, trigger, triggerFromLearningState, dismiss };
}
