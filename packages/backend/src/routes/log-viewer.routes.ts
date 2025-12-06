/**
 * 日志查看和告警规则管理路由
 *
 * 挂载路径: /api/admin/logs
 *
 * 功能:
 * - 分页查询日志
 * - 日志统计分析
 * - 获取模块列表
 * - 单条日志详情
 * - 告警规则 CRUD
 *
 * 路由列表:
 * - GET    /api/admin/logs           - 分页查询日志
 * - GET    /api/admin/logs/stats     - 日志统计
 * - GET    /api/admin/logs/modules   - 获取模块列表
 * - GET    /api/admin/logs/:id       - 单条日志详情
 * - GET    /api/admin/logs/log-alerts       - 获取告警规则列表
 * - POST   /api/admin/logs/log-alerts       - 创建告警规则
 * - PUT    /api/admin/logs/log-alerts/:id   - 更新告警规则
 * - DELETE /api/admin/logs/log-alerts/:id   - 删除告警规则
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateQuery, validateBody, validateParams } from '../middleware/validate.middleware';
import { AuthRequest } from '../types';
import { LogLevel, LogSource } from '@prisma/client';

const router = Router();

// 所有路由需要认证和管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// ==================== 验证 Schema ====================

/**
 * 日志查询参数验证
 */
const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  level: z.nativeEnum(LogLevel).optional(),
  module: z.string().max(100).optional(),
  source: z.nativeEnum(LogSource).optional(),
  userId: z.string().uuid().optional(),
  requestId: z.string().max(100).optional(),
  messagePattern: z.string().max(500).optional(), // 消息模糊搜索
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  sortBy: z.enum(['timestamp', 'level']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 日志统计查询参数
 */
const logsStatsQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  groupBy: z.enum(['level', 'module', 'source', 'hour', 'day']).default('level'),
});

/**
 * 模块查询参数
 */
const modulesQuerySchema = z.object({
  search: z.string().max(100).optional(),
});

/**
 * 告警规则创建/更新验证
 */
const alertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  levels: z.array(z.nativeEnum(LogLevel)).min(1),
  module: z.string().max(100).optional(),
  messagePattern: z.string().max(500).optional(),
  threshold: z.number().int().min(1),
  windowMinutes: z.number().int().min(1).max(1440), // 最长24小时
  webhookUrl: z.string().url().max(500).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).default(30),
});

/**
 * 告警规则更新验证（部分字段可选）
 */
const updateAlertRuleSchema = alertRuleSchema.partial();

/**
 * ID 参数验证
 */
const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ==================== 日志查询路由 ====================

/**
 * GET /api/admin/logs
 * 分页查询日志
 */
