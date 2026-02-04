// Root-level components
export { default as WordCard } from './WordCard';
export { default as TestOptions } from './TestOptions';

export { default as ProtectedRoute } from './ProtectedRoute';
export { default as SyncIndicator } from './SyncIndicator';
export { default as AmasStatus } from './AmasStatus';
export { default as AmasSuggestion } from './AmasSuggestion';
export { default as FileUpload } from './FileUpload';
export { default as StatusModal } from './StatusModal';
export { default as SuggestionModal } from './SuggestionModal';
export { default as BatchImportModal } from './BatchImportModal';
export { default as ProgressBarChart } from './ProgressBarChart';
export { default as LineChart } from './LineChart';
export { default as ChronotypeCard } from './ChronotypeCard';
export { DecisionTooltip } from './DecisionTooltip';
export { default as LearningStyleCard } from './LearningStyleCard';
export { default as MasteryProgress } from './MasteryProgress';
export { LearningModeSelector } from './LearningModeSelector';
export { default as BadgeCelebration } from './BadgeCelebration';

// Re-export from sub-directories
export * from './ui';
export * from './progress';
export * from './profile';
export * from './dashboard';
export * from './explainability';
export * from './word-mastery';
export * from './admin';
export * from './badges';
