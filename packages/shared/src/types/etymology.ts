/**
 * Etymology and morphology types for word root network
 */

export type MorphemeType = 'prefix' | 'root' | 'suffix';

export interface Morpheme {
  id: string;
  surface: string;
  type: MorphemeType;
  meaning?: string;
  meaningZh?: string;
  language: string;
  etymology?: string;
  aliases: string[];
  frequency: number;
}

export interface WordPart {
  part: string;
  type: MorphemeType;
  meaning?: string;
  meaningZh?: string;
}

export interface WordEtymology {
  wordId: string;
  decomposition: WordPart[];
  roots: Morpheme[];
  confidence: number;
  source: string;
}

export interface RelatedWord {
  id: string;
  spelling: string;
  meaning?: string;
  sharedRoot: string;
}

export interface WordFamily {
  root: Morpheme;
  words: RelatedWord[];
  totalCount: number;
}

export interface RootFeatures {
  rootCount: number;
  knownRootRatio: number;
  avgRootMastery: number;
  maxRootMastery: number;
}

export interface UserMorphemeState {
  id: string;
  userId: string;
  morphemeId: string;
  masteryLevel: number;
  stability: number;
  difficulty: number;
  exposureCount: number;
  correctCount: number;
}

export interface AnalyzeEtymologyRequest {
  decomposition: Array<{
    part: string;
    type: MorphemeType;
    meaning?: string;
    meaningZh?: string;
  }>;
  confidence?: number;
  source?: string;
}

export interface EtymologyResponse<T> {
  success: boolean;
  data: T;
}
