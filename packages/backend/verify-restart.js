/**
 * 验证后端服务是否使用了最新代码
 * 通过检查API响应中是否包含sessionId字段
 */

const http = require('http');

// 模拟一个学习事件请求（需要真实的token）
console.log('\n验证方法：');
console.log('1. 重启后端服务后');
console.log('2. 在前端学习1个单词');
console.log('3. 打开浏览器开发者工具 -> Network');
console.log('4. 找到 /api/amas/process 请求');
console.log('5. 查看响应JSON中是否有 sessionId 字段\n');
console.log('如果有 sessionId 字段 → ✅ 新代码已生效');
console.log('如果没有 sessionId 字段 → ❌ 仍是旧代码\n');
