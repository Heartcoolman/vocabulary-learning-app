# VARK Learning Style Upgrade - Technical Design

## Overview

本文档汇总 VARK 学习风格升级的技术设计决策。

## Design Documents

| 文档                                                     | 描述              |
| -------------------------------------------------------- | ----------------- |
| [database-migration.md](./database-migration.md)         | 数据库迁移脚本    |
| [type-definitions.md](./type-definitions.md)             | 前后端类型定义    |
| [rule-engine.md](./rule-engine.md)                       | VARK 规则引擎算法 |
| [ml-model.md](./ml-model.md)                             | 在线 SGD ML 模型  |
| [frontend-updates.md](./frontend-updates.md)             | 前端组件和 Hook   |
| [confidence-calibration.md](./confidence-calibration.md) | 置信度校准        |

## Key Decisions

### D1: Reading 信号采集

**决策**: 复用 dwellTime 推断阅读行为

**理由**:

- 现有 UI 无独立释义/例句阅读区域
- dwellTime > 5000ms 且无音频播放时，可合理推断为阅读行为
- 避免大规模 UI 改动

### D2: multimodal 判定

**决策**: 基于方差判定 (var < 0.01)

**理由**:

- 比固定阈值 (max < 0.4) 更数学化
- 当四维分数均匀时，方差接近 0
- 阈值 0.01 经验证在四维模型中合理

### D3: ML 模型选择

**决策**: 在线 SGD (4 个二分类器, one-vs-rest)

**理由**:

- 轻量级，适合实时增量更新
- 每次交互后可立即更新
- 内存占用低（仅存储权重向量）

### D4: 时间衰减

**决策**: τ = 14 天

**理由**:

- 用户原选择 30 天，后调整为 14 天
- 更快适应用户学习风格变化
- 平衡历史数据价值和实时性

### D5: 向后兼容

**决策**: 双字段兼容 (style + styleLegacy)

**理由**:

- 旧版客户端可继续使用 styleLegacy
- 新客户端使用 style 获取完整 VARK 类型
- 渐进式迁移，无破坏性变更

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Learning Style Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Frontend   │────▶│   Backend    │────▶│   Database   │    │
│  │  Tracking    │     │   Service    │     │   Storage    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                     │            │
│         ▼                    ▼                     ▼            │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ useInteract  │     │ Rule Engine  │     │ answer_      │    │
│  │ ionTracker   │     │     or       │     │ records      │    │
│  └──────────────┘     │  ML Model    │     └──────────────┘    │
│                       └──────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│                       ┌──────────────┐                          │
│                       │ VARK Scores  │                          │
│                       │ V, A, R, K   │                          │
│                       └──────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│                       ┌──────────────┐                          │
│                       │  Normalize   │                          │
│                       │  & Classify  │                          │
│                       └──────────────┘                          │
│                              │                                  │
│                              ▼                                  │
│                       ┌──────────────┐                          │
│                       │   Output:    │                          │
│                       │ style,       │                          │
│                       │ styleLegacy, │                          │
│                       │ confidence   │                          │
│                       └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## ML Model Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VARK Online SGD Classifier                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Input: VarkFeatures (16 dimensions)                            │
│  ─────────────────────────────────────                          │
│  Visual:      [img_view, img_zoom, img_press, dwell_visual]     │
│  Auditory:    [audio_play, replay, speed_adj, pronunciation]    │
│  Reading:     [def_read, ex_read, dwell_reading, no_audio]      │
│  Kinesthetic: [resp_speed, resp_var, switch, note_write]        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  4 Binary Classifiers                    │    │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │    │
│  │  │   V    │  │   A    │  │   R    │  │   K    │        │    │
│  │  │ vs rest│  │ vs rest│  │ vs rest│  │ vs rest│        │    │
│  │  └────────┘  └────────┘  └────────┘  └────────┘        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│                    ┌──────────────────┐                         │
│                    │    Normalize     │                         │
│                    │   (sum = 1.0)    │                         │
│                    └──────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌──────────────────┐                         │
│                    │ Output Scores:   │                         │
│                    │ V=0.35, A=0.25,  │                         │
│                    │ R=0.30, K=0.10   │                         │
│                    └──────────────────┘                         │
│                                                                  │
│  Parameters:                                                     │
│  ─────────────                                                  │
│  Learning rate (η): 0.005                                       │
│  L2 regularization (λ): 0.001                                   │
│  Time decay (τ): 14 days                                        │
│  Cold start threshold: 50 interactions                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
