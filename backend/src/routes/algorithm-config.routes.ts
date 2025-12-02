/**
 * 算法配置路由
 */

import { Router } from 'express';
import { algorithmConfigService } from '../services/algorithm-config.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/algorithm-config
 * 获取当前激活的算法配置
 */
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const config = await algorithmConfigService.getActiveConfig();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: '未找到算法配置'
      });
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/algorithm-config
 * 更新算法配置（测试环境放宽权限）
 */
router.put('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { configId, config, changeReason } = req.body;
    const changedBy = req.user!.id;

    if (!configId) {
      return res.status(400).json({
        success: false,
        message: '缺少配置ID'
      });
    }

    if (!config) {
      return res.status(400).json({
        success: false,
        message: '缺少配置数据'
      });
    }

    // 验证配置
    const validation = algorithmConfigService.validateConfig(config);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: '配置验证失败',
        errors: validation.errors
      });
    }

    const updatedConfig = await algorithmConfigService.updateConfig(
      configId,
      config,
      changedBy,
      changeReason
    );

    res.json({
      success: true,
      data: updatedConfig
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/algorithm-config/reset
 * 重置算法配置为默认值（测试环境放宽权限）
 */
router.post('/reset', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { configId } = req.body;
    const changedBy = req.user!.id;

    const targetConfigId = configId || (await algorithmConfigService.getActiveConfig())?.id;
    if (!targetConfigId) {
      return res.status(500).json({
        success: false,
        message: '没有可用的算法配置'
      });
    }

    const resetConfig = await algorithmConfigService.resetToDefault(targetConfigId, changedBy);

    res.json({
      success: true,
      data: resetConfig
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/algorithm-config/history
 * 获取算法配置历史记录
 */
router.get('/history', authMiddleware, adminMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { configId, limit } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;

    const history = await algorithmConfigService.getConfigHistory(
      configId as string | undefined,
      limitNum
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/algorithm-config/presets
 * 获取算法配置预设列表
 */
router.get('/presets', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const presets = await algorithmConfigService.getAllConfigs();
    res.json({
      success: true,
      data: presets
    });
  } catch (error) {
    next(error);
  }
});

export default router;
