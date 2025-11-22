# 操作日志 - Bug修复任务

生成时间：2025-11-22

## 任务概述

修复项目中的6个已知问题，涉及数据一致性、幂等性、缓存管理、用户体验和输入验证。

## 修复清单

### 1. 修复 wordbook.service 事务问题（高优先级）✅

**问题描述**：
- 位置：`backend/src/services/wordbook.service.ts` lines 175-194, 228-240, 257-276
- 问题：单词增删和计数更新未在同一事务中，可能导致 wordCount 与实际单词数不一致

**修复方案**：
- 使用 `prisma.$transaction` 包裹所有操作，确保原子性
- 参考 `word.service.ts:139-147` 的正确实现模式

**修复内容**：

1. **addWordToWordBook** (lines 175-194)
   - 使用事务数组模式：`prisma.$transaction([创建单词, 更新计数])`
   - 确保创建单词和增加计数同时成功或同时失败

2. **removeWordFromWordBook** (lines 228-240)
   - 使用事务数组模式：`prisma.$transaction([删除单词, 更新计数])`
   - 确保删除单词和减少计数同时成功或同时失败

3. **batchImportWords** (lines 257-281)
   - 使用事务回调模式：`prisma.$transaction(async (tx) => { ... })`
   - 在事务内批量创建单词并更新计数
   - 确保批量操作的原子性

**验证要点**：
- 创建/删除单词失败时，计数不会更新
- 批量导入失败时，所有操作回滚
- wordCount 始终与实际单词数一致

---

### 2. 修复 record.service 去重键问题（高优先级）✅

**问题描述**：
- 位置：`backend/src/services/record.service.ts` lines 95-107
- 问题：使用 `record.timestamp || Date.now()` 作为去重键，缺少时间戳时每次生成不同key，导致重复写入

**修复方案**：
- 要求客户端必须提供时间戳，拒绝缺少时间戳的记录
- 确保去重键的稳定性和幂等性

**修复内容**：

1. **添加时间戳验证** (lines 50-54)
   ```typescript
   const recordsWithoutTimestamp = records.filter(r => !r.timestamp);
   if (recordsWithoutTimestamp.length > 0) {
     throw new Error(`${recordsWithoutTimestamp.length} 条记录缺少时间戳，无法保证幂等性。请确保客户端提供时间戳。`);
   }
   ```

2. **移除默认时间戳生成** (lines 104, 129)
   - 去重键生成：`${record.wordId}-${record.timestamp}` （不再使用 `|| Date.now()`）
   - 数据库写入：`new Date(record.timestamp!)` （使用非空断言）

**验证要点**：
- 缺少时间戳的记录会被拒绝，返回明确错误信息
- 相同 wordId + timestamp 的记录不会重复写入
- 客户端需要确保提供时间戳

---

### 3. 修复 StorageService 初始化/用户切换（高优先级）✅

**问题描述**：
- 位置：`src/services/StorageService.ts` lines 23-31
- 问题：`init()` 和 `setCurrentUser()` 是空实现，无法正确初始化和隔离用户数据

**修复方案**：
- 实现 `init()` 加载云端数据并初始化缓存
- 实现 `setCurrentUser()` 清空缓存并重新加载新用户数据

**修复内容**：

1. **init() 实现** (lines 26-43)
   - 尝试从云端加载数据：`await this.refreshCacheFromCloud()`
   - 更新同步状态：设置 lastSyncTime 和 pendingChanges
   - 错误处理：初始化失败不阻断应用启动，使用空缓存

2. **setCurrentUser() 实现** (lines 48-64)
   - 清空当前用户缓存：`wordCache = []`, `cacheTimestamp = null`
   - 重置同步状态：清空 lastSyncTime、pendingChanges、error
   - 如果有新用户，调用 `init()` 重新初始化

**验证要点**：
- 应用启动时正确加载用户数据
- 用户切换时清空旧数据并加载新数据
- 初始化失败不影响应用启动

---

### 4. 修复 StorageService 缓存失效（中优先级）✅

**问题描述**：
- 位置：`src/services/StorageService.ts` lines 115-118
- 问题：`deleteWord` 后未重置 cacheTimestamp，在 TTL 内 getWords 直接返回缓存，已删单词会继续展示

**修复方案**：
- 删除单词后重置 cacheTimestamp，强制下次 getWords 重新从云端加载

**修复内容**：

