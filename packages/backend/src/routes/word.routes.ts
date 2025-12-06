import { Router, Response } from 'express';
import wordService from '../services/word.service';
import { createWordSchema, updateWordSchema } from '../validators/word.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateParams } from '../middleware/validate.middleware';
import { idParamSchema } from '../validators/common.validator';
import { AuthRequest } from '../types';

const router = Router();

// 所有单词路由都需要认证
router.use(authMiddleware);

// 获取用户的所有单词（基于选择的词书）
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

// 搜索单词
router.get('/search', async (req: AuthRequest, res: Response, next) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const words = await wordService.searchWords(query, limit);

    res.json({
      success: true,
      data: words,
    });
  } catch (error) {
    next(error);
  }
});

// 获取用户学过的单词（有学习记录的）
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

// 获取单个单词
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

// 添加新单词
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = createWordSchema.parse(req.body);
    const word = await wordService.createWord(req.user!.id, data);

    res.status(201).json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

// 批量添加单词
// 管理员UI: src/pages/BatchImportPage.tsx (路由: /admin/batch-import)
router.post('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const words = req.body.words;
    if (!Array.isArray(words)) {
      throw new Error('words必须是数组');
    }

    const validatedWords = words.map(word => createWordSchema.parse(word));
    const result = await wordService.batchCreateWords(req.user!.id, validatedWords);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 更新单词
router.put('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    const data = updateWordSchema.parse(req.body);
    const word = await wordService.updateWord(id, req.user!.id, data);

    res.json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

// 删除单词
router.delete('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.validatedParams as { id: string };
    await wordService.deleteWord(id, req.user!.id);

    res.json({
      success: true,
      message: '单词删除成功',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
