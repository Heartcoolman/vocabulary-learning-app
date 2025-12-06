export interface StudyConfig {
  dailyGoal: number;
  reviewRatio: number;
  difficultyPreference: 'easy' | 'medium' | 'hard' | 'adaptive';
  sessionDuration: number;
}

export interface LearningSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  wordsStudied: number;
  correctCount: number;
  totalTime: number;
}
