# 文档审查标准

> **版本**: v1.0.0 | **验证状态**: ✅

## README完整性

### 🔴 阻断级

- [ ] **项目描述**: 清晰说明项目用途
- [ ] **快速开始**: 完整的安装和运行步骤
- [ ] **技术栈**: 列出主要技术和版本
- [ ] **目录结构**: 说明项目组织方式

### README模板

```markdown
# 项目名称

简短描述(一句话)

## 功能特性

- 特性1
- 特性2

## 技术栈

- React 18
- TypeScript 5
- Vite 5

## 快速开始

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## 项目结构

\`\`\`
src/
├── components/
├── pages/
└── services/
\`\`\`

## 开发指南

参见 [CONTRIBUTING.md]

## 许可证

MIT
```

## API文档要求

### 🟡 警告级

- [ ] **端点列表**: 所有API端点有文档
- [ ] **请求示例**: 包含请求参数和示例
- [ ] **响应示例**: 包含成功和错误响应
- [ ] **认证说明**: 说明认证方式

### API文档示例

```markdown
## POST /api/v1/words

创建新单词

### 请求

\`\`\`json
{
"spelling": "hello",
"phonetic": "/həˈloʊ/",
"meanings": ["你好"],
"wordBookId": "book-id"
}
\`\`\`

### 响应 200

\`\`\`json
{
"id": "word-id",
"spelling": "hello",
...
}
\`\`\`

### 错误 400

\`\`\`json
{
"error": "Invalid input",
"details": [...]
}
\`\`\`
```

## 注释规范

### 🟡 警告级

- [ ] **函数注释**: 复杂函数有JSDoc注释
- [ ] **类型注释**: TypeScript类型有说明注释
- [ ] **算法注释**: 复杂算法有步骤说明
- [ ] **TODO标记**: 待办事项明确标记

### JSDoc示例

````typescript
/**
 * 计算单词的遗忘曲线保持率
 *
 * @param lastReviewTime - 上次复习的时间戳
 * @param reviewCount - 复习次数
 * @param difficulty - 难度系数 (0-1)
 * @returns 当前保持率 (0-1)
 *
 * @example
 * ```ts
 * const retention = calculateRetention(
 *   Date.now() - 86400000, // 24小时前
 *   3,  // 复习3次
 *   0.5 // 中等难度
 * );
 * // => 0.82
 * ```
 */
function calculateRetention(
  lastReviewTime: number,
  reviewCount: number,
  difficulty: number,
): number {
  // 实现...
}
````

## 变更日志要求

### 🟡 警告级

- [ ] **CHANGELOG.md**: 维护变更日志
- [ ] **语义化版本**: 遵循Semver规范
- [ ] **分类记录**: 按Added/Changed/Fixed分类

### CHANGELOG示例

```markdown
# Changelog

## [2.0.0] - 2025-12-13

### Added

- 事件驱动架构
- SSE实时推送
- 遗忘预警功能

### Changed

- AMAS接口重构
- 用户画像合并

### Fixed

- 内存泄漏问题
- 性能瓶颈优化

## [1.0.0] - 2025-01-01

...
```

## 架构文档要求

### 🟡 警告级

- [ ] **系统架构图**: 说明系统整体架构
- [ ] **数据流图**: 说明数据流转
- [ ] **组件交互**: 说明组件间交互方式

## 验证记录 ✅

- ✅ README完整且清晰
- ✅ API文档覆盖所有端点
- ✅ 代码注释充分
- ✅ CHANGELOG持续更新

## 参考资源

- [Write the Docs](https://www.writethedocs.org/)
- [JSDoc](https://jsdoc.app/)
