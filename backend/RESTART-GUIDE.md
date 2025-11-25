# 后端服务重启指南

## 🚨 当前问题

AMAS API被正确调用，但特征向量没有保存，说明**后端服务没有使用最新代码**。

---

## ✅ 完整重启步骤（请严格按照以下步骤操作）

### 步骤1: 停止所有Node进程

**方法A: 强制停止所有Node（推荐）**
```bash
taskkill /F /IM node.exe
```
**说明**: 这会停止所有Node进程，确保旧代码被清理

**方法B: 停止特定进程**
```bash
# 1. 查找占用3000端口的进程
netstat -ano | findstr ":3000"
# 会显示类似：TCP  0.0.0.0:3000  ...  LISTENING  6808
#                                                    ↑ 这是PID

# 2. 停止该进程（替换6808为实际PID）
taskkill /F /PID 6808
```

---

### 步骤2: 验证进程已停止

```bash
netstat -ano | findstr ":3000"
```
**期望结果**: 无输出（说明端口已释放）

如果仍有输出，重复步骤1

---

### 步骤3: 清除缓存（可选但推荐）

```bash
cd backend

# 删除Node模块缓存
rm -rf node_modules/.cache

# 如果使用了build，也删除dist目录
rm -rf dist
```

---

### 步骤4: 重新启动服务

```bash
cd backend
npm run dev
```

**必须看到以下3行日志才算启动成功**:
```
✓ Database connected successfully
✓ Delayed reward worker started
✓ Server running on http://localhost:3000
```

如果没有看到这些日志，服务没有正确启动！

---

### 步骤5: 验证新代码已加载

学习1个单词后，**立即查看后端终端**，应该看到：

```
[AMAS] processLearningEvent: sessionId=abc-123..., hasFeatureVector=true
[AMAS] 准备保存特征向量: version=2, dimension=22
[AMAS] FeatureVector持久化成功: sessionId=abc-123...
```

**如果看到这些日志** → ✅ 新代码已生效
**如果没有看到** → ❌ 还是旧代码，继续往下看

---

## 🔧 如果步骤5没有看到日志

### 问题A: 根本没有日志输出

**可能原因**: 前端没有调用AMAS API

**解决方法**:
1. 打开浏览器开发者工具（F12）
2. 切换到Network标签
3. 学习1个单词
4. 查找 `/api/amas/process` 请求
   - 如果没有这个请求 → 前端代码有问题
   - 如果有这个请求但返回错误 → 查看错误信息

---

### 问题B: 有日志但不是预期的格式

**可能原因**: 旧代码的日志

**解决方法**:
1. 再次执行步骤1-4（确保完全重启）
2. 检查是否有多个Node进程在运行:
   ```bash
   tasklist | findstr "node.exe"
   ```
3. 杀掉所有Node进程后重启

---

## 🎯 最终验证

完成所有步骤后，运行：

```bash
cd backend
node check-feature-vectors.js
```

**成功的输出**:
```
✅ AMAS扩展版（22维）特征向量已生效
   - v2 (扩展版, 22维): 1 条 ✅

1. ✅ sessionId: abc12345...
   版本: v2 | 维度: 22
```

**失败的输出**:
```
⚠️ 暂无特征向量数据
```

---

## 💡 常见错误

### 错误1: "我已经Ctrl+C了但还是不行"

**原因**: Ctrl+C只停止前台进程，可能还有后台进程在运行

**解决**: 使用 `taskkill /F /IM node.exe` 强制停止所有Node

---

### 错误2: "我重启了但端口被占用"

**提示**: `Error: listen EADDRINUSE: address already in use :::3000`

**原因**: 旧进程没有完全停止

**解决**:
```bash
# 查找占用端口的进程
netstat -ano | findstr ":3000"

# 强制停止该进程
taskkill /F /PID <PID号>
```

---

### 错误3: "看不到后端终端的输出"

**原因**: 可能使用了后台运行方式（pm2、forever等）

**解决**:
```bash
# 如果使用pm2
pm2 stop all
pm2 delete all
pm2 flush  # 清除日志

# 然后手动启动
cd backend
npm run dev
```

---

## 📞 需要帮助？

如果按照以上步骤操作后仍然不行，请提供：

1. 步骤4的完整启动日志（前10行）
2. 步骤5学习1个单词后，后端终端的所有输出
3. 运行以下命令的输出:
   ```bash
   netstat -ano | findstr ":3000"
   tasklist | findstr "node.exe"
   cd backend && node quick-check.js
   ```

---

**最后更新**: 2025-11-24 21:46
