# Beta 测试流程指南

本文档描述 Danci 项目的 Beta 测试流程和灰度发布策略。

## 概述

项目已实现完整的 Beta 测试基础设施，包括：

- Feature Flags 特性开关系统
- 灰度发布 (Rollout) 机制
- A/B 测试框架
- 监控告警系统
- 紧急回滚能力

---

## 1. Feature Flags 使用

### 1.1 基础用法

```tsx
import { useFeatureFlag, Feature } from '@/hooks/useRollout';

// Hook 方式
function MyComponent() {
  const { enabled, loading } = useFeatureFlag('new_dashboard');

  if (loading) return <Spinner />;
  if (!enabled) return <OldDashboard />;
  return <NewDashboard />;
}

// 组件方式
function App() {
  return (
    <Feature flag="new_feature" fallback={<OldFeature />}>
      <NewFeature />
    </Feature>
  );
}
```

### 1.2 预定义 Feature Flags

```typescript
// packages/frontend/src/utils/featureFlags.ts

export const FEATURE_FLAGS = {
  // UI 相关
  NEW_DASHBOARD: 'new_dashboard',
  DARK_MODE: 'dark_mode',
  COMPACT_VIEW: 'compact_view',

  // 学习功能
  SPACED_REPETITION_V2: 'spaced_repetition_v2',
  AI_PRONUNCIATION: 'ai_pronunciation',
  ADAPTIVE_DIFFICULTY: 'adaptive_difficulty',
  GAMIFICATION: 'gamification',

  // 性能优化
  LAZY_LOADING: 'lazy_loading',
  VIRTUAL_LIST: 'virtual_list',
  SERVICE_WORKER: 'service_worker',

  // 实验功能
  EXPERIMENT_REVIEW_UI: 'experiment_review_ui',
  EXPERIMENT_LEARNING_PATH: 'experiment_learning_path',
};
```

### 1.3 创建新 Feature Flag

```typescript
import { getFeatureFlagManager } from '@/utils/featureFlags';

const manager = getFeatureFlagManager();

manager.register({
  key: 'my_new_feature',
  name: '我的新功能',
  description: '这是一个新功能的描述',
  status: 'conditional',
  defaultValue: false,
  percentage: 10, // 10% 用户可见
  targetGroups: ['beta_testers'],
});
```

---

## 2. 灰度发布流程

### 2.1 发布阶段

项目采用 5 阶段灰度发布：

| 阶段              | 百分比 | 目标群体      | 持续时间 |
| ----------------- | ------ | ------------- | -------- |
| **canary**        | 1%     | 内部团队      | 24h      |
| **beta**          | 5%     | Beta 测试用户 | 48h      |
| **early_adopter** | 20%    | 活跃用户      | 72h      |
| **general**       | 50%    | 普通用户      | 1 周     |
| **full**          | 100%   | 所有用户      | -        |

### 2.2 配置灰度发布

```typescript
import { getRolloutManager } from '@/config/rollout';

const manager = getRolloutManager();

// 创建灰度发布配置
manager.createRollout({
  id: 'new_learning_ui_rollout',
  featureKey: 'new_learning_ui',
  name: '新学习界面灰度发布',
  currentStage: 'canary',
  stages: [
    {
      stage: 'canary',
      percentage: 1,
      groups: ['internal'],
      healthCheck: {
        errorRateThreshold: 0.01,
        latencyP99Threshold: 1000,
        minSampleSize: 100,
      },
    },
    // ... 其他阶段
  ],
});
```

### 2.3 监控健康状态

```tsx
import { useRolloutHealth } from '@/hooks/useRolloutMonitoring';

function RolloutDashboard() {
  const { report, isHealthy, isDegraded } = useRolloutHealth('new_feature');

  return (
    <div>
      <p>状态: {report.status}</p>
      <p>错误率: {(report.errorRate * 100).toFixed(2)}%</p>
      <p>P99 延迟: {report.latencyP99}ms</p>
      {report.recommendation && <Alert>{report.recommendation}</Alert>}
    </div>
  );
}
```

---

## 3. A/B 测试

### 3.1 创建实验

