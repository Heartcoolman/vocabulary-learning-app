import React from 'react';
import type { AmasProcessResult } from '../../../types/amas';

/**
 * AMAS 决策解释面板 Props
 */
export interface AmasExplanationPanelProps {
  /** 是否显示面板 */
  visible: boolean;
  /** 最新的 AMAS 决策结果 */
  latestAmasResult?: AmasProcessResult | null;
}

/**
 * AMAS 决策解释面板
 *
 * 固定在页面底部，显示当前的学习策略解释
 */
export function AmasExplanationPanel({
  visible,
  latestAmasResult,
}: AmasExplanationPanelProps): React.ReactElement {
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-3 transition-all duration-500 ease-out ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
    }`}>
      <div className="p-3 bg-white/95 backdrop-blur-sm border border-blue-200 rounded-lg shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">当前学习策略</span>
          <p className="text-sm text-gray-600">
            {latestAmasResult?.explanation || '分析中...'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AmasExplanationPanel;
