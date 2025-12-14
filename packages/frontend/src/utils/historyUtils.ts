/**
 * historyUtils.ts - 历史页面工具函数
 */

type FilterType = 'all' | 'mastered' | 'reviewing' | 'struggling';

/**
 * 格式化时间戳为相对时间或日期
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return date.toLocaleDateString('zh-CN');
}

/**
 * 格式化日期字符串为简短格式 MM/DD
 */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 根据正确率获取颜色类名
 */
export function getCorrectRateColor(rate: number): string {
  if (rate >= 80) return 'text-green-600';
  if (rate >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * 根据正确率获取掌握程度
 */
export function getMasteryLevel(rate: number): FilterType {
  if (rate >= 80) return 'mastered';
  if (rate >= 40) return 'reviewing';
  return 'struggling';
}

/**
 * 根据正确率获取掌握程度标签配置
 */
export function getMasteryLabel(rate: number) {
  if (rate >= 80)
    return {
      label: '已掌握',
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-300',
    };
  if (rate >= 40)
    return {
      label: '需复习',
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-300',
    };
  return {
    label: '未掌握',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-300',
  };
}
