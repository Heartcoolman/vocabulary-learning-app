# Spec: Frontend VARK Updates

## Overview

前端组件和类型定义更新，支持 VARK 四维模型展示和交互数据采集。

---

## 1. 类型定义更新

**文件**: `packages/frontend/src/types/cognitive.ts`

```typescript
/**
 * 学习风格类型（VARK 四维 + multimodal）
 */
export type LearningStyleType = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'multimodal';

/**
 * 学习风格类型（旧版兼容）
 */
export type LearningStyleTypeLegacy = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

/**
 * 学习风格评分（VARK 四维）
 */
export interface LearningStyleScores {
  visual: number;
  auditory: number;
  reading: number;
  kinesthetic: number;
}

/**
 * 学习风格画像
 */
export interface LearningStyleProfile {
  style: LearningStyleType;
  styleLegacy: LearningStyleTypeLegacy;
  confidence: number;
  sampleCount: number;
  scores: LearningStyleScores;
  interactionPatterns: LearningStyleInteractionPatterns;
  modelType: 'rule_engine' | 'ml_sgd';
}
```

---

## 2. LearningStyleCard 组件更新

**文件**: `packages/frontend/src/components/LearningStyleCard.tsx`

### 新增 Reading 配置

```typescript
import { Eye, Headphones, Hand, Brain, BookOpen, Sparkle } from './Icon';

export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'multimodal';

// 保留旧类型别名（向后兼容）
export type LearningStyleLegacy = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

export interface LearningStyleProfile {
  style: LearningStyle;
  styleLegacy?: LearningStyleLegacy;
  confidence: number;
  scores: {
    visual: number;
    auditory: number;
    reading: number;
    kinesthetic: number;
  };
}

const getStyleConfig = (style: LearningStyle) => {
  switch (style) {
    case 'visual':
      return {
        label: '视觉型 (Visual)',
        icon: Eye,
        desc: '你对图像、图表和书面文字记忆深刻。建议多使用思维导图和颜色标记。',
        color: 'text-sky-600',
        bg: 'bg-sky-50',
      };
    case 'auditory':
      return {
        label: '听觉型 (Auditory)',
        icon: Headphones,
        desc: '通过聆听和朗读能达到最佳效果。建议开启单词发音，尝试跟读练习。',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
      };
    case 'reading':
      return {
        label: '读写型 (Reading)',
        icon: BookOpen,
        desc: '你对文字阅读和书写有较强偏好。建议多查看例句和释义，尝试做笔记。',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
      };
    case 'kinesthetic':
      return {
        label: '动觉型 (Kinesthetic)',
        icon: Hand,
        desc: '通过互动和操作学习最有效。建议多参与拼写测试和互动小游戏。',
        color: 'text-rose-600',
        bg: 'bg-rose-50',
      };
    case 'multimodal':
    default:
      return {
        label: '多模态型 (Multimodal)',
        icon: Brain,
        desc: '你能灵活运用多种感官进行学习。结合视听读写多种方式可达到最佳效果。',
        color: 'text-violet-600',
        bg: 'bg-violet-50',
      };
  }
};
```

### 四维进度条展示

```typescript
const metrics = [
  { label: '视觉', key: 'visual', score: profile.scores.visual, icon: Eye, color: 'bg-sky-500' },
  {
    label: '听觉',
    key: 'auditory',
    score: profile.scores.auditory,
    icon: Headphones,
    color: 'bg-emerald-500',
  },
  {
    label: '读写',
    key: 'reading',
    score: profile.scores.reading,
    icon: BookOpen,
    color: 'bg-amber-500',
  },
  {
    label: '动觉',
    key: 'kinesthetic',
    score: profile.scores.kinesthetic,
    icon: Hand,
    color: 'bg-rose-500',
  },
];
```

### 兼容处理

```typescript
const LearningStyleCard: React.FC<LearningStyleCardProps> = ({ data }) => {
  // 兼容旧数据：如果没有 reading 字段，默认为 0
  const profile: LearningStyleProfile = data
    ? {
        ...data,
        scores: {
          visual: data.scores.visual,
          auditory: data.scores.auditory,
          reading: data.scores.reading ?? 0,
          kinesthetic: data.scores.kinesthetic,
        },
      }
    : defaultProfile;

  // 兼容旧 style：mixed → multimodal
  const style = profile.style === 'mixed' ? 'multimodal' : profile.style;
  const config = getStyleConfig(style);

  // ...
};
```

