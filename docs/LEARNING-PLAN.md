# 学习计划系统文档

## 概述

学习计划系统是 AMAS 智能学习算法的增强功能，帮助用户制定个性化的学习目标和进度安排。

## 功能特点

- **智能目标设定**：根据用户能力和词书规模自动推荐每日目标
- **多词书分配**：支持多个词书按优先级和比例分配学习任务
- **周里程碑**：设置每周学习目标，追踪长期进度
- **预计完成时间**：基于当前进度预测学习完成日期

## 数据模型

```prisma
model LearningPlan {
  id                      String   @id @default(uuid())
  userId                  String   @unique
  dailyTarget             Int                        // 每日目标单词数
  totalWords              Int      @default(0)       // 总单词数
  estimatedCompletionDate DateTime                   // 预计完成日期
  wordbookDistribution    Json                       // 词书分配
  weeklyMilestones        Json                       // 周里程碑
  isActive                Boolean  @default(true)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  user                    User     @relation(...)

  @@map("learning_plans")
}
```

## 数据结构

### 词书分配 (wordbookDistribution)

```typescript
interface WordbookDistribution {
  wordbookId: string;      // 词书 ID
  percentage: number;      // 分配比例 (0-100)
  priority: number;        // 优先级 (1 最高)
}[]
```

**示例：**
```json
[
  { "wordbookId": "uuid-1", "percentage": 60, "priority": 1 },
  { "wordbookId": "uuid-2", "percentage": 40, "priority": 2 }
]
```

### 周里程碑 (weeklyMilestones)

```typescript
interface WeeklyMilestone {
  week: number;            // 第几周
  target: number;          // 累计目标单词数
  description: string;     // 里程碑描述
}[]
```

**示例：**
```json
[
  { "week": 1, "target": 140, "description": "完成第一周学习" },
  { "week": 4, "target": 560, "description": "掌握基础词汇" },
  { "week": 8, "target": 1120, "description": "中期目标达成" },
  { "week": 12, "target": 1680, "description": "高级词汇突破" }
]
```

## API 端点

### 获取学习计划

```
GET /api/plan
```

**响应：**
```json
{
  "plan": {
    "id": "uuid",
    "dailyTarget": 20,
    "totalWords": 1500,
    "estimatedCompletionDate": "2024-06-01T00:00:00Z",
    "wordbookDistribution": [...],
    "weeklyMilestones": [...],
    "isActive": true
  },
  "progress": {
    "wordsLearned": 450,
    "daysCompleted": 25,
    "currentStreak": 7,
    "completionPercentage": 30
  }
}
```

### 创建/更新学习计划

```
POST /api/plan
```

**请求体：**
```json
{
  "dailyTarget": 20,
  "wordbookIds": ["uuid-1", "uuid-2"],
  "distribution": [
    { "wordbookId": "uuid-1", "percentage": 60, "priority": 1 },
    { "wordbookId": "uuid-2", "percentage": 40, "priority": 2 }
  ]
}
```

### 获取今日任务

```
GET /api/plan/today
```

**响应：**
```json
{
  "date": "2024-01-15",
  "target": 20,
  "completed": 8,
  "remaining": 12,
  "wordsByBook": [
    { "wordbookId": "uuid-1", "wordbookName": "CET-4", "count": 12, "completed": 5 },
    { "wordbookId": "uuid-2", "wordbookName": "日常英语", "count": 8, "completed": 3 }
  ]
}
```

### 获取进度报告

```
GET /api/plan/progress?period=week
```

**响应：**
```json
{
  "period": "week",
  "startDate": "2024-01-08",
  "endDate": "2024-01-14",
  "dailyProgress": [
    { "date": "2024-01-08", "target": 20, "actual": 22, "accuracy": 0.85 },
    { "date": "2024-01-09", "target": 20, "actual": 18, "accuracy": 0.90 }
  ],
  "summary": {
    "totalTarget": 140,
    "totalActual": 125,
    "averageAccuracy": 0.87,
    "streakDays": 5
  }
}
```

## 智能推荐算法

### 每日目标推荐

基于以下因素计算推荐的每日学习量：

1. **词书总量**：总单词数 / 预期天数
2. **用户能力**：根据历史正确率调整
3. **学习习惯**：参考用户平均每日学习量
4. **认知状态**：AMAS 疲劳度和注意力指标

```typescript
function recommendDailyTarget(user: User, wordbooks: Wordbook[]): number {
  const totalWords = wordbooks.reduce((sum, wb) => sum + wb.wordCount, 0);
  const baseDays = 90; // 默认 90 天完成
  const baseTarget = Math.ceil(totalWords / baseDays);

  // 根据用户能力调整
  const abilityFactor = user.cognitiveProfile.mem * 0.5 + 0.5;

  // 限制在合理范围内
  return Math.max(10, Math.min(50, Math.round(baseTarget * abilityFactor)));
}
```

### 预计完成日期计算

```typescript
function estimateCompletionDate(
  totalWords: number,
  dailyTarget: number,
  wordsLearned: number
): Date {
  const remainingWords = totalWords - wordsLearned;
  const remainingDays = Math.ceil(remainingWords / dailyTarget);

  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + remainingDays);

  return completionDate;
}
```

## 前端集成

### 学习计划页面

```tsx
import { LearningPlan } from '@/components/LearningPlan';

<LearningPlan
  plan={userPlan}
  progress={progressData}
  onUpdateTarget={(newTarget) => updatePlan({ dailyTarget: newTarget })}
/>
```

### 进度环组件

```tsx
import { ProgressRing } from '@/components/ProgressRing';

<ProgressRing
  value={progress.completionPercentage}
  max={100}
  size={120}
  label="总进度"
/>
```

## 通知提醒

系统会在以下时机发送提醒：

1. **每日学习提醒**：在用户常用学习时段推送
2. **里程碑达成**：完成周目标时庆祝通知
3. **连续学习中断**：连续学习即将中断时提醒
4. **进度落后**：实际进度低于计划进度时提醒

## 相关文档

- [AMAS 算法指南](./AMAS-algorithm-guide.md)
- [徽章系统](./BADGE-SYSTEM.md)
- [用户使用指南](./USER_GUIDE.md)