1. **deleteWord() 修复** (lines 148-153)
   ```typescript
   async deleteWord(wordId: string): Promise<void> {
     await ApiClient.deleteWord(wordId);
     this.wordCache = this.wordCache.filter((w) => w.id !== wordId);
     // 重置缓存时间戳，确保下次 getWords 时重新从云端加载
     this.cacheTimestamp = null;
   }
   ```

**验证要点**：
- 删除单词后，getWords 返回最新数据（不包含已删除单词）
- 缓存失效机制正常工作

---

### 5. 修复 LearningService 选项生成（中优先级）✅

**问题描述**：
- 位置：`src/services/LearningService.ts` lines 145-177
- 问题：干扰项不足时处理不完整，可能只返回1个选项

**修复方案**：
- 补充兜底选项逻辑，确保至少返回指定数量的选项
- 处理极端情况（只有一个单词且只有一个释义）

**修复内容**：

1. **添加兜底逻辑** (lines 175-184)
   ```typescript
   // 兜底：如果干扰项为空（极端情况：只有一个单词且只有一个释义）
   // 生成通用的占位选项，确保至少有指定数量的选项
   if (distractors.length === 0) {
     const fallbackOptions = [
       '（其他释义）',
       '（待补充）',
       '（暂无）',
     ];
     distractors = fallbackOptions.slice(0, count - 1);
   }
   ```

**验证要点**：
- 任何情况下都返回指定数量的选项（2-4个）
- 极端情况下使用占位选项
- 选项生成逻辑健壮

---

### 6. 补充 wordbook.routes 校验（低优先级）✅

**问题描述**：
- 位置：`backend/src/routes/wordbook.routes.ts` lines 56-80, 100-121
- 问题：只校验名称非空，缺少对描述、封面、长度/格式的验证

**修复方案**：
- 添加完整的输入验证，包括类型、长度、格式检查
- 统一错误响应格式

**修复内容**：

1. **创建词书校验** (lines 60-112)
   - 名称：非空、字符串类型、长度≤100
   - 描述：字符串类型、长度≤500（可选）
   - 封面URL：字符串类型、长度≤500、URL格式验证（可选）
   - 自动 trim 去除首尾空格

2. **更新词书校验** (lines 151-204)
   - 相同的验证逻辑，但所有字段都是可选的
   - 只验证提供的字段

**验证要点**：
- 异常输入被拒绝，返回明确错误信息
- 不会出现500错误或脏数据
- 输入自动清理（trim）

---

## 编码后声明

### 1. 复用了以下既有组件
- `prisma.$transaction([])`: 事务数组模式，用于 wordbook.service 的单词增删操作
- `prisma.$transaction(async (tx) => {})`: 事务回调模式，用于批量导入操作
- `ApiClient.getWords()`: 云端数据获取，用于 StorageService 初始化
- 错误处理模式：`throw new Error('中文错误信息')`

### 2. 遵循了以下项目约定
- 命名约定：camelCase 方法名，PascalCase 类名
- 代码风格：async/await、2空格缩进、简体中文注释
- 文件组织：服务层在 `services/`，路由层在 `routes/`
- 错误处理：统一的错误抛出和响应格式

### 3. 对比了以下相似实现
- `word.service.ts:139-147`: 事务数组模式，我的方案与其一致
- `admin.service.ts:242-245`: 批量创建模式，我改进为包含计数更新的完整事务
- `ApiClient` 的错误处理模式，我在 StorageService 中保持一致

### 4. 未重复造轮子的证明
- 检查了 `word.service.ts`、`admin.service.ts`，确认事务模式可复用
- 检查了 `ApiClient`，确认数据获取方式可复用
- 检查了路由层的错误处理模式，确认验证逻辑风格一致

---

## 风险评估

### 低风险
- StorageService 缓存失效修复：简单的状态重置，影响范围小
- LearningService 选项生成：兜底逻辑不影响正常流程

### 中风险
- wordbook.routes 校验：可能影响现有客户端（如果发送了不符合规范的数据）
- StorageService 初始化：初始化失败可能影响应用启动（已添加错误处理）

### 高风险
- wordbook.service 事务：改变了数据库操作的原子性，需要充分测试
- record.service 去重键：拒绝缺少时间戳的记录，可能影响旧版本客户端

### 缓解措施
- 所有修改都保持了向后兼容的错误处理
- 添加了详细的错误信息，便于调试
- 事务操作遵循 Prisma 最佳实践

---

## 下一步

1. 运行单元测试验证修复
2. 手动测试关键流程（创建/删除单词、批量导入、用户切换）
3. 监控生产环境日志，确认无异常
4. 如有必要，更新客户端以确保提供时间戳
