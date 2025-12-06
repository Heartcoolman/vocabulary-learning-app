/**
 * 检查后端代码版本
 * 通过文件修改时间判断服务是否使用最新代码
 */

const fs = require('fs');
const path = require('path');

console.log('\n========================================');
console.log('🔍 后端代码版本检查');
console.log('========================================\n');

// 关键文件列表（我们刚修改过的）
const keyFiles = [
  'src/services/amas.service.ts',
  'src/routes/amas.routes.ts',
  'src/amas/engine.ts'
];

console.log('最近修改的关键文件:\n');

keyFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  try {
    const stats = fs.statSync(filePath);
    const modTime = stats.mtime;
    const now = new Date();
    const ageMinutes = Math.floor((now - modTime) / 1000 / 60);

    console.log(`📄 ${file}`);
    console.log(`   修改时间: ${modTime.toLocaleString('zh-CN')}`);
    console.log(`   距今: ${ageMinutes}分钟前\n`);
  } catch (err) {
    console.log(`❌ ${file} - 文件不存在\n`);
  }
});

console.log('========================================');
console.log('🔧 如何正确重启后端服务:');
console.log('========================================\n');

console.log('方法1: 在运行服务的终端中');
console.log('  1. 按 Ctrl+C (会看到 "^C" 符号)');
console.log('  2. 等待进程完全停止');
console.log('  3. 运行: npm run dev');
console.log('  4. 看到 "Server running" 后才算启动完成\n');

console.log('方法2: 强制重启（如果找不到终端）');
console.log('  1. 运行: taskkill /F /IM node.exe');
console.log('  2. 打开新终端');
console.log('  3. cd backend');
console.log('  4. npm run dev\n');

console.log('方法3: 查找并杀死特定进程');
console.log('  1. 运行: netstat -ano | findstr :3000');
console.log('  2. 找到PID（最后一列数字）');
console.log('  3. 运行: taskkill /F /PID <PID号>');
console.log('  4. npm run dev\n');

console.log('========================================');
console.log('✅ 重启完成后的验证步骤:');
console.log('========================================\n');

console.log('1. 确认看到启动日志:');
console.log('   Database connected successfully');
console.log('   Delayed reward worker started');
console.log('   Server running on http://localhost:3000\n');

console.log('2. 学习1个单词\n');

console.log('3. 查看后端终端，应该看到新的日志:');
console.log('   [AMAS] processLearningEvent: sessionId=...');
console.log('   [AMAS] 准备保存特征向量: version=2, dimension=22');
console.log('   [AMAS] FeatureVector持久化成功: sessionId=...\n');

console.log('4. 运行验证:');
console.log('   node check-feature-vectors.js\n');

console.log('========================================\n');
