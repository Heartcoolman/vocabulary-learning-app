import React, { useState, useEffect } from 'react';
import { X, ChartPie, Sliders, TrendUp, Flask } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import DecisionFactors from './DecisionFactors';
import WeightRadarChart from './WeightRadarChart';
import LearningCurveChart from './LearningCurveChart';
import CounterfactualPanel from './CounterfactualPanel';
import { AmasProcessResult } from '../../types/amas';
import { DecisionExplanation, LearningCurvePoint, AlgorithmWeights, DecisionFactor } from '../../types/explainability';
import { explainabilityApi } from '../../services/explainabilityApi';

interface ExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestDecision?: AmasProcessResult | null;
}

const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({
  isOpen,
  onClose,
  latestDecision
}) => {
  const [activeTab, setActiveTab] = useState<'factors' | 'weights' | 'curve' | 'counterfactual'>('factors');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explanationData, setExplanationData] = useState<DecisionExplanation | null>(null);
  const [curveData, setCurveData] = useState<LearningCurvePoint[]>([]);

  // 从 latestDecision 的状态生成 factors（如果后端未返回）
  const generateFactorsFromState = (state: AmasProcessResult['state']): DecisionFactor[] => {
    return [
      { name: '记忆强度', score: state.memory || 0.5, weight: 0.4, explanation: '记忆痕迹强度', icon: 'memory' },
      { name: '注意力', score: state.attention || 0.5, weight: 0.2, explanation: '当前注意力水平', icon: 'attention' },
      { name: '疲劳度', score: 1 - (state.fatigue || 0.5), weight: 0.2, explanation: '疲劳程度（低分表示疲劳）', icon: 'fatigue' },
      { name: '学习动机', score: state.motivation || 0.5, weight: 0.1, explanation: '学习动力指数', icon: 'motivation' },
      { name: '反应速度', score: state.speed || 0.5, weight: 0.1, explanation: '响应速度评估', icon: 'speed' },
    ];
  };

  // 加载真实数据
  useEffect(() => {
    if (isOpen && latestDecision) {
      const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
          // 并行获取决策解释和学习曲线
          // 注意: AmasProcessResult 不包含 decisionId，传 undefined 让后端返回最近的决策
          const [explanationRes, curveRes] = await Promise.all([
            explainabilityApi.getDecisionExplanation(undefined).catch(() => null),
            explainabilityApi.getLearningCurve(30).catch(() => null)
          ]);

          // 处理决策解释数据
          if (explanationRes) {
            // 如果后端没有返回 factors，从 latestDecision.state 生成
            const factors = explanationRes.factors || generateFactorsFromState(latestDecision.state);
            setExplanationData({
              ...explanationRes,
              factors,
              reasoning: explanationRes.reasoning || latestDecision.explanation || 'AMAS 系统根据您当前的状态进行了最优决策。',
            });
          } else {
            // API 调用失败，使用 latestDecision 数据构建
            setExplanationData({
              decisionId: latestDecision.sessionId || `local-${Date.now()}`,
              timestamp: new Date().toISOString(),
              reasoning: latestDecision.explanation || 'AMAS 系统根据您当前的状态进行了最优决策。',
              state: {
                attention: latestDecision.state.attention,
                fatigue: latestDecision.state.fatigue,
                motivation: latestDecision.state.motivation,
              },
              difficultyFactors: { length: 0, accuracy: 0, frequency: 0, forgetting: 0 },
              factors: generateFactorsFromState(latestDecision.state),
              weights: { thompson: 0.5, linucb: 0.25, actr: 0.15, heuristic: 0.1 }
            });
          }

          // 处理学习曲线数据
          if (curveRes && curveRes.points) {
            setCurveData(curveRes.points);
          } else {
            setCurveData([]);
          }
        } catch (err) {
          console.error('加载解释数据失败:', err);
          setError('加载数据失败，请稍后重试');
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }
  }, [isOpen, latestDecision]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">AMAS 决策透视</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">为什么选择这个词？</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
          {[
            { id: 'factors', label: '决策因素', icon: Sliders },
            { id: 'weights', label: '算法权重', icon: ChartPie },
            { id: 'curve', label: '学习曲线', icon: TrendUp },
            { id: 'counterfactual', label: '反事实分析', icon: Flask },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-all relative ${
                activeTab === tab.id
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
              <p>正在解析 AI 决策...</p>
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : !explanationData ? (
            <div className="text-center py-10 text-gray-500">暂无决策数据</div>
          ) : (
            <>
              {activeTab === 'factors' && (
                <div className="space-y-6">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg text-indigo-800 dark:text-indigo-200 text-sm leading-relaxed">
                    <strong>AI 思考：</strong> {explanationData.reasoning}
                  </div>
                  {explanationData.factors && <DecisionFactors factors={explanationData.factors} />}
                </div>
              )}

              {activeTab === 'weights' && explanationData.weights && (
                <WeightRadarChart weights={explanationData.weights as AlgorithmWeights} />
              )}

              {activeTab === 'curve' && (
                <LearningCurveChart data={curveData} />
              )}

              {activeTab === 'counterfactual' && (
                <CounterfactualPanel
                  currentWordId={explanationData.selectedWordId || ''}
                  decisionId={explanationData.decisionId}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 text-center">
          Powered by AMAS Adaptive Learning Engine v2.5
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExplainabilityModal;
