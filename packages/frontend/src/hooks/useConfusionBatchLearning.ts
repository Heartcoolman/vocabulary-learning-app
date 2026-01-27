import { useState, useCallback, useMemo } from 'react';
import type { ConfusionPair } from '../services/client';

export interface ConfusionBatchState {
  pairs: ConfusionPair[];
  currentPairIndex: number;
  themeLabel: string;
  completedPairs: number;
  skippedPairs: number;
  startTime: number;
}

interface UseConfusionBatchLearningOptions {
  pairs: ConfusionPair[];
  themeLabel: string;
  initialPairIndex?: number;
}

export function useConfusionBatchLearning({
  pairs,
  themeLabel,
  initialPairIndex = 0,
}: UseConfusionBatchLearningOptions) {
  const [currentPairIndex, setCurrentPairIndex] = useState(initialPairIndex);
  const [completedPairs, setCompletedPairs] = useState(0);
  const [skippedPairs, setSkippedPairs] = useState(0);
  const [startTime] = useState(Date.now());
  const [isEnded, setIsEnded] = useState(false);

  const totalPairs = pairs.length;
  const currentPair = pairs[currentPairIndex] ?? null;
  const isLastPair = currentPairIndex >= totalPairs - 1;
  const allPairsProcessed = currentPairIndex >= totalPairs;

  const progress = useMemo(
    () => ({
      current: currentPairIndex + 1,
      total: totalPairs,
      completed: completedPairs,
      skipped: skippedPairs,
      percentage: totalPairs > 0 ? Math.round(((currentPairIndex + 1) / totalPairs) * 100) : 0,
    }),
    [currentPairIndex, totalPairs, completedPairs, skippedPairs],
  );

  const advanceToNextPair = useCallback(() => {
    if (currentPairIndex < totalPairs - 1) {
      setCurrentPairIndex((prev) => prev + 1);
      setCompletedPairs((prev) => prev + 1);
    } else {
      setCompletedPairs((prev) => prev + 1);
      setIsEnded(true);
    }
  }, [currentPairIndex, totalPairs]);

  const skipPair = useCallback(() => {
    if (currentPairIndex < totalPairs - 1) {
      setCurrentPairIndex((prev) => prev + 1);
      setSkippedPairs((prev) => prev + 1);
    } else {
      setSkippedPairs((prev) => prev + 1);
      setIsEnded(true);
    }
  }, [currentPairIndex, totalPairs]);

  const endSession = useCallback(() => {
    setIsEnded(true);
  }, []);

  const getSessionStats = useCallback(() => {
    const elapsedMs = Date.now() - startTime;
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

    return {
      totalPairs,
      completedPairs,
      skippedPairs,
      elapsedTime: `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`,
      elapsedMs,
      themeLabel,
    };
  }, [totalPairs, completedPairs, skippedPairs, startTime, themeLabel]);

  return {
    currentPair,
    currentPairIndex,
    progress,
    themeLabel,
    isLastPair,
    isEnded: isEnded || allPairsProcessed,
    advanceToNextPair,
    skipPair,
    endSession,
    getSessionStats,
  };
}
