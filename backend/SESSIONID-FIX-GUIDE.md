# SessionID修复指南

## 🐛 问题说明

**问题**: 特征向量无法保存，因为API缺少sessionId参数传递

**影响**: 无论学习多少个单词，都不会生成特征向量数据

**原因**: 前端不发送sessionId → 后端不接收sessionId → 特征向量保存逻辑被跳过

---

## ✅ 已完成的修复

### 修改文件清单

1. **`src/types/amas.ts`**
   - ✅ LearningEventInput接口添加`sessionId?: string`字段
   - ✅ AmasProcessResult接口添加`sessionId: string`字段

2. **`backend/src/routes/amas.routes.ts`**
   - ✅ 导入`randomUUID`
   - ✅ 从请求body中提取sessionId
   - ✅ 优先使用前端传入的sessionId，否则后端生成
   - ✅ 调用service时传递sessionId
   - ✅ 响应中返回sessionId供前端复用

### 编译验证

- ✅ 后端TypeScript编译通过
- ✅ 前端TypeScript编译通过

---

## 🎯 现在需要学习几个单词？

### 回答：**1个单词即可生成22维特征向量**

修复后的逻辑：
1. 前端调用API（可选：传递sessionId）
2. 后端接收或自动生成sessionId
3. **每次学习事件都会保存特征向量**
4. 后端返回sessionId供前端复用

---

## 🧪 测试验证步骤

### 步骤1: 重启后端服务

```bash
cd backend

# 如果服务正在运行，先停止（Ctrl+C）
# 然后重新启动
npm run dev
```

**期望看到**:
```
Database connected successfully
Delayed reward worker started
Server running on http://localhost:3000
```

---

### 步骤2: 在前端学习1个单词

1. 打开前端应用
2. 进入学习页面
3. 完成**1个单词**的学习（答对或答错都可以）

---

### 步骤3: 检查特征向量

```bash
cd backend
node check-feature-vectors.js
```

**期望看到**:
```
========================================
🔍 AMAS扩展版特征向量检查
========================================

📊 特征向量总数: 1

📈 版本分布:
   - v1 (MVP版, 12维): 0 条 ❌
   - v2 (扩展版, 22维): 1 条 ✅

🔎 最新的 1 条特征向量:

1. ✅ sessionId: abc12345...
   版本: v2 | 维度: 22 | 格式: 对象格式 {values, labels, ts}
   数据预览: [0.750, 0.150, 0.100...]
   创建时间: 2025-11-24T...

========================================
📋 检查结论:
========================================

✅ AMAS扩展版（22维）特征向量已成功保存
```

---

### 步骤4: 验证sessionId复用机制

#### 场景A: 前端不传sessionId（向后兼容）

**行为**: 后端每次自动生成新的sessionId

**结果**:
- ✅ 每个单词生成1条特征向量记录
- ⚠️ 无法关联同一学习会话的多个单词

**适用场景**: 旧版前端、快速测试

#### 场景B: 前端传递并复用sessionId（推荐）

**实现方式** (前端需要修改):
```typescript
// LearningPage.tsx 或类似组件

// 1. 在学习会话开始时生成sessionId
const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
  return crypto.randomUUID();  // 生成一次
});

// 2. 学习每个单词时传递同一个sessionId
const handleAnswer = async (wordId: string, isCorrect: boolean) => {
  const result = await ApiClient.processLearningEvent({
    wordId,
    isCorrect,
    responseTime: Date.now() - startTime,
    sessionId: currentSessionId  // 复用sessionId
  });

  // 3. 如果需要，可以更新sessionId（从后端返回）
  // setCurrentSessionId(result.sessionId);
};

// 4. 学习会话结束时，重新生成sessionId
const handleSessionEnd = () => {
  setCurrentSessionId(crypto.randomUUID());  // 为下次会话生成新ID
};
```

**结果**:
- ✅ 同一学习会话的N个单词使用相同sessionId
- ✅ 便于延迟奖励回溯（可以找到该会话的特征向量）
- ✅ 符合扩展版设计意图

---

## 📊 查看数据库中的特征向量

### 方法1: 使用检查脚本（推荐）

```bash
cd backend
node check-feature-vectors.js
```

### 方法2: 直接查询数据库

