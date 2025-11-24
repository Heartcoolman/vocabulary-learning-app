import { Router, Response } from 'express';
import { wordStateService } from '../services/word-state.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { validateWordStateUpdate } from '../validators/word-state.validator';


const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);


/**
 * 获取单个单词的学习状态
 * GET /api/word-states/:wordId
 */
router.get('/:wordId', async (req: AuthRequest, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const { wordId } = req.params;

        const state = await wordStateService.getWordState(userId, wordId);

        res.json({
            success: true,
            data: state
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 批量获取单词学习状态
 * POST /api/word-states/batch
 * Body: { wordIds: string[] }
 */
router.post('/batch', async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const { wordIds } = req.body;

        if (!Array.isArray(wordIds)) {
            return res.status(400).json({
                success: false,
                error: 'wordIds must be an array'
            });
        }

        const statesMap = await wordStateService.batchGetWordStates(userId, wordIds);

        // 转换Map为数组
        const states = Array.from(statesMap.values());

        res.json({
            success: true,
            data: states
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 更新单词学习状态
 * PUT /api/word-states/:wordId
 */
router.put('/:wordId', validateWordStateUpdate, async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const { wordId } = req.params;
        const updateData = req.body;

        const state = await wordStateService.upsertWordState(userId, wordId, updateData);

        res.json({
            success: true,
            data: state
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 删除单词学习状态
 * DELETE /api/word-states/:wordId
 */
router.delete('/:wordId', async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const { wordId } = req.params;

        await wordStateService.deleteWordState(userId, wordId);

        res.json({
            success: true,
            message: '学习状态已删除'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 获取到期需要复习的单词
 * GET /api/word-states/due
 */
router.get('/due/list', async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;

        const dueWords = await wordStateService.getDueWords(userId);

        res.json({
            success: true,
            data: dueWords
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 按状态获取单词
 * GET /api/word-states/by-state/:state
 */
router.get('/by-state/:state', async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const { state } = req.params;

        const words = await wordStateService.getWordsByState(userId, state as any);

        res.json({
            success: true,
            data: words
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 获取用户学习统计
 * GET /api/word-states/stats
 */
router.get('/stats/overview', async (req: AuthRequest, res, next) => {
    try {
        const userId = req.user!.id;

        const stats = await wordStateService.getUserStats(userId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
});

export default router;
