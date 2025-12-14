/**
 * LLM Advisor Prompts
 * LLM 顾问提示词模板
 *
 * 定义用于 LLM 分析的提示词模板
 */

import { WeeklyStats, ErrorPatterns, TrendData, PreviousSuggestionEffect } from './stats-collector';

// ==================== 系统提示 ====================

export const SYSTEM_PROMPT = `你是一个专业的自适应学习系统优化专家。你的任务是分析学习系统的运行数据，并给出参数调整建议。

你需要关注以下方面：
1. 用户留存和活跃度
2. 学习效果（正确率、响应时间）
3. 用户状态（疲劳、动机）
4. 参数配置的合理性
5. 历史建议的效果反馈（如有提供）

你的建议应该是：
- 具体可执行的（精确到参数值）
- 有充分理由的（基于数据分析）
- 风险可控的（评估潜在风险）
- 可验证的（说明如何验证效果）
- 考虑历史反馈的（避免重复无效调整）

重要提示：
- 不要给出过于激进的调整，单次调整幅度不要超过 20%
- 优先解决最严重的问题
- 如果数据不足，明确说明并给出保守建议
- 参考历史建议效果，避免重复产生负面效果的调整`;

// ==================== 周度分析提示 ====================

/**
 * 生成周度分析提示词（增强版）
 */
export function buildWeeklyAnalysisPrompt(stats: WeeklyStats): string {
  let prompt = `## 本周系统运行数据

### 统计周期
${formatDate(stats.period.start)} 至 ${formatDate(stats.period.end)}

### 用户指标
- 总用户数: ${stats.users.total}
- 本周活跃用户: ${stats.users.activeThisWeek}
- 本周新增用户: ${stats.users.newThisWeek}
- 本周流失用户: ${stats.users.churned}
- 流失率: ${(stats.alerts.churnRate * 100).toFixed(1)}%

### 学习效果
- 平均正确率: ${(stats.learning.avgAccuracy * 100).toFixed(1)}%
- 平均会话时长: ${stats.learning.avgSessionDuration.toFixed(1)} 分钟
- 本周学习单词数: ${stats.learning.totalWordsLearned}
- 本周答题总数: ${stats.learning.totalAnswers}
- 平均响应时间: ${stats.learning.avgResponseTime.toFixed(0)} 毫秒

### 用户状态分布
疲劳度:
- 低疲劳 (<40%): ${(stats.stateDistribution.fatigue.low * 100).toFixed(1)}%
- 中疲劳 (40-70%): ${(stats.stateDistribution.fatigue.mid * 100).toFixed(1)}%
- 高疲劳 (>70%): ${(stats.stateDistribution.fatigue.high * 100).toFixed(1)}%

动机水平:
- 低动机 (<-0.3): ${(stats.stateDistribution.motivation.low * 100).toFixed(1)}%
- 中动机 (-0.3~0.3): ${(stats.stateDistribution.motivation.mid * 100).toFixed(1)}%
- 高动机 (>0.3): ${(stats.stateDistribution.motivation.high * 100).toFixed(1)}%

### 告警指标
- 低正确率用户占比: ${(stats.alerts.lowAccuracyUserRatio * 100).toFixed(1)}%
- 高疲劳用户占比: ${(stats.alerts.highFatigueUserRatio * 100).toFixed(1)}%
- 低动机用户占比: ${(stats.alerts.lowMotivationUserRatio * 100).toFixed(1)}%`;

  // 添加趋势数据（如果有）
  if (stats.trends) {
    prompt += `

### 7日趋势数据
${formatTrendData(stats.trends)}`;
  }

  // 添加错误模式分析（如果有）
  if (stats.errorPatterns) {
    prompt += `

### 错误模式分析
${formatErrorPatterns(stats.errorPatterns)}`;
  }

  // 添加历史建议效果反馈（如果有）
  if (stats.previousSuggestionEffects && stats.previousSuggestionEffects.length > 0) {
    prompt += `

### 历史建议效果反馈（重要！）
以下是之前应用的建议及其实际效果，请在制定新建议时参考：
${formatPreviousEffects(stats.previousSuggestionEffects)}`;
  }

  prompt += `

### 当前参数配置

用户超参数边界:
${formatParamBounds(stats.currentConfig.userParamBounds)}

奖励函数权重:
${formatObject(stats.currentConfig.rewardWeights)}

调整阈值:
${formatObject(stats.currentConfig.adjustmentThresholds)}

安全阈值:
${formatObject(stats.currentConfig.safetyThresholds)}

### 优化历史
- 总评估次数: ${stats.optimizationHistory.evaluationCount}
- 当前最优值: ${stats.optimizationHistory.bestValue?.toFixed(4) ?? '无'}
${stats.optimizationHistory.bestParams ? `- 当前最优参数: ${JSON.stringify(stats.optimizationHistory.bestParams)}` : ''}

---

## 分析要求

请基于以上数据进行分析，并给出配置调整建议。

### 输出格式要求

请严格按照以下 JSON 格式输出（不要添加任何其他内容）：

\`\`\`json
{
  "analysis": {
    "summary": "一句话总结本周系统表现",
    "keyFindings": [
      "关键发现1",
      "关键发现2",
      "关键发现3"
    ],
    "concerns": [
      "需要关注的问题1",
      "需要关注的问题2"
    ],
    "trendAnalysis": "趋势分析（如有趋势数据）",
    "historicalFeedback": "对历史建议效果的总结（如有历史数据）"
  },
  "suggestions": [
    {
      "id": "唯一标识符，如 suggestion_1",
      "type": "param_bound 或 threshold 或 reward_weight 或 safety_threshold",
      "target": "参数名称",
      "currentValue": 当前值（数字）,
      "suggestedValue": 建议值（数字）,
      "reason": "调整原因（详细说明）",
      "expectedImpact": "预期影响",
      "risk": "low 或 medium 或 high",
      "priority": 1-5的优先级（1最高）
    }
  ],
  "confidence": 0.0到1.0之间的置信度,
  "dataQuality": "数据质量评估：sufficient 或 limited 或 insufficient",
  "nextReviewFocus": "下周重点关注的内容"
}
\`\`\`

注意事项：
1. suggestions 数组可以为空（如果没有建议）
2. 每个 suggestion 必须包含所有字段
3. currentValue 和 suggestedValue 必须是数字
4. confidence 反映你对建议的把握程度
5. 如果数据不足，dataQuality 设为 limited 或 insufficient，并在 concerns 中说明
6. 如果有历史建议效果数据，请在 historicalFeedback 中总结并避免重复无效调整`;

  return prompt;
}

