import React, { memo } from 'react';

// ==================== 类型定义 ====================

export interface AMASControlsProps {
  /** 自定义类名 */
  className?: string;
}

// ==================== 子组件 ====================

/**
 * 说明项组件
 */
const InfoItem = memo(function InfoItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <li>
      <strong>{title}：</strong>
      {description}
    </li>
  );
});

// ==================== 主组件 ====================

/**
 * AMAS 控制组件 - 说明信息面板
 * 展示 AMAS 可解释性功能的使用说明
 */
function AMASControlsComponent({ className }: AMASControlsProps) {
  const infoItems = [
    {
      title: '决策解释',
      description: '展示系统最新的决策过程，包括学习状态、难度因素和算法权重',
    },
    {
      title: '学习曲线',
      description: '追踪用户的掌握度变化趋势，帮助了解学习进度',
    },
    {
      title: '决策时间线',
      description: '按时间顺序展示系统的所有决策记录',
    },
    {
      title: '反事实分析',
      description: '模拟不同学习状态下系统的响应，探索"如果...会怎样"的场景',
    },
  ];

  return (
    <div className={`rounded-card border border-purple-200 bg-purple-50 p-6 ${className || ''}`}>
      <h3 className="mb-3 text-lg font-semibold text-purple-900">AMAS 可解释性说明</h3>
      <ul className="space-y-2 text-sm text-purple-800">
        {infoItems.map((item, index) => (
          <InfoItem key={index} title={item.title} description={item.description} />
        ))}
      </ul>
    </div>
  );
}

export const AMASControls = memo(AMASControlsComponent);
export default AMASControls;
