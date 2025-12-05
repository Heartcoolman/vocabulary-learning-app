/**
 * 习惯画像路由
 * 提供用户学习习惯画像的API
 *
 * 修复问题: HabitProfile 表只读不写
 * - 新增会话结束端点，触发习惯画像持久化
 * - 新增习惯画像查询端点
 * - 新增从历史记录初始化端点
 *
 * 独立页面: src/pages/HabitProfilePage.tsx
 * 路由配置: App.tsx -> /habit-profile
 * API方法: ApiClient.ts -> getHabitProfile, initializeHabitProfile, persistHabitProfile 等
 */

import { Router } from 'express';
import { habitProfileService } from '../services/habit-profile.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import prisma from '../config/database';

const router = Router();

/**
 * POST /api/habit-profile/end-session
 * 结束学习会话并持久化习惯画像
 * 
 * Body:
 * - sessionId: 学习会话ID
 * 
 * 返回:
 * - sessionEnded: 会话是否成功结束
 * - durationMinutes: 会话时长（分钟）
 * - wordCount: 本次学习的单词数
 * - habitProfileSaved: 习惯画像是否已保存
 * - preferredTimeSlots: 当前偏好时间段
 */
router.post('/end-session', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    // 获取会话信息
    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: {
          select: { answerRecords: true }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Session belongs to another user'
      });
    }

    // 计算会话时长
    const endTime = new Date();
    const durationMinutes = (endTime.getTime() - session.startedAt.getTime()) / 60000;

    // 更新会话结束时间
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: { endedAt: endTime }
    });

    // 记录会话结束事件
    habitProfileService.recordSessionEnd(
      userId,
      durationMinutes,
      session._count.answerRecords
    );

    // 获取当前习惯画像（用于检查样本数）
    const profile = habitProfileService.getHabitProfile(userId);

    // 持久化习惯画像
    const saved = await habitProfileService.persistHabitProfile(userId);

    // 生成保存状态消息，区分"样本不足"和"保存失败"
    let habitProfileMessage: string | undefined;
    if (!saved) {
      if (profile.samples.timeEvents < 10) {
        habitProfileMessage = `样本不足（当前${profile.samples.timeEvents}/10），继续学习后将自动保存`;
      } else {
        habitProfileMessage = '习惯画像保存失败，请稍后重试';
      }
    }

    res.json({
      success: true,
      data: {
        sessionEnded: true,
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        wordCount: session._count.answerRecords,
        habitProfileSaved: saved,
        habitProfileMessage,
        preferredTimeSlots: profile.preferredTimeSlots
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/habit-profile
 * 获取用户当前习惯画像
 * 
 * 返回:
 * - stored: 数据库中存储的习惯画像
 * - realtime: 内存中实时计算的习惯画像
 */
router.get('/', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 先尝试从数据库获取
    const stored = await prisma.habitProfile.findUnique({
      where: { userId }
    });

    // 获取内存中的实时画像
    const realtime = habitProfileService.getHabitProfile(userId);

    res.json({
      success: true,
      data: {
        stored: stored ? {
          timePref: stored.timePref,
          rhythmPref: stored.rhythmPref,
          updatedAt: stored.updatedAt
        } : null,
        realtime: {
          timePref: realtime.timePref,
          preferredTimeSlots: realtime.preferredTimeSlots,
          rhythmPref: realtime.rhythmPref,
          samples: realtime.samples
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/habit-profile/initialize
 * 从历史记录初始化习惯画像
 * 用于数据恢复或首次生成习惯画像
 * 
 * 返回:
 * - profile: 初始化后的习惯画像
 */
router.post('/initialize', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 先重置，确保从干净状态开始
    habitProfileService.resetUser(userId);

    // 从历史记录初始化
    await habitProfileService.initializeFromHistory(userId);

    // 持久化到数据库
    const saved = await habitProfileService.persistHabitProfile(userId);

    // 获取初始化后的画像
    const profile = habitProfileService.getHabitProfile(userId);

    res.json({
      success: true,
      data: {
        initialized: true,
        saved,
        profile: {
          preferredTimeSlots: profile.preferredTimeSlots,
          rhythmPref: profile.rhythmPref,
          samples: profile.samples
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/habit-profile/persist
 * 手动触发习惯画像持久化
 * 
 * 返回:
 * - saved: 是否成功保存
 * - profile: 当前习惯画像
 */
router.post('/persist', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // 持久化到数据库
    const saved = await habitProfileService.persistHabitProfile(userId);

    // 获取当前画像
    const profile = habitProfileService.getHabitProfile(userId);

    res.json({
      success: true,
      data: {
        saved,
        profile: {
          preferredTimeSlots: profile.preferredTimeSlots,
          rhythmPref: profile.rhythmPref,
          samples: profile.samples
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
