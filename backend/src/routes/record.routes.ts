import { Router, Response } from 'express';
import recordService from '../services/record.service';
import { createRecordSchema, batchCreateRecordsSchema } from '../validators/record.validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

// 所有记录路由都需要认证
router.use(authMiddleware);

// 获取用户的学习记录（支持分页）
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    // 解析分页参数，确保无效值回退为 undefined
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : NaN;
    const parsedPageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : NaN;
    
    const page = Number.isNaN(parsedPage) ? undefined : parsedPage;
    const pageSize = Number.isNaN(parsedPageSize) ? undefined : parsedPageSize;

    const result = await recordService.getRecordsByUserId(req.user!.id, { page, pageSize });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
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
