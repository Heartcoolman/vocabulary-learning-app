/**
 * Suggestion Parser for LLM Advisor
 * LLM 输出解析器
 *
 * 解析和验证 LLM 返回的建议
 */

import { amasLogger } from '../../../logger';

// ==================== 类型定义 ====================

/**
 * 建议类型
 */
export type SuggestionType = 'param_bound' | 'threshold' | 'reward_weight' | 'safety_threshold';

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * 数据质量
 */
export type DataQuality = 'sufficient' | 'limited' | 'insufficient';

/**
 * 单个建议项
 */
export interface SuggestionItem {
  /** 唯一标识符 */
  id: string;
  /** 建议类型 */
  type: SuggestionType;
  /** 目标参数 */
  target: string;
  /** 当前值 */
  currentValue: number;
  /** 建议值 */
  suggestedValue: number;
  /** 调整原因 */
  reason: string;
  /** 预期影响 */
  expectedImpact: string;
  /** 风险等级 */
  risk: RiskLevel;
  /** 优先级 (1-5, 1 最高) */
  priority: number;
}

/**
 * LLM 分析结果
 */
export interface LLMSuggestion {
  /** 分析摘要 */
  analysis: {
    summary: string;
    keyFindings: string[];
    concerns: string[];
  };
  /** 建议列表 */
  suggestions: SuggestionItem[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 数据质量评估 */
  dataQuality: DataQuality;
  /** 下周关注重点 */
  nextReviewFocus: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== 解析器类 ====================

/**
 * 建议解析器
 */
export class SuggestionParser {
  /**
   * 解析 LLM 输出
   */
  parse(llmOutput: string): LLMSuggestion {
    // 尝试提取 JSON 块
    const jsonMatch = llmOutput.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : llmOutput;

    try {
      // 清理可能的格式问题
      const cleanedJson = this.cleanJsonString(jsonStr);
      const parsed = JSON.parse(cleanedJson);

      // 规范化结构
      return this.normalizeStructure(parsed);
    } catch (error) {
      amasLogger.error(
        {
          error: (error as Error).message,
          output: llmOutput.substring(0, 500),
        },
        '[SuggestionParser] JSON 解析失败',
      );

      // 返回默认结构
      return this.getDefaultSuggestion(llmOutput);
    }
  }

  /**
   * 验证建议结构
   */
  validate(suggestion: LLMSuggestion): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证分析部分
    if (!suggestion.analysis) {
      errors.push('缺少 analysis 字段');
    } else {
      if (!suggestion.analysis.summary) {
        warnings.push('缺少 analysis.summary');
      }
      if (!Array.isArray(suggestion.analysis.keyFindings)) {
        errors.push('analysis.keyFindings 必须是数组');
      }
      if (!Array.isArray(suggestion.analysis.concerns)) {
        errors.push('analysis.concerns 必须是数组');
      }
    }

    // 验证建议列表
    if (!Array.isArray(suggestion.suggestions)) {
      errors.push('suggestions 必须是数组');
    } else {
      suggestion.suggestions.forEach((item, index) => {
        const itemErrors = this.validateSuggestionItem(item, index);
        errors.push(...itemErrors);
      });
    }

    // 验证置信度
    if (
      typeof suggestion.confidence !== 'number' ||
      suggestion.confidence < 0 ||
      suggestion.confidence > 1
    ) {
      warnings.push('confidence 应该是 0-1 之间的数字');
    }

    // 验证数据质量
    const validQualities: DataQuality[] = ['sufficient', 'limited', 'insufficient'];
    if (!validQualities.includes(suggestion.dataQuality)) {
      warnings.push('dataQuality 应该是 sufficient/limited/insufficient');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证单个建议项
   */
  private validateSuggestionItem(item: SuggestionItem, index: number): string[] {
    const errors: string[] = [];
    const prefix = `suggestions[${index}]`;

    if (!item.id) {
      errors.push(`${prefix}.id 不能为空`);
    }

    const validTypes: SuggestionType[] = [
      'param_bound',
      'threshold',
      'reward_weight',
      'safety_threshold',
    ];
    if (!validTypes.includes(item.type)) {
      errors.push(`${prefix}.type 无效: ${item.type}`);
    }

    if (!item.target) {
      errors.push(`${prefix}.target 不能为空`);
    }

    if (typeof item.currentValue !== 'number') {
      errors.push(`${prefix}.currentValue 必须是数字`);
    }

    if (typeof item.suggestedValue !== 'number') {
      errors.push(`${prefix}.suggestedValue 必须是数字`);
    }

    if (!item.reason) {
      errors.push(`${prefix}.reason 不能为空`);
    }

    const validRisks: RiskLevel[] = ['low', 'medium', 'high'];
    if (!validRisks.includes(item.risk)) {
      errors.push(`${prefix}.risk 无效: ${item.risk}`);
    }

    if (typeof item.priority !== 'number' || item.priority < 1 || item.priority > 5) {
      errors.push(`${prefix}.priority 必须是 1-5 之间的数字`);
    }

    // 检查调整幅度
    if (item.currentValue !== 0) {
      const changeRatio =
        Math.abs(item.suggestedValue - item.currentValue) / Math.abs(item.currentValue);
      if (changeRatio > 0.5) {
        errors.push(`${prefix} 调整幅度过大 (${(changeRatio * 100).toFixed(0)}%)，最大允许 50%`);
      }
    }

    return errors;
  }

  /**
   * 清理 JSON 字符串
   */
  private cleanJsonString(str: string): string {
    return (
      str
        .trim()
        // 移除可能的 BOM
        .replace(/^\uFEFF/, '')
        // 移除注释
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        // 移除尾随逗号
        .replace(/,\s*([\]}])/g, '$1')
    );
  }

  /**
   * 规范化结构
   */
  private normalizeStructure(parsed: unknown): LLMSuggestion {
    const obj = parsed as Record<string, unknown>;
    const analysis = obj.analysis as Record<string, unknown> | undefined;

    return {
      analysis: {
        summary: String(analysis?.summary || ''),
        keyFindings: Array.isArray(analysis?.keyFindings)
          ? (analysis.keyFindings as unknown[]).map(String)
          : [],
        concerns: Array.isArray(analysis?.concerns)
          ? (analysis.concerns as unknown[]).map(String)
          : [],
      },
      suggestions: Array.isArray(obj.suggestions)
        ? obj.suggestions.map((s: unknown, i: number) =>
            this.normalizeSuggestionItem(s as Record<string, unknown>, i),
          )
        : [],
      confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
      dataQuality: this.normalizeDataQuality(obj.dataQuality),
      nextReviewFocus: String(obj.nextReviewFocus || ''),
    };
  }

  /**
   * 规范化建议项
   */
  private normalizeSuggestionItem(item: Record<string, unknown>, index: number): SuggestionItem {
    return {
      id: String(item.id || `suggestion_${index + 1}`),
      type: this.normalizeSuggestionType(item.type),
      target: String(item.target || ''),
      currentValue: Number(item.currentValue) || 0,
      suggestedValue: Number(item.suggestedValue) || 0,
      reason: String(item.reason || ''),
      expectedImpact: String(item.expectedImpact || ''),
      risk: this.normalizeRisk(item.risk),
      priority: Math.min(5, Math.max(1, Number(item.priority) || 3)),
    };
  }

  /**
   * 规范化建议类型
   */
  private normalizeSuggestionType(type: unknown): SuggestionType {
    const validTypes: SuggestionType[] = [
      'param_bound',
      'threshold',
      'reward_weight',
      'safety_threshold',
    ];
    const typeStr = String(type).toLowerCase();
    return validTypes.includes(typeStr as SuggestionType)
      ? (typeStr as SuggestionType)
      : 'threshold';
  }

  /**
   * 规范化风险等级
   */
  private normalizeRisk(risk: unknown): RiskLevel {
    const riskStr = String(risk).toLowerCase();
    if (riskStr === 'low' || riskStr === 'medium' || riskStr === 'high') {
      return riskStr;
    }
    return 'medium';
  }

  /**
   * 规范化数据质量
   */
  private normalizeDataQuality(quality: unknown): DataQuality {
    const qualityStr = String(quality).toLowerCase();
    if (qualityStr === 'sufficient' || qualityStr === 'limited' || qualityStr === 'insufficient') {
      return qualityStr;
    }
    return 'limited';
  }

  /**
   * 获取默认建议（解析失败时使用）
   */
  private getDefaultSuggestion(rawOutput: string): LLMSuggestion {
    return {
      analysis: {
        summary: 'LLM 输出解析失败，请检查原始响应',
        keyFindings: [],
        concerns: ['LLM 响应格式不符合预期'],
      },
      suggestions: [],
      confidence: 0,
      dataQuality: 'insufficient',
      nextReviewFocus: '检查 LLM 响应格式',
    };
  }
}

// ==================== 默认实例 ====================

export const suggestionParser = new SuggestionParser();
