/**
 * v1 API - 单词管理路由
 * Words Management Routes for API v1
 *
 * 提供单词的查询、创建、更新、删除等 RESTful API 接口
 */

import { Router, Response } from 'express';
import wordService from '../../services/word.service';
import { createWordSchema, updateWordSchema } from '../../validators/word.validator';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validateParams } from '../../middleware/validate.middleware';
import { idParamSchema } from '../../validators/common.validator';
import { AuthRequest } from '../../types';
import { logger } from '../../logger';

const router = Router();

// 所有单词路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/v1/words
 * 获取用户的所有单词（基于选择的词书）
 *
 * 需要认证
 */
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const words = await wordService.getWordsByUserId(req.user!.id);

    res.json({
      success: true,
      data: words,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/words/search
 * 搜索单词
 *
 * Query:
 * - q: string              // 搜索关键词
 * - limit?: number         // 返回结果数量限制，默认 20
 *
 * 需要认证
 */
router.get('/search', async (req: AuthRequest, res: Response, next) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '搜索关键词不能为空',
        code: 'EMPTY_QUERY',
      });
    }

    const limit = parseInt(req.query.limit as string) || 20;

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit 必须在 1-100 之间',
        code: 'INVALID_LIMIT',
      });
    }

    const words = await wordService.searchWords(query, limit);

    res.json({
      success: true,
      data: words,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/words/learned
 * 获取用户学过的单词（有学习记录的）
 *
 * 需要认证
 */
router.get('/learned', async (req: AuthRequest, res: Response, next) => {
  try {
    const words = await wordService.getLearnedWordsByUserId(req.user!.id);

    res.json({
      success: true,
      data: words,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/words/:id
 * 获取单个单词详情
 *
 * 需要认证
 */
router.get('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    const word = await wordService.getWordById(id, req.user!.id);

    res.json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/words
 * 添加新单词
 *
 * Body:
 * {
 *   spelling: string;
 *   phonetic?: string;
 *   meanings?: string;
 *   wordBookId: string;
 *   difficulty?: number;
 * }
 *
 * 需要认证
 */
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = createWordSchema.parse(req.body);
    const word = await wordService.createWord(req.user!.id, data);

    logger.info({ userId: req.user!.id, wordId: word.id }, '[Word] 单词创建成功');

    res.status(201).json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/words/batch
 * 批量添加单词
 *
 * Body:
 * {
 *   words: Array<{
 *     spelling: string;
 *     phonetic?: string;
 *     meanings?: string;
 *     wordBookId: string;
 *     difficulty?: number;
 *   }>;
 * }
 *
 * 需要认证
 */
router.post('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const words = req.body.words;

    if (!Array.isArray(words)) {
      return res.status(400).json({
        success: false,
        error: 'words 必须是数组',
        code: 'INVALID_WORDS_FORMAT',
      });
    }

    if (words.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'words 数组不能为空',
        code: 'EMPTY_WORDS_ARRAY',
      });
    }

    if (words.length > 1000) {
      return res.status(400).json({
        success: false,
        error: '单次批量添加不能超过 1000 个单词',
        code: 'BATCH_SIZE_EXCEEDED',
      });
    }

    const validatedWords = words.map((word) => createWordSchema.parse(word));
    const result = await wordService.batchCreateWords(req.user!.id, validatedWords);

    logger.info({ userId: req.user!.id, count: words.length }, '[Word] 批量创建单词成功');

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/words/:id
 * 更新单词
 *
 * Body:
 * {
 *   spelling?: string;
 *   phonetic?: string;
 *   meanings?: string;
 *   difficulty?: number;
 * }
 *
 * 需要认证
 */
router.put('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    const data = updateWordSchema.parse(req.body);
    const word = await wordService.updateWord(id, req.user!.id, data);

    logger.info({ userId: req.user!.id, wordId: id }, '[Word] 单词更新成功');

    res.json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/words/:id
 * 删除单词
 *
 * 需要认证
 */
router.delete(
  '/:id',
  validateParams(idParamSchema),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { id } = req.validatedParams as { id: string };
      await wordService.deleteWord(id, req.user!.id);

      logger.info({ userId: req.user!.id, wordId: id }, '[Word] 单词删除成功');

      res.json({
        success: true,
        message: '单词删除成功',
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
