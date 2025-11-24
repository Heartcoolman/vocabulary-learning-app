# 性能优化文档

本文档描述了智能间隔重复学习算法系统的性能优化策略和实现细节。

## 优化概览

### 1. 数据库索引优化

#### AnswerRecord 表索引
- `answer_records_user_timestamp_idx`: 用户ID + 时间戳（降序），优化查询用户最近答题记录
- `answer_records_word_timestamp_idx`: 单词ID + 时间戳（降序），优化查询单词答题历史
- `answer_records_session_timestamp_idx`: 会话ID + 时间戳（降序），优化查询会话答题记录
- `answer_records_user_correct_idx`: 用户ID + 是否正确，优化统计正确率

#### WordLearningState 表索引
- `word_learning_states_user_next_review_idx`: 用户ID + 下次复习时间，优化查询需要复习的单词
- `word_learning_states_user_state_idx`: 用户ID + 单词状态，优化按状态查询
- `word_learning_states_user_mastery_idx`: 用户ID + 掌握程度，优化按掌握程度查询

#### WordScore 表索引
- `word_scores_user_score_idx`: 用户ID + 总分（降序），优化按得分排序查询
- `word_scores_user_low_score_idx`: 用户ID + 总分（部分索引，< 40），优化查询低分单词
- `word_scores_user_high_score_idx`: 用户ID + 总分（部分索引，> 80），优化查询高分单词

#### AlgorithmConfig 表索引
- `algorithm_configs_default_idx`: 默认配置标记（部分索引），快速查找默认配置

#### ConfigHistory 表索引
- `config_history_timestamp_idx`: 时间戳（降序），优化按时间查询配置历史

#### Session 表索引
- `sessions_expires_idx`: 过期时间，优化清理过期会话

#### Word 表索引
- `words_spelling_idx`: 单词拼写，优化按拼写搜索
- `words_wordbook_created_idx`: 词书ID + 创建时间（降序），优化词书单词查询

### 2. 缓存策略

#### 缓存服务 (CacheService)
- **实现**: 内存缓存，支持TTL（生存时间）
- **清理机制**: 每分钟自动清理过期缓存
- **模式匹配**: 支持通配符删除缓存

#### 缓存层级

##### 算法配置缓存
- **TTL**: 1小时
- **键**: `algorithm_config:{configId}`, `algorithm_config:default`
- **用途**: 缓存算法配置参数，减少数据库查询
- **失效**: 配置更新时自动失效

##### 用户学习状态缓存
- **TTL**: 5分钟
- **键**: `learning_state:{userId}:{wordId}`, `learning_states:{userId}`, `due_words:{userId}`
- **用途**: 缓存单词学习状态，支持批量查询
- **失效**: 状态更新时自动失效

##### 单词得分缓存
- **TTL**: 10分钟
- **键**: `word_score:{userId}:{wordId}`, `word_scores:{userId}`
- **用途**: 缓存单词综合得分，支持批量查询
- **失效**: 得分更新时自动失效

##### 用户统计缓存
- **TTL**: 5分钟
- **键**: `user_stats:{userId}`
- **用途**: 缓存用户学习统计数据
- **失效**: 学习状态变化时自动失效

### 3. 批量操作优化

#### 批量查询
- **WordStateService.batchGetWordStates**: 批量获取单词学习状态
- **WordScoreService.batchGetWordScores**: 批量获取单词得分
- **优势**: 减少数据库往返次数，提高查询效率

#### 批量更新
- **WordStateService.batchUpdateWordStates**: 批量更新单词学习状态
- **WordScoreService.batchUpdateWordScores**: 批量更新单词得分
- **实现**: 使用Prisma事务批量执行

#### 批量统计
- **使用 groupBy**: 一次查询获取多个单词的统计数据
- **示例**: 答题记录按单词分组统计正确率

### 4. 查询优化

#### 复合索引
- 使用复合索引优化多条件查询
- 索引顺序遵循查询模式（等值查询 → 范围查询 → 排序）

#### 部分索引
- 低分单词索引：只索引得分 < 40 的记录
- 高分单词索引：只索引得分 > 80 的记录
- 默认配置索引：只索引 isDefault = true 的记录

#### 选择性查询
- 只查询需要的字段，避免查询整个表
- 使用 `select` 指定返回字段

## 性能指标

### 目标性能
- 优先级队列生成时间：< 100ms（1000个单词）
- 单词得分计算时间：< 10ms（单个单词）
- 学习状态更新时间：< 50ms（单次更新）
- 统计数据查询时间：< 200ms（单个用户）

