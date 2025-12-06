import { Router, Response, NextFunction } from 'express';
import { wordStateService } from '../services/word-state.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { validateWordStateUpdate } from '../validators/word-state.validator';
import { WordState } from '@prisma/client';


const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * 路由顺序规则：
 * 1. 静态路由（如 /batch, /due/list, /stats/overview）必须放在参数路由之前
 * 2. 参数路由（如 /:wordId）必须放在文件末尾
 * 3. 添加新路由时，GET/PUT/DELETE 的静态路由必须在对应的 /:wordId 路由之前
 */

// 小写状态到 Prisma 枚举的映射
const STATE_MAP: Record<string, WordState> = {
  new: WordState.NEW,
  learning: WordState.LEARNING,
  review: WordState.REVIEWING,
  mastered: WordState.MASTERED
};

// 合法的学习状态枚举
const ALLOWED_STATES = new Set<string>(Object.keys(STATE_MAP));

// 批量请求最大数量限制
const MAX_BATCH_SIZE = 500;

/**
 * 安全获取用户ID，认证失败返回401
 */
const getUserIdOr401 = (req: AuthRequest, res: Response): string | null => {
    if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return null;
    }
    return req.user.id;
};

/**
 * 校验并规范化 wordId 参数
 */
const ensureWordId = (wordId: string | undefined, res: Response): string | null => {
    const normalized = wordId?.trim();
    if (!normalized) {
        res.status(400).json({ success: false, error: 'wordId is required' });
        return null;
    }
    return normalized;
};

/**
 * 批量获取单词学习状态
 * POST /api/word-states/batch
 * Body: { wordIds: string[] }
 */
router.post('/batch', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const wordIds = req.body?.wordIds;

        // 验证 wordIds 是非空数组
        if (!Array.isArray(wordIds) || wordIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'wordIds must be a non-empty array'
            });
        }

        // 验证数组长度上限
        if (wordIds.length > MAX_BATCH_SIZE) {
            return res.status(400).json({
                success: false,
                error: `wordIds array exceeds maximum size of ${MAX_BATCH_SIZE}`
            });
        }

        // 验证所有元素都是非空字符串
        if (!wordIds.every((id: unknown) => typeof id === 'string' && id.trim())) {
            return res.status(400).json({
                success: false,
                error: 'wordIds must contain only non-empty strings'
            });
        }

        // 去重并规范化
        const uniqueIds = Array.from(new Set(wordIds.map((id: string) => id.trim())));
        const statesMap = await wordStateService.batchGetWordStates(userId, uniqueIds);

        // 保持与请求 wordId 的对应关系，便于客户端处理
        const data = uniqueIds.map(id => ({
            wordId: id,
            state: statesMap.get(id) ?? null
        }));

        res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 更新单词学习状态
 * PUT /api/word-states/:wordId
 */
router.put('/:wordId', validateWordStateUpdate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const wordId = ensureWordId(req.params.wordId, res);
        if (!wordId) return;

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
router.delete('/:wordId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const wordId = ensureWordId(req.params.wordId, res);
        if (!wordId) return;

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
 * GET /api/word-states/due/list
 */
router.get('/due/list', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

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
router.get('/by-state/:state', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const { state } = req.params;

        // 验证状态值是否合法
        if (!ALLOWED_STATES.has(state)) {
            return res.status(400).json({
                success: false,
                error: `Invalid state. Allowed values: ${Array.from(ALLOWED_STATES).join(', ')}`
            });
        }

        const words = await wordStateService.getWordsByState(userId, STATE_MAP[state]);

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
router.get('/stats/overview', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const stats = await wordStateService.getUserStats(userId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 获取单个单词的学习状态
 * GET /api/word-states/:wordId
 * 注意：此参数路由必须放在所有静态路由之后，否则会错误匹配
 */
router.get('/:wordId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = getUserIdOr401(req, res);
        if (!userId) return;

        const wordId = ensureWordId(req.params.wordId, res);
        if (!wordId) return;

        const state = await wordStateService.getWordState(userId, wordId);

        res.json({
            success: true,
            data: state
        });
    } catch (error) {
        next(error);
    }
});

export default router;
