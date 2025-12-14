# 测试补充计划 - 执行看板

> 项目周期: 5 周 | 开始日期: 2025-12-16 | 目标覆盖率: 85%

---

## 📅 Week 1: P0 服务测试 (2025-12-16 ~ 2025-12-22)

### Day 1-2: learning-state.service.test.ts (基础)

- [ ] 环境准备和模板创建 (2h)
- [ ] 学习状态管理测试 (6h)
  - [ ] `getWordState` - 缓存命中和失效
  - [ ] `updateWordState` - 更新和事件发布
  - [ ] `batchGetWordStates` - 批量查询优化
  - [ ] `getDueWords` - 到期词查询和排序
- [ ] 分数计算测试 (4h)
  - [ ] `getWordScore` - 获取和缓存
  - [ ] `updateWordScore` - 加权计算
  - [ ] `batchCalculateScores` - 批量计算

**预期输出**: 20+ 测试用例，学习状态和分数模块覆盖

### Day 3-4: learning-state.service.test.ts (高级)

- [ ] 掌握度评估测试 (6h)
  - [ ] `evaluateWordMastery` - 集成 WordMasteryEvaluator
  - [ ] `trackReview` - WordMemoryTracker 集成
  - [ ] `getMasteryStats` - 统计聚合
  - [ ] ACT-R 模型集成测试
- [ ] 事件发布和缓存测试 (4h)
  - [ ] WORD_MASTERED 事件
  - [ ] FORGETTING_RISK 事件
  - [ ] 缓存失效策略
  - [ ] 批量缓存预热

**预期输出**: 25+ 测试用例，掌握度评估完整覆盖

### Day 5-7: word-selection.service.test.ts

- [ ] 策略路由和普通选词 (6h)
  - [ ] `selectWordsForSession` - 路由逻辑
  - [ ] `selectForNormalSession` - AMAS 集成
  - [ ] `fetchWordsWithStrategy` - new_ratio 分配
  - [ ] 难度映射测试
- [ ] 复习和碎片时间选词 (6h)
  - [ ] `selectWordsForReview` - 优先级排序
  - [ ] `getDueWordsWithPriority` - 到期词计算
  - [ ] `selectWordsForMicroSession` - MicroSessionPolicy 集成
  - [ ] `toWordCandidates` - 格式转换
- [ ] 难度和优先级计算 (6h)
  - [ ] `computeWordDifficultyFromScore` - 得分难度
  - [ ] `computeNewWordDifficulty` - 新词难度
  - [ ] `calculateForgettingRisk` - 遗忘风险
  - [ ] `calculateMemoryStrength` - 记忆强度
  - [ ] 边界条件和错误处理

**预期输出**: 50+ 测试用例，选词策略完整覆盖

**Week 1 里程碑**:

- ✅ 110+ 测试用例完成
- ✅ 覆盖率达到 78%+
- ✅ P0 服务测试完成

---

## 📅 Week 2-3: P1 服务测试 (2025-12-23 ~ 2026-01-12)

### Week 2: user-profile.service.test.ts (基础)

- [ ] 用户管理测试 (12h)
  - [ ] `createUser` - 密码加密
  - [ ] `getUserById` - 查询和缓存
  - [ ] `updateUser` - 更新和验证
  - [ ] `authenticateUser` - 密码验证
  - [ ] 重复用户名处理
- [ ] 习惯画像测试 (8h)
  - [ ] `getHabitProfile` - HabitRecognizer 集成
  - [ ] `recordTimeEvent` - 事件记录
  - [ ] `persistHabitProfile` - 持久化
  - [ ] 实例缓存管理

**预期输出**: 25+ 测试用例，用户管理和习惯画像覆盖

### Week 3: user-profile.service.test.ts (高级)

- [ ] 认知画像测试 (8h)
  - [ ] `getChronotypeProfile` - 时型检测
  - [ ] `getLearningStyleProfile` - 学习风格分析
  - [ ] `buildCognitiveProfile` - 综合画像
  - [ ] 数据不足错误处理
- [ ] 安全性和错误处理 (6h)
  - [ ] bcrypt 加密验证
  - [ ] 密码强度检查
  - [ ] 敏感信息保护
  - [ ] 缓存降级策略
- [ ] 代码审查和优化 (6h)
  - [ ] 性能测试
  - [ ] 边界条件补充
  - [ ] 文档更新

**预期输出**: 30+ 测试用例，认知画像和安全性完整覆盖

**Week 2-3 里程碑**:

- ✅ 55+ 测试用例完成
- ✅ 覆盖率达到 82%+
- ✅ P1 服务测试完成

---

## 📅 Week 4: 优化和文档 (2026-01-13 ~ 2026-01-19)

### 测试优化

- [ ] 性能基准测试 (4h)
  - [ ] 单次查询性能 (<100ms)
  - [ ] 批量查询性能 (<500ms)
  - [ ] 内存使用测试
- [ ] 边界条件补充 (4h)
  - [ ] 极端值测试
  - [ ] 空数据测试
  - [ ] 并发测试
- [ ] 代码覆盖率优化 (8h)
  - [ ] 补充未覆盖分支
  - [ ] 错误路径测试
  - [ ] 集成测试增强

