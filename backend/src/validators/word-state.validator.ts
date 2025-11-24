import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const wordStateUpdateSchema = z.object({
    state: z.enum(['NEW', 'LEARNING', 'REVIEWING', 'MASTERED']).optional(),
    masteryLevel: z.number().int().min(0).max(5).optional(),
    easeFactor: z.number().min(1.3).max(2.5).optional(),
    reviewCount: z.number().int().min(0).optional(),
    lastReviewDate: z.coerce.date().optional(),
    nextReviewDate: z.coerce.date().optional(),
    currentInterval: z.number().int().min(1).optional(),
    consecutiveCorrect: z.number().int().min(0).optional(),
    consecutiveWrong: z.number().int().min(0).optional(),
}).strict();

/**
 * 验证单词学习状态更新请求
 */
export const validateWordStateUpdate = (req: Request, res: Response, next: NextFunction) => {
    const allowedFields = [
        'state', 'masteryLevel', 'easeFactor', 'reviewCount',
        'lastReviewDate', 'nextReviewDate', 'currentInterval',
        'consecutiveCorrect', 'consecutiveWrong'
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
        wordStateUpdateSchema.parse(req.body);
        next();
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: '字段验证失败',
            details: error.issues?.[0]?.message || error.message
        });
    }
};
