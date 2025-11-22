# 项目上下文摘要（Bug修复任务）
生成时间：2025-11-22

## 1. 相似实现分析

### 实现1: backend/src/services/word.service.ts:139-147
- **模式**：Prisma 事务数组模式
- **可复用**：`prisma.$transaction([操作1, 操作2])` 确保原子性
- **需注意**：事务数组中的操作会按顺序执行，全部成功或全部回滚

### 实现2: backend/src/services/wordbook.service.ts:257-266
- **模式**：Prisma 事务 map 模式（批量创建）
- **可复用**：`prisma.$transaction(array.map(item => prisma.model.create(...)))`
- **需注意**：批量创建后需要单独更新计数，未包含在事务中（存在问题）

### 实现3: backend/src/services/admin.service.ts:242-245
- **模式**：与实现2相同的批量创建模式
- **可复用**：相同的事务 map 模式
- **需注意**：同样存在计数更新未包含在事务中的问题

## 2. 项目约定

### 命名约定
- 服务类：PascalCase，如 `WordBookService`、`RecordService`
- 方法名：camelCase，如 `addWordToWordBook`、`batchCreateRecords`
- 变量名：camelCase
- 常量：UPPER_SNAKE_CASE（如有）

### 文件组织
- 服务层：`backend/src/services/*.service.ts`
- 路由层：`backend/src/routes/*.routes.ts`
- 类型定义：`backend/src/types/index.ts`
- 前端服务：`src/services/*.ts`

### 导入顺序
1. 第三方库（如 prisma、uuid）
2. 本地类型定义
3. 本地服务/工具

### 代码风格
- 使用 async/await 而非 Promise.then
- 错误抛出使用 `throw new Error('中文错误信息')`
- 注释使用简体中文
- 缩进：2空格

## 3. 可复用组件清单

- `prisma.$transaction([])`: 事务数组模式，确保多个操作的原子性
- `prisma.$transaction(array.map(...))`: 批量操作事务模式
- `prisma.model.update({ data: { count: { increment: 1 } } })`: 原子性计数更新
- `prisma.model.update({ data: { count: { decrement: 1 } } })`: 原子性计数递减

## 4. 测试策略

### 测试框架
- 未找到明确的测试文件，但项目中有 `__tests__` 目录
- 前端测试：`src/services/__tests__/*.test.ts`
- 测试框架可能是 Jest 或 Vitest

### 测试模式
- 单元测试：测试单个服务方法
- 集成测试：测试 API 端点

### 覆盖要求
- 正常流程：成功创建/删除/更新
- 边界条件：空数据、重复数据、不存在的ID
- 错误处理：权限错误、数据库错误、验证错误

## 5. 依赖和集成点

### 外部依赖
- `@prisma/client`: 数据库 ORM
- `uuid`: 生成唯一ID
- `express`: Web 框架

### 内部依赖
- `StorageService` 依赖 `ApiClient`
- `LearningService` 依赖 `StorageService`
- 后端服务层依赖 `prisma` 实例

### 集成方式
- 直接调用：服务间直接导入和调用
- API 调用：前端通过 `ApiClient` 调用后端 API

### 配置来源
- 数据库配置：`backend/src/config/database.ts`
- 类型定义：`backend/src/types/index.ts`

## 6. 技术选型理由

### 为什么用 Prisma
- 类型安全的 ORM
- 支持事务操作
- 自动生成类型定义

### 优势
- 事务支持确保数据一致性
- TypeScript 类型安全
- 简洁的 API

### 劣势和风险
- 事务使用不当会导致数据不一致
- 批量操作需要注意性能
- 缓存失效需要手动管理

## 7. 关键风险点

### 并发问题
- 多个请求同时修改同一词书的 wordCount
- 缓存并发更新可能导致数据不一致

### 边界条件
- 空数组批量操作
- 单词不存在时的删除操作
- 缓存 TTL 过期时的并发刷新

### 性能瓶颈
- 批量导入大量单词时的事务性能
- 缓存未命中时的数据库查询
- 重复的去重检查

### 安全考虑
- 用户权限验证（已实现）
- 输入验证不足（需要补充）
- SQL 注入（Prisma 已防护）

## 8. 问题分析

### 问题1：wordbook.service 事务缺失
- **位置**：lines 175-194, 228-240, 257-276
- **问题**：单词增删和计数更新未在同一事务中
- **影响**：计数可能与实际单词数不一致
- **修复方案**：使用 `prisma.$transaction` 包裹所有操作

### 问题2：record.service 去重键问题
- **位置**：lines 95-107
- **问题**：使用 `record.timestamp || Date.now()` 作为去重键，缺少时间戳时每次生成不同key
- **影响**：重复上传相同记录
- **修复方案**：要求客户端必须提供时间戳，或使用内容哈希

### 问题3：StorageService 初始化空实现
- **位置**：lines 23-31
- **问题**：init() 和 setCurrentUser() 是空实现
- **影响**：无法正确初始化和隔离用户数据
- **修复方案**：实现初始化逻辑和用户切换逻辑

### 问题4：StorageService 缓存失效
- **位置**：lines 115-118
- **问题**：deleteWord 后未重置 cacheTimestamp
- **影响**：已删除单词仍在缓存中显示
- **修复方案**：删除后重置 cacheTimestamp

### 问题5：LearningService 选项生成
- **位置**：lines 145-177
- **问题**：干扰项不足时处理不完整
- **影响**：可能只返回1个选项
- **修复方案**：补充兜底选项逻辑

### 问题6：wordbook.routes 校验不足
- **位置**：lines 56-80, 100-121
- **问题**：只校验名称非空，缺少其他字段验证
- **影响**：异常输入可能导致500错误
- **修复方案**：添加完整的输入验证
