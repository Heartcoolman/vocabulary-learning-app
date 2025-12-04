/**
 * TimescaleDB 设置脚本
 * 将时序表转换为 hypertable 以获得更好的时间序列查询性能
 * 
 * 运行: npx tsx scripts/setup-timescaledb.ts
 * 
 * 注意：
 * - word_review_traces 和 causal_observations 可以直接转换（无外键依赖）
 * - answer_records 和 decision_records 有外键依赖，需要先修改主键
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupTimescaleDB() {
  console.log('🔧 开始设置 TimescaleDB...\n');

  try {
    // 1. 检查 TimescaleDB 扩展是否已启用
    console.log('1. 检查 TimescaleDB 扩展...');
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'timescaledb'
    `;
    
    if (extensions.length === 0) {
      console.log('   启用 TimescaleDB 扩展...');
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS timescaledb`;
      console.log('   ✅ TimescaleDB 扩展已启用');
    } else {
      console.log('   ✅ TimescaleDB 扩展已存在');
    }

    // 2. 转换无外键依赖的表
    console.log('\n2. 转换 word_review_traces 为 hypertable...');
    await convertToHypertableWithPKChange('word_review_traces', 'timestamp');

    console.log('\n3. 转换 causal_observations 为 hypertable...');
    await convertCausalObservationsToHypertable();

    // 3. 处理有外键依赖的表（需要特殊处理）
    console.log('\n4. 处理 answer_records（有外键依赖）...');
    await convertAnswerRecordsToHypertable();

    console.log('\n5. 处理 decision_records（有外键依赖）...');
    await convertDecisionRecordsToHypertable();

    // 4. 设置压缩策略
    console.log('\n6. 设置压缩策略...');
    await setupCompressionPolicies();

    console.log('\n🎉 TimescaleDB 设置完成！');
    console.log('\n性能优化说明:');
    console.log('- 时序数据自动按时间分区（7天一个 chunk）');
    console.log('- 时间范围查询性能提升 10-100x');
    console.log('- 7天后的数据自动压缩');

  } catch (error) {
    console.error('❌ 设置失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 检查表是否已经是 hypertable
 */
