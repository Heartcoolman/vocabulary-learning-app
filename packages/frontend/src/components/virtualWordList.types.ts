export const ITEM_HEIGHT = 160;
export const ITEM_GAP = 16;
export const ROW_HEIGHT = ITEM_HEIGHT + ITEM_GAP;

export interface WordWithState {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  masteryLevel: number;
  score: number;
  nextReviewDate: string;
  accuracy: number;
  studyCount: number;
}

export interface VirtualWordListProps {
  words: WordWithState[];
  onAdjustWord: (word: WordWithState, action: 'mastered' | 'needsPractice' | 'reset') => void;
  containerHeight?: number;
}