```bash
cd backend
npx prisma studio
```

然后在浏览器中：
1. 访问 http://localhost:5555
2. 点击 `FeatureVector` 表
3. 查看记录，确认：
   - `featureVersion` = 2
   - `features.values` 长度 = 22

### 方法3: SQL查询

```bash
cd backend
npx prisma db execute --stdin <<< "
SELECT
  sessionId,
  featureVersion,
  jsonb_array_length(features->'values') as dimension,
  createdAt
FROM feature_vectors
ORDER BY createdAt DESC
LIMIT 5;
"
```

**期望输出**:
```
sessionId              | featureVersion | dimension | createdAt
-----------------------|----------------|-----------|---------------------------
abc123...              | 2              | 22        | 2025-11-24 12:30:00
```

---

## 🔍 问题排查

### 问题1: 学习后仍无特征向量数据

**检查步骤**:
```bash
# 1. 确认后端服务已重启
ps aux | grep "tsx.*src/index.ts"

# 2. 查看后端日志
# 应该看到类似日志：
#   [AMAS] FeatureVector持久化成功: sessionId=xxx

# 3. 确认没有错误日志
# 如果看到：
#   [AMAS] FeatureVector持久化失败: sessionId=xxx
# 说明数据库写入失败，检查数据库连接
```

### 问题2: 特征向量维度仍为12

**原因**: 旧版本代码缓存或数据

**解决方法**:
```bash
# 1. 完全重启后端
cd backend
# Ctrl+C 停止服务
rm -rf node_modules/.cache  # 清除缓存
npm run dev

# 2. 重置用户AMAS状态（可选）
# 在前端调用reset API，或直接删除数据库中该用户的旧状态
```

### 问题3: 前端报类型错误

**错误信息**: `Property 'sessionId' does not exist on type 'AmasProcessResult'`

**原因**: TypeScript缓存未更新

**解决方法**:
```bash
# 重启前端开发服务器
# Ctrl+C 停止
npm run dev
```

---

## 📈 预期效果

### 修复前
- 📊 特征向量总数: **0**
- ❌ 无论学习多少个单词都不会保存

### 修复后
- 📊 特征向量总数: **N**（N = 学习的单词数）
- ✅ 每学习1个单词生成1条22维特征向量记录
- ✅ sessionId可以关联同一学习会话的多个单词
- ✅ 支持延迟奖励功能回溯

---

## 🎓 sessionId最佳实践

### 推荐做法（前端需要实现）

**1. 会话生命周期管理**
```typescript
// 会话开始：用户进入学习页面
onMount(() => {
  sessionId = crypto.randomUUID();
});

// 会话进行：学习多个单词
for (const word of words) {
  await processLearningEvent({ ...event, sessionId });  // 复用同一个sessionId
}

// 会话结束：用户退出学习页面或完成学习
onUnmount(() => {
  sessionId = null;  // 清除，下次进入时重新生成
});
```

**2. 会话ID持久化（可选）**
```typescript
// 保存到localStorage，防止页面刷新丢失
localStorage.setItem('currentAmasSessionId', sessionId);

// 页面加载时恢复
const savedSessionId = localStorage.getItem('currentAmasSessionId');
if (savedSessionId) {
  sessionId = savedSessionId;
}
```

**3. 会话过期策略（可选）**
```typescript
// 超过1小时自动失效
const SESSION_TIMEOUT = 60 * 60 * 1000;  // 1小时

if (Date.now() - sessionStartTime > SESSION_TIMEOUT) {
  sessionId = crypto.randomUUID();  // 生成新会话
}
```

---

## ✅ 验收标准

修复成功的标志：

1. ✅ 学习**1个单词**后，运行 `node check-feature-vectors.js`
2. ✅ 看到 `✅ 扩展版（22维）特征向量已生效`
3. ✅ 后端日志显示 `FeatureVector持久化成功`
4. ✅ 数据库中有记录，featureVersion=2, dimension=22

---

## 📚 相关文档

- [AMAS扩展版检查指南](./CHECK-AMAS-EXTENDED.md)
- [AMAS扩展版完成报告](../docs/AMAS-EXTENDED-VERSION-COMPLETION.md)

---

**最后更新**: 2025-11-24
**修复版本**: v2.1
