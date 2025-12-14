# 服务集成测试文档

## 概述

本目录包含 `learning-state.service.ts` 和 `user-profile.service.ts` 的完整集成测试。

## 测试统计

### LearningStateService 集成测试

- **测试用例总数**: 37 个
- **测试分类**:
  - 单词状态完整生命周期: 4 个测试
  - 批量操作: 4 个测试
  - 缓存一致性: 4 个测试
  - 事件发布验证: 3 个测试
  - 并发场景: 3 个测试
  - 得分管理: 3 个测试
  - 掌握度评估: 3 个测试
  - 复习轨迹: 3 个测试
  - 统计数据: 3 个测试
  - 错误处理: 4 个测试
  - 性能测试: 3 个测试

### UserProfileService 集成测试

- **测试用例总数**: 37 个
- **测试分类**:
  - 完整用户画像获取: 5 个测试
  - 用户基础信息管理: 7 个测试
  - 学习习惯画像: 6 个测试
  - 认知画像: 3 个测试
  - 学习档案管理: 6 个测试
  - 多服务数据合并: 3 个测试
  - 并发场景: 3 个测试
  - 错误处理: 4 个测试
  - 用户删除: 1 个测试
  - 性能测试: 4 个测试
  - 时间事件记录: 2 个测试
  - 事件总线集成: 3 个测试

**总计**: 74 个集成测试用例

## 测试环境要求

### 1. 测试数据库设置

集成测试需要一个独立的PostgreSQL测试数据库。

#### 使用 Docker 快速启动测试数据库

```bash
# 启动测试数据库
docker run -d \
  --name danci-test-db \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=vocabulary_test \
  -p 5433:5432 \
  postgres:14
```

#### 手动配置测试数据库

1. 创建测试数据库：

```sql
CREATE DATABASE vocabulary_test;
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE vocabulary_test TO test_user;
```

2. 运行数据库迁移：

```bash
cd packages/backend
DATABASE_URL="postgresql://test_user:test_password@localhost:5433/vocabulary_test" npx prisma migrate deploy
```

### 2. 环境变量配置

在 `packages/backend/.env.test` 文件中配置：

```bash
TEST_DATABASE_URL=postgresql://test_user:test_password@localhost:5433/vocabulary_test
NODE_ENV=test
```

### 3. 依赖安装

```bash
cd packages/backend
npm install
```

## 运行测试

### 运行所有服务集成测试

```bash
cd packages/backend
npm test -- tests/integration/services
```

### 运行特定服务的测试

```bash
# LearningStateService 测试
npm test -- tests/integration/services/learning-state.service.integration.test.ts

# UserProfileService 测试
npm test -- tests/integration/services/user-profile.service.integration.test.ts
```

### 运行测试并查看详细输出

```bash
npm test -- tests/integration/services --reporter=verbose
```

### 运行测试并生成覆盖率报告

```bash
npm test -- tests/integration/services --coverage
```

## 测试特性

### 1. 真实数据库操作

- 使用真实的 Prisma 客户端
- 完整的 CRUD 操作测试
- 事务和并发测试

### 2. 服务间协作

- 测试多个服务之间的数据流
- 验证服务边界和职责分离
- 确保数据一致性

### 3. 事件总线集成

- 验证事件发布和订阅
- 测试异步事件处理
- 确保事件载荷正确性

### 4. 缓存行为验证

- 测试缓存命中和未命中
- 验证缓存失效策略
- 测试缓存一致性

### 5. 并发场景测试

- 并发读写操作
- 竞态条件处理
- 批量操作并发执行

### 6. 事务处理

- 事务成功提交
- 事务回滚测试
- 嵌套事务处理

### 7. 错误恢复

- 数据库连接错误
- 无效输入处理
- 边界条件测试

### 8. 性能基准

- 批量操作性能（< 1秒处理50+单词）
- 缓存优化效果（第二次访问更快）
- 并发请求处理（< 2秒处理多个请求）

## 测试覆盖的场景

### LearningStateService

#### 单词状态生命周期

```typescript
NEW → LEARNING → REVIEWING → MASTERED
```

#### 批量操作

- 批量获取单词状态（50+ 单词 < 1秒）
- 批量更新（事务保证原子性）
- 批量事件发布

