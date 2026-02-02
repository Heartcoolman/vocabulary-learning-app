import React from 'react';
import { Card } from '../ui/Card';
import { LearningObjectiveMode } from '../../types/learning-objectives';
import type { IconProps } from '../Icon';

interface ModeCardProps {
  mode: LearningObjectiveMode;
  label: string;
  description: string;
  Icon: React.ComponentType<IconProps>;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * ModeCard - 学习模式选择卡片组件
 */
export function ModeCard({ label, description, Icon, isActive, disabled, onClick }: ModeCardProps) {
  return (
    <Card
      clickable={!disabled && !isActive}
      selected={isActive}
      onClick={!disabled ? onClick : undefined}
      variant="elevated"
      padding="lg"
      className={`group flex flex-col items-center border-2 text-center transition-all ${
        isActive
          ? 'scale-[1.02] border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-pressed={isActive}
    >
      <div
        className={`mb-3 transition-colors ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`}
      >
        <Icon size={48} />
      </div>
      <h3 className={`mb-1 text-base font-bold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
        {label}
      </h3>
      <p className="text-sm text-gray-500">{description}</p>
    </Card>
  );
}

export default ModeCard;
