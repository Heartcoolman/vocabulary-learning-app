/**
 * Word Quality Service
 * 词库质量检查服务
 *
 * 使用 LLM 批量检查词库内容质量，发现拼写、释义、例句等问题
 */

import prisma from '../../config/database';
import { llmConfig } from '../../config/llm.config';
import { LLMProviderService, llmProviderService } from '../llm-provider.service';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 检查类型
 */
export type CheckType = 'SPELLING' | 'MEANING' | 'EXAMPLE' | 'FULL';

/**
 * 问题严重程度
 */
export type IssueSeverity = 'error' | 'warning' | 'suggestion';

/**
 * 检查任务状态
 */
export type CheckStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 单个问题记录
 */
export interface WordIssue {
  wordId: string;
  spelling: string;
  field: 'spelling' | 'phonetic' | 'meanings' | 'examples';
  severity: IssueSeverity;
  description: string;
  suggestion?: string;
  originalValue?: string;
}

/**
 * 质量检查结果
 */
export interface QualityCheckResult {
  id: string;
  wordBookId: string;
  checkType: CheckType;
  status: CheckStatus;
  totalWords: number;
  checkedWords: number;
  issuesFound: number;
  issues: WordIssue[];
  summary?: {
    errorCount: number;
    warningCount: number;
    suggestionCount: number;
    overallQuality: 'good' | 'fair' | 'poor';
  };
  createdAt: Date;
  completedAt?: Date;
}

/**
 * 检查请求选项
 */
export interface CheckOptions {
  checkType?: CheckType;
  batchSize?: number;
  maxIssues?: number;
  createdBy?: string;
}

// ==================== 提示词 ====================

const WORD_QUALITY_CHECK_SYSTEM = `你是一个专业的英语词库质量审核专家。请检查单词数据的质量问题。

检查维度：
1. 拼写检查：检查 spelling 是否有拼写错误
2. 音标检查：检查 phonetic 是否符合 IPA 标准格式
3. 释义检查：检查 meanings 是否准确、完整、表达清晰
4. 例句检查：检查 examples 是否语法正确、用法恰当、难度适中

严重程度定义：
- error: 明显错误，必须修复（如拼写错误、语法错误）
- warning: 可能有问题，建议检查（如释义不够精确）
- suggestion: 改进建议（如可以补充更多例句）

注意事项：
- 只报告真正的问题，避免误报
- 对于专有名词和技术术语保持宽容
- 音标检查只针对明显格式错误`;

function buildWordCheckPrompt(
  words: Array<{
    id: string;
    spelling: string;
    phonetic: string;
    meanings: string[];
    examples: string[];
  }>,
  checkType: CheckType,
): string {
  const checkFocus =
    checkType === 'FULL'
      ? '全部维度（拼写、音标、释义、例句）'
      : checkType === 'SPELLING'
        ? '拼写'
        : checkType === 'MEANING'
          ? '释义'
          : '例句';

  return `请检查以下 ${words.length} 个单词的 ${checkFocus}：

${words
  .map(
    (w, i) => `
### 单词 ${i + 1}
- ID: ${w.id}
- 拼写: ${w.spelling}
- 音标: ${w.phonetic}
- 释义: ${w.meanings.join('; ')}
- 例句: ${w.examples.join(' | ')}
`,
  )
  .join('\n')}

---

请严格按照以下 JSON 格式输出检查结果（不要添加任何其他内容）：

\`\`\`json
{
  "issues": [
    {
      "wordId": "单词ID",
      "spelling": "单词拼写",
      "field": "问题字段 (spelling/phonetic/meanings/examples)",
      "severity": "严重程度 (error/warning/suggestion)",
      "description": "问题描述",
      "suggestion": "修复建议（可选）"
    }
  ],
  "summary": {
    "checkedCount": 检查的单词数,
    "issueCount": 发现的问题数,
    "notes": "整体评价（一句话）"
  }
}
\`\`\`

如果没有发现问题，issues 数组应该为空。`;
}

// ==================== 服务类 ====================

/**
 * 词库质量检查服务
 */