```typescript
import { getABTestingManager } from '@/utils/abTesting';

const manager = getABTestingManager();

manager.registerExperiment({
  id: 'exp_001',
  key: 'review_ui_experiment',
  name: '复习界面 A/B 测试',
  hypothesis: '新复习界面可以提高用户留存率',
  status: 'running',
  variants: [
    { id: 'control', name: '对照组', weight: 50, isControl: true },
    { id: 'treatment', name: '实验组', weight: 50, isControl: false },
  ],
  metrics: [
    { name: 'retention_rate', type: 'rate', primary: true },
    { name: 'session_duration', type: 'average', primary: false },
  ],
  targetAudience: {
    percentage: 20, // 20% 用户参与实验
  },
});
```

### 3.2 使用实验变体

```tsx
import { useExperiment } from '@/hooks/useRollout';

function ReviewPage() {
  const { variant, isInExperiment, trackConversion } = useExperiment('review_ui_experiment');

  useEffect(() => {
    if (isInExperiment) {
      // 记录转化
      trackConversion();
    }
  }, []);

  if (variant?.id === 'treatment') {
    return <NewReviewUI />;
  }
  return <OldReviewUI />;
}
```

---

## 4. 监控告警

### 4.1 告警规则

```typescript
// packages/backend/src/monitoring/alert-rules.ts

export const ALERT_RULES = [
  {
    id: 'http_latency_p95_p0',
    description: 'HTTP p95 延迟超过 1s',
    severity: 'P0',
    metric: 'http.request.duration.p95',
    threshold: 1.0,
  },
  {
    id: 'error_rate_p0',
    description: '错误率超过 5%',
    severity: 'P0',
    metric: 'http.error.rate',
    threshold: 0.05,
  },
];
```

### 4.2 告警阈值

| 类型             | Warning | Critical | Severe |
| ---------------- | ------- | -------- | ------ |
| **HTTP 延迟**    | 500ms   | 1000ms   | 2000ms |
| **错误率**       | 1%      | 5%       | 10%    |
| **数据库连接池** | 70%     | 85%      | 95%    |

---

## 5. 紧急回滚

### 5.1 触发条件

自动回滚触发条件：

- 错误率 > 5%
- P99 延迟 > 2000ms
- 连续 2 个评估周期不满足健康检查

### 5.2 手动回滚

```typescript
import { getEmergencyManager } from '@/utils/emergency';

const emergency = getEmergencyManager();

// 触发紧急回滚
await emergency.triggerRollback({
  clearCache: true,
  clearLocalStorage: false,
  forceReload: true,
});

// 恢复正常状态
emergency.recover();
```

### 5.3 降级策略

```typescript
// 设置降级级别
emergency.setDegradationLevel('partial');

// 降级级别:
// - none: 正常运行
// - minimal: 禁用非关键功能
// - partial: 禁用大部分高级功能
// - full: 仅保留核心功能
```

---

## 6. Beta 测试检查清单

### 发布前

- [ ] Feature Flag 已创建并配置
- [ ] 灰度发布配置已设置
- [ ] 健康检查阈值已定义
- [ ] 告警规则已配置
- [ ] 回滚脚本已准备

### 发布中

- [ ] 监控 Canary 阶段 24 小时
- [ ] 检查错误率和延迟指标
- [ ] 收集用户反馈
- [ ] 验证功能正常工作

### 发布后

- [ ] 逐步推进到下一阶段
- [ ] 持续监控健康状态
- [ ] 处理用户报告的问题
- [ ] 完成后设置 flag 为 100%

---

## 7. 相关文件

| 文件                            | 描述                |
| ------------------------------- | ------------------- |
| `utils/featureFlags.ts`         | Feature Flag 管理器 |
| `config/rollout.ts`             | 灰度发布配置        |
| `utils/abTesting.ts`            | A/B 测试框架        |
| `utils/rolloutMonitoring.ts`    | 发布监控            |
| `utils/emergency.ts`            | 紧急状态管理        |
| `hooks/useRollout.tsx`          | React Hooks         |
| `hooks/useRolloutMonitoring.ts` | 监控 Hooks          |

---

## 8. 联系方式

如有问题，请联系：

- 技术负责人：[开发团队]
- 紧急情况：查看 `docs/operations/deployment-checklist.md`
