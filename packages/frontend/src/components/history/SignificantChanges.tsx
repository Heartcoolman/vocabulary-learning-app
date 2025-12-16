import React from 'react';
import { Target, TrendUp, TrendDown } from '../Icon';
import { SignificantChange } from '../../types/amas-enhanced';
import { formatShortDate } from '../../utils/historyUtils';

interface SignificantChangesProps {
  significantChanges: (SignificantChange & { description: string })[];
}

/**
 * SignificantChanges - 显著变化列表
 */
const SignificantChanges: React.FC<SignificantChangesProps> = React.memo(
  ({ significantChanges }) => {
    if (significantChanges.length === 0) {
      return null;
    }

    return (
      <div className="rounded-card border border-gray-200 bg-white/80 p-6 shadow-soft backdrop-blur-sm">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
          <Target size={24} weight="duotone" color="#f59e0b" />
          显著变化
        </h2>
        <div className="space-y-3">
          {significantChanges.map((change, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 rounded-card border-2 p-4 transition-all ${
                change.isPositive ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
              } `}
            >
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${change.isPositive ? 'bg-green-500' : 'bg-red-500'} `}
              >
                {change.direction === 'up' ? (
                  <TrendUp size={20} weight="fill" color="#ffffff" />
                ) : (
                  <TrendDown size={20} weight="fill" color="#ffffff" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`font-medium ${change.isPositive ? 'text-green-700' : 'text-red-700'}`}
                >
                  {change.metricLabel}
                </p>
                <p className="text-sm text-gray-600">{change.description}</p>
              </div>
              <div
                className={`text-right ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}
              >
                <p className="text-lg font-bold">
                  {change.changePercent > 0 ? '+' : ''}
                  {change.changePercent.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">
                  {formatShortDate(change.startDate)} - {formatShortDate(change.endDate)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

SignificantChanges.displayName = 'SignificantChanges';

export default SignificantChanges;
