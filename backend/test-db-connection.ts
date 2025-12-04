import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.$connect()
  .then(() => {
    console.log('✓ 数据库连接成功');
    return prisma.$disconnect();
  })
  .catch(err => {
    console.error('✗ 数据库连接失败:', err.message);
    process.exit(1);
  });
