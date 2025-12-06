/**
 * 特征向量检查脚本
 * 验证AMAS扩展版特征向量是否正确保存（22维）
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFeatureVectors() {
  console.log('\n========================================');
  console.log('🔍 AMAS扩展版特征向量检查');
  console.log('========================================\n');

  try {
    // 1. 检查特征向量表总数
    const totalCount = await prisma.featureVector.count();
    console.log(`📊 特征向量总数: ${totalCount}`);

    if (totalCount === 0) {
      console.log('⚠️  警告: 暂无特征向量数据，请先进行学习活动生成数据');
      return;
    }

    // 2. 按版本统计
    const v1Count = await prisma.featureVector.count({
      where: { featureVersion: 1 }
    });
    const v2Count = await prisma.featureVector.count({
      where: { featureVersion: 2 }
    });

    console.log(`\n📈 版本分布:`);
    console.log(`   - v1 (MVP版, 12维): ${v1Count} 条 ${v1Count > 0 ? '✅' : '❌'}`);
    console.log(`   - v2 (扩展版, 22维): ${v2Count} 条 ${v2Count > 0 ? '✅' : '⚠️'}`);

    // 3. 检查最新的10条特征向量
    const latestVectors = await prisma.featureVector.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        sessionId: true,
        featureVersion: true,
        features: true,
        normMethod: true,
        createdAt: true
      }
    });

    console.log(`\n🔎 最新的 ${latestVectors.length} 条特征向量:\n`);

    latestVectors.forEach((vec, idx) => {
      let dimension = 0;
      let format = '未知';
      let valuesPreview = '无法解析';

      try {
        const features = vec.features;

        // 检测格式：对象 {values, labels, ts} 或 数组
        if (Array.isArray(features)) {
          // 旧格式：直接数组
          dimension = features.length;
          format = '数组格式';
          valuesPreview = features.slice(0, 3).map(v => v.toFixed(3)).join(', ') + '...';
        } else if (features && typeof features === 'object' && 'values' in features) {
          // 新格式：对象
          dimension = Array.isArray(features.values) ? features.values.length : 0;
          format = '对象格式 {values, labels, ts}';
          if (Array.isArray(features.values)) {
            valuesPreview = features.values.slice(0, 3).map(v => v.toFixed(3)).join(', ') + '...';
          }
        }
      } catch (err) {
        console.error(`   解析特征向量失败: ${err.message}`);
      }

      const statusIcon = dimension === 22 ? '✅' : (dimension === 12 ? '⚠️' : '❌');
      console.log(`${idx + 1}. ${statusIcon} sessionId: ${vec.sessionId.slice(0, 8)}...`);
      console.log(`   版本: v${vec.featureVersion} | 维度: ${dimension} | 格式: ${format}`);
      console.log(`   数据预览: [${valuesPreview}]`);
      console.log(`   创建时间: ${vec.createdAt.toISOString()}`);
      console.log('');
    });

    // 4. 维度分布统计
    console.log('📊 维度分布统计:');
    const dimensionStats = {};

    for (const vec of latestVectors) {
      let dim = 0;
      try {
        const features = vec.features;
        if (Array.isArray(features)) {
          dim = features.length;
        } else if (features && typeof features === 'object' && 'values' in features && Array.isArray(features.values)) {
          dim = features.values.length;
        }
      } catch (err) {
        dim = 0;
      }
      dimensionStats[dim] = (dimensionStats[dim] || 0) + 1;
    }

    for (const [dim, count] of Object.entries(dimensionStats)) {
      const icon = dim === '22' ? '✅' : (dim === '12' ? '⚠️' : '❌');
      console.log(`   ${icon} ${dim}维: ${count} 条`);
    }

    // 5. 关联学习会话检查
    const sessionsCount = await prisma.learningSession.count();
    console.log(`\n📝 学习会话总数: ${sessionsCount}`);

    if (sessionsCount > 0) {
      const latestSession = await prisma.learningSession.findFirst({
        orderBy: { startedAt: 'desc' },
        include: {
          featureVectors: true
        }
      });

      if (latestSession) {
        console.log(`\n🎯 最新学习会话:`);
        console.log(`   ID: ${latestSession.id}`);
        console.log(`   用户: ${latestSession.userId}`);
        console.log(`   开始: ${latestSession.startedAt.toISOString()}`);
        console.log(`   结束: ${latestSession.endedAt ? latestSession.endedAt.toISOString() : '进行中'}`);
        console.log(`   关联特征向量: ${latestSession.featureVectors.length > 0 ? '✅ 是' : '❌ 否'}`);
      }
    }

    // 6. 结论
    console.log('\n========================================');
    console.log('📋 检查结论:');
    console.log('========================================\n');

    if (v2Count > 0) {
      console.log('✅ AMAS扩展版（22维）特征向量已成功保存');
      console.log(`   最近有 ${latestVectors.filter(v => {
        try {
          const features = v.features;
          const dim = Array.isArray(features)
            ? features.length
            : (features?.values?.length || 0);
          return dim === 22;
        } catch {
          return false;
        }
      }).length}/${latestVectors.length} 条记录使用22维特征`);
    } else if (v1Count > 0) {
      console.log('⚠️  当前仅有MVP版（12维）特征向量');
      console.log('   扩展版代码已部署，但尚未生成22维数据');
      console.log('   建议: 进行新的学习活动以生成扩展版数据');
    } else {
      console.log('❌ 无特征向量数据');
      console.log('   建议: 检查后端服务是否正常运行');
    }

  } catch (error) {
    console.error('\n❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行检查
checkFeatureVectors()
  .then(() => {
    console.log('\n✅ 检查完成\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 检查异常:', error);
    process.exit(1);
  });
