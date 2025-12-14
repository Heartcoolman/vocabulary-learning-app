import { Router } from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import sessionsRoutes from './sessions.routes';
import wordsRoutes from './words.routes';
import learningRoutes from './learning.routes';
import realtimeRoutes from './realtime.routes';

const router = Router();

/**
 * v1 API 路由入口
 *
 * 版本化 API 的优势：
 * 1. 向后兼容性：允许在不破坏现有客户端的情况下演进 API
 * 2. 渐进式迁移：新功能可在新版本中实现，旧版本继续服务
 * 3. 明确的废弃策略：可以为不同版本设置不同的生命周期
 *
 * 路由结构：
 * - /auth        认证（登录、注册、登出、验证）
 * - /users       用户管理（个人信息、统计、学习模式）
 * - /sessions    学习会话管理
 * - /words       单词管理（查询、创建、更新、删除）
 * - /learning    学习功能（获取学习单词、提交记录、动态推荐）
 * - /realtime    实时通信（SSE）
 */

// 注册 v1 路由
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/words', wordsRoutes);
router.use('/learning', learningRoutes);
router.use('/realtime', realtimeRoutes);

export default router;
