import { Router, Response } from 'express';
import { z } from 'zod';
import wordBookService from '../services/wordbook.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody, validateParams } from '../middleware/validate.middleware';
import { createWordSchema } from '../validators/word.validator';
import { idParamSchema, uuidSchema } from '../validators/common.validator';
import { AuthRequest } from '../types';
import { CreateWordDto } from '../types';

/**
 * 词书和单词组合参数 schema
 */
const wordBookWordParamsSchema = z.object({
    wordBookId: uuidSchema,
    wordId: uuidSchema,
});

const router = Router();

// 所有词书路由都需要认证
router.use(authMiddleware);

// 获取用户词库列表
router.get('/user', async (req: AuthRequest, res: Response, next) => {
    try {
        const wordBooks = await wordBookService.getUserWordBooks(req.user!.id);

        res.json({
            success: true,
            data: wordBooks,
        });
    } catch (error) {
        next(error);
    }
});

// 获取系统词库列表
router.get('/system', async (req: AuthRequest, res: Response, next) => {
    try {
        const wordBooks = await wordBookService.getSystemWordBooks();

        res.json({
            success: true,
            data: wordBooks,
        });
    } catch (error) {
        next(error);
    }
});

// 获取所有可用词书（系统 + 用户自己的）
router.get('/available', async (req: AuthRequest, res: Response, next) => {
    try {
        const wordBooks = await wordBookService.getAllAvailableWordBooks(
            req.user!.id
        );

        res.json({
            success: true,
            data: wordBooks,
        });
    } catch (error) {
        next(error);
    }
});

// 创建用户词书
router.post('/', async (req: AuthRequest, res: Response, next) => {
    try {
        const { name, description, coverImage } = req.body;

        // 验证名称
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
                success: false,
                error: '词书名称不能为空',
            });
        }

        if (name.length > 100) {
            return res.status(400).json({
                success: false,
                error: '词书名称不能超过100个字符',
            });
        }

        // 验证描述（可选）
        if (description !== undefined && description !== null) {
            if (typeof description !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '词书描述必须是字符串',
                });
            }
            if (description.length > 500) {
                return res.status(400).json({
                    success: false,
                    error: '词书描述不能超过500个字符',
                });
            }
        }

        // 验证封面图片URL（可选）
        if (coverImage !== undefined && coverImage !== null) {
            if (typeof coverImage !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL必须是字符串',
                });
            }
            if (coverImage.length > 500) {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL不能超过500个字符',
                });
            }
            // 简单的URL格式验证
            if (coverImage && !coverImage.match(/^https?:\/\/.+/)) {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL格式不正确',
                });
            }
        }

        const wordBook = await wordBookService.createWordBook(req.user!.id, {
            name: name.trim(),
            description: description?.trim(),
            coverImage: coverImage?.trim(),
        });

        res.status(201).json({
            success: true,
            data: wordBook,
        });
    } catch (error) {
        next(error);
    }
});

// 获取词书详情
router.get('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        const wordBook = await wordBookService.getWordBookById(
            id,
            req.user!.id
        );

        res.json({
            success: true,
            data: wordBook,
        });
    } catch (error) {
        next(error);
    }
});

// 更新词书信息
router.put('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        const { name, description, coverImage } = req.body;

        // 验证名称（如果提供）
        if (name !== undefined && name !== null) {
            if (typeof name !== 'string' || name.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: '词书名称不能为空',
                });
            }
            if (name.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: '词书名称不能超过100个字符',
                });
            }
        }

        // 验证描述（如果提供）
        if (description !== undefined && description !== null) {
            if (typeof description !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '词书描述必须是字符串',
                });
            }
            if (description.length > 500) {
                return res.status(400).json({
                    success: false,
                    error: '词书描述不能超过500个字符',
                });
            }
        }

        // 验证封面图片URL（如果提供）
        if (coverImage !== undefined && coverImage !== null) {
            if (typeof coverImage !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL必须是字符串',
                });
            }
            if (coverImage.length > 500) {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL不能超过500个字符',
                });
            }
            // 简单的URL格式验证
            if (coverImage && !coverImage.match(/^https?:\/\/.+/)) {
                return res.status(400).json({
                    success: false,
                    error: '封面图片URL格式不正确',
                });
            }
        }

        const wordBook = await wordBookService.updateWordBook(
            id,
            req.user!.id,
            {
                name: name?.trim(),
                description: description?.trim(),
                coverImage: coverImage?.trim(),
            }
        );

        res.json({
            success: true,
            data: wordBook,
        });
    } catch (error) {
        next(error);
    }
});

// 删除词书
router.delete('/:id', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        await wordBookService.deleteWordBook(id, req.user!.id);

        res.json({
            success: true,
            message: '词书删除成功',
        });
    } catch (error) {
        next(error);
    }
});

// 获取词书中的单词
router.get('/:id/words', validateParams(idParamSchema), async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        const words = await wordBookService.getWordBookWords(
            id,
            req.user!.id
        );

        res.json({
            success: true,
            data: words,
        });
    } catch (error) {
        next(error);
    }
});

// 向词书添加单词
router.post('/:id/words', validateParams(idParamSchema), validateBody(createWordSchema), async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        const validatedData = req.validatedBody as unknown as CreateWordDto;
        const { spelling, phonetic, meanings, examples, audioUrl } = validatedData;

        const word = await wordBookService.addWordToWordBook(
            id,
            req.user!.id,
            {
                spelling,
                phonetic: phonetic ?? '',
                meanings,
                examples,
                audioUrl: audioUrl ?? undefined,
            }
        );

        res.status(201).json({
            success: true,
            data: word,
        });
    } catch (error) {
        next(error);
    }
});

// 从词书删除单词
router.delete(
    '/:wordBookId/words/:wordId',
    validateParams(wordBookWordParamsSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { wordBookId, wordId } = req.validatedParams as { wordBookId: string; wordId: string };
            await wordBookService.removeWordFromWordBook(
                wordBookId,
                wordId,
                req.user!.id
            );

            res.json({
                success: true,
                message: '单词删除成功',
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