export class WordQualityService {
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
   * 启动词库质量检查
   */
  async startQualityCheck(
    wordBookId: string,
    options: CheckOptions = {},
  ): Promise<QualityCheckResult> {
    if (!this.isEnabled()) {
      throw new Error('LLM 服务未启用，无法进行质量检查');
    }

    const { checkType = 'FULL', batchSize = 10, maxIssues = 100, createdBy } = options;

    amasLogger.info(
      {
        wordBookId,
        checkType,
        batchSize,
      },
      '[WordQualityService] 开始质量检查',
    );

    // 获取词库单词
    const words = await prisma.word.findMany({
      where: { wordBookId },
      select: {
        id: true,
        spelling: true,
        phonetic: true,
        meanings: true,
        examples: true,
      },
      orderBy: { spelling: 'asc' },
    });

    if (words.length === 0) {
      throw new Error('词库为空，无法进行质量检查');
    }

    // 创建检查记录
    const checkRecord = await prisma.wordQualityCheck.create({
      data: {
        wordBookId,
        checkType,
        totalWords: words.length,
        checkedWords: 0,
        issuesFound: 0,
        issueDetails: [],
        status: 'processing',
        createdBy,
      },
    });

    // 分批处理
    const allIssues: WordIssue[] = [];
    let checkedCount = 0;

    try {
      for (let i = 0; i < words.length && allIssues.length < maxIssues; i += batchSize) {
        const batch = words.slice(i, i + batchSize);

        const batchIssues = await this.checkWordBatch(batch, checkType);
        allIssues.push(...batchIssues);
        checkedCount += batch.length;

        // 更新进度
        await prisma.wordQualityCheck.update({
          where: { id: checkRecord.id },
          data: {
            checkedWords: checkedCount,
            issuesFound: allIssues.length,
          },
        });

        amasLogger.info(
          {
            checkId: checkRecord.id,
            progress: `${checkedCount}/${words.length}`,
            issuesFound: allIssues.length,
          },
          '[WordQualityService] 检查进度',
        );

        // 限制请求频率
        if (i + batchSize < words.length) {
          await this.sleep(1000);
        }
      }

      // 计算汇总
      const summary = this.calculateSummary(allIssues, checkedCount);

      // 更新最终结果
      const updatedRecord = await prisma.wordQualityCheck.update({
        where: { id: checkRecord.id },
        data: {
          checkedWords: checkedCount,
          issuesFound: allIssues.length,
          issueDetails: allIssues as unknown as object[],
          status: 'completed',
        },
      });

      // 保存问题到独立表
      if (allIssues.length > 0) {
        await this.saveIssuesToDatabase(checkRecord.id, allIssues);
      }

      amasLogger.info(
        {
          checkId: checkRecord.id,
          totalWords: words.length,
          checkedWords: checkedCount,
          issuesFound: allIssues.length,
        },
        '[WordQualityService] 质量检查完成',
      );

      return {
        id: updatedRecord.id,
        wordBookId,
        checkType,
        status: 'completed',
        totalWords: words.length,
        checkedWords: checkedCount,
        issuesFound: allIssues.length,
        issues: allIssues,
        summary,
        createdAt: updatedRecord.createdAt,
        completedAt: new Date(),
      };
    } catch (error) {
      // 标记失败
      await prisma.wordQualityCheck.update({
        where: { id: checkRecord.id },
        data: {
          status: 'failed',
          issueDetails: { error: (error as Error).message },
        },
      });

      amasLogger.error(
        {
          checkId: checkRecord.id,
          error: (error as Error).message,
        },
        '[WordQualityService] 质量检查失败',
      );

      throw error;
    }
  }

