import { Router, Response } from 'express';
import adminService from '../services/admin.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateQuery, validateBody, validateParams } from '../middleware/validate.middleware';
import {
  adminGetUsersSchema,
  adminUserWordsSchema,
  adminLearningDataSchema,
  adminHeatmapSchema,
  adminWordHistorySchema,
  updateUserRoleSchema,
  createSystemWordBookSchema,
  updateSystemWordBookSchema,
  batchAddWordsSchema,
  flagAnomalySchema,
  exportFormatSchema,
} from '../validators/admin.validator';
import { idParamSchema, userWordParamsSchema, userIdParamSchema } from '../validators/common.validator';
import { AuthRequest } from '../types';

/**
 * 安全获取当前用户ID
 * 用于替代 req.user! 非空断言
 */
function getCurrentUserId(req: AuthRequest): string {
  if (!req.user?.id) {
    throw new Error('未获取到用户信息');
  }
  return req.user.id;
}

const router = Router();

// 所有管理员路由都需要认证和管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// =============== 用户管理 ===============

// 获取用户列表
router.get(
    '/users',
    validateQuery(adminGetUsersSchema),
    async (req: AuthRequest, res: Response, next) => {
    try {
        const { page, pageSize, search } = req.validatedQuery as {
            page: number;
            pageSize: number;
            search?: string;
        };

        const result = await adminService.getAllUsers({
            page,
            pageSize,
            search,
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

// 获取用户详情
router.get(
    '/users/:id',
    validateParams(idParamSchema),
    async (req: AuthRequest, res: Response, next) => {
    try {
        const { id } = req.validatedParams as { id: string };
        const user = await adminService.getUserById(id);

        res.json({
            success: true,
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

// 获取用户学习数据详情
router.get(
    '/users/:id/learning-data',
    validateParams(idParamSchema),
    validateQuery(adminLearningDataSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const { limit } = req.validatedQuery as { limit: number };

            const data = await adminService.getUserLearningData(id, {
                limit,
            });

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 获取用户详细统计数据
router.get(
    '/users/:id/statistics',
    validateParams(idParamSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const data = await adminService.getUserDetailedStatistics(id);

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 导出用户单词数据
router.get(
    '/users/:id/words/export',
    validateParams(idParamSchema),
    validateQuery(exportFormatSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const { format } = req.validatedQuery as { format: 'csv' | 'excel' };

            const result = await adminService.exportUserWords(id, format);

            res.setHeader('Content-Type', result.contentType);
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${encodeURIComponent(result.filename)}"`
            );
            res.send(result.data);
        } catch (error) {
            next(error);
        }
    }
);

// 获取用户单词列表
router.get(
    '/users/:id/words',
    validateParams(idParamSchema),
    validateQuery(adminUserWordsSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const {
                page,
                pageSize,
                scoreRange,
                masteryLevel,
                minAccuracy,
                state,
                sortBy,
                sortOrder,
            } = req.validatedQuery as {
                page: number;
                pageSize: number;
                scoreRange?: 'low' | 'medium' | 'high';
                masteryLevel?: number;
                minAccuracy?: number;
                state?: 'new' | 'learning' | 'reviewing' | 'mastered';
                sortBy?: 'score' | 'accuracy' | 'reviewCount' | 'lastReview';
                sortOrder: 'asc' | 'desc';
            };

            const data = await adminService.getUserWords(id, {
                page,
                pageSize,
                state,
                sortBy,
                sortOrder,
                scoreRange,
                masteryLevel,
                minAccuracy,
            });

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 修改用户角色
router.put(
    '/users/:id/role',
    validateParams(idParamSchema),
    validateBody(updateUserRoleSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const { role } = req.body as { role: 'USER' | 'ADMIN' };

            const user = await adminService.updateUserRole(id, role);

            res.json({
                success: true,
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 删除用户
router.delete(
    '/users/:id',
    validateParams(idParamSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            await adminService.deleteUser(id);

            res.json({
                success: true,
                message: '用户删除成功',
            });
        } catch (error) {
            next(error);
        }
    }
);

// =============== 系统词库管理 ===============

// 创建系统词库
router.post(
    '/wordbooks',
    validateBody(createSystemWordBookSchema),
    async (req: AuthRequest, res: Response, next) => {
    try {
        const { name, description, coverImage } = req.body as {
            name: string;
            description?: string;
            coverImage?: string;
        };

        const wordBook = await adminService.createSystemWordBook({
            name,
            description,
            coverImage,
        });

        res.status(201).json({
            success: true,
            data: wordBook,
        });
    } catch (error) {
        next(error);
    }
});

// 更新系统词库
router.put(
    '/wordbooks/:id',
    validateParams(idParamSchema),
    validateBody(updateSystemWordBookSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const { name, description, coverImage } = req.body as {
                name?: string;
                description?: string;
                coverImage?: string;
            };

            const wordBook = await adminService.updateSystemWordBook(id, {
                name,
                description,
                coverImage,
            });

            res.json({
                success: true,
                data: wordBook,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 删除系统词库
router.delete(
    '/wordbooks/:id',
    validateParams(idParamSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            await adminService.deleteSystemWordBook(id);

            res.json({
                success: true,
                message: '系统词库删除成功',
            });
        } catch (error) {
            next(error);
        }
    }
);

// 批量添加单词到系统词库
router.post(
    '/wordbooks/:id/words/batch',
    validateParams(idParamSchema),
    validateBody(batchAddWordsSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { id } = req.validatedParams as { id: string };
            const { words } = req.body as {
                words: Array<{
                    spelling: string;
                    phonetic: string;
                    meanings: string[];
                    examples: string[];
                    audioUrl?: string;
                }>;
            };

            const createdWords = await adminService.batchAddWordsToSystemWordBook(
                id,
                words
            );

            res.status(201).json({
                success: true,
                data: {
                    count: createdWords.length,
                    words: createdWords,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// =============== 单词详情（管理员视角） ===============

// 获取单词的完整学习历史
router.get(
    '/users/:userId/words/:wordId/history',
    validateParams(userWordParamsSchema),
    validateQuery(adminWordHistorySchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { userId, wordId } = req.validatedParams as { userId: string; wordId: string };
            const { limit } = req.validatedQuery as { limit: number };

            const data = await adminService.getWordLearningHistory(
                userId,
                wordId,
                { limit }
            );

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 获取单词得分历史（用于绘制曲线图）
router.get(
    '/users/:userId/words/:wordId/score-history',
    validateParams(userWordParamsSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { userId, wordId } = req.validatedParams as { userId: string; wordId: string };

            const data = await adminService.getWordScoreHistory(userId, wordId);

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 获取用户学习热力图数据
router.get(
    '/users/:userId/heatmap',
    validateParams(userIdParamSchema),
    validateQuery(adminHeatmapSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { userId } = req.validatedParams as { userId: string };
            const { days } = req.validatedQuery as { days: number };

            const data = await adminService.getUserLearningHeatmap(userId, { days });

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 标记异常单词或学习记录
router.post(
    '/users/:userId/words/:wordId/flag',
    validateParams(userWordParamsSchema),
    validateBody(flagAnomalySchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { userId, wordId } = req.validatedParams as { userId: string; wordId: string };
            const { recordId, reason, notes } = req.body as {
                recordId?: string;
                reason: string;
                notes?: string;
            };

            const data = await adminService.flagAnomalyRecord({
                userId,
                wordId,
                reason,
                flaggedBy: getCurrentUserId(req),
            });

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// 获取异常标记列表
router.get(
    '/users/:userId/words/:wordId/flags',
    validateParams(userWordParamsSchema),
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { userId, wordId } = req.validatedParams as { userId: string; wordId: string };

            const data = await adminService.getAnomalyFlags(userId, wordId);

            res.json({
                success: true,
                data,
            });
        } catch (error) {
            next(error);
        }
    }
);

// =============== 统计数据 ===============

// 获取系统统计数据
router.get('/statistics', async (req: AuthRequest, res: Response, next) => {
    try {
        const stats = await adminService.getStatistics();

        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
