import { Router, Response } from 'express';
import studyConfigService from '../services/study-config.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有学习配置路由都需要认证
router.use(authMiddleware);

// 获取当前用户学习配置
router.get('/', async (req: AuthRequest, res: Response, next) => {
    try {
        const config = await studyConfigService.getUserStudyConfig(req.user!.id);

        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        next(error);
    }
});

// 更新学习配置
router.put('/', async (req: AuthRequest, res: Response, next) => {
    try {
        const { selectedWordBookIds, dailyWordCount, studyMode } = req.body;

        if (!selectedWordBookIds || !Array.isArray(selectedWordBookIds)) {
            return res.status(400).json({
                success: false,
                error: 'selectedWordBookIds 必须是数组',
            });
        }

        if (!dailyWordCount || dailyWordCount < 10 || dailyWordCount > 100) {
            return res.status(400).json({
                success: false,
                error: '每日学习量必须在 10-100 之间',
            });
        }

        const config = await studyConfigService.updateStudyConfig(req.user!.id, {
            selectedWordBookIds,
            dailyWordCount,
            studyMode,
        });

        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        next(error);
    }
});

// 获取今日学习单词
router.get('/today-words', async (req: AuthRequest, res: Response, next) => {
    try {
        const result = await studyConfigService.getTodayWords(req.user!.id);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

// 获取学习进度
router.get('/progress', async (req: AuthRequest, res: Response, next) => {
    try {
        const progress = await studyConfigService.getStudyProgress(req.user!.id);

        res.json({
            success: true,
            data: progress,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
