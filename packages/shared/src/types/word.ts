export interface Word {
  id: string;
  spelling: string;
  phonetic?: string;
  definition: string;
  example?: string;
  frequency?: number;
  difficulty?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WordBookType = 'SYSTEM' | 'CUSTOM';

export interface WordBook {
  id: string;
  name: string;
  description?: string;
  type: WordBookType;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}
