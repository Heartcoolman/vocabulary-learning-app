import { Router, Response } from 'express';
import recordService from '../services/record.service';
import { createRecordSchema, batchCreateRecordsSchema } from '../validators/record.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有记录路由都需要认证
router.use(authMiddleware);

// 获取用户的学习记录
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const records = await recordService.getRecordsByUserId(req.user!.id);

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    next(error);
  }
});

// 保存答题记录
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const data = createRecordSchema.parse(req.body);
    const record = await recordService.createRecord(req.user!.id, data);

    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
});

// 批量保存答题记录
router.post('/batch', async (req: AuthRequest, res: Response, next) => {
  try {
    const { records } = batchCreateRecordsSchema.parse(req.body);
    const result = await recordService.batchCreateRecords(req.user!.id, records);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 获取学习统计
router.get('/statistics', async (req: AuthRequest, res: Response, next) => {
  try {
    const statistics = await recordService.getStatistics(req.user!.id);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
