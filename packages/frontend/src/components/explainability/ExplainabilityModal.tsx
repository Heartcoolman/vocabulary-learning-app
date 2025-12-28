import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, ChartPie, Sliders, TrendUp, Flask } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import DecisionFactors from './DecisionFactors';
import WeightRadarChart from './WeightRadarChart';
import LearningCurveChart from './LearningCurveChart';
import CounterfactualPanel from './CounterfactualPanel';
import { AmasProcessResult } from '../../types/amas';
import {
  DecisionExplanation,
  LearningCurvePoint,
  AlgorithmWeights,
  DecisionFactor,
} from '../../types/explainability';
import { explainabilityApi } from '../../services/explainabilityApi';
import { amasLogger } from '../../utils/logger';

// 从状态生成 factors（移到组件外部避免 useEffect 依赖问题）
const generateFactorsFromState = (state: AmasProcessResult['state']): DecisionFactor[] => {
  return [
    {
      name: '记忆强度',
      score: state.memory || 0.5,
      weight: 0.4,
      explanation: '记忆痕迹强度',
      icon: 'memory',
    },
    {
      name: '注意力',
      score: state.attention || 0.5,
      weight: 0.2,
      explanation: '当前注意力水平',
      icon: 'attention',
    },
    {
      name: '疲劳度',
      score: 1 - (state.fatigue || 0.5),
      weight: 0.2,
      explanation: '疲劳程度（低分表示疲劳）',
      icon: 'fatigue',
    },
    {
      name: '学习动机',
      score: state.motivation || 0.5,
      weight: 0.1,
      explanation: '学习动力指数',
      icon: 'motivation',
    },
    {
      name: '反应速度',
      score: state.speed || 0.5,
      weight: 0.1,
      explanation: '响应速度评估',
      icon: 'speed',
    },
  ];
};

interface ExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestDecision?: AmasProcessResult | null;
}

// Tab ID 类型定义
type TabId = 'factors' | 'weights' | 'curve' | 'counterfactual';

const ExplainabilityModal: React.FC<ExplainabilityModalProps> = React.memo(
  ({ isOpen, onClose, latestDecision }) => {
    const [activeTab, setActiveTab] = useState<TabId>('factors');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [explanationData, setExplanationData] = useState<DecisionExplanation | null>(null);
    const [curveData, setCurveData] = useState<LearningCurvePoint[]>([]);

    // 使用 useMemo 记忆化 latestDecision 的关键字段，避免对象引用变化导致无限循环
    const decisionKey = useMemo(() => {
      if (!latestDecision) return null;
      return {
        sessionId: latestDecision.sessionId,
        attention: latestDecision.state.attention,
        fatigue: latestDecision.state.fatigue,
        motivation: latestDecision.state.motivation,
      };
    }, [latestDecision]);

    // 使用 useCallback 来记忆化数据加载函数
    const loadData = useCallback(async () => {
      if (!latestDecision) return;

      setLoading(true);
      setError(null);
      try {
        // 并行获取决策解释和学习曲线
        // 注意: AmasProcessResult 不包含 decisionId，传 undefined 让后端返回最近的决策
        const [explanationRes, curveRes] = await Promise.all([
          explainabilityApi.getDecisionExplanation(undefined).catch(() => null),
          explainabilityApi.getLearningCurve(30).catch(() => null),
        ]);

        // 处理决策解释数据
        if (explanationRes) {
          // 如果后端没有返回 factors，从 latestDecision.state 生成
          const factors = explanationRes.factors || generateFactorsFromState(latestDecision.state);
          setExplanationData({
            ...explanationRes,
            factors,
            reasoning:
              explanationRes.reasoning ||
              latestDecision.explanation?.text ||
              'AMAS 系统根据您当前的状态进行了最优决策。',
          });
        } else {
          // API 调用失败，使用 latestDecision 数据构建
          setExplanationData({
            decisionId: latestDecision.sessionId || `local-${Date.now()}`,
            timestamp: new Date().toISOString(),
            reasoning:
              latestDecision.explanation?.text || 'AMAS 系统根据您当前的状态进行了最优决策。',
            state: {
              attention: latestDecision.state.attention,
              fatigue: latestDecision.state.fatigue,
              motivation: latestDecision.state.motivation,
            },
            difficultyFactors: { length: 0, accuracy: 0, frequency: 0, forgetting: 0 },
            factors: generateFactorsFromState(latestDecision.state),
            weights: { thompson: 0.5, linucb: 0.25, actr: 0.15, heuristic: 0.1 },
          });
        }

        // 处理学习曲线数据
        if (curveRes && curveRes.points) {
          setCurveData(curveRes.points);
        } else {
          setCurveData([]);
        }
      } catch (err) {
        amasLogger.error({ err }, '加载解释数据失败');
        setError('加载数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    }, [latestDecision]);

    // 使用 useMemo 记忆化 tabs 配置
    const tabs = useMemo(
      () => [
        { id: 'factors' as const, label: '决策因素', icon: Sliders },
        { id: 'weights' as const, label: '算法权重', icon: ChartPie },
        { id: 'curve' as const, label: '学习曲线', icon: TrendUp },
        { id: 'counterfactual' as const, label: '反事实分析', icon: Flask },
      ],
      [],
    );

    // 加载真实数据 - 使用 decisionKey 的 sessionId 作为稳定依赖
    useEffect(() => {
      // 只依赖 decisionKey，不直接依赖 latestDecision 对象
      if (!isOpen || !decisionKey) return;

      loadData();
    }, [isOpen, decisionKey, loadData]);

    if (!isOpen) return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="animate-scale-in relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-white shadow-2xl dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">AMAS 决策透视</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">为什么选择这个词？</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="scrollbar-hide flex overflow-x-auto border-b border-gray-100 dark:border-slate-800">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`relative flex items-center gap-2 whitespace-nowrap px-6 py-4 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="min-h-[400px] flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
                <p>正在解析 AI 决策...</p>
              </div>
            ) : error ? (
              <div className="py-10 text-center text-red-500">{error}</div>
            ) : !explanationData ? (
              <div className="py-10 text-center text-gray-500">暂无决策数据</div>
            ) : (
              <>
                {activeTab === 'factors' && (
                  <div className="space-y-6">
                    <div className="rounded-button bg-indigo-50 p-4 text-sm leading-relaxed text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
                      <strong>AI 思考：</strong> {explanationData.reasoning}
                    </div>
                    {explanationData.factors && (
                      <DecisionFactors factors={explanationData.factors} />
                    )}
                  </div>
                )}

                {activeTab === 'weights' && explanationData.weights && (
                  <WeightRadarChart weights={explanationData.weights as AlgorithmWeights} />
                )}

                {activeTab === 'curve' && <LearningCurveChart data={curveData} />}

                {activeTab === 'counterfactual' && (
                  <CounterfactualPanel decisionId={explanationData.decisionId} />
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 text-center text-xs text-gray-400 dark:border-slate-800 dark:bg-slate-800/50">
            Powered by AMAS Adaptive Learning Engine v2.5
          </div>
        </div>
      </div>,
      document.body,
    );
  },
);

ExplainabilityModal.displayName = 'ExplainabilityModal';

export default ExplainabilityModal;
