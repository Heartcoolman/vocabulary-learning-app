import React from 'react';
import { Brain, Clock, Target, Lightning, ChartLine, Info } from '@phosphor-icons/react';
import { DecisionFactor } from '../../types/explainability';

interface DecisionFactorsProps {
  factors: DecisionFactor[];
}

const DecisionFactors: React.FC<DecisionFactorsProps> = ({ factors }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'memory': return <Brain className="w-5 h-5" />;
      case 'difficulty': return <Target className="w-5 h-5" />;
      case 'time': return <Clock className="w-5 h-5" />;
      case 'risk': return <Lightning className="w-5 h-5" />;
      case 'rhythm': return <ChartLine className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
        <Brain className="w-6 h-6 text-indigo-500" />
        决策因素解析
      </h3>

      <div className="grid gap-3">
        {factors.map((factor, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                {getIcon(factor.icon)}
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {factor.name}
                  </h4>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                    权重: {(factor.weight * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${factor.score * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 min-w-[3ch]">
                    {(factor.score * 100).toFixed(0)}
                  </span>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {factor.explanation}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DecisionFactors;
