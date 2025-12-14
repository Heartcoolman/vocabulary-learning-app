# 代码审查标准体系

> **版本**: v1.0.0
> **最后更新**: 2025-12-13
> **适用项目**: Danci 词汇学习应用 Monorepo

---

## 概述

本文档定义了Danci项目的全面代码审查标准体系，涵盖React开发、性能优化、安全防护、架构设计、测试质量、文档完整性和合规性检查七大维度。

## 文档结构

代码审查标准分为以下专题文档：

1. **[React代码审查标准](./standards/react-review-standards.md)** - 组件设计、Hooks使用、性能优化
2. **[性能优化审查标准](./standards/performance-review-standards.md)** - Bundle大小、加载时间、渲染性能
3. **[安全审查标准](./standards/security-review-standards.md)** - XSS防护、认证授权、数据保护
4. **[架构审查标准](./standards/architecture-review-standards.md)** - 分层架构、模块化、耦合度
5. **[测试审查标准](./standards/testing-review-standards.md)** - 覆盖率要求、测试质量、E2E测试
6. **[文档审查标准](./standards/documentation-review-standards.md)** - README完整性、API文档、注释规范
7. **[合规性检查标准](./standards/compliance-review-standards.md)** - 许可证检查、可访问性、浏览器兼容性

## 快速开始

### 代码提交前检查清单

使用[综合检查清单](./checklists/CODE_REVIEW_CHECKLIST.md)进行自我审查：

```bash
# 1. 代码格式化
pnpm format

# 2. 代码检查
pnpm lint

# 3. 类型检查
pnpm build

# 4. 运行测试
pnpm test

# 5. 测试覆盖率
pnpm test:coverage

# 6. E2E测试
pnpm test:e2e

# 7. 性能审查（可选）
pnpm lighthouse
```

### Pull Request审查流程

1. **自动化检查** - CI流水线自动运行
   - 代码格式检查（Prettier）
   - 代码质量检查（ESLint）
   - 类型安全检查（TypeScript）
   - 单元测试和集成测试
   - 覆盖率门槛检查（80%）

2. **人工审查** - 使用审查清单
   - 架构设计合理性
   - 代码可读性和可维护性
   - 安全漏洞排查
   - 性能影响评估
   - 文档完整性

3. **专项审查** - 针对特定变更
   - React组件审查（组件变更）
   - API安全审查（接口变更）
   - 数据库审查（Schema变更）
   - 性能审查（核心功能变更）

## 审查标准等级

### 🔴 阻断级（Blocking）

必须修复才能合并的问题：

- 安全漏洞
- 功能缺陷
- 测试覆盖率不足（<80%）
- 代码格式不符合规范
- TypeScript类型错误
- 破坏性API变更未标记

### 🟡 警告级（Warning）

建议修复，可酌情合并：

- 代码复杂度过高
- 缺少注释或文档
- 性能次优实现
- 命名不够清晰
- 重复代码

### 🟢 建议级（Suggestion）

优化建议，不影响合并：

- 代码风格偏好
- 更优雅的实现方式
- 额外的测试用例
- 文档增强

## 工具链配置

项目已配置以下代码质量工具：

### 代码格式化

- **Prettier**: 统一代码格式
- 配置文件: `.prettierrc.json`
- 规则:
  - 单引号
  - 分号结尾
  - 行宽100字符
  - 尾随逗号
  - Tailwind排序插件

### 代码检查

- **ESLint**: 代码质量和风格检查
- Backend配置: `packages/backend/eslint.config.js`
- Frontend配置: `packages/frontend/eslint.config.js`
- 核心规则:
  - 禁止console（测试文件除外）
  - TypeScript严格模式
  - React Hooks规则
  - 未使用变量警告

### 类型检查

- **TypeScript**: 静态类型检查
- 严格模式启用
- 路径别名配置
- Monorepo项目引用

### 提交规范

- **Commitlint**: Git提交消息检查
- **Husky**: Git钩子管理
- **Lint-staged**: 提交前代码检查
- 配置文件: `commitlint.config.js`
- 提交格式: `type(scope): subject`

### 测试框架

- **Vitest**: 单元测试和集成测试
- **Playwright**: E2E测试
- **MSW**: API Mock
- **Testing Library**: React组件测试

### 性能监控

- **Lighthouse CI**: 性能审计
- **Rollup Plugin Visualizer**: Bundle分析
- **Sentry**: 运行时错误监控

## 验证流程

每个标准都经过**5轮验证**：

### 第1轮：标准定义验证

- 标准是否清晰明确？
- 标准是否可执行？
- 标准是否有工具支持？

### 第2轮：项目适配性验证

- 标准是否适合当前项目？
- 标准是否与现有架构兼容？
- 标准是否需要调整？

### 第3轮：工具链验证

- 自动化工具是否已配置？
- 工具是否能准确检测违规？
- CI/CD是否已集成？

### 第4轮：实践验证

- 在实际代码上测试标准
- 收集开发者反馈
- 识别误报和漏报

### 第5轮：持续优化验证

- 标准是否需要更新？
- 是否有新的最佳实践？
- 团队接受度如何？

## 审查流程指南

### 1. PR创建者自查

使用[自查清单](./checklists/SELF_REVIEW_CHECKLIST.md)：

- [ ] 代码通过所有自动化检查
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 遵循了架构设计原则
- [ ] 考虑了安全和性能影响

### 2. 审查者检查

使用[审查者清单](./checklists/REVIEWER_CHECKLIST.md)：

- [ ] 代码逻辑正确性
- [ ] 架构设计合理性
- [ ] 代码可读性和可维护性
- [ ] 测试覆盖充分性
- [ ] 安全漏洞排查
- [ ] 性能影响评估
- [ ] 文档完整性

### 3. 维护者最终检查

- [ ] 变更影响范围评估
- [ ] 破坏性变更确认
- [ ] 版本号更新
- [ ] 变更日志更新
- [ ] 发布计划确认

## 持续改进

本标准体系将持续优化：

- **每季度审查**: 评估标准执行情况
- **收集反馈**: 开发者使用体验
- **更新标准**: 纳入新的最佳实践
- **工具升级**: 保持工具链最新

## 参考资源

### 官方文档

- [React 官方文档](https://react.dev/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Vitest 文档](https://vitest.dev/)
- [Playwright 文档](https://playwright.dev/)

### 最佳实践

- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

### 安全资源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## 联系方式

如有问题或建议，请：

- 提交Issue到项目仓库
- 联系技术负责人
- 参与代码审查讨论会

---

**注意**: 本标准体系是动态文档，将随着项目演进持续更新。所有开发者都应定期查看最新版本。
