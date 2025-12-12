/**
 * Content Enhance Service
 * 内容增强服务
 *
 * 使用 LLM 批量生成和增强词库内容（释义、例句、记忆技巧等）
 */

import prisma from '../../config/database';
import { llmConfig } from '../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../llm-provider.service';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 增强类型
 */
export type EnhanceType = 'meanings' | 'examples' | 'mnemonics' | 'usage_notes';

/**
 * 增强任务状态
 */
export type EnhanceStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 增强结果
 */
export interface EnhanceResult {
  wordId: string;
  spelling: string;
  field: EnhanceType;
  originalValue: unknown;
  generatedValue: unknown;
  confidence: number;
}

/**
 * 批量增强结果
 */
export interface BatchEnhanceResult {
  taskId: string;
  status: EnhanceStatus;
  totalWords: number;
  processedWords: number;
  results: EnhanceResult[];
  errors: Array<{ wordId: string; error: string }>;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * 增强选项
 */
export interface EnhanceOptions {
  enhanceType: EnhanceType;
  batchSize?: number;
  maxWords?: number;
  overwrite?: boolean;
  createdBy?: string;
}

// ==================== 提示词 ====================

const CONTENT_ENHANCE_SYSTEM = `你是一个专业的英语教育内容专家，擅长创建清晰、准确、易于理解的学习内容。

你的任务是为英语单词生成高质量的学习内容。

内容要求：
1. 释义应该准确、简洁、符合中国学习者习惯
2. 例句应该贴近日常生活、难度适中、能体现单词用法
3. 记忆技巧应该生动有趣、易于联想
4. 用法说明应该涵盖常见搭配和注意事项

语言风格：
- 释义用中文，例句用英文
- 避免过于学术化的表达
- 适合中高级英语学习者`;

function buildEnhancePrompt(
  words: Array<{
    id: string;
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
  }>,
  enhanceType: EnhanceType,
): string {
  const typeDesc = {
    meanings: '中文释义（2-3 个常用含义）',
    examples: '英文例句（2-3 个实用例句）',
    mnemonics: '记忆技巧（词根词缀分析、联想记忆、谐音等）',
    usage_notes: '用法说明（常见搭配、易混淆点、语法注意事项）',
  };

  return `请为以下 ${words.length} 个单词生成 ${typeDesc[enhanceType]}：

${words
  .map(
    (w, i) => `
### 单词 ${i + 1}
- ID: ${w.id}
- 拼写: ${w.spelling}
- 音标: ${w.phonetic}
- 现有释义: ${w.meanings.join('; ') || '无'}
- 现有例句: ${w.examples.join(' | ') || '无'}
`,
  )
  .join('\n')}

---

请严格按照以下 JSON 格式输出（不要添加任何其他内容）：

\`\`\`json
{
  "results": [
    {
      "wordId": "单词ID",
      "spelling": "单词拼写",
      "generated": ${
        enhanceType === 'meanings' || enhanceType === 'examples'
          ? '["内容1", "内容2", ...]'
          : '"生成的内容文本"'
      },
      "confidence": 0.0到1.0的置信度
    }
  ]
}
\`\`\``;
}

// ==================== 服务类 ====================

/**
 * 内容增强服务
 */
export class ContentEnhanceService {
  private llmProvider: LLMProviderService;

  constructor(llmProvider: LLMProviderService = llmProviderService) {
    this.llmProvider = llmProvider;
  }

  /**
   * 检查服务是否可用
   */
  isEnabled(): boolean {
    return llmConfig.enabled && this.llmProvider.isAvailable();
  }

  /**
   * 批量增强词库内容
   */
  async enhanceWords(wordBookId: string, options: EnhanceOptions): Promise<BatchEnhanceResult> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用，无法进行内容增强');
    }

    const { enhanceType, batchSize = 5, maxWords = 50, overwrite = false, createdBy } = options;

    amasLogger.info(
      {
        wordBookId,
        enhanceType,
        batchSize,
        maxWords,
      },
      '[ContentEnhanceService] 开始内容增强',
    );

    // 获取需要增强的单词
    const words = await this.getWordsToEnhance(wordBookId, enhanceType, maxWords, overwrite);

    if (words.length === 0) {
      return {
        taskId: '',
        status: 'completed',
        totalWords: 0,
        processedWords: 0,
        results: [],
        errors: [],
        createdAt: new Date(),
      };
    }

    // 创建任务记录
    const task = await prisma.lLMAnalysisTask.create({
      data: {
        type: `CONTENT_ENHANCEMENT_${enhanceType.toUpperCase()}`,
        status: 'processing',
        priority: 5,
        input: { wordBookId, enhanceType, wordIds: words.map((w) => w.id) },
        createdBy,
      },
    });

