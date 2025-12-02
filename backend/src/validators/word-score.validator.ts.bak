import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const wordScoreUpdateSchema = z.object({
    totalScore: z.number().min(0).max(100).optional(),
    accuracyScore: z.number().min(0).max(40).optional(),
    speedScore: z.number().min(0).max(30).optional(),
    stabilityScore: z.number().min(0).max(20).optional(),
    proficiencyScore: z.number().min(0).max(10).optional(),
    totalAttempts: z.number().int().min(0).optional(),
    correctAttempts: z.number().int().min(0).optional(),
    averageResponseTime: z.number().min(0).optional(),
    averageDwellTime: z.number().min(0).optional(),
    recentAccuracy: z.number().min(0).max(1).optional(),
}).strict();

/**
 * 验证单词得分更新请求
 */
export const validateWordScoreUpdate = (req: Request, res: Response, next: NextFunction) => {
    const allowedFields = [
        'totalScore', 'accuracyScore', 'speedScore', 'stabilityScore',
        'proficiencyScore', 'totalAttempts', 'correctAttempts',
        'averageResponseTime', 'averageDwellTime', 'recentAccuracy'
    ];

    const providedFields = Object.keys(req.body);
    const invalidFields = providedFields.filter(f => !allowedFields.includes(f));

    if (invalidFields.length > 0) {
        return res.status(400).json({
            success: false,
            error: `不允许的字段: ${invalidFields.join(', ')}`
        });
    }

    // 禁止用户提交 userId 和 wordId
    if (req.body.userId || req.body.wordId) {
        return res.status(400).json({
            success: false,
            error: '不允许提交 userId 或 wordId'
        });
    }

    try {
        wordScoreUpdateSchema.parse(req.body);
        next();
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: '字段验证失败',
            details: error.issues?.[0]?.message || error.message
        });
    }
};
