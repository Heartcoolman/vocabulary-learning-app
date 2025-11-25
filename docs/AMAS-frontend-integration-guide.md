# AMAS 前端集成指南

## 概述

AMAS (Adaptive Multi-dimensional Aware System) 是一个自适应多维度用户感知智能学习算法系统。本文档说明如何将AMAS集成到前端学习流程中。

## 已完成的工作

### 1. 类型定义 ✅
**文件**: `src/types/amas.ts`

包含以下类型：
- `UserState` - 用户学习状态（注意力、疲劳度、记忆力等）
- `LearningStrategy` - 学习策略参数
- `LearningEventInput` - 学习事件输入
- `AmasProcessResult` - AMAS处理结果
- `ColdStartPhaseInfo` - 冷启动阶段信息

### 2. API客户端 ✅
**文件**: `src/services/ApiClient.ts`

新增API方法：
- `processLearningEvent(eventData)` - 处理学习事件并获取策略
- `getAmasState()` - 获取用户当前状态
- `getAmasStrategy()` - 获取当前学习策略
- `resetAmasState()` - 重置AMAS状态
- `getAmasColdStartPhase()` - 获取冷启动阶段
- `batchProcessEvents(events)` - 批量处理历史事件

### 3. React组件 ✅

#### AmasStatus 组件
**文件**: `src/components/AmasStatus.tsx`

**用途**: 显示用户当前学习状态监控面板

**Props**:
- `detailed?: boolean` - 是否显示详细信息（默认false）

**功能**:
- 显示注意力、疲劳度、记忆力、反应速度等核心指标
- 用进度条可视化展示各项指标
- 显示冷启动阶段（分类阶段、探索阶段、正常运行）
- 根据状态值自动调整颜色（绿色/黄色/红色）

#### AmasSuggestion 组件
**文件**: `src/components/AmasSuggestion.tsx`

**用途**: 显示AI学习建议和休息提示

**Props**:
- `result: AmasProcessResult | null` - AMAS处理结果
- `onBreak?: () => void` - 点击休息按钮的回调

**功能**:
- 显示AMAS的策略调整说明
- 显示当前策略参数（批量大小、难度、新词比例、提示级别）
- 疲劳检测时显示休息建议
- 提供休息按钮供用户确认

## 集成步骤

### 第一步：导入组件

```typescript
import { AmasStatus, AmasSuggestion } from '../components';
import { AmasProcessResult } from '../types/amas';
import ApiClient from '../services/ApiClient';
```

### 第二步：添加状态管理

在学习页面组件中添加状态：

```typescript
const [amasResult, setAmasResult] = useState<AmasProcessResult | null>(null);
const [showBreakDialog, setShowBreakDialog] = useState(false);
```

### 第三步：在UI中添加组件

在学习页面的合适位置添加AMAS组件：

```tsx
{/* 顶部显示学习状态监控 */}
<AmasStatus detailed={false} />

{/* 答题后显示AI建议 */}
{amasResult && (
  <AmasSuggestion
    result={amasResult}
    onBreak={() => {
      setShowBreakDialog(true);
      // 可选：暂停学习、显示休息对话框等
    }}
  />
)}
```

### 第四步：在答题流程中调用AMAS

在用户答题后调用AMAS处理事件：

```typescript
const handleAnswer = async (selectedAnswer: string, isCorrect: boolean) => {
  const responseTime = Date.now() - questionStartTime;

  try {
    // 1. 提交答题记录到后端
    await ApiClient.submitAnswer({
      wordId: currentWord.id,
      selectedAnswer,
      isCorrect,
      responseTime,
      // ... 其他字段
    });

    // 2. 调用AMAS处理学习事件
    const result = await ApiClient.processLearningEvent({
      wordId: currentWord.id,
      isCorrect,
      responseTime,
      pauseCount: pauseCountRef.current,
      retryCount: retryCountRef.current,
      // ... 其他可选字段
    });

    // 3. 更新AMAS结果
    setAmasResult(result);

    // 4. 根据AMAS建议调整学习策略
    if (result.strategy) {
      // 可选：使用新策略调整下一批单词的难度、数量等
      applyLearningStrategy(result.strategy);
    }

    // 5. 处理休息建议
    if (result.shouldBreak) {
      // 显示休息提示或暂停学习
      setShowBreakDialog(true);
    }

  } catch (error) {
    console.error('处理学习事件失败:', error);
    // AMAS失败不应影响核心学习流程，继续进行
  }
};
```

### 第五步：应用学习策略（可选）

根据AMAS返回的策略调整学习参数：

```typescript
const applyLearningStrategy = (strategy: LearningStrategy) => {
  // 调整批量大小
  setBatchSize(strategy.batch_size);

  // 调整难度（过滤单词）
  setDifficultyFilter(strategy.difficulty);

  // 调整新词比例
  setNewWordRatio(strategy.new_ratio);

  // 调整提示级别
  setHintLevel(strategy.hint_level);

  // 调整复习间隔
  setReviewIntervalScale(strategy.interval_scale);
};
```

