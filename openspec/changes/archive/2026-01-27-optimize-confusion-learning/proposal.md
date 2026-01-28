# Proposal: optimize-confusion-learning

## Why

当前易混淆词功能存在两个核心问题影响用户体验：

1. 大型词库加载性能差（5000+ 词时响应超过数秒）
2. 学习流程繁琐，每次仅能练习单对词汇，无主题关联

## What Changes

- 后端：新增 `confusion_pairs_cache` 表预计算混淆词对，支持 O(1) 查询
- 后端：新增 ConfusionCacheWorker 增量更新缓存
- 后端：新增 3 个 API（confusion-by-cluster、confusion-pairs 增强、cache-status）
- 前端：ConfusionWordsPage 重构为主题分组布局
- 前端：LearningPage 支持批量学习模式（进度追踪、跳过/结束）

## Summary

优化易混淆词检测功能，解决两个核心问题：

1. **加载性能问题**：大型词库初次加载易混淆词对耗时过长
2. **学习效率问题**：当前只能两两对比学习，学完需返回重选下一组，流程繁琐

## Problem Analysis

### 问题1：加载性能瓶颈

**现状**：

- 当前 `find_confusion_pairs_paged` 执行 O(n²) 的向量距离计算
- 每次阈值变化都触发全量重新计算
- 前端 `LARGE_DATASET_THRESHOLD = 5000` 时强制选择词书，但仍然慢

**根因**：

- SQL 查询需要比较所有词对组合 (`e1.wordId < e2.wordId`)
- 向量相似度计算 `<=>` 操作符无法利用预计算索引
- 无缓存机制，相同参数重复请求重复计算

### 问题2：学习流程断裂

**现状**：

- 点击"一起练习" → 导航到学习页 → 学完2词 → 手动返回 → 选下一组
- 每轮仅练习2个词，上下文切换开销大
- 用户需要记住自己练到哪组
- 选出的词对之间毫无关联，学习缺乏主题聚焦

**根因**：

- `handlePracticePair` 仅传递单个 pair 的 seedWords
- 无批量模式设计，每次只能处理一对
- 无队列管理，学完不会自动推进
- 未结合聚类功能，词对无主题归属

## Proposed Solution

### Capability 1: confusion-performance (加载性能优化)

采用**预计算 + 增量更新**策略：

- 后台 Worker 预计算并缓存混淆词对（关联 cluster_id）
- 前端请求直接查缓存表，O(1) 查询
- 向量更新时增量刷新受影响的词对

### Capability 2: confusion-batch-learning (按主题批量学习)

实现**主题分组 + 用户自选数量**模式：

- 复用 `word_clusters` 聚类，按主题展示混淆词对
- 用户选择一个主题后，通过滑块/输入框自选学习数量
- 同一批学习的词对有共同主题（如"动物类"、"数字类"）
- 学完一对自动推进，提供跳过/结束操作

## Impact Analysis

- **后端**：新增 confusion_pairs_cache 表，新增预计算 Worker
- **前端**：ConfusionWordsPage 增加批量选择，LearningPage 支持多对队列
- **数据库**：新增 SQL migration

## Success Criteria

1. 5000 词以上词库，混淆词列表加载时间 < 500ms
2. 混淆词按主题分组展示，用户可选择特定主题学习
3. 用户可自主选择学习数量（1~N 对），同批词对有共同主题
4. 学习进度实时可见，支持跳过/结束操作
