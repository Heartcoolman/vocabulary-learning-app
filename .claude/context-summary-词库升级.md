## 项目上下文摘要（词库升级）
生成时间：2025-11-21

### 1. 相似实现分析

**实现1**: src/pages/VocabularyPage.tsx:13-441
- 模式：React Hooks + 状态管理
- 功能：单词列表展示、CRUD操作、搜索过滤
- 可复用：表单验证逻辑、防抖搜索、动画效果
- 需注意：当前直接显示单词列表，需改为显示词书列表

**实现2**: src/services/StorageService.ts:24-1049
- 模式：单例服务 + IndexedDB + 云端同步
- 功能：本地存储、云端同步、离线支持、数据迁移
- 可复用：同步机制、队列管理、防抖同步
- 需注意：当前支持离线模式，需要移除并改为云端优先

**实现3**: backend/src/services/word.service.ts:4-83
- 模式：服务层 + Prisma ORM
- 功能：单词CRUD、批量操作、用户权限验证
- 可复用：批量创建逻辑、权限验证模式
- 需注意：需要扩展为支持词书管理

### 2. 项目约定

**命名约定**:
- 组件：PascalCase (VocabularyPage, WordCard)
- 服务：PascalCase + Service后缀 (StorageService, WordService)
- 接口：PascalCase (Word, AnswerRecord)
- 变量/函数：camelCase (getWords, addWord)

**文件组织**:
- 前端：src/pages/, src/components/, src/services/, src/types/
- 后端：backend/src/services/, backend/src/routes/, backend/src/validators/
- 数据库：backend/prisma/schema.prisma

**导入顺序**:
1. React相关
2. 第三方库
3. 类型定义
4. 本地服务/工具
5. 样式文件

**代码风格**:
- 使用TypeScript严格模式
- 使用箭头函数
- 使用async/await处理异步
- 使用Tailwind CSS类名

### 3. 可复用组件清单

- `src/services/StorageService.ts`: 存储服务（需重构）
- `src/services/ApiClient.ts`: API客户端
- `src/utils/validation.ts`: 验证工具函数
- `src/utils/errorHandler.ts`: 错误处理工具
- `src/utils/debounce.ts`: 防抖函数
- `backend/src/services/word.service.ts`: 单词服务（需扩展）

### 4. 测试策略

**测试框架**: Jest + React Testing Library
**测试模式**: 单元测试 + 集成测试
**参考文件**: 
- src/components/__tests__/WordCard.test.tsx
- src/services/__tests__/LearningService.test.ts
**覆盖要求**: 正常流程 + 边界条件 + 错误处理

### 5. 依赖和集成点

**外部依赖**:
- React 18
- Tauri (桌面应用框架)
- Prisma (ORM)
- PostgreSQL (数据库)
- uuid (ID生成)
- Tailwind CSS (样式)

**内部依赖**:
- VocabularyPage → StorageService → ApiClient
- WordService → Prisma → PostgreSQL
- 前端通过Tauri调用后端API

**集成方式**: 
- 前端通过ApiClient调用后端REST API
- 后端通过Prisma操作PostgreSQL数据库
- 本地IndexedDB作为缓存层

**配置来源**: 
- backend/.env (数据库连接)
- src/services/ApiClient.ts (API端点)

### 6. 技术选型理由

**为什么用这个方案**:
- Tauri: 轻量级桌面应用框架，比Electron更小
- Prisma: 类型安全的ORM，开发体验好
- IndexedDB: 浏览器原生存储，支持大量数据
- PostgreSQL: 成熟的关系型数据库，支持JSON字段

**优势**:
- 类型安全（TypeScript + Prisma）
- 离线支持（IndexedDB）
- 云端同步（自动同步机制）
- 跨平台（Tauri）

**劣势和风险**:
- IndexedDB API复杂，需要封装
- 同步冲突处理复杂
- 离线功能增加复杂度（本次需移除）

### 7. 关键风险点

**并发问题**:
- 同步过程中的数据冲突
- 多标签页同时操作IndexedDB

**边界条件**:
- 用户未登录时的操作
- 网络断开时的处理
- 数据库版本升级

**性能瓶颈**:
- 大量单词的列表渲染
- IndexedDB批量操作
- 云端同步的频率控制

**安全考虑**:
- 用户权限验证（系统词库vs用户词库）
- SQL注入防护（Prisma已处理）
- XSS防护（React已处理）

### 8. 核心变更需求

**数据模型变更**:
- 新增WordBook模型（词书）
- Word模型关联到WordBook
- 区分系统词书和用户词书（isSystem字段）
- 添加管理员角色（User模型扩展）

**UI变更**:
- VocabularyPage改为显示词书列表
- 新增词书详情页（显示词书内的单词）
- 新增词书创建/编辑表单
- 新增词书上传功能

**存储策略变更**:
- 移除离线模式（删除local和hybrid模式）
- 仅保留cloud模式
- IndexedDB仅作缓存使用
- 所有操作直接调用云端API

**权限控制**:
- 系统词书：只读，不可修改/删除
- 用户词书：完全控制权限
- 管理员：可以上传系统词书

### 9. 实现路径

**阶段1：数据模型重构**
1. 修改Prisma schema，添加WordBook模型
2. 创建数据库迁移
3. 更新TypeScript类型定义

**阶段2：后端API开发**
1. 创建WordBookService
2. 创建词书CRUD路由
3. 添加权限验证中间件
4. 实现词书上传功能

**阶段3：前端UI改造**
1. 重构VocabularyPage为词书列表页
2. 创建WordBookDetailPage（词书详情页）
3. 创建词书创建/编辑表单
4. 实现词书上传功能

**阶段4：存储服务重构**
1. 移除离线模式相关代码
2. 简化StorageService为缓存层
3. 所有操作直接调用API
4. 保留基本的IndexedDB缓存

**阶段5：测试和验证**
1. 单元测试
2. 集成测试
3. 手动测试各种场景
4. 性能测试

### 10. 观察报告

**发现的异常**:
- 当前没有WordBook概念，所有单词直接属于用户
- 没有管理员角色和权限系统
- 离线功能代码量大，移除需要谨慎

**信息不足之处**:
- 词书上传的文件格式（CSV? JSON? Excel?）
- 系统词书的来源和管理方式
- 管理员界面是否需要单独开发

**建议深入的方向**:
- 词书导入/导出的文件格式标准
- 权限系统的详细设计
- 缓存策略的优化方案