#### 缓存策略

- 单词状态缓存（TTL: 300秒）
- 得分缓存（TTL: 300秒）
- 空值缓存（TTL: 60秒）
- 用户统计缓存（TTL: 600秒）

#### 事件发布

- `WORD_MASTERED`: 单词达到掌握状态
- `FORGETTING_RISK_HIGH`: 遗忘风险警告
- 防止重复事件发布

#### 掌握度评估

- ACT-R 记忆模型集成
- 提取概率计算
- 最佳复习间隔预测

### UserProfileService

#### 完整用户画像

```typescript
UserProfile {
  user: 基础信息
  habitProfile: 学习习惯画像
  cognitiveProfile: {
    chronotype: 时间节律画像
    learningStyle: 学习风格画像
  }
  learningProfile: 学习档案
}
```

#### 习惯画像更新

- 时间偏好识别（24小时直方图）
- 节奏偏好分析（会话时长、批次大小）
- 从历史数据初始化

#### 认知画像

- 时间节律分析（需要≥50条记录）
- 学习风格识别（需要≥30条记录）
- 缓存优化（避免重复计算）

#### 学习档案

- Theta 参数（IRT 模型）
- 注意力、疲劳、动机状态
- 情绪基线和当前情绪
- 心流分数和基线
- 遗忘曲线参数

## 测试数据清理

每个测试用例执行后会自动清理：

- 用户数据
- 单词和词书
- 学习状态和得分
- 答题记录
- 复习轨迹
- 习惯画像
- 学习档案
- 缓存数据

## 性能基准

### LearningStateService

- 单词状态获取: < 100ms
- 批量获取 (50 单词): < 1000ms
- 批量更新 (50 单词): < 2000ms
- 缓存命中率: > 80%

### UserProfileService

- 完整画像获取: < 1000ms
- 习惯画像更新: < 500ms
- 学习档案更新: < 300ms
- 并发更新 (3 个): < 2000ms

## 故障排查

### 数据库连接失败

```
Error: Can't reach database server at localhost:5433
```

**解决方案**:

1. 确认测试数据库正在运行
2. 检查 `TEST_DATABASE_URL` 环境变量
3. 验证数据库凭据

### 测试超时

```
Error: Test timeout of 5000ms exceeded
```

**解决方案**:

1. 检查数据库性能
2. 增加测试超时时间（在测试文件中）
3. 优化测试数据量

### 事务冲突

```
Error: Transaction already started
```

**解决方案**:

1. 确保测试之间正确清理
2. 检查 `afterEach` 钩子
3. 避免嵌套事务

### 缓存不一致

```
Error: Expected cached value to match database
```

**解决方案**:

1. 清理缓存：`cacheService.clear()`
2. 检查缓存 TTL 配置
3. 验证缓存失效逻辑

## 扩展测试

### 添加新测试用例

```typescript
it('should handle new scenario', async () => {
  // 1. Arrange - 准备测试数据
  const wordId = testWords[0].id;

  // 2. Act - 执行操作
  const result = await learningStateService.someMethod(testUser.id, wordId);

  // 3. Assert - 验证结果
  expect(result).toBeDefined();
});
```

### 测试最佳实践

1. **独立性**: 每个测试应该独立运行
2. **清理**: 使用 `afterEach` 清理测试数据
3. **命名**: 使用描述性的测试名称
4. **断言**: 每个测试应该有明确的断言
5. **性能**: 避免不必要的数据库查询

## 持续集成

### GitHub Actions 配置

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: vocabulary_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5433/vocabulary_test

      - name: Run integration tests
        run: npm test -- tests/integration/services
        env:
          TEST_DATABASE_URL: postgresql://test_user:test_password@localhost:5433/vocabulary_test
```

## 相关文档

- [LearningStateService 实现](../../../src/services/learning-state.service.ts)
- [UserProfileService 实现](../../../src/services/user-profile.service.ts)
- [测试工厂](../../helpers/factories.ts)
- [测试设置](../../setup.ts)

## 维护和更新

当服务接口或行为发生变化时：

1. 更新对应的测试用例
2. 确保所有测试通过
3. 更新本文档
4. 提交代码审查

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。
