import React from 'react';
import { Brain, Clock, Target, Lightning, ChartLine, Info } from '@/components/Icon';
import { DecisionFactor } from '../../types/explainability';

interface DecisionFactorsProps {
  factors: DecisionFactor[];
}

const DecisionFactors: React.FC<DecisionFactorsProps> = React.memo(({ factors }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'memory':
        return <Brain className="h-5 w-5" />;
      case 'difficulty':
        return <Target className="h-5 w-5" />;
      case 'time':
        return <Clock className="h-5 w-5" />;
      case 'risk':
        return <Lightning className="h-5 w-5" />;
      case 'rhythm':
        return <ChartLine className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white">
        <Brain className="h-6 w-6 text-blue-500" />
        决策因素解析
      </h3>

      <div className="grid gap-3">
        {factors.map((factor, index) => (
          <div
            key={index}
            className="rounded-card border border-gray-100 bg-white p-4 shadow-soft transition-shadow hover:shadow-elevated dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-button bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {getIcon(factor.icon)}
              </div>

              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{factor.name}</h4>
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    权重: {(factor.weight * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="mb-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-g3-slow"
                      style={{ width: `${factor.score * 100}%` }}
                    />
                  </div>
                  <span className="min-w-[3ch] text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {(factor.score * 100).toFixed(0)}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {factor.explanation}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

DecisionFactors.displayName = 'DecisionFactors';

export default DecisionFactors;
