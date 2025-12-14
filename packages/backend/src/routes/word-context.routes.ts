/**
 * v1 API - 单词语境路由
 * Word Context Routes for API v1
 *
 * 提供单词语境的管理和查询接口
 */

import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { wordContextService } from '../services/word-context.service';
import { logger } from '../logger';
import type { ContextType } from '@prisma/client';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * POST /api/v1/word-contexts
 * 添加单词语境
 *
 * Body:
 * {
 *   wordId: string;
 *   contextType: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA';
 *   content: string;
 *   metadata?: {
 *     source?: string;
 *     difficulty?: 'easy' | 'medium' | 'hard';
 *     tags?: string[];
 *     audioUrl?: string;
 *     imageUrl?: string;
 *     author?: string;
 *     publishDate?: string;
 *   }
 * }
 */
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordId, contextType, content, metadata } = req.body;

    // 参数校验
    if (!wordId || typeof wordId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'wordId 参数必填且必须是字符串',
        code: 'INVALID_WORD_ID',
      });
    }

    if (!contextType || !['SENTENCE', 'CONVERSATION', 'ARTICLE', 'MEDIA'].includes(contextType)) {
      return res.status(400).json({
        success: false,
        error: 'contextType 必须是 SENTENCE, CONVERSATION, ARTICLE 或 MEDIA',
        code: 'INVALID_CONTEXT_TYPE',
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'content 参数必填且不能为空',
        code: 'INVALID_CONTENT',
      });
    }

    const context = await wordContextService.addContext({
      wordId,
      contextType: contextType as ContextType,
      content,
      metadata,
    });

    logger.info({ contextId: context.id, wordId, contextType }, '[WordContext] 语境已添加');

    res.status(201).json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/word-contexts/batch
 * 批量添加语境
 *
 * Body:
 * [
 *   {
 *     wordId: string;
 *     contextType: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA';
 *     content: string;
 *     metadata?: { ... }
 *   }
 * ]
 */
