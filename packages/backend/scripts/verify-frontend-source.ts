import { createChildLogger } from '../src/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Writing test frontend log...');

  const frontendLogger = createChildLogger({ source: 'frontend' });
  const testMessage = `TEST_FRONTEND_LOG_${Date.now()}`;

  // Log a frontend mock log
  frontendLogger.info(
    {
      clientIp: '127.0.0.1',
      userAgent: 'TestScript',
    },
    testMessage,
  );

  console.log('Waiting for log to be written (5s)...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('Checking database...');
  const log = await prisma.systemLog.findFirst({
    where: {
      message: testMessage,
    },
  });

  if (!log) {
    console.error('FAILED: Test log not found in database.');
    process.exit(1);
  }

  console.log('Found log entry:', JSON.stringify(log, null, 2));

  if (log.source === 'FRONTEND') {
    console.log('SUCCESS: Log source is correctly recorded as FRONTEND.');
  } else {
    console.error(`FAILED: Log source is ${log.source}, expected FRONTEND.`);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
