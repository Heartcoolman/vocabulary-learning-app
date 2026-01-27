import type { SemanticWord, ConfusionPair } from '../services/client';
import type { WordItem } from '../services/learning/WordQueueManager';

export type LearningSeedSource = 'cluster' | 'confusion' | 'confusion-batch';

export interface LearningSeedState {
  seedWords: WordItem[];
  seedSource?: LearningSeedSource;
  seedLabel?: string;
  themeLabel?: string;
  confusionPairs?: ConfusionPair[];
  currentPairIndex?: number;
}

export function buildSeedWords(words: SemanticWord[]): WordItem[] {
  const seen = new Set<string>();
  const result: WordItem[] = [];

  for (const word of words) {
    if (!word?.id || seen.has(word.id)) continue;
    seen.add(word.id);
    result.push({
      id: word.id,
      spelling: word.spelling,
      phonetic: word.phonetic || '',
      meanings: word.meanings ?? [],
      examples: word.examples ?? [],
      audioUrl: word.audioUrl,
      isNew: false,
    });
  }

  return result;
}

export function buildBatchSeedFromPairs(pairs: ConfusionPair[]): WordItem[] {
  const seen = new Set<string>();
  const result: WordItem[] = [];

  for (const pair of pairs) {
    for (const word of [pair.word1, pair.word2]) {
      if (!word?.id || seen.has(word.id)) continue;
      seen.add(word.id);
      result.push({
        id: word.id,
        spelling: word.spelling,
        phonetic: word.phonetic || '',
        meanings: word.meanings ?? [],
        examples: word.examples ?? [],
        audioUrl: word.audioUrl,
        isNew: false,
      });
    }
  }

  return result;
}
