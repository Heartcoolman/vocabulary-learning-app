import { useCallback, useMemo, useRef } from 'react';

export interface InteractionData {
  imageViewCount: number;
  imageZoomCount: number;
  imageLongPressMs: number;
  audioPlayCount: number;
  audioReplayCount: number;
  audioSpeedAdjust: boolean;
  definitionReadMs: number;
  exampleReadMs: number;
  noteWriteCount: number;
}

const createEmptyInteractionData = (): InteractionData => ({
  imageViewCount: 0,
  imageZoomCount: 0,
  imageLongPressMs: 0,
  audioPlayCount: 0,
  audioReplayCount: 0,
  audioSpeedAdjust: false,
  definitionReadMs: 0,
  exampleReadMs: 0,
  noteWriteCount: 0,
});

export function useInteractionTracker() {
  const dataRef = useRef<InteractionData>(createEmptyInteractionData());
  const longPressStartRef = useRef<number | null>(null);
  const readingStartRef = useRef<{ type: 'definition' | 'example'; start: number } | null>(null);

  const trackImageView = useCallback(() => {
    dataRef.current.imageViewCount += 1;
  }, []);

  const trackImageZoom = useCallback(() => {
    dataRef.current.imageZoomCount += 1;
  }, []);

  const trackImageLongPressStart = useCallback(() => {
    longPressStartRef.current = Date.now();
  }, []);

  const trackImageLongPressEnd = useCallback(() => {
    if (longPressStartRef.current) {
      dataRef.current.imageLongPressMs += Date.now() - longPressStartRef.current;
      longPressStartRef.current = null;
    }
  }, []);

  const trackAudioPlay = useCallback((isReplay: boolean = false) => {
    dataRef.current.audioPlayCount += 1;
    if (isReplay) {
      dataRef.current.audioReplayCount += 1;
    }
  }, []);

  const trackAudioSpeedAdjust = useCallback(() => {
    dataRef.current.audioSpeedAdjust = true;
  }, []);

  const trackReadingStart = useCallback((type: 'definition' | 'example') => {
    readingStartRef.current = { type, start: Date.now() };
  }, []);

  const trackReadingEnd = useCallback(() => {
    if (readingStartRef.current) {
      const duration = Date.now() - readingStartRef.current.start;
      if (readingStartRef.current.type === 'definition') {
        dataRef.current.definitionReadMs += duration;
      } else {
        dataRef.current.exampleReadMs += duration;
      }
      readingStartRef.current = null;
    }
  }, []);

  const trackNote = useCallback(() => {
    dataRef.current.noteWriteCount += 1;
  }, []);

  const getData = useCallback((): InteractionData => {
    // End any ongoing tracking
    if (longPressStartRef.current) {
      dataRef.current.imageLongPressMs += Date.now() - longPressStartRef.current;
      longPressStartRef.current = null;
    }
    if (readingStartRef.current) {
      const duration = Date.now() - readingStartRef.current.start;
      if (readingStartRef.current.type === 'definition') {
        dataRef.current.definitionReadMs += duration;
      } else {
        dataRef.current.exampleReadMs += duration;
      }
      readingStartRef.current = null;
    }
    return { ...dataRef.current };
  }, []);

  const reset = useCallback(() => {
    dataRef.current = createEmptyInteractionData();
    longPressStartRef.current = null;
    readingStartRef.current = null;
  }, []);

  return useMemo(
    () => ({
      trackImageView,
      trackImageZoom,
      trackImageLongPressStart,
      trackImageLongPressEnd,
      trackAudioPlay,
      trackAudioSpeedAdjust,
      trackReadingStart,
      trackReadingEnd,
      trackNote,
      getData,
      reset,
    }),
    [
      trackImageView,
      trackImageZoom,
      trackImageLongPressStart,
      trackImageLongPressEnd,
      trackAudioPlay,
      trackAudioSpeedAdjust,
      trackReadingStart,
      trackReadingEnd,
      trackNote,
      getData,
      reset,
    ],
  );
}

export type InteractionTracker = ReturnType<typeof useInteractionTracker>;
