# Backend 测试补充计划 - 快速参考

> 2025-12-13 | 针对 4 个缺失测试的核心服务 | 预计 103 小时工作量

---

## 🎯 核心结论

### 缺失测试的服务

1. **learning-state.service.ts** (1,354 行) - P0 严重
2. **word-selection.service.ts** (770 行) - P0 严重
3. **user-profile.service.ts** (1,047 行) - P1 高
4. **realtime.service.ts** (373 行) - P2 中

### 风险评分: 43/50 (高风险技术债务)

| 维度     | 评分 | 说明                           |
| -------- | ---- | ------------------------------ |
| 规模     | 8/10 | 4,053 行未测试代码             |
| 复杂度   | 9/10 | 事务、缓存、事件总线、认知模型 |
| 关键性   | 9/10 | 核心业务流程                   |
| 技术风险 | 8/10 | 并发、数据一致性、性能         |
| 业务风险 | 9/10 | 直接影响学习体验               |

---

## 📋 执行计划

### Phase 1 (Week 1) - P0 服务

**目标**: 78% 覆盖率 | 56h 工作量

```bash
# Day 1-4: learning-state.service.test.ts
- 学习状态管理 (6h)
- 分数计算 (4h)
- 掌握度评估 (6h)
- 事件发布和缓存 (4h)
- 批量操作优化 (4h)
- 错误处理和边界条件 (6h)

# Day 5-7: word-selection.service.test.ts
- 策略路由和普通选词 (6h)
- 复习选词 (4h)
- 碎片时间选词 (4h)
- 难度和优先级计算 (4h)
- 错误处理和性能测试 (4h)
```

**交付物**: 110+ 测试用例，覆盖率 78%+

### Phase 2 (Week 2-4) - P1 服务

**目标**: 82% 覆盖率 | 27h 工作量

```bash
# Week 2-3: user-profile.service.test.ts
- 用户管理和认证 (12h)
- 习惯画像和时型画像 (8h)
- 学习风格和综合认知画像 (8h)
- 安全性和错误处理 (6h)
```

**交付物**: 55+ 测试用例，覆盖率 82%+

### Phase 3 (Week 5+) - P2 服务

**目标**: 85% 覆盖率 | 20h 工作量

```bash
# Week 5: realtime.service.test.ts
- 订阅管理 (6h)
- 事件分发和 SSE (6h)
- 清理机制和错误处理 (4h)
- 并发和内存泄漏测试 (4h)
```

**交付物**: 40+ 测试用例，覆盖率 85%+

---

## 🚀 快速开始

### 1. 运行示例测试

```bash
cd packages/backend

# 运行已创建的示例测试
npm run test -- learning-state.service.test.ts

# 查看覆盖率
npm run test:coverage
```

### 2. 使用测试模板

示例测试文件已创建：

- `/packages/backend/tests/unit/services/learning-state.service.test.ts`

复制此模板为其他服务创建测试：

```bash
# 复制模板
cp tests/unit/services/learning-state.service.test.ts \
   tests/unit/services/word-selection.service.test.ts

# 根据服务特点修改 Mock 和测试用例
```

### 3. 关键 Mock 模式

```typescript
// 数据库 Mock
vi.mock('../../../src/config/database', () => ({
  default: {
    [tableName]: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mockPrisma)),
  },
}));

// 缓存 Mock
vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

// EventBus Mock
vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => ({
    publish: vi.fn(),
  })),
}));
```

---

## 📊 测试覆盖率路线图

```
当前 68% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         │
         │ Phase 1 (1 周)
         ▼
目标 78% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         │
         │ Phase 2 (3 周)
         ▼
目标 82% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         │
         │ Phase 3 (1+ 周)
         ▼
目标 85% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📝 测试清单

### learning-state.service.ts

- [ ] 学习状态管理 (6 个测试套件)
- [ ] 分数计算与更新 (3 个测试套件)
- [ ] 掌握度评估 (3 个测试套件)
- [ ] 事件发布机制 (1 个测试套件)
- [ ] 缓存策略 (1 个测试套件)
- [ ] 批量操作优化 (1 个测试套件)
- [ ] 错误处理 (1 个测试套件)
- [ ] 边界条件 (1 个测试套件)
- [ ] ACT-R 集成 (1 个测试套件)
- [ ] 性能测试 (1 个测试套件)

### word-selection.service.ts

- [ ] 策略路由 (1 个测试套件)
- [ ] 普通选词策略 (1 个测试套件)
- [ ] 复习选词策略 (1 个测试套件)
- [ ] 碎片时间选词策略 (1 个测试套件)
- [ ] 难度计算 (1 个测试套件)
- [ ] 优先级计算 (1 个测试套件)
- [ ] 遗忘风险评估 (1 个测试套件)
- [ ] 记忆强度计算 (1 个测试套件)
- [ ] 批量操作 (1 个测试套件)
- [ ] 错误处理 (1 个测试套件)

### user-profile.service.ts

- [ ] 用户管理 (1 个测试套件)
- [ ] 习惯画像 (1 个测试套件)
- [ ] 时型画像 (1 个测试套件)
- [ ] 学习风格画像 (1 个测试套件)
- [ ] 综合认知画像 (1 个测试套件)
- [ ] 学习档案 (1 个测试套件)
- [ ] 事件发布 (1 个测试套件)
- [ ] 缓存管理 (1 个测试套件)
- [ ] 数据验证 (1 个测试套件)
- [ ] 安全性 (1 个测试套件)
- [ ] 错误处理 (1 个测试套件)

### realtime.service.ts

- [ ] 订阅管理 (1 个测试套件)
- [ ] 事件分发 (1 个测试套件)
- [ ] SSE 格式化 (1 个测试套件)
- [ ] 清理机制 (1 个测试套件)
- [ ] 统计信息 (1 个测试套件)
- [ ] 并发控制 (1 个测试套件)
- [ ] 错误处理 (1 个测试套件)
- [ ] 关闭流程 (1 个测试套件)

---

## 🎓 参考资源

### 文档

- **详细分析**: `TEST_COVERAGE_ANALYSIS.md` (完整 100 页分析报告)
- **示例测试**: `tests/unit/services/learning-state.service.test.ts`
- **现有测试参考**: `tests/unit/services/amas.service.test.ts`

### 命令速查

```bash
# 运行所有测试
npm run test

# 运行特定文件
npm run test -- [filename]

# 监听模式
npm run test -- --watch

# 生成覆盖率
npm run test:coverage

# 查看覆盖率（浏览器）
open coverage/index.html
```

---

## 📞 支持

遇到问题？

1. 查看 `TEST_COVERAGE_ANALYSIS.md` 第六部分（测试最佳实践）
2. 参考现有测试文件 `amas.service.test.ts`
3. 联系技术负责人或 Slack #testing 频道

---

**最后更新**: 2025-12-13
**下次检查**: Phase 1 完成后 (2025-12-22)