router.get(
  '/',
  validateQuery(logsQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page,
        pageSize,
        level,
        module,
        source,
        userId,
        requestId,
        messagePattern,
        startTime,
        endTime,
        sortBy,
        sortOrder,
      } = req.validatedQuery as z.infer<typeof logsQuerySchema>;

      // 构建查询条件
      const where: any = {};

      if (level) where.level = level;
      if (module) where.module = module;
      if (source) where.source = source;
      if (userId) where.userId = userId;
      if (requestId) where.requestId = requestId;
      if (messagePattern) {
        where.message = {
          contains: messagePattern,
          mode: 'insensitive',
        };
      }

      // 时间范围过滤
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      // 计算分页
      const skip = (page - 1) * pageSize;

      // 并行查询总数和数据
      const [total, logs] = await Promise.all([
        prisma.systemLog.count({ where }),
        prisma.systemLog.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: {
            [sortBy]: sortOrder,
          },
          select: {
            id: true,
            level: true,
            message: true,
            module: true,
            source: true,
            context: true,
            error: true,
            requestId: true,
            userId: true,
            clientIp: true,
            userAgent: true,
            app: true,
            env: true,
            timestamp: true,
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '查询日志失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/admin/logs/stats
 * 日志统计
 */
router.get(
  '/stats',
  validateQuery(logsStatsQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { startTime, endTime } = req.validatedQuery as z.infer<
        typeof logsStatsQuerySchema
      >;

      // 构建时间范围条件
      const where: any = {};
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      // 并行查询各项统计
      const [
        total,
        levelStats,
        sourceStats,
      ] = await Promise.all([
        // 总数
        prisma.systemLog.count({ where }),
        // 按级别统计
        prisma.systemLog.groupBy({
          by: ['level'],
          where,
          _count: { id: true },
        }),
        // 按来源统计
        prisma.systemLog.groupBy({
          by: ['source'],
          where,
          _count: { id: true },
        }),
      ]);

      // 计算各项数量
      const errorCount = levelStats.find(s => s.level === 'ERROR')?._count?.id || 0;
      const warnCount = levelStats.find(s => s.level === 'WARN')?._count?.id || 0;
      const frontendCount = sourceStats.find(s => s.source === 'FRONTEND')?._count?.id || 0;
      const backendCount = sourceStats.find(s => s.source === 'BACKEND')?._count?.id || 0;

      res.json({
        success: true,
        data: {
          total,
          errorCount,
          warnCount,
          frontendCount,
          backendCount,
          // 额外返回详细统计（供图表使用）
          byLevel: levelStats.map(s => ({ level: s.level, count: s._count.id })),
          bySource: sourceStats.map(s => ({ source: s.source, count: s._count.id })),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '获取日志统计失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/admin/logs/modules
 * 获取所有模块列表（用于筛选下拉框）
 */
router.get(
  '/modules',
  validateQuery(modulesQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { search } = req.validatedQuery as z.infer<typeof modulesQuerySchema>;

      const where: any = {
        module: {
          not: null,
        },
      };

      if (search) {
        where.module = {
          contains: search,
          mode: 'insensitive',
        };
      }

      // 获取去重的模块列表
      const modules = await prisma.systemLog.findMany({
        where,
        select: {
          module: true,
        },
        distinct: ['module'],
        orderBy: {
          module: 'asc',
        },
        take: 100,
      });

      res.json({
        success: true,
        data: modules
          .map(m => m.module)
          .filter((m): m is string => m !== null),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '获取模块列表失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/admin/logs/:id
 * 获取单条日志详情
 */
router.get(
  '/:id',
  validateParams(idParamSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.validatedParams as z.infer<typeof idParamSchema>;

      const log = await prisma.systemLog.findUnique({
        where: { id },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: '日志不存在',
        });
      }

      res.json({
        success: true,
        data: log,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '查询日志详情失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ==================== 告警规则管理路由 ====================

/**
 * GET /api/admin/log-alerts
 * 获取告警规则列表
 */
router.get('/log-alerts', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await prisma.logAlertRule.findMany({
      orderBy: [
        { enabled: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '查询告警规则失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/admin/log-alerts
 * 创建告警规则
 */
router.post(
  '/log-alerts',
  validateBody(alertRuleSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const validatedData = req.body as z.infer<typeof alertRuleSchema>;

      const rule = await prisma.logAlertRule.create({
        data: {
          name: validatedData.name,
          description: validatedData.description,
          enabled: validatedData.enabled,
          levels: validatedData.levels,
          module: validatedData.module,
          messagePattern: validatedData.messagePattern,
          threshold: validatedData.threshold,
          windowMinutes: validatedData.windowMinutes,
          webhookUrl: validatedData.webhookUrl,
          cooldownMinutes: validatedData.cooldownMinutes,
        },
      });

      res.status(201).json({
        success: true,
        data: rule,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '创建告警规则失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * PUT /api/admin/log-alerts/:id
 * 更新告警规则
 */
router.put(
  '/log-alerts/:id',
  validateParams(idParamSchema),
  validateBody(updateAlertRuleSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.validatedParams as z.infer<typeof idParamSchema>;
      const data = req.body as z.infer<typeof updateAlertRuleSchema>;

      // 检查规则是否存在
      const existing = await prisma.logAlertRule.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: '告警规则不存在',
        });
      }

      const rule = await prisma.logAlertRule.update({
        where: { id },
        data,
      });

      res.json({
        success: true,
        data: rule,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '更新告警规则失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * DELETE /api/admin/log-alerts/:id
 * 删除告警规则
 */
router.delete(
  '/log-alerts/:id',
  validateParams(idParamSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.validatedParams as z.infer<typeof idParamSchema>;

      // 检查规则是否存在
      const existing = await prisma.logAlertRule.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: '告警规则不存在',
        });
      }

      await prisma.logAlertRule.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: '告警规则删除成功',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '删除告警规则失败',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