---

## 3. 交互数据采集 Hook

**文件**: `packages/frontend/src/hooks/useInteractionTracker.ts`

```typescript
import { useCallback, useRef } from 'react';
import { useAnswerRecordStore } from '../stores/answerRecordStore';

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

export function useInteractionTracker(wordId: string) {
  const dataRef = useRef<InteractionData>({
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

  const longPressStartRef = useRef<number | null>(null);
  const readingStartRef = useRef<{ type: 'definition' | 'example'; start: number } | null>(null);

  // 图片查看
  const trackImageView = useCallback(() => {
    dataRef.current.imageViewCount += 1;
  }, []);

  // 图片缩放
  const trackImageZoom = useCallback(() => {
    dataRef.current.imageZoomCount += 1;
  }, []);

  // 图片长按开始
  const trackImageLongPressStart = useCallback(() => {
    longPressStartRef.current = Date.now();
  }, []);

  // 图片长按结束
  const trackImageLongPressEnd = useCallback(() => {
    if (longPressStartRef.current) {
      dataRef.current.imageLongPressMs += Date.now() - longPressStartRef.current;
      longPressStartRef.current = null;
    }
  }, []);

  // 音频播放
  const trackAudioPlay = useCallback((isReplay: boolean) => {
    dataRef.current.audioPlayCount += 1;
    if (isReplay) {
      dataRef.current.audioReplayCount += 1;
    }
  }, []);

  // 语速调节
  const trackAudioSpeedAdjust = useCallback(() => {
    dataRef.current.audioSpeedAdjust = true;
  }, []);

  // 开始阅读
  const trackReadingStart = useCallback((type: 'definition' | 'example') => {
    readingStartRef.current = { type, start: Date.now() };
  }, []);

  // 结束阅读
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

  // 笔记
  const trackNote = useCallback(() => {
    dataRef.current.noteWriteCount += 1;
  }, []);

  // 获取当前数据
  const getData = useCallback(() => {
    // 结束所有未完成的追踪
    trackImageLongPressEnd();
    trackReadingEnd();
    return { ...dataRef.current };
  }, [trackImageLongPressEnd, trackReadingEnd]);

  // 重置
  const reset = useCallback(() => {
    dataRef.current = {
      imageViewCount: 0,
      imageZoomCount: 0,
      imageLongPressMs: 0,
      audioPlayCount: 0,
      audioReplayCount: 0,
      audioSpeedAdjust: false,
      definitionReadMs: 0,
      exampleReadMs: 0,
      noteWriteCount: 0,
    };
  }, []);

  return {
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
  };
}
```

---

## 4. 答题记录扩展

**文件**: `packages/frontend/src/services/client/amas/AmasClient.ts`

### 提交答题记录时包含 VARK 数据

```typescript
export interface SubmitAnswerRequest {
  wordId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  dwellTime: number;
  responseTime?: number;
  sessionId?: string;

  // VARK 新增字段
  imageViewCount?: number;
  imageZoomCount?: number;
  imageLongPressMs?: number;
  audioPlayCount?: number;
  audioReplayCount?: number;
  audioSpeedAdjust?: boolean;
  definitionReadMs?: number;
  exampleReadMs?: number;
  noteWriteCount?: number;
}
```

---

## 5. Icon 组件扩展

**文件**: `packages/frontend/src/components/Icon.tsx`

确保导出 `BookOpen` 图标：

```typescript
export { BookOpen } from 'lucide-react';
```

---

## 约束

| 约束 ID | 描述                                             |
| ------- | ------------------------------------------------ |
| F1      | 当 `scores.reading` 缺失时，默认为 0             |
| F2      | 当 `style === 'mixed'` 时，映射为 `'multimodal'` |
| F3      | 四维进度条必须显示四个维度                       |
| F4      | 交互数据必须在提交答案时一并发送                 |
| F5      | 长按和阅读计时必须在组件卸载时自动结束           |
