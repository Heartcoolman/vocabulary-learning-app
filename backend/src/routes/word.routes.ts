import { Router, Response } from 'express';
import wordService from '../services/word.service';
import { createWordSchema, updateWordSchema } from '../validators/word.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有单词路由都需要认证
router.use(authMiddleware);

// 获取用户的所有单词
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

// 获取单个单词
router.get('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const word = await wordService.getWordById(req.params.id, req.user!.id);

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
router.put('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = updateWordSchema.parse(req.body);
    const word = await wordService.updateWord(req.params.id, req.user!.id, data);

    res.json({
      success: true,
      data: word,
    });
  } catch (error) {
    next(error);
  }
});

// 删除单词
router.delete('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    await wordService.deleteWord(req.params.id, req.user!.id);

    res.json({
      success: true,
      message: '单词删除成功',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
