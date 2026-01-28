export type ConfidenceCategory = {
  level: 'low' | 'medium' | 'high' | 'unknown';
  color: string;
  bgColor: string;
  label: string;
};

export function getConfidenceCategory(confidence: number | undefined | null): ConfidenceCategory {
  if (confidence === undefined || confidence === null || isNaN(confidence)) {
    return {
      level: 'unknown',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      label: '—',
    };
  }

  if (confidence < 0.5) {
    return {
      level: 'low',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      label: '低',
    };
  }

  if (confidence <= 0.8) {
    return {
      level: 'medium',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: '中',
    };
  }

  return {
    level: 'high',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: '高',
  };
}