async function isHypertable(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count 
    FROM timescaledb_information.hypertables 
    WHERE hypertable_name = ${tableName}
  `;
  return Number(result[0]?.count) > 0;
}

/**
 * 转换无外键依赖的表（需要修改主键）
 */
async function convertToHypertableWithPKChange(tableName: string, timeColumn: string) {
  try {
    if (await isHypertable(tableName)) {
      console.log(`   ✅ ${tableName} 已经是 hypertable`);
      return;
    }

    // 1. 删除旧主键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_pkey
    `);
    
    // 2. 添加新的复合主键（包含时间列）
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ${tableName} ADD PRIMARY KEY (id, "${timeColumn}")
    `);
    
    // 3. 转换为 hypertable
    await prisma.$executeRawUnsafe(`
      SELECT create_hypertable(
        '${tableName}', 
        '${timeColumn}',
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE,
        migrate_data => TRUE
      )
    `);
    
    console.log(`   ✅ ${tableName} 已转换为 hypertable`);
  } catch (error: any) {
    if (error.message?.includes('already a hypertable')) {
      console.log(`   ✅ ${tableName} 已经是 hypertable`);
    } else {
      console.log(`   ⚠️ ${tableName} 转换失败: ${error.message}`);
    }
  }
}

/**
 * 转换 causal_observations（bigint 时间戳）
 */
async function convertCausalObservationsToHypertable() {
  try {
    if (await isHypertable('causal_observations')) {
      console.log('   ✅ causal_observations 已经是 hypertable');
      return;
    }

    // 1. 删除旧主键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE causal_observations DROP CONSTRAINT IF EXISTS causal_observations_pkey
    `);
    
    // 2. 添加新的复合主键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE causal_observations ADD PRIMARY KEY (id, "timestamp")
    `);
    
    // 3. 转换为 hypertable（bigint 用整数间隔，1周 = 604800000 毫秒）
    await prisma.$executeRawUnsafe(`
      SELECT create_hypertable(
        'causal_observations', 
        'timestamp',
        chunk_time_interval => 604800000,
        if_not_exists => TRUE,
        migrate_data => TRUE
      )
    `);
    
    console.log('   ✅ causal_observations 已转换为 hypertable');
  } catch (error: any) {
    if (error.message?.includes('already a hypertable')) {
      console.log('   ✅ causal_observations 已经是 hypertable');
    } else {
      console.log(`   ⚠️ causal_observations 转换失败: ${error.message}`);
    }
  }
}

/**
 * 转换 answer_records（有外键依赖）
 */
async function convertAnswerRecordsToHypertable() {
  try {
    if (await isHypertable('answer_records')) {
      console.log('   ✅ answer_records 已经是 hypertable');
      return;
    }

    // 1. 删除依赖的外键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE decision_records 
      DROP CONSTRAINT IF EXISTS decision_records_answerRecordId_fkey
    `);

    // 2. 删除旧主键（CASCADE 删除依赖）
    await prisma.$executeRawUnsafe(`
      ALTER TABLE answer_records DROP CONSTRAINT IF EXISTS answer_records_pkey CASCADE
    `);

    // 3. 添加新的复合主键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE answer_records ADD PRIMARY KEY (id, "timestamp")
    `);

    // 4. 转换为 hypertable
    await prisma.$executeRawUnsafe(`
      SELECT create_hypertable(
        'answer_records', 
        'timestamp',
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE,
        migrate_data => TRUE
      )
    `);

    // 5. 不重建外键（hypertable 不支持被外键引用）
    // decision_records.answerRecordId 将成为逻辑引用，应用层保证完整性
    console.log('   ✅ answer_records 已转换为 hypertable');
    console.log('   ⚠️  注意: decision_records.answerRecordId 外键已移除');
  } catch (error: any) {
    console.log(`   ⚠️ answer_records 转换失败: ${error.message}`);
  }
}

/**
 * 转换 decision_records（有外键依赖）
 */
async function convertDecisionRecordsToHypertable() {
  try {
    if (await isHypertable('decision_records')) {
      console.log('   ✅ decision_records 已经是 hypertable');
      return;
    }

    // 1. 删除依赖的外键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE pipeline_stages 
      DROP CONSTRAINT IF EXISTS pipeline_stages_decisionRecordId_fkey
    `);

    // 2. 删除旧主键（CASCADE 删除依赖）
    await prisma.$executeRawUnsafe(`
      ALTER TABLE decision_records DROP CONSTRAINT IF EXISTS decision_records_pkey CASCADE
    `);

    // 3. 删除 decisionId 唯一约束（TimescaleDB 要求唯一索引包含分区列）
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "decision_records_decisionId_key"
    `);

    // 4. 添加新的复合主键
    await prisma.$executeRawUnsafe(`
      ALTER TABLE decision_records ADD PRIMARY KEY (id, "timestamp")
    `);

    // 5. 添加包含 timestamp 的新唯一约束
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "decision_records_decisionId_timestamp_key" 
      ON decision_records ("decisionId", "timestamp")
    `);

    // 6. 转换为 hypertable
    await prisma.$executeRawUnsafe(`
      SELECT create_hypertable(
        'decision_records', 
        'timestamp',
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE,
        migrate_data => TRUE
      )
    `);

    console.log('   ✅ decision_records 已转换为 hypertable');
    console.log('   ⚠️  注意: pipeline_stages.decisionRecordId 外键已移除');
    console.log('   ⚠️  注意: decisionId 唯一约束已改为 (decisionId, timestamp)');
  } catch (error: any) {
    console.log(`   ⚠️ decision_records 转换失败: ${error.message}`);
  }
}

/**
 * 设置压缩策略
 */
async function setupCompressionPolicies() {
  const tables = [
    { name: 'answer_records', segmentBy: 'userId' },
    { name: 'decision_records', segmentBy: 'decisionSource' },
    { name: 'word_review_traces', segmentBy: 'userId' },
  ];

  for (const { name, segmentBy } of tables) {
    try {
      if (!(await isHypertable(name))) continue;

      // 启用压缩（列名需要用双引号）
      await prisma.$executeRawUnsafe(`
        ALTER TABLE ${name} SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = '"${segmentBy}"'
        )
      `);

      // 添加压缩策略（7天后压缩）
      await prisma.$executeRawUnsafe(`
        SELECT add_compression_policy('${name}', INTERVAL '7 days', if_not_exists => TRUE)
      `);

      console.log(`   ✅ ${name} 压缩策略已设置`);
    } catch (error: any) {
      console.log(`   ⚠️ ${name} 压缩策略设置失败: ${error.message}`);
    }
  }
}

// 运行脚本
setupTimescaleDB().catch(console.error);
