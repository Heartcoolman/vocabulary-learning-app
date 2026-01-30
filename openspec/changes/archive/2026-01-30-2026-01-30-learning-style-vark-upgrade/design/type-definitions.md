# Spec: VARK Type Definitions

## Overview

前后端共享的 VARK 类型定义更新。

---

## Backend Types (Rust)

**文件**: `packages/backend-rust/src/services/user_profile.rs`

### LearningStyleScores

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleScores {
    pub visual: f64,
    pub auditory: f64,
    pub reading: f64,      // 新增
    pub kinesthetic: f64,
}

impl LearningStyleScores {
    pub fn normalize(&mut self) {
        let total = self.visual + self.auditory + self.reading + self.kinesthetic;
        if total > 0.0 {
            self.visual /= total;
            self.auditory /= total;
            self.reading /= total;
            self.kinesthetic /= total;
        }
    }

    pub fn variance(&self) -> f64 {
        let mean = 0.25; // 均值为 1/4
        let sum_sq = (self.visual - mean).powi(2)
            + (self.auditory - mean).powi(2)
            + (self.reading - mean).powi(2)
            + (self.kinesthetic - mean).powi(2);
        sum_sq / 4.0
    }

    pub fn is_multimodal(&self) -> bool {
        self.variance() < 0.01
    }

    pub fn dominant_style(&self) -> &'static str {
        if self.is_multimodal() {
            return "multimodal";
        }
        let max_score = self.visual
            .max(self.auditory)
            .max(self.reading)
            .max(self.kinesthetic);
        if self.visual == max_score {
            "visual"
        } else if self.auditory == max_score {
            "auditory"
        } else if self.reading == max_score {
            "reading"
        } else {
            "kinesthetic"
        }
    }

    pub fn legacy_style(&self) -> &'static str {
        let style = self.dominant_style();
        match style {
            "reading" | "multimodal" => "mixed",
            other => other,
        }
    }
}
```

### LearningStyleProfile

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleProfile {
    pub style: &'static str,           // 新值: visual | auditory | reading | kinesthetic | multimodal
    pub style_legacy: &'static str,    // 兼容值: visual | auditory | kinesthetic | mixed
    pub confidence: f64,
    pub sample_count: i64,
    pub scores: LearningStyleScores,
    pub interaction_patterns: LearningStyleInteractionPatterns,
    pub model_type: &'static str,      // "rule_engine" | "ml_sgd"
}
```

---

## Frontend Types (TypeScript)

**文件**: `packages/frontend/src/types/cognitive.ts`

```typescript
/**
 * 学习风格类型（VARK 四维 + multimodal）
 */
export type LearningStyleType = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'multimodal';

/**
 * 学习风格类型（旧版兼容）
 */
export type LearningStyleTypeLegacy = 'visual' | 'auditory' | 'kinesthetic' | 'mixed';

/**
 * 学习风格评分（VARK 四维）
 */
export interface LearningStyleScores {
  visual: number;
  auditory: number;
  reading: number; // 新增
  kinesthetic: number;
}

/**
 * 学习风格画像
 */
export interface LearningStyleProfile {
  style: LearningStyleType;
  styleLegacy: LearningStyleTypeLegacy; // 新增，向后兼容
  confidence: number;
  sampleCount: number;
  scores: LearningStyleScores;
  interactionPatterns: LearningStyleInteractionPatterns;
  modelType: 'rule_engine' | 'ml_sgd'; // 新增，标识使用的模型类型
}

/**
 * 交互模式统计
 */
export interface LearningStyleInteractionPatterns {
  avgDwellTime: number;
  avgResponseTime: number;
  pauseFrequency: number;
  switchFrequency: number;
}
```

---

## Shared Types

**文件**: `packages/shared/src/api/types/user-profile.ts`

```typescript
/**
 * 学习风格画像（API 响应）
 */
export interface LearningStyleProfile {
  dominantStyle: string; // 保留旧字段名（兼容）
  style: string; // 新增：VARK 风格
  styleLegacy: string; // 新增：旧版兼容风格
  styleScores: Record<string, number>;
  confidence: number;
  recommendations: string[];
  modelType: string; // 新增
}
```

---

## Constraints

| 约束 ID | 描述                                                     |
| ------- | -------------------------------------------------------- |
| T1      | `LearningStyleScores` 必须包含四个维度，总和归一化为 1.0 |
| T2      | `style` 字段返回 VARK 五种类型之一                       |
| T3      | `styleLegacy` 字段仅返回旧版四种类型之一                 |
| T4      | `reading` 或 `multimodal` 映射到 `styleLegacy = "mixed"` |
| T5      | 旧版客户端可忽略 `reading` 字段（默认为 0）              |