### 缓存命中率
- 算法配置：> 95%（配置很少变化）
- 学习状态：> 80%（5分钟内重复查询）
- 单词得分：> 85%（10分钟内重复查询）

## 使用示例

### 1. 使用缓存服务

```typescript
import { cacheService, CacheKeys, CacheTTL } from './services/cache.service';

// 设置缓存
cacheService.set('my-key', data, 300); // 5分钟

// 获取缓存
const cached = cacheService.get('my-key');

// 删除缓存
cacheService.delete('my-key');

// 删除模式匹配的缓存
cacheService.deletePattern('user:*');
```

### 2. 使用批量查询

```typescript
import { wordStateService } from './services/word-state.service';
import { wordScoreService } from './services/word-score.service';

// 批量获取单词学习状态
const wordIds = ['word1', 'word2', 'word3'];
const statesMap = await wordStateService.batchGetWordStates(userId, wordIds);

// 批量获取单词得分
const scoresMap = await wordScoreService.batchGetWordScores(userId, wordIds);
```

### 3. 使用批量更新

```typescript
// 批量更新单词学习状态
await wordStateService.batchUpdateWordStates(userId, [
  { wordId: 'word1', data: { masteryLevel: 2 } },
  { wordId: 'word2', data: { masteryLevel: 3 } },
]);

// 批量更新单词得分
await wordScoreService.batchUpdateWordScores(userId, [
  { wordId: 'word1', data: { totalScore: 75 } },
  { wordId: 'word2', data: { totalScore: 85 } },
]);
```

## 监控和调优

### 缓存监控

```typescript
// 获取缓存统计
const stats = cacheService.getStats();
console.log(`缓存大小: ${stats.size}`);
console.log(`缓存键: ${stats.keys.join(', ')}`);
```

### 数据库查询监控

使用Prisma的查询日志功能：

```typescript
// 在 prisma/schema.prisma 中启用日志
generator client {
  provider = "prisma-client-js"
  log      = ["query", "info", "warn", "error"]
}
```

### 性能分析

1. **慢查询分析**: 使用PostgreSQL的 `pg_stat_statements` 扩展
2. **索引使用分析**: 使用 `EXPLAIN ANALYZE` 查看查询计划
3. **缓存命中率**: 记录缓存命中和未命中次数

## 最佳实践

### 1. 缓存使用
- ✅ 缓存频繁读取、很少变化的数据
- ✅ 设置合理的TTL，避免缓存过期数据
- ✅ 数据更新时及时清除相关缓存
- ❌ 不要缓存实时性要求高的数据
- ❌ 不要缓存大量数据导致内存溢出

### 2. 批量操作
- ✅ 使用批量查询减少数据库往返
- ✅ 使用事务保证批量更新的原子性
- ✅ 合理控制批量大小（建议 < 1000）
- ❌ 不要在循环中执行单个查询

### 3. 索引使用
- ✅ 为常用查询条件创建索引
- ✅ 使用复合索引优化多条件查询
- ✅ 使用部分索引减少索引大小
- ❌ 不要创建过多索引影响写入性能
- ❌ 不要在低基数列上创建索引

### 4. 查询优化
- ✅ 只查询需要的字段
- ✅ 使用分页避免一次查询大量数据
- ✅ 使用 `groupBy` 代替多次查询
- ❌ 避免 N+1 查询问题
- ❌ 避免在循环中执行数据库查询

## 故障排查

### 缓存问题
- **症状**: 数据不一致
- **原因**: 缓存未及时失效
- **解决**: 检查缓存失效逻辑，确保数据更新时清除缓存

### 性能问题
- **症状**: 查询缓慢
- **原因**: 缺少索引或索引未生效
- **解决**: 使用 `EXPLAIN ANALYZE` 分析查询计划，添加必要索引

### 内存问题
- **症状**: 内存占用过高
- **原因**: 缓存数据过多
- **解决**: 减少缓存TTL，清理不必要的缓存

## 未来优化方向

1. **Redis缓存**: 使用Redis替代内存缓存，支持分布式部署
2. **查询结果缓存**: 缓存复杂查询的结果
3. **数据预加载**: 预加载用户常用数据
4. **读写分离**: 使用主从复制分离读写操作
5. **分库分表**: 当数据量增长时考虑分库分表

## 参考资料

- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL Indexing](https://www.postgresql.org/docs/current/indexes.html)
- [Caching Strategies](https://aws.amazon.com/caching/best-practices/)
