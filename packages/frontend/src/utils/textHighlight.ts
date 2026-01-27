import { ReactNode, createElement } from 'react';

/**
 * 高亮匹配关键词
 * - 大小写不敏感
 * - 使用 <mark> 标签包裹匹配文本
 */
export function highlightText(text: string, query: string): ReactNode {
  if (!query || !query.trim()) {
    return text;
  }

  try {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const parts = text.split(regex);

    if (parts.length === 1) {
      return text;
    }

    return parts.map((part, index) =>
      regex.test(part)
        ? createElement(
            'mark',
            {
              key: index,
              className: 'bg-yellow-200 dark:bg-yellow-700/50 px-0.5 rounded',
            },
            part,
          )
        : part,
    );
  } catch {
    return text;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 按日期分组
 * 返回 Map<日期字符串, 数据数组>
 */
export function groupByDate<T>(items: T[], getTimestamp: (item: T) => number): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const date = new Date(getTimestamp(item));
    const dateKey = getDateGroupKey(date);

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(item);
  });

  return groups;
}

function getDateGroupKey(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return '今天';
  }
  if (dateOnly.getTime() === yesterday.getTime()) {
    return '昨天';
  }

  const diffDays = Math.floor((today.getTime() - dateOnly.getTime()) / 86400000);
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}
