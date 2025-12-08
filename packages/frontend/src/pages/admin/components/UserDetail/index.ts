/**
 * UserDetailPage Section Components
 * 用户详情页面的各个区块组件
 */

export { UserBasicInfo } from './UserBasicInfo';
export type { UserBasicInfoProps, UserStatisticsData } from './UserBasicInfo';

export { UserStatistics, getMasteryLevelLabel, getMasteryLevelColor } from './UserStatistics';
export type { UserStatisticsProps } from './UserStatistics';

export { UserWordList, getStateLabel, getStateColor, formatDate } from './UserWordList';
export type { UserWordListProps, FilterState, WordDetail, PaginationInfo } from './UserWordList';

export { UserAnalytics } from './UserAnalytics';
export type {
  UserAnalyticsProps,
  AnalyticsData,
  HeatmapDataPoint,
  DailyAccuracyPoint,
  WeakWord,
  LearningPattern,
} from './UserAnalytics';