## 完整示例

```typescript
import React, { useState, useRef } from 'react';
import { AmasStatus, AmasSuggestion } from '../components';
import { AmasProcessResult, LearningStrategy } from '../types/amas';
import ApiClient from '../services/ApiClient';

export default function LearningPage() {
  const [amasResult, setAmasResult] = useState<AmasProcessResult | null>(null);
  const [currentStrategy, setCurrentStrategy] = useState<LearningStrategy | null>(null);
  const questionStartTime = useRef<number>(Date.now());

  const handleAnswer = async (wordId: string, isCorrect: boolean) => {
    const responseTime = Date.now() - questionStartTime.current;

    try {
      // 调用AMAS处理学习事件
      const result = await ApiClient.processLearningEvent({
        wordId,
        isCorrect,
        responseTime,
      });

      setAmasResult(result);
      setCurrentStrategy(result.strategy);

      // 根据建议处理
      if (result.shouldBreak) {
        alert(result.suggestion || '建议休息一下');
      }

    } catch (error) {
      console.error('AMAS处理失败:', error);
    }

    // 重置计时器
    questionStartTime.current = Date.now();
  };

  return (
    <div>
      {/* 状态监控面板 */}
      <AmasStatus detailed={false} />

      {/* 学习内容 */}
      <div className="learning-content">
        {/* 单词卡片、选项等 */}
      </div>

      {/* AI建议 */}
      <AmasSuggestion
        result={amasResult}
        onBreak={() => {
          alert('好的，休息一下！');
          // 可以导航到休息页面或显示休息对话框
        }}
      />
    </div>
  );
}
```

## 高级功能

### 1. 批量导入历史数据

如果需要导入用户的历史学习数据来初始化AMAS：

```typescript
const importHistoricalData = async (answerRecords: AnswerRecord[]) => {
  const events = answerRecords.map(record => ({
    wordId: record.wordId,
    isCorrect: record.isCorrect,
    responseTime: record.responseTime || 3000,
    timestamp: record.timestamp,
  }));

  try {
    const result = await ApiClient.batchProcessEvents(events);
    console.log(`已导入${result.processed}条历史记录`);
    setCurrentStrategy(result.finalStrategy);
  } catch (error) {
    console.error('导入历史数据失败:', error);
  }
};
```

### 2. 手动重置AMAS状态

提供管理员或用户重置AMAS状态的功能：

```typescript
const handleResetAmas = async () => {
  if (!confirm('确定要重置AMAS学习状态吗？这将清除所有历史学习数据。')) {
    return;
  }

  try {
    await ApiClient.resetAmasState();
    setAmasResult(null);
    setCurrentStrategy(null);
    alert('AMAS状态已重置');
  } catch (error) {
    console.error('重置失败:', error);
    alert('重置失败，请稍后重试');
  }
};
```

### 3. 实时监控冷启动阶段

```typescript
const [coldStartPhase, setColdStartPhase] = useState<ColdStartPhaseInfo | null>(null);

useEffect(() => {
  const loadPhase = async () => {
    try {
      const phase = await ApiClient.getAmasColdStartPhase();
      setColdStartPhase(phase);
    } catch (error) {
      console.error('加载冷启动阶段失败:', error);
    }
  };

  loadPhase();
  // 每10次答题后更新一次阶段
  const interval = setInterval(loadPhase, 10 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

## 性能优化建议

1. **避免频繁调用**: AMAS处理有一定开销，建议每次答题后调用，而不是每次用户交互都调用

2. **错误处理**: AMAS调用失败不应影响核心学习流程，要做好降级处理

3. **缓存策略结果**: 当前策略可以缓存到本地，避免每次都请求

4. **异步更新**: AMAS调用应该是异步的，不要阻塞UI渲染

## 测试建议

1. 测试AMAS状态初始化（首次访问）
2. 测试正常学习流程中的策略调整
3. 测试疲劳检测和休息建议
4. 测试冷启动阶段转换
5. 测试网络错误时的降级处理

## API端点

所有AMAS API端点均需要认证（Bearer Token）：

- `POST /api/amas/process` - 处理学习事件
- `GET /api/amas/state` - 获取用户状态
- `GET /api/amas/strategy` - 获取当前策略
- `POST /api/amas/reset` - 重置状态
- `GET /api/amas/phase` - 获取冷启动阶段
- `POST /api/amas/batch-process` - 批量处理事件

## 总结

AMAS前端集成已完成以下内容：
- ✅ TypeScript类型定义
- ✅ API客户端封装
- ✅ React展示组件
- ✅ 集成指南文档

下一步：
1. 在实际学习页面中集成AMAS组件
2. 根据AMAS策略调整学习流程
3. 收集用户反馈并优化展示效果
