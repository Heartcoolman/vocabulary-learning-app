/**
 * 测试AMAS API是否正常工作
 * 模拟前端调用来验证后端功能
 */

const http = require('http');

// 从环境变量或配置读取
const API_HOST = 'localhost';
const API_PORT = 3000;

// 需要一个真实的JWT token
// 这个token可以从浏览器的localStorage或cookie中获取
const TEST_TOKEN = process.argv[2];

if (!TEST_TOKEN) {
  console.log('\n使用方法:');
  console.log('node test-amas-api.js <JWT_TOKEN>\n');
  console.log('JWT Token获取方法:');
  console.log('1. 打开浏览器开发者工具（F12）');
  console.log('2. 切换到Console标签');
  console.log('3. 输入: localStorage.getItem("token")');
  console.log('4. 复制输出的token（不包括引号）');
  console.log('5. 运行: node test-amas-api.js <复制的token>\n');
  process.exit(1);
}

async function testAmasAPI() {
  console.log('\n========================================');
  console.log('🧪 测试AMAS API');
  console.log('========================================\n');

  const data = JSON.stringify({
    wordId: 'test-word-' + Date.now(),
    isCorrect: true,
    responseTime: 3000,
    dwellTime: 1500
  });

  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: '/api/amas/process',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Authorization': `Bearer ${TEST_TOKEN}`
    }
  };

  return new Promise((resolve, reject) => {
    console.log('发送测试请求...');
    console.log(`POST http://${API_HOST}:${API_PORT}/api/amas/process`);
    console.log('数据:', JSON.parse(data));
    console.log('');

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        console.log(`状态码: ${res.statusCode}`);
        console.log('');

        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(body);
            console.log('✅ API调用成功！\n');
            console.log('响应数据:');
            console.log(JSON.stringify(result, null, 2));

            // 检查关键字段
            if (result.data && result.data.sessionId) {
              console.log('\n✅ sessionId存在:', result.data.sessionId);
            } else {
              console.log('\n⚠️  响应中没有sessionId字段');
            }

            if (result.data && result.data.strategy) {
              console.log('✅ strategy存在');
            }

            if (result.data && result.data.state) {
              console.log('✅ state存在');
            }

            resolve(result);
          } catch (err) {
            console.error('❌ 解析响应失败:', err.message);
            console.log('原始响应:', body);
            reject(err);
          }
        } else {
          console.error('❌ API调用失败');
          console.log('响应:', body);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ 请求错误:', err.message);
      console.log('\n可能的原因:');
      console.log('1. 后端服务未启动');
      console.log('2. 端口号不正确');
      console.log('3. 网络问题');
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// 运行测试
testAmasAPI()
  .then(() => {
    console.log('\n========================================');
    console.log('✅ 测试完成');
    console.log('========================================\n');
    console.log('现在运行: node check-feature-vectors.js');
    console.log('查看特征向量是否已保存\n');
    process.exit(0);
  })
  .catch((err) => {
    console.log('\n========================================');
    console.log('❌ 测试失败');
    console.log('========================================\n');
    process.exit(1);
  });
