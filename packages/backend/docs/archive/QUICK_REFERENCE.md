# 数据迁移快速参考

## 🚀 快速开始（3步完成迁移）

```bash
# 1️⃣ 预览（不修改数据）
npm run migrate:user-profiles

# 2️⃣ 执行迁移
npm run migrate:user-profiles:execute

# 3️⃣ 验证结果
npm run verify:profile-consistency
```

---

## 📋 所有可用命令

### 完整版迁移（推荐）

```bash
# 预览模式
npm run migrate:user-profiles

# 执行迁移
npm run migrate:user-profiles:execute

# 仅验证
npm run migrate:user-profiles:verify

# 回滚
npm run migrate:user-profiles:rollback
```

### 一致性校验

```bash
# 默认检查（100样本）
npm run verify:profile-consistency

# 自定义样本
npm run verify:profile-consistency -- --sample=200

# 导出报告
npm run verify:profile-consistency:export
```

### 基础版迁移（仅AmasUserState）

```bash
npm run migrate:user-learning-profile
npm run migrate:user-learning-profile:execute
npm run migrate:user-learning-profile:verify
npm run migrate:user-learning-profile:rollback
```

---

## ⚠️ 重要提醒

### 迁移前必做

- [ ] **备份数据库**

  ```bash
  pg_dump -U username -d danci_db -f backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **检查数据库连接**

  ```bash
  # 确保 .env 配置正确
  DATABASE_URL="postgresql://..."
  ```

- [ ] **运行预览模式**
  ```bash
  npm run migrate:user-profiles
  ```

### 迁移后必做

- [ ] **运行验证**

  ```bash
  npm run migrate:user-profiles:verify
  npm run verify:profile-consistency
  ```

- [ ] **检查日志输出**
      查看是否有错误或警告

- [ ] **抽查数据**
      在数据库中随机检查几个用户的数据

---

## 🔍 问题诊断

### 迁移覆盖率低于100%？

```bash
# 1. 查看错误详情
npm run migrate:user-profiles

# 2. 修复数据问题
# SQL 查询异常数据...

# 3. 重新运行迁移
npm run migrate:user-profiles:execute
```

### 数据不一致？

```bash
# 1. 运行一致性校验
npm run verify:profile-consistency:export

# 2. 查看详细报告
cat consistency-report.json

# 3. 重新迁移以同步
npm run migrate:user-profiles:execute
```

### 习惯信息未合并？

```bash
# 直接重新运行即可自动合并
npm run migrate:user-profiles:execute
```

---

## 📊 数据映射

### AmasUserState → UserLearningProfile

| 源                 | 目标              | 逻辑           |
| ------------------ | ----------------- | -------------- |
| `attention`        | `attention`       | 直接           |
| `fatigue`          | `fatigue`         | 直接           |
| `motivation`       | `motivation`      | 直接           |
| `cognitiveProfile` | `theta`           | 平均值         |
| `confidence`       | `thetaVariance`   | 1 - confidence |
| `trendState`       | `emotionBaseline` | JSON解析       |
| -                  | `flowScore`       | 计算           |

### HabitProfile → UserLearningProfile

| 源           | 目标                                       |
| ------------ | ------------------------------------------ |
| `timePref`   | `forgettingParams.habits.timePreference`   |
| `rhythmPref` | `forgettingParams.habits.rhythmPreference` |

---

## 💡 最佳实践

### ✅ DO

- ✅ 先在测试环境运行
- ✅ 始终备份数据库
- ✅ 使用预览模式查看数据
- ✅ 迁移后运行验证
- ✅ 保留备份至少一周

### ❌ DON'T

- ❌ 不要跳过备份
- ❌ 不要并发运行多次迁移
- ❌ 不要在生产环境直接测试
- ❌ 不要忽略错误日志

---

## 🆘 紧急回滚

### 方法1：使用内置回滚（同一会话）

```bash
npm run migrate:user-profiles:rollback
```

### 方法2：从备份恢复

```bash
# 停止应用
# 恢复数据库
psql -U username -d danci_db < backup_file.sql
# 重启应用
```

### 方法3：手动删除（谨慎！）

```sql
-- 仅删除今天迁移的数据
DELETE FROM user_learning_profiles
WHERE created_at > '2025-12-12 00:00:00'
  AND created_at < '2025-12-13 00:00:00';
```

---

## 📈 性能参考

| 数据量       | 预计时间  |
| ------------ | --------- |
| 100 users    | ~5-10秒   |
| 1,000 users  | ~30-60秒  |
| 10,000 users | ~5-10分钟 |

---

## 📚 详细文档

- [完整使用文档](./MIGRATION_USAGE.md) - 详细的迁移指南
- [脚本说明](./README.md) - 脚本功能说明
- [Prisma Schema](../prisma/schema.prisma) - 数据模型定义

---

## 🔗 相关命令

```bash
# Prisma 相关
npm run prisma:migrate      # 运行数据库迁移
npm run prisma:generate     # 生成 Prisma Client
npm run prisma:studio       # 打开数据库管理界面

# 其他脚本
npm run fix:next-review-date:execute  # 修复复习日期
```

---

**提示**: 如有疑问，查看 [MIGRATION_USAGE.md](./MIGRATION_USAGE.md) 获取详细说明。
