/**
 * Session 迁移脚本
 * 用于清理旧的明文 Token Session，使其失效
 * 
 * 运行方式: npx tsx prisma/migrate-sessions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateSessions() {
  console.log('开始 Session 迁移...');

  try {
    // 统计当前 Session 数量
    const totalSessions = await prisma.session.count();
    console.log(`当前共有 ${totalSessions} 个 Session`);

    if (totalSessions === 0) {
      console.log('没有需要迁移的 Session');
      return;
    }

    // 方案1: 删除所有旧 Session（推荐，强制用户重新登录）
    const deleted = await prisma.session.deleteMany({});
    console.log(`已删除 ${deleted.count} 个旧 Session`);
    console.log('所有用户需要重新登录');

    // 方案2: 标记旧 Session 为过期（如果需要保留记录）
    // const updated = await prisma.session.updateMany({
    //   data: {
    //     expiresAt: new Date(0), // 设置为1970年，强制过期
    //   },
    // });
    // console.log(`已将 ${updated.count} 个旧 Session 标记为过期`);

    console.log('Session 迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
migrateSessions()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
