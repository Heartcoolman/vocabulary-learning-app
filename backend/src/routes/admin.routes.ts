import { Router, Response } from 'express';
import adminService from '../services/admin.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';
import { UserRole } from '@prisma/client';

const router = Router();

// 所有管理员路由都需要认证和管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// =============== 用户管理 ===============

// 获取用户列表
router.get('/users', async (req: AuthRequest, res: Response, next) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const pageSize = req.query.pageSize
            ? parseInt(req.query.pageSize as string)
            : 20;
        const search = req.query.search as string | undefined;

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
router.get('/users/:id', async (req: AuthRequest, res: Response, next) => {
    try {
        const user = await adminService.getUserById(req.params.id);

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
    async (req: AuthRequest, res: Response, next) => {
        try {
            const limit = req.query.limit
                ? parseInt(req.query.limit as string)
                : 50;

            const data = await adminService.getUserLearningData(req.params.id, {
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

// 修改用户角色
router.put(
    '/users/:id/role',
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { role } = req.body;

            if (!role || !['USER', 'ADMIN'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: '无效的角色',
                });
            }

            const user = await adminService.updateUserRole(
                req.params.id,
                role as UserRole
            );

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
router.delete('/users/:id', async (req: AuthRequest, res: Response, next) => {
    try {
        await adminService.deleteUser(req.params.id);

        res.json({
            success: true,
            message: '用户删除成功',
        });
    } catch (error) {
        next(error);
    }
});

// =============== 系统词库管理 ===============

// 创建系统词库
router.post('/wordbooks', async (req: AuthRequest, res: Response, next) => {
    try {
        const { name, description, coverImage } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                error: '词库名称不能为空',
            });
        }

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
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { name, description, coverImage } = req.body;

            const wordBook = await adminService.updateSystemWordBook(req.params.id, {
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
    async (req: AuthRequest, res: Response, next) => {
        try {
            await adminService.deleteSystemWordBook(req.params.id);

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
    async (req: AuthRequest, res: Response, next) => {
        try {
            const { words } = req.body;

            if (!Array.isArray(words) || words.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '单词列表不能为空',
                });
            }

            // 验证每个单词的必填字段
            for (const word of words) {
                if (
                    !word.spelling ||
                    !word.phonetic ||
                    !word.meanings ||
                    !word.examples
                ) {
                    return res.status(400).json({
                        success: false,
                        error: '每个单词必须包含 spelling、phonetic、meanings 和 examples',
                    });
                }
            }

            const createdWords = await adminService.batchAddWordsToSystemWordBook(
                req.params.id,
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
