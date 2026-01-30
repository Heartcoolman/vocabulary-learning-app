# Design: UMM - Unified Memory Model

## Context

UMM 是一个完全原创的记忆算法系统，替换现有的 FSRS/Thompson/LinUCB/ACT-R 算法。设计遵循以下约束：

- **不使用**：Beta 分布、高斯过程、神经网络、幂律衰减
- **使用**：微分方程、指数衰减、方差统计、余弦相似度、多尺度时间常数

## Goals / Non-Goals

**Goals**:

- 7个模块独立实现，可单独测试
- 保持与现有 AMAS 接口兼容（`WordMasteryDecision`、`EnsembleDecision`）
- 支持 feature flag 切换，与现有算法并行运行
- 影子计算模式用于 A/B 对照

**Non-Goals**:

- 不修改前端组件（Phase 5 之后考虑可视化）
- 现有用户使用 FSRS 状态映射初始化 UMM 状态

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UMM Engine                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    核心记忆模型层                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │     MDM     │  │     IGE     │  │     SWD     │       │  │
│  │  │  记忆动力学  │  │ 信息增益探索 │  │ 相似度决策  │       │  │
│  │  │ (替代FSRS)  │  │(替代Thompson)│  │(替代LinUCB) │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │         │                │                │               │  │
│  │         └────────────────┼────────────────┘               │  │
│  │                          │                                │  │
│  │                   ┌──────┴──────┐                         │  │
│  │                   │    MSMT     │                         │  │
│  │                   │ 多尺度记忆  │                         │  │
│  │                   │(替代ACT-R)  │                         │  │
│  │                   └─────────────┘                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    词汇学习特化层                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │     MTP     │  │     IAD     │  │     EVM     │       │  │
│  │  │  形态迁移   │  │  干扰衰减   │  │ 编码变异    │       │  │
│  │  │  传播模型   │  │  计数模型   │  │  度量模型   │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Decisions (已确认)

### Decision 1: Feature Flags

**选择**: 各模块独立 flag，无全局 umm_enabled 开关

**flags**:

- `umm_mdm_enabled` (default: false)
- `umm_ige_enabled` (default: false)
- `umm_swd_enabled` (default: false)
- `umm_msmt_enabled` (default: false)
- `umm_mtp_enabled` (default: false)
- `umm_iad_enabled` (default: false)
- `umm_evm_enabled` (default: false)

### Decision 2: R_target 来源

**选择**: 用户级个性化，基于动态负担平衡

**公式**:

```
burden = 0.5 × (actual_review_count / target_review_count) + 0.5 × (actual_time / target_time)
R_target = clamp(0.9 × (1 + 0.1 × (1 - burden)), 0.75, 0.95)
```

**窗口**: 7 天滑动窗口

### Decision 3: 全局边界

| 参数          | 值           |
| ------------- | ------------ |
| R_base_target | [0.05, 0.97] |
| mult          | [0.5, 2.0]   |
| ε             | 1e-6         |

### Decision 4: MDM 衰减方法

**选择**: 严格微分方程解（Newton/Lambert W）

**理由**: 用户明确选择精度优先

**状态语义**: 存储复习时刻 M，查询时实时计算衰减

### Decision 5: MDM 参数

| 参数       | 值           |
| ---------- | ------------ |
| λ_0        | 0.3          |
| α          | 0.5          |
| η          | 0.4          |
| M_max      | 10.0         |
| κ          | 0.2          |
| μ          | 0.25         |
| M 边界     | [0.1, 10.0]  |
| 新词初始值 | M=1.0, C=0.1 |

### Decision 6: quality 映射

**选择**: 连续映射（RT/hints）

**公式**:

```
quality = clamp(0.5 + 0.3 × (1 - RT/30) + 0.2 × (1 - hints/3), 0, 1)
```

错误答案: quality = 0.0

### Decision 7: MSMT 参数

| 参数        | 值                           |
| ----------- | ---------------------------- |
| max_history | 100                          |
| threshold   | 0.3                          |
| slope       | 1.5                          |
| 融合权重    | 0.6×cognitive.mem + 0.4×msmt |

### Decision 8: IGE 参数

| 参数           | 值                  |
| -------------- | ------------------- |
| 统计架构       | 全局 + context 分层 |
| context_weight | 0.7                 |
| ess_k          | 5                   |
| min_confidence | 0.4                 |
| max_confidence | 0.98                |

### Decision 9: SWD 参数

| 参数        | 值   |
| ----------- | ---- |
| max_history | 200  |
| 淘汰策略    | FIFO |

### Decision 10: 平局处理

**选择**: 按 strategy key 字典序

### Decision 11: IAD 参数

| 参数     | 值                     |
| -------- | ---------------------- |
| 窗口范围 | 会话内最近 20 个       |
| 权重方案 | 基于 distance 线性映射 |
| 查找方向 | 双向                   |

### Decision 12: EVM 参数

| 参数        | 值                                                   |
| ----------- | ---------------------------------------------------- |
| 维度        | hour_of_day, day_of_week, question_type, device_type |
| device_type | 前端必须上报，无 fallback                            |
| 存储        | 专用 context_history 表                              |

### Decision 13: MTP 模式

**选择**: 更新模式（每次复习后更新 user_morpheme_states）

### Decision 14: 现有用户迁移

**选择**: 从 FSRS 状态映射

**映射公式**:

```
M = ln(stability + 1)
C = 1 - difficulty / 10
```

## Risks / Trade-offs

| Risk                     | Mitigation                                |
| ------------------------ | ----------------------------------------- |
| MDM 严格解性能开销       | Newton 迭代收敛快，单次 < 1ms；必要时缓存 |
| IGE context 分层存储开销 | 限制 context 签名数量；定期清理冷 context |
| EVM device_type 前端依赖 | 阻塞式需求，Phase 3 前完成前端上报        |
| 多模块组合导致 mult 极端 | mult 全局 clamp [0.5, 2.0]                |
| MSMT 100 条历史 O(n)     | 可接受；必要时引入缓存                    |

## Migration Plan

**Phase 0**: Feature flags + AlgorithmId 扩展 + DB migration (umm\_\* 字段)
**Phase 1**: MSMT 替换 `compute_actr_memory`
**Phase 2**: IGE + SWD 替换 Thompson/LinUCB
**Phase 3**: MTP + IAD + EVM（前端需完成 device_type 上报）
**Phase 4**: MDM 影子 + FSRS 映射迁移 + 切主
**Phase 5**: 统一引擎收敛
**Phase 6**: A/B 测试

**Rollback**: 每个 Phase 可通过 feature flag 独立回滚

## Open Questions (已解决)

| 问题                | 决策                          |
| ------------------- | ----------------------------- |
| ~~MSMT 历史上限~~   | max_history=100 ✓             |
| ~~EVM device_type~~ | 前端必须上报 ✓                |
| ~~IAD 权重方案~~    | 基于 distance 线性映射 ✓      |
| ~~R_target 来源~~   | 用户级个性化 + 动态负担平衡 ✓ |
| ~~MDM 衰减方法~~    | 严格微分方程解 ✓              |
| ~~现有用户迁移~~    | 从 FSRS 映射 ✓                |
