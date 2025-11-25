# 徽章系统文档

## 概述

徽章系统是 AMAS 智能学习算法的增强功能之一，旨在通过成就激励机制提升用户学习动力和参与度。

## 徽章类别

系统定义了四大类徽章：

### 1. 连续学习徽章 (STREAK)

| 徽章名称 | 等级 | 解锁条件 | 图标 |
|---------|------|---------|------|
| 初学者 | 1 | 连续学习 3 天 | `/badges/streak-3.svg` |
| 坚持者 | 2 | 连续学习 7 天 | `/badges/streak-7.svg` |
| 习惯养成 | 3 | 连续学习 14 天 | `/badges/streak-14.svg` |
| 学习达人 | 4 | 连续学习 30 天 | `/badges/streak-30.svg` |
| 学习大师 | 5 | 连续学习 100 天 | `/badges/streak-100.svg` |

### 2. 正确率徽章 (ACCURACY)

| 徽章名称 | 等级 | 解锁条件 | 图标 |
|---------|------|---------|------|
| 准确新手 | 1 | 单次学习正确率 ≥ 70% | `/badges/accuracy-70.svg` |
| 准确能手 | 2 | 单次学习正确率 ≥ 80% | `/badges/accuracy-80.svg` |
| 准确高手 | 3 | 单次学习正确率 ≥ 90% | `/badges/accuracy-90.svg` |
| 准确大师 | 4 | 单次学习正确率 ≥ 95% | `/badges/accuracy-95.svg` |
| 完美学习 | 5 | 单次学习正确率 100%（≥10词） | `/badges/accuracy-100.svg` |

### 3. 认知提升徽章 (COGNITIVE)

| 徽章名称 | 等级 | 解锁条件 | 图标 |
|---------|------|---------|------|
| 记忆力提升 | 1 | 记忆力指标提升 10% | `/badges/cognitive-memory.svg` |
| 反应加速 | 2 | 反应速度指标提升 10% | `/badges/cognitive-speed.svg` |
| 稳定进步 | 3 | 稳定性指标提升 10% | `/badges/cognitive-stability.svg` |
| 全面提升 | 4 | 所有认知指标提升 5% | `/badges/cognitive-all.svg` |
| 认知大师 | 5 | 所有认知指标提升 15% | `/badges/cognitive-master.svg` |

### 4. 里程碑徽章 (MILESTONE)

| 徽章名称 | 等级 | 解锁条件 | 图标 |
|---------|------|---------|------|
| 词汇起步 | 1 | 累计学习 50 个单词 | `/badges/milestone-50.svg` |
| 词汇积累 | 2 | 累计学习 100 个单词 | `/badges/milestone-100.svg` |
| 词汇丰富 | 3 | 累计学习 500 个单词 | `/badges/milestone-500.svg` |
| 词汇达人 | 4 | 累计学习 1000 个单词 | `/badges/milestone-1000.svg` |
| 词汇大师 | 5 | 累计学习 5000 个单词 | `/badges/milestone-5000.svg` |
| 学习新手 | 1 | 完成 10 次学习会话 | `/badges/sessions-10.svg` |
| 学习常客 | 2 | 完成 50 次学习会话 | `/badges/sessions-50.svg` |
| 学习专家 | 3 | 完成 100 次学习会话 | `/badges/sessions-100.svg` |

## 数据模型

### BadgeDefinition（徽章定义）

```prisma
model BadgeDefinition {
  id          String        @id @default(uuid())
  name        String                              // 徽章名称
  description String                              // 徽章描述
  iconUrl     String                              // 图标 URL
  category    BadgeCategory                       // 徽章类别
  tier        Int           @default(1)           // 徽章等级 1-5
  condition   Json                                // 解锁条件
  createdAt   DateTime      @default(now())
  userBadges  UserBadge[]

  @@unique([name, tier])
}
```

### UserBadge（用户徽章）

```prisma
model UserBadge {
  id         String          @id @default(uuid())
  userId     String
  badgeId    String
  tier       Int             @default(1)
  unlockedAt DateTime        @default(now())
  user       User            @relation(...)
  badge      BadgeDefinition @relation(...)

  @@unique([userId, badgeId, tier])
  @@index([userId])
  @@index([badgeId])
}
```

### 解锁条件格式

```typescript
interface BadgeCondition {
  type: 'streak' | 'accuracy' | 'words_learned' | 'cognitive_improvement' | 'total_sessions';
  value: number;
  params?: {
    metric?: 'memory' | 'speed' | 'stability' | 'all';
    minWords?: number;
  };
}
```

## API 端点

### 获取徽章定义列表

```
GET /api/badges
```

**响应：**
```json
{
  "badges": [
    {
      "id": "uuid",
      "name": "初学者",
      "description": "连续学习3天",
      "iconUrl": "/badges/streak-3.svg",
      "category": "STREAK",
      "tier": 1,
      "condition": { "type": "streak", "value": 3 }
    }
  ]
}
```

### 获取用户徽章

```
GET /api/badges/user
```

**响应：**
```json
{
  "badges": [
    {
      "id": "uuid",
      "badge": { ... },
      "tier": 1,
      "unlockedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "stats": {
    "total": 5,
    "byCategory": {
      "STREAK": 2,
      "ACCURACY": 1,
      "COGNITIVE": 0,
      "MILESTONE": 2
    }
  }
}
```

### 检查并解锁徽章

```
POST /api/badges/check
```

该端点在学习会话结束时自动调用，检查用户是否满足新徽章的解锁条件。

## 前端集成

### 徽章展示组件

```tsx
import { Badge } from '@/components/Badge';

<Badge
  name="初学者"
  iconUrl="/badges/streak-3.svg"
  tier={1}
  unlocked={true}
  unlockedAt={new Date()}
/>
```

### 徽章解锁动画

当用户解锁新徽章时，前端会显示庆祝动画：

```tsx
import { BadgeCelebration } from '@/components/BadgeCelebration';

<BadgeCelebration
  badge={unlockedBadge}
  onClose={() => setShowCelebration(false)}
/>
```

## 业务逻辑

### 徽章检查时机

1. **学习会话结束时**：检查正确率、单词数等即时指标
2. **每日首次登录**：检查连续学习天数
3. **定时任务**：每日凌晨检查认知指标变化

### 徽章解锁规则

- 每个徽章的每个等级只能解锁一次
- 高等级徽章不要求先解锁低等级
- 解锁记录不可撤销

## 种子数据

运行数据库种子会自动创建所有徽章定义：

```bash
npx prisma db seed
```

## 相关文档

- [AMAS 算法指南](./AMAS-algorithm-guide.md)
- [学习计划系统](./LEARNING-PLAN.md)
- [用户使用指南](./USER_GUIDE.md)
