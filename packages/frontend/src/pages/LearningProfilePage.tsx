import React, { useEffect, useState } from 'react';
import apiClient from '../services/client';
import { learningLogger } from '../utils/logger';
import { Clock, Brain, Lightning, WarningCircle, ArrowClockwise } from '../components/Icon';

interface ChronotypeData {
  category: 'morning' | 'evening' | 'intermediate';
  peakHours: number[];
  confidence: number;
  learningHistory: Array<{
    hour: number;
    performance: number;
    sampleCount: number;
  }>;
}

interface LearningStyleData {
  style: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  confidence: number;
  scores: {
    visual: number;
    auditory: number;
    kinesthetic: number;
  };
}

const LearningProfilePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chronotype, setChronotype] = useState<ChronotypeData | null>(null);
  const [learningStyle, setLearningStyle] = useState<LearningStyleData | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载两个API
      const [chrono, style] = await Promise.all([
        apiClient.getChronotypeProfile(),
        apiClient.getLearningStyleProfile(),
      ]);

      setChronotype(chrono);
      setLearningStyle(style);
    } catch (err) {
      const errorMsg = '加载学习档案失败，请稍后重试';
      setError(errorMsg);
      learningLogger.error({ err }, errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRetry = () => {
    fetchData();
  };

  // 获取生物钟分类的中文描述
  const getChronotypeLabel = (category: string): string => {
    const labels: Record<string, string> = {
      morning: '晨间型',
      evening: '夜间型',
      intermediate: '中间型',
    };
    return labels[category] || category;
  };

  // 获取生物钟的建议
  const getChronotypeAdvice = (category: string): string => {
    const advice: Record<string, string> = {
      morning: '你是晨间型的学习者！建议在上午 9-12 点安排重要的学习任务，此时大脑最活跃。',
      evening: '你是夜间型的学习者！建议在下午 3-5 点或晚上 8-11 点安排学习，此时效率最高。',
      intermediate: '你是中间型的学习者！全天任何时间都可以进行学习，但避免过于极端的时间更佳。',
    };
    return advice[category] || '正在分析你的学习时间偏好...';
  };

  // 获取学习风格的中文标签
  const getLearningStyleLabel = (style: string): string => {
    const labels: Record<string, string> = {
      visual: '视觉学习者',
      auditory: '听觉学习者',
      kinesthetic: '动觉学习者',
      mixed: '混合学习者',
    };
    return labels[style] || style;
  };

  // 获取学习风格的建议
  const getLearningStyleAdvice = (style: string): string => {
    const advice: Record<string, string> = {
      visual: '你倾向视觉学习！建议使用图表、颜色编码、思维导图等视觉工具来增强记忆。',
      auditory: '你倾向听觉学习！建议通过朗读、听英文发音、讨论等方式加深理解。',
      kinesthetic: '你倾向动觉学习！建议通过实际应用、写作、手写笔记等动手方式学习。',
      mixed: '你是多模式学习者！结合视觉、听觉和动觉的多种学习方法效果最佳。',
    };
    return advice[style] || '正在分析你的学习风格...';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin">
            <Lightning className="h-8 w-8 text-blue-500" weight="bold" />
          </div>
          <p className="text-gray-600">正在加载学习档案...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <WarningCircle className="h-6 w-6 text-red-500" weight="bold" />
            <h2 className="text-lg font-semibold text-gray-800">加载失败</h2>
          </div>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={handleRetry}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            <ArrowClockwise className="h-4 w-4" weight="bold" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* 页面头部 */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-800">学习档案分析</h1>
          <p className="text-gray-600">了解你的学习特点，优化学习策略</p>
        </div>

        {/* 生物钟分析卡片 */}
        {chronotype && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center gap-3">
              <Clock className="h-6 w-6 text-amber-500" weight="bold" />
              <h2 className="text-xl font-semibold text-gray-800">生物钟分析</h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* 基本信息 */}
              <div>
                <div className="mb-4">
                  <p className="mb-1 text-sm text-gray-600">生物钟类型</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {getChronotypeLabel(chronotype.category)}
                  </p>
                </div>

                <div className="mb-4">
                  <p className="mb-1 text-sm text-gray-600">置信度</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${chronotype.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {(chronotype.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-gray-600">黄金学习时段</p>
                  <div className="flex flex-wrap gap-2">
                    {chronotype.peakHours.length > 0 ? (
                      chronotype.peakHours.map((hour) => (
                        <span
                          key={hour}
                          className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700"
                        >
                          {`${hour}:00-${hour + 1}:00`}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">数据不足</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 建议 */}
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">学习建议</p>
                <p className="text-sm text-amber-800">{getChronotypeAdvice(chronotype.category)}</p>
              </div>
            </div>

            {/* 性能数据图表 */}
            {chronotype.learningHistory && chronotype.learningHistory.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <p className="mb-3 text-sm font-semibold text-gray-800">按时段性能分析</p>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                  {chronotype.learningHistory.map((item) => (
                    <div key={item.hour} className="text-center">
                      <div className="mb-1 text-xs text-gray-600">{item.hour}:00</div>
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded bg-amber-200"
                          style={{
                            height: `${Math.max(20, item.performance * 40)}px`,
                            opacity: item.sampleCount > 0 ? 1 : 0.5,
                          }}
                        />
                        <span className="text-xs text-gray-500">
                          {item.sampleCount > 0
                            ? `${(item.performance * 100).toFixed(0)}%`
                            : '无数据'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 学习风格分析卡片 */}
        {learningStyle && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center gap-3">
              <Brain className="h-6 w-6 text-blue-500" weight="bold" />
              <h2 className="text-xl font-semibold text-gray-800">学习风格分析</h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* 基本信息 */}
              <div>
                <div className="mb-4">
                  <p className="mb-1 text-sm text-gray-600">主要学习风格</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {getLearningStyleLabel(learningStyle.style)}
                  </p>
                </div>

                <div className="mb-4">
                  <p className="mb-1 text-sm text-gray-600">置信度</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${learningStyle.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {(learningStyle.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* 风格分布 */}
                <div>
                  <p className="mb-3 text-sm font-semibold text-gray-800">学习风格分布</p>
                  <div className="space-y-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-gray-600">视觉学习</span>
                        <span className="text-sm font-medium text-gray-700">
                          {(learningStyle.scores.visual * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-blue-400"
                          style={{ width: `${learningStyle.scores.visual * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-gray-600">听觉学习</span>
                        <span className="text-sm font-medium text-gray-700">
                          {(learningStyle.scores.auditory * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-green-400"
                          style={{ width: `${learningStyle.scores.auditory * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-gray-600">动觉学习</span>
                        <span className="text-sm font-medium text-gray-700">
                          {(learningStyle.scores.kinesthetic * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-purple-400"
                          style={{ width: `${learningStyle.scores.kinesthetic * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 建议 */}
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="mb-2 text-sm font-semibold text-blue-900">学习建议</p>
                <p className="text-sm text-blue-800">
                  {getLearningStyleAdvice(learningStyle.style)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 认知能力提示卡片 */}
        <div className="rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 p-6 shadow-md">
          <div className="mb-3 flex items-center gap-3">
            <Lightning className="h-6 w-6 text-purple-500" weight="bold" />
            <h2 className="text-lg font-semibold text-gray-800">个性化学习建议</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            {chronotype && learningStyle && (
              <>
                <p>根据你的生物钟和学习风格分析，我们为你推荐：</p>
                <ul className="ml-2 list-inside list-disc space-y-1">
                  <li>在{getChronotypeLabel(chronotype.category)}的黄金时段进行高效学习</li>
                  <li>采用{getLearningStyleLabel(learningStyle.style)}的学习方法</li>
                  <li>定期复习数据以获得更精准的学习建议</li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningProfilePage;