router.post('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const requests = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请求体必须是非空数组',
        code: 'INVALID_REQUEST_BODY',
      });
    }

    // 参数校验
    for (const request of requests) {
      if (!request.wordId || !request.contextType || !request.content) {
        return res.status(400).json({
          success: false,
          error: '每个语境必须包含 wordId, contextType 和 content',
          code: 'INCOMPLETE_REQUEST',
        });
      }
    }

    const contexts = await wordContextService.addContexts(requests);

    res.status(201).json({
      success: true,
      data: contexts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/word-contexts/word/:wordId
 * 获取单词的语境列表
 *
 * Query:
 * - type?: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA'
 * - difficulty?: 'easy' | 'medium' | 'hard'
 * - limit?: number
 * - offset?: number
 * - sortBy?: 'createdAt' | 'usageCount' | 'effectivenessScore'
 * - sortOrder?: 'asc' | 'desc'
 */
router.get('/word/:wordId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordId } = req.params;
    const { type, difficulty, limit, offset, sortBy, sortOrder } = req.query;

    const contexts = await wordContextService.getContexts(wordId, {
      type: type as ContextType | undefined,
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | undefined,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
      sortBy: sortBy as 'createdAt' | 'usageCount' | 'effectivenessScore' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.json({
      success: true,
      data: contexts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/word-contexts/word/:wordId/random
 * 获取单词的随机语境
 *
 * Query:
 * - type?: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA'
 * - difficulty?: 'easy' | 'medium' | 'hard'
 */
router.get('/word/:wordId/random', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordId } = req.params;
    const { type, difficulty } = req.query;

    const context = await wordContextService.getRandomContext(wordId, {
      type: type as ContextType | undefined,
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | undefined,
    });

    if (!context) {
      return res.status(404).json({
        success: false,
        error: '未找到符合条件的语境',
        code: 'CONTEXT_NOT_FOUND',
      });
    }

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/word-contexts/word/:wordId/best
 * 获取单词的最佳语境
 *
 * Query:
 * - preferredType?: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA'
 * - userLevel?: 'beginner' | 'intermediate' | 'advanced'
 */
router.get('/word/:wordId/best', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordId } = req.params;
    const { preferredType, userLevel } = req.query;

    const context = await wordContextService.getBestContext(wordId, {
      preferredType: preferredType as ContextType | undefined,
      userLevel: userLevel as 'beginner' | 'intermediate' | 'advanced' | undefined,
    });

    if (!context) {
      return res.status(404).json({
        success: false,
        error: '未找到符合条件的语境',
        code: 'CONTEXT_NOT_FOUND',
      });
    }

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/word-contexts/word/:wordId/stats
 * 获取单词的语境统计
 */
router.get('/word/:wordId/stats', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordId } = req.params;

    const stats = await wordContextService.getContextStats(wordId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/word-contexts/:contextId/content
 * 更新语境内容
 *
 * Body:
 * {
 *   content: string;
 * }
 */
router.put('/:contextId/content', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'content 参数必填且不能为空',
        code: 'INVALID_CONTENT',
      });
    }

    const context = await wordContextService.updateContext(contextId, content);

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/word-contexts/:contextId/metadata
 * 更新语境元数据
 *
 * Body:
 * {
 *   source?: string;
 *   difficulty?: 'easy' | 'medium' | 'hard';
 *   tags?: string[];
 *   audioUrl?: string;
 *   imageUrl?: string;
 *   author?: string;
 *   publishDate?: string;
 *   usageCount?: number;
 *   effectivenessScore?: number;
 * }
 */
router.put('/:contextId/metadata', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextId } = req.params;
    const metadata = req.body;

    const context = await wordContextService.updateContextMetadata(contextId, metadata);

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/word-contexts/:contextId/usage
 * 记录语境使用
 */
router.post('/:contextId/usage', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextId } = req.params;

    await wordContextService.recordContextUsage(contextId);

    res.json({
      success: true,
      data: { contextId, recorded: true },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/word-contexts/:contextId/effectiveness
 * 更新语境效果评分
 *
 * Body:
 * {
 *   score: number;  // 0-1 之间
 * }
 */
router.put('/:contextId/effectiveness', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextId } = req.params;
    const { score } = req.body;

    if (typeof score !== 'number' || score < 0 || score > 1) {
      return res.status(400).json({
        success: false,
        error: 'score 必须是 0-1 之间的数字',
        code: 'INVALID_SCORE',
      });
    }

    await wordContextService.updateEffectivenessScore(contextId, score);

    res.json({
      success: true,
      data: { contextId, score },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/word-contexts/:contextId
 * 删除语境
 */
router.delete('/:contextId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextId } = req.params;

    await wordContextService.deleteContext(contextId);

    logger.info({ contextId }, '[WordContext] 语境已删除');

    res.json({
      success: true,
      data: { contextId, deleted: true },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/word-contexts/batch
 * 批量删除语境
 *
 * Body:
 * {
 *   contextIds: string[];
 * }
 */
router.delete('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const { contextIds } = req.body;

    if (!Array.isArray(contextIds) || contextIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'contextIds 必须是非空数组',
        code: 'INVALID_CONTEXT_IDS',
      });
    }

    const count = await wordContextService.deleteContexts(contextIds);

    res.json({
      success: true,
      data: { deletedCount: count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/word-contexts/recommend
 * 为选定的单词推荐语境
 *
 * Body:
 * {
 *   wordIds: string[];
 *   contextType?: 'SENTENCE' | 'CONVERSATION' | 'ARTICLE' | 'MEDIA';
 *   difficulty?: 'easy' | 'medium' | 'hard';
 *   maxPerWord?: number;
 * }
 */
router.post('/recommend', async (req: AuthRequest, res: Response, next) => {
  try {
    const { wordIds, contextType, difficulty, maxPerWord } = req.body;

    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'wordIds 必须是非空数组',
        code: 'INVALID_WORD_IDS',
      });
    }

    const contexts = await wordContextService.recommendContextsForWords(wordIds, {
      contextType: contextType as ContextType | undefined,
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | undefined,
      maxPerWord,
    });

    res.json({
      success: true,
      data: contexts,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