### 文档编写

- [ ] 测试最佳实践文档 (4h)
- [ ] 代码审查清单 (2h)
- [ ] 团队分享准备 (2h)

**Week 4 里程碑**:

- ✅ 覆盖率优化到 82%+
- ✅ 性能基准建立
- ✅ 测试文档完成

---

## 📅 Week 5+: P2 服务测试和持续改进 (2026-01-20 ~)

### Week 5: realtime.service.test.ts

- [ ] 订阅管理测试 (6h)
  - [ ] `subscribe` - 创建订阅
  - [ ] `unsubscribe` - 取消订阅
  - [ ] 用户和会话索引管理
  - [ ] 订阅 ID 生成
- [ ] 事件分发和 SSE (6h)
  - [ ] `sendToUser` - 用户事件
  - [ ] `sendToSession` - 会话事件
  - [ ] `broadcast` - 广播
  - [ ] `formatSSEMessage` - SSE 格式化
- [ ] 清理和并发测试 (4h)
  - [ ] `cleanupExpiredSubscriptions` - 定期清理
  - [ ] 并发订阅测试
  - [ ] 内存泄漏测试
  - [ ] `shutdown` - 关闭流程

**预期输出**: 40+ 测试用例，实时服务完整覆盖

### 持续改进

- [ ] 监控覆盖率下降 (持续)
- [ ] 补充新功能测试 (持续)
- [ ] 重构驱动测试优化 (持续)

**Week 5+ 里程碑**:

- ✅ 40+ 测试用例完成
- ✅ 覆盖率达到 85%+
- ✅ 全部 4 个服务测试完成

---

## 🎯 关键指标追踪

### 测试用例统计

| 服务           | 目标用例 | 已完成 | 进度                        |
| -------------- | -------- | ------ | --------------------------- |
| learning-state | 60       | 0      | ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%     |
| word-selection | 50       | 0      | ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%     |
| user-profile   | 55       | 0      | ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%     |
| realtime       | 40       | 0      | ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%     |
| **总计**       | **205**  | **0**  | ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ **0%** |

### 覆盖率进度

| 阶段           | 目标 | 当前 | 状态      |
| -------------- | ---- | ---- | --------- |
| Phase 0 (起点) | -    | 68%  | ✅        |
| Phase 1 (P0)   | 78%  | 68%  | 🔄 进行中 |
| Phase 2 (P1)   | 82%  | 68%  | ⏳ 待开始 |
| Phase 3 (P2)   | 85%  | 68%  | ⏳ 待开始 |

### 工作量统计

| 类别     | 预算     | 已用   | 剩余     |
| -------- | -------- | ------ | -------- |
| Phase 1  | 56h      | 0h     | 56h      |
| Phase 2  | 27h      | 0h     | 27h      |
| Phase 3  | 20h      | 0h     | 20h      |
| **总计** | **103h** | **0h** | **103h** |

---

## ⚠️ 风险和阻塞

### 当前风险

- 暂无

### 已解决问题

- 暂无

---

## 📋 每日站会记录

### 2025-12-16 (Week 1, Day 1)

- **完成**:
- **进行中**:
- **计划**:
- **阻塞**:

### 2025-12-17 (Week 1, Day 2)

- **完成**:
- **进行中**:
- **计划**:
- **阻塞**:

### 2025-12-18 (Week 1, Day 3)

- **完成**:
- **进行中**:
- **计划**:
- **阻塞**:

### 2025-12-19 (Week 1, Day 4)

- **完成**:
- **进行中**:
- **计划**:
- **阻塞**:

### 2025-12-20 (Week 1, Day 5)

- **完成**:
- **进行中**:
- **计划**:
- **阻塞**:

---

## ✅ 验收标准

### Phase 1 完成标准

- [ ] `learning-state.service.test.ts` 完成（60+ 用例）
- [ ] `word-selection.service.test.ts` 完成（50+ 用例）
- [ ] 所有测试通过（100% 绿色）
- [ ] 覆盖率达到 78%+
- [ ] 代码审查通过（至少 2 人）
- [ ] CI/CD 流水线通过
- [ ] 性能基准达标
- [ ] 文档更新完成

### Phase 2 完成标准

- [ ] `user-profile.service.test.ts` 完成（55+ 用例）
- [ ] 所有测试通过
- [ ] 覆盖率达到 82%+
- [ ] 安全性测试通过
- [ ] 性能测试通过
- [ ] 代码审查通过
- [ ] 文档更新完成

### Phase 3 完成标准

- [ ] `realtime.service.test.ts` 完成（40+ 用例）
- [ ] 所有测试通过
- [ ] 覆盖率达到 85%+
- [ ] 内存泄漏测试通过
- [ ] 并发测试通过
- [ ] 代码审查通过
- [ ] 最终文档完成

---

## 🚀 快速命令

```bash
# 运行测试
npm run test

# 监听模式
npm run test -- --watch

# 生成覆盖率
npm run test:coverage

# 查看覆盖率报告
open coverage/index.html

# 运行特定测试文件
npm run test -- learning-state.service.test.ts
```

---

**最后更新**: 2025-12-13
**负责人**: [待指定]
**审查人**: [待指定]