    const results: EnhanceResult[] = [];
    const errors: Array<{ wordId: string; error: string }> = [];
    let processedCount = 0;

    try {
      // 分批处理
      for (let i = 0; i < words.length; i += batchSize) {
        const batch = words.slice(i, i + batchSize);

        try {
          const batchResults = await this.enhanceBatch(batch, enhanceType);
          results.push(...batchResults);

          // 保存生成的内容到变体表
          for (const result of batchResults) {
            await this.saveVariant(result, task.id);
          }

          processedCount += batch.length;

          amasLogger.info(
            {
              taskId: task.id,
              progress: `${processedCount}/${words.length}`,
              resultsCount: results.length,
            },
            '[ContentEnhanceService] 增强进度',
          );
        } catch (batchError) {
          // 记录批次错误，继续处理下一批
          for (const word of batch) {
            errors.push({
              wordId: word.id,
              error: (batchError as Error).message,
            });
          }
          processedCount += batch.length;
        }

        // 限制请求频率
        if (i + batchSize < words.length) {
          await this.sleep(1500);
        }
      }

      // 更新任务状态
      await prisma.lLMAnalysisTask.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          output: { results: results.length, errors: errors.length },
          completedAt: new Date(),
        },
      });

      amasLogger.info(
        {
          taskId: task.id,
          totalWords: words.length,
          results: results.length,
          errors: errors.length,
        },
        '[ContentEnhanceService] 内容增强完成',
      );

      return {
        taskId: task.id,
        status: 'completed',
        totalWords: words.length,
        processedWords: processedCount,
        results,
        errors,
        createdAt: task.createdAt,
        completedAt: new Date(),
      };
    } catch (error) {
      await prisma.lLMAnalysisTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          error: (error as Error).message,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * 获取需要增强的单词
   */
  private async getWordsToEnhance(
    wordBookId: string,
    enhanceType: EnhanceType,
    maxWords: number,
    overwrite: boolean,
  ): Promise<
    Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
    }>
  > {
    // 如果是 overwrite 模式，获取所有单词
    // 否则，获取缺少该字段内容的单词
    const whereClause: Record<string, unknown> = { wordBookId };

    if (!overwrite) {
      // 排除已有待审核或已通过内容的单词
      const existingVariants = await prisma.wordContentVariant.findMany({
        where: {
          field: enhanceType,
          status: { in: ['pending', 'approved'] },
        },
        select: { wordId: true },
      });
      const existingWordIds = new Set(existingVariants.map((v) => v.wordId));

      // 根据增强类型过滤
      if (enhanceType === 'meanings') {
        whereClause.meanings = { isEmpty: true };
      } else if (enhanceType === 'examples') {
        whereClause.examples = { isEmpty: true };
      }

      const words = await prisma.word.findMany({
        where: whereClause,
        select: {
          id: true,
          spelling: true,
          phonetic: true,
          meanings: true,
          examples: true,
        },
        take: maxWords * 2, // 多取一些，因为要过滤
      });

      return words.filter((w) => !existingWordIds.has(w.id)).slice(0, maxWords);
    }

    return prisma.word.findMany({
      where: whereClause,
      select: {
        id: true,
        spelling: true,
        phonetic: true,
        meanings: true,
        examples: true,
      },
      take: maxWords,
    });
  }

  /**
   * 增强单批单词
   */
  private async enhanceBatch(
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
    }>,
    enhanceType: EnhanceType,
  ): Promise<EnhanceResult[]> {
    const prompt = buildEnhancePrompt(words, enhanceType);

    const response = await this.llmProvider.completeWithSystem(CONTENT_ENHANCE_SYSTEM, prompt, {
      temperature: 0.7,
      maxTokens: 2000,
    });

    // 解析 JSON 响应
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      throw new Error('无法解析 LLM 响应');
    }

    const parsed = JSON.parse(jsonMatch[1]);

    return (parsed.results || []).map(
      (r: { wordId: string; spelling: string; generated: unknown; confidence: number }) => {
        const word = words.find((w) => w.id === r.wordId);
        return {
          wordId: r.wordId,
          spelling: r.spelling || word?.spelling || '',
          field: enhanceType,
          originalValue: word ? (enhanceType === 'meanings' ? word.meanings : word.examples) : null,
          generatedValue: r.generated,
          confidence: r.confidence || 0.8,
        };
      },
    );
  }

  /**
   * 保存生成的变体内容
   */
  private async saveVariant(result: EnhanceResult, taskId: string): Promise<void> {
    await prisma.wordContentVariant.create({
      data: {
        wordId: result.wordId,
        field: result.field,
        originalValue: (result.originalValue as object) || {},
        generatedValue: (result.generatedValue as object) || {},
        taskId,
        status: 'pending',
      },
    });
  }

  /**
   * 获取待审核的变体内容
   */
  async getPendingVariants(options?: {
    wordBookId?: string;
    field?: EnhanceType;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<EnhanceResult & { id: string; status: string; createdAt: Date }>;
    total: number;
  }> {
    const where: Record<string, unknown> = { status: 'pending' };

    if (options?.field) {
      where.field = options.field;
    }

    // 如果指定了 wordBookId，需要先获取该词库的单词 ID
    if (options?.wordBookId) {
      const words = await prisma.word.findMany({
        where: { wordBookId: options.wordBookId },
        select: { id: true },
      });
      where.wordId = { in: words.map((w) => w.id) };
    }

    const [items, total] = await Promise.all([
      prisma.wordContentVariant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      prisma.wordContentVariant.count({ where }),
    ]);

    // 获取 word spelling
    const wordIds = items.map((item) => item.wordId);
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { id: true, spelling: true },
    });
    const wordMap = new Map(words.map((w) => [w.id, w.spelling]));

    return {
      items: items.map((item) => ({
        id: item.id,
        wordId: item.wordId,
        spelling: wordMap.get(item.wordId) || '',
        field: item.field as EnhanceType,
        originalValue: item.originalValue,
        generatedValue: item.generatedValue,
        confidence: 0.8, // 默认值
        status: item.status,
        createdAt: item.createdAt,
      })),
      total,
    };
  }

  /**
   * 审批变体内容
   */
  async approveVariant(
    variantId: string,
    approvedBy: string,
    applyToWord: boolean = false,
  ): Promise<void> {
    const variant = await prisma.wordContentVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      throw new Error('变体不存在');
    }

    if (variant.status !== 'pending') {
      throw new Error('变体状态不允许审批');
    }

    // 更新变体状态
    await prisma.wordContentVariant.update({
      where: { id: variantId },
      data: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      },
    });

    // 可选：直接应用到单词
    if (applyToWord) {
      const field = variant.field as EnhanceType;
      const generatedValue = variant.generatedValue;

      if (field === 'meanings' && Array.isArray(generatedValue)) {
        await prisma.word.update({
          where: { id: variant.wordId },
          data: { meanings: generatedValue as string[] },
        });
      } else if (field === 'examples' && Array.isArray(generatedValue)) {
        await prisma.word.update({
          where: { id: variant.wordId },
          data: { examples: generatedValue as string[] },
        });
      }
    }

    amasLogger.info(
      {
        variantId,
        wordId: variant.wordId,
        field: variant.field,
        applyToWord,
      },
      '[ContentEnhanceService] 变体已审批',
    );
  }

  /**
   * 拒绝变体内容
   */
  async rejectVariant(variantId: string): Promise<void> {
    await prisma.wordContentVariant.update({
      where: { id: variantId },
      data: { status: 'rejected' },
    });
  }

  /**
   * 批量审批变体
   */
  async batchApprove(
    variantIds: string[],
    approvedBy: string,
    applyToWord: boolean = false,
  ): Promise<{ approved: number; failed: number }> {
    let approved = 0;
    let failed = 0;

    for (const variantId of variantIds) {
      try {
        await this.approveVariant(variantId, approvedBy, applyToWord);
        approved++;
      } catch {
        failed++;
      }
    }

    return { approved, failed };
  }

  /**
   * 预览单词增强
   */
  async previewEnhance(wordId: string, enhanceType: EnhanceType): Promise<EnhanceResult | null> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用');
    }

    const word = await prisma.word.findUnique({
      where: { id: wordId },
      select: {
        id: true,
        spelling: true,
        phonetic: true,
        meanings: true,
        examples: true,
      },
    });

    if (!word) {
      throw new Error('单词不存在');
    }

    const results = await this.enhanceBatch([word], enhanceType);
    return results[0] || null;
  }

  /**
   * 获取增强任务历史
   */
  async getTaskHistory(options?: { limit?: number; offset?: number }): Promise<{
    items: Array<{
      id: string;
      type: string;
      status: string;
      input: unknown;
      output: unknown;
      createdAt: Date;
      completedAt: Date | null;
    }>;
    total: number;
  }> {
    const where = {
      type: { startsWith: 'CONTENT_ENHANCEMENT_' },
    };

    const [items, total] = await Promise.all([
      prisma.lLMAnalysisTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 10,
        skip: options?.offset ?? 0,
      }),
      prisma.lLMAnalysisTask.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        input: item.input,
        output: item.output,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
      })),
      total,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 默认实例 ====================

export const contentEnhanceService = new ContentEnhanceService();