  /**
   * 检查单批单词
   */
  private async checkWordBatch(
    words: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
    }>,
    checkType: CheckType,
  ): Promise<WordIssue[]> {
    const prompt = buildWordCheckPrompt(words, checkType);

    try {
      const response = await this.llmProvider.completeWithSystem(
        WORD_QUALITY_CHECK_SYSTEM,
        prompt,
        { temperature: 0.2, maxTokens: 2000 },
      );

      // 解析 JSON 响应
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (!jsonMatch) {
        amasLogger.warn({ response }, '[WordQualityService] 无法解析 LLM 响应');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[1]);

      // 验证和过滤问题
      return (parsed.issues || [])
        .filter((issue: WordIssue) => {
          return issue.wordId && issue.field && issue.severity && issue.description;
        })
        .map((issue: WordIssue) => ({
          ...issue,
          spelling: words.find((w) => w.id === issue.wordId)?.spelling || issue.spelling,
        }));
    } catch (error) {
      amasLogger.warn(
        {
          error: (error as Error).message,
          batchSize: words.length,
        },
        '[WordQualityService] 批次检查失败',
      );
      return [];
    }
  }

  /**
   * 保存问题到数据库
   */
  private async saveIssuesToDatabase(checkId: string, issues: WordIssue[]): Promise<void> {
    const createData = issues.map((issue) => ({
      wordId: issue.wordId,
      checkId,
      field: issue.field,
      severity: issue.severity,
      description: issue.description,
      suggestion: issue.suggestion,
      status: 'open',
    }));

    await prisma.wordContentIssue.createMany({
      data: createData,
      skipDuplicates: true,
    });
  }

  /**
   * 计算汇总统计
   */
  private calculateSummary(
    issues: WordIssue[],
    checkedCount: number,
  ): QualityCheckResult['summary'] {
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

    // 计算质量评级
    const errorRatio = checkedCount > 0 ? errorCount / checkedCount : 0;
    let overallQuality: 'good' | 'fair' | 'poor';

    if (errorRatio > 0.1) {
      overallQuality = 'poor';
    } else if (errorRatio > 0.02 || warningCount > checkedCount * 0.1) {
      overallQuality = 'fair';
    } else {
      overallQuality = 'good';
    }

    return {
      errorCount,
      warningCount,
      suggestionCount,
      overallQuality,
    };
  }

  /**
   * 获取检查历史
   */
  async getCheckHistory(
    wordBookId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: QualityCheckResult[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.wordQualityCheck.findMany({
        where: { wordBookId },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 10,
        skip: options?.offset ?? 0,
      }),
      prisma.wordQualityCheck.count({ where: { wordBookId } }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        wordBookId: item.wordBookId,
        checkType: item.checkType as CheckType,
        status: item.status as CheckStatus,
        totalWords: item.totalWords,
        checkedWords: item.checkedWords,
        issuesFound: item.issuesFound,
        issues: (item.issueDetails as unknown as WordIssue[]) || [],
        createdAt: item.createdAt,
      })),
      total,
    };
  }

  /**
   * 获取检查详情
   */
  async getCheckDetail(checkId: string): Promise<QualityCheckResult | null> {
    const record = await prisma.wordQualityCheck.findUnique({
      where: { id: checkId },
    });

    if (!record) return null;

    const issues = (record.issueDetails as unknown as WordIssue[]) || [];

    return {
      id: record.id,
      wordBookId: record.wordBookId,
      checkType: record.checkType as CheckType,
      status: record.status as CheckStatus,
      totalWords: record.totalWords,
      checkedWords: record.checkedWords,
      issuesFound: record.issuesFound,
      issues,
      summary: this.calculateSummary(issues, record.checkedWords),
      createdAt: record.createdAt,
    };
  }

  /**
   * 获取未解决的问题列表
   */
  async getOpenIssues(
    wordBookId: string,
    options?: {
      severity?: IssueSeverity;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Array<WordIssue & { id: string; status: string }>; total: number }> {
    const where: Record<string, unknown> = {
      status: 'open',
    };

    // 需要通过 checkId 关联到 wordBookId
    const checks = await prisma.wordQualityCheck.findMany({
      where: { wordBookId },
      select: { id: true },
    });
    const checkIds = checks.map((c) => c.id);

    if (checkIds.length === 0) {
      return { items: [], total: 0 };
    }

    where.checkId = { in: checkIds };

    if (options?.severity) {
      where.severity = options.severity;
    }

    const [items, total] = await Promise.all([
      prisma.wordContentIssue.findMany({
        where,
        orderBy: [
          { severity: 'asc' }, // error 在前
          { createdAt: 'desc' },
        ],
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      prisma.wordContentIssue.count({ where }),
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
        field: item.field as WordIssue['field'],
        severity: item.severity as IssueSeverity,
        description: item.description,
        suggestion: item.suggestion || undefined,
        status: item.status,
      })),
      total,
    };
  }

  /**
   * 标记问题为已修复
   */
  async markIssueFixed(issueId: string, fixedBy: string): Promise<void> {
    await prisma.wordContentIssue.update({
      where: { id: issueId },
      data: {
        status: 'fixed',
        fixedBy,
        fixedAt: new Date(),
      },
    });
  }

  /**
   * 忽略问题
   */
  async ignoreIssue(issueId: string): Promise<void> {
    await prisma.wordContentIssue.update({
      where: { id: issueId },
      data: { status: 'ignored' },
    });
  }

  /**
   * 批量应用修复建议（真正修改单词内容）
   */
  async applyFixes(
    issueIds: string[],
    appliedBy: string,
  ): Promise<{
    applied: number;
    failed: number;
    errors: Array<{ issueId: string; error: string }>;
  }> {
    const issues = await prisma.wordContentIssue.findMany({
      where: {
        id: { in: issueIds },
        status: 'open',
        suggestion: { not: null },
      },
    });

    let applied = 0;
    let failed = 0;
    const errors: Array<{ issueId: string; error: string }> = [];

    for (const issue of issues) {
      try {
        if (!issue.suggestion) {
          errors.push({ issueId: issue.id, error: '没有修复建议' });
          failed++;
          continue;
        }

        // 获取单词信息
        const word = await prisma.word.findUnique({
          where: { id: issue.wordId },
        });

        if (!word) {
          errors.push({ issueId: issue.id, error: '单词不存在' });
          failed++;
          continue;
        }

        // 根据字段类型应用修复
        const updateData: Record<string, unknown> = {};

        switch (issue.field) {
          case 'spelling':
            // 拼写修复：直接使用建议的拼写
            updateData.spelling = issue.suggestion;
            break;
          case 'phonetic':
            // 音标修复：直接使用建议的音标
            updateData.phonetic = issue.suggestion;
            break;
          case 'meanings':
            // 释义修复：如果建议包含完整释义，替换；否则追加
            if (issue.suggestion.startsWith('[') || issue.suggestion.includes(';')) {
              // 尝试解析为数组
              try {
                const newMeanings = JSON.parse(issue.suggestion);
                if (Array.isArray(newMeanings)) {
                  updateData.meanings = newMeanings;
                }
              } catch {
                // 按分号分割
                updateData.meanings = issue.suggestion
                  .split(';')
                  .map((m) => m.trim())
                  .filter(Boolean);
              }
            } else {
              // 追加新释义
              updateData.meanings = [...word.meanings, issue.suggestion];
            }
            break;
          case 'examples':
            // 例句修复：追加建议的例句
            if (issue.suggestion.startsWith('[')) {
              try {
                const newExamples = JSON.parse(issue.suggestion);
                if (Array.isArray(newExamples)) {
                  updateData.examples = [...word.examples, ...newExamples];
                }
              } catch {
                updateData.examples = [...word.examples, issue.suggestion];
              }
            } else {
              updateData.examples = [...word.examples, issue.suggestion];
            }
            break;
          default:
            errors.push({ issueId: issue.id, error: `不支持的字段类型: ${issue.field}` });
            failed++;
            continue;
        }

        // 更新单词
        if (Object.keys(updateData).length > 0) {
          await prisma.word.update({
            where: { id: issue.wordId },
            data: updateData,
          });
        }

        // 标记问题为已修复
        await prisma.wordContentIssue.update({
          where: { id: issue.id },
          data: {
            status: 'fixed',
            fixedBy: appliedBy,
            fixedAt: new Date(),
          },
        });

        applied++;
      } catch (error) {
        errors.push({ issueId: issue.id, error: (error as Error).message });
        failed++;
      }
    }

    amasLogger.info(
      {
        applied,
        failed,
        total: issueIds.length,
      },
      '[WordQualityService] 批量应用修复完成',
    );

    return { applied, failed, errors };
  }

  /**
   * 获取质量检查统计
   */
  async getQualityStats(wordBookId: string): Promise<{
    totalChecks: number;
    lastCheckDate: Date | null;
    totalIssuesFound: number;
    openIssues: number;
    fixedIssues: number;
    qualityTrend: Array<{ date: string; issueCount: number }>;
  }> {
    // 先获取该词库的所有检查 ID
    const wordBookChecks = await prisma.wordQualityCheck.findMany({
      where: { wordBookId },
      select: { id: true },
    });
    const checkIds = wordBookChecks.map((c) => c.id);

    const [checks, openCount, fixedCount] = await Promise.all([
      prisma.wordQualityCheck.findMany({
        where: { wordBookId },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          issuesFound: true,
        },
      }),
      checkIds.length > 0
        ? prisma.wordContentIssue.count({
            where: {
              checkId: { in: checkIds },
              status: 'open',
            },
          })
        : Promise.resolve(0),
      checkIds.length > 0
        ? prisma.wordContentIssue.count({
            where: {
              checkId: { in: checkIds },
              status: 'fixed',
            },
          })
        : Promise.resolve(0),
    ]);

    const totalIssuesFound = checks.reduce((sum, c) => sum + c.issuesFound, 0);

    // 生成趋势数据（最近 7 次检查）
    const qualityTrend = checks
      .slice(0, 7)
      .reverse()
      .map((c) => ({
        date: c.createdAt.toISOString().split('T')[0],
        issueCount: c.issuesFound,
      }));

    return {
      totalChecks: checks.length,
      lastCheckDate: checks[0]?.createdAt || null,
      totalIssuesFound,
      openIssues: openCount,
      fixedIssues: fixedCount,
      qualityTrend,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 默认实例 ====================

export const wordQualityService = new WordQualityService();