// ==================== 辅助函数 ====================

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatParamBounds(bounds: Record<string, { min: number; max: number }>): string {
  return Object.entries(bounds)
    .map(([key, value]) => `- ${key}: [${value.min}, ${value.max}]`)
    .join('\n');
}

function formatObject(obj: Record<string, number>): string {
  return Object.entries(obj)
    .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
    .join('\n');
}

/**
 * 格式化趋势数据
 */
function formatTrendData(trends: TrendData): string {
  const lines: string[] = [];

  // 正确率趋势
  if (trends.accuracyTrend.length > 0) {
    const accuracyValues = trends.accuracyTrend.map(
      (t) => `${t.date}: ${(t.value * 100).toFixed(1)}%`,
    );
    lines.push(`正确率趋势: ${accuracyValues.join(' → ')}`);

    // 计算趋势方向
    const first = trends.accuracyTrend[0]?.value ?? 0;
    const last = trends.accuracyTrend[trends.accuracyTrend.length - 1]?.value ?? 0;
    const change = ((last - first) * 100).toFixed(1);
    lines.push(`  周变化: ${Number(change) >= 0 ? '+' : ''}${change}%`);
  }

  // 活跃用户趋势
  if (trends.activeUsersTrend.length > 0) {
    const userValues = trends.activeUsersTrend.map((t) => `${t.date.slice(5)}: ${t.value}`);
    lines.push(`活跃用户趋势: ${userValues.join(' → ')}`);
  }

  // 答题量趋势
  if (trends.answerCountTrend.length > 0) {
    const total = trends.answerCountTrend.reduce((sum, t) => sum + t.value, 0);
    const avg = Math.round(total / trends.answerCountTrend.length);
    lines.push(`日均答题量: ${avg}`);
  }

  return lines.join('\n');
}

/**
 * 格式化错误模式
 */
function formatErrorPatterns(patterns: ErrorPatterns): string {
  const lines: string[] = [];

  // 常错单词
  if (patterns.topMistakeWords.length > 0) {
    lines.push('常错单词（前5个）:');
    patterns.topMistakeWords.slice(0, 5).forEach((w, i) => {
      lines.push(
        `  ${i + 1}. ${w.spelling} - 错误率 ${(w.errorRate * 100).toFixed(1)}% (${w.errorCount}次)`,
      );
    });
  }

  // 错误时段分布
  const peakHours = Object.entries(patterns.errorTimeDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour, count]) => `${hour}:00 (${count}次)`);

  if (peakHours.length > 0) {
    lines.push(`错误高峰时段: ${peakHours.join(', ')}`);
  }

  // 常见错误模式
  if (patterns.commonPatterns.length > 0) {
    lines.push('常见错误模式:');
    patterns.commonPatterns.forEach((p) => {
      lines.push(`  - ${p.description}: ${p.count}次`);
    });
  }

  return lines.join('\n');
}

/**
 * 格式化历史建议效果
 */
function formatPreviousEffects(effects: PreviousSuggestionEffect[]): string {
  return effects
    .map((e, i) => {
      const effectLabel =
        e.effectScore > 0.1
          ? '✅ 积极效果'
          : e.effectScore < -0.1
            ? '❌ 负面效果'
            : '➖ 效果不明显';
      return `${i + 1}. 参数 ${e.targetParam}: ${e.oldValue.toFixed(3)} → ${e.newValue.toFixed(3)}
   效果评分: ${e.effectScore.toFixed(2)} (${effectLabel})
   分析: ${e.effectAnalysis}
   应用日期: ${formatDate(e.appliedAt)}`;
    })
    .join('\n\n');
}

// ==================== 导出 ====================

export const prompts = {
  system: SYSTEM_PROMPT,
  buildWeeklyAnalysis: buildWeeklyAnalysisPrompt,
};
