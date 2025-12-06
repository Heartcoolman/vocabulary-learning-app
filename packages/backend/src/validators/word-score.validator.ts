import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const updateScoreSchema = z.object({
    wordId: z.string().uuid('无效的单词ID'),
    isCorrect: z.boolean(),
    responseTime: z.number().int().min(0).optional(),
    dwellTime: z.number().int().min(0).optional(),
});

export const getScoresSchema = z.object({
    wordIds: z.array(z.string().uuid('无效的单词ID')).min(1, 'wordIds cannot be empty'),
});

export const validateUpdateScore = (req: Request, res: Response, next: NextFunction) => {
  try {
    updateScoreSchema.parse(req.body);
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: '参数验证失败',
      errors: error.errors
    });
  }
};

export const validateWordScoreUpdate = validateUpdateScore;

export const validateGetScores = (req: Request, res: Response, next: NextFunction) => {
  try {
    getScoresSchema.parse(req.body);
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: '参数验证失败',
      errors: error.errors
    });
  }
};
