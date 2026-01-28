# confusion-performance Specification

## Purpose

优化易混淆词对的加载性能，通过预计算缓存机制将查询时间从 O(n²) 降至 O(1)。

## ADDED Requirements

### Requirement: Confusion Pairs Cache Table

系统 **MUST** 维护一个预计算的混淆词对缓存表。

#### Scenario: 缓存表结构

- **Given** 数据库已部署
- **When** 查看 confusion_pairs_cache 表
- **Then** 应包含 word1Id, word2Id, wordBookId, clusterId, distance, model 字段
- **And** 应有 (word1Id, word2Id, model) 的唯一约束
- **And** 应有 (clusterId, distance) 的索引用于按主题查询
- **And** 应有 (wordBookId, distance) 的索引用于兼容查询

#### Scenario: 缓存数据完整性

- **Given** 某词书有 N 个已嵌入的单词
- **When** 缓存表数据完整
- **Then** 应存储所有 distance < 0.3 的词对
- **And** word1Id < word2Id（保证唯一性）

---

### Requirement: Cached Confusion Pairs API

系统 **SHALL** 提供查询缓存混淆词对的 API。

#### Scenario: 按主题聚类查询

- **Given** 聚类 "cluster-animals" 有缓存数据
- **When** 请求 `POST /api/semantic/confusion-pairs` with `{ clusterId: "cluster-animals", limit: 5 }`
- **Then** 应在 500ms 内返回前 5 对最易混淆的词对
- **And** 结果按 distance 升序排列

#### Scenario: 按词书查询（兼容）

- **Given** 词书 "wb-001" 有缓存数据
- **When** 请求 `POST /api/semantic/confusion-pairs` with `{ wordBookId: "wb-001", threshold: 0.15 }`
- **Then** 应在 500ms 内返回结果
- **And** 结果按 distance 升序排列
- **And** 仅返回 distance < threshold 的词对

#### Scenario: 用户指定数量

- **Given** 某主题有 20 对混淆词
- **When** 请求 `{ clusterId: "xxx", limit: 8 }`
- **Then** 应返回前 8 对（最易混淆的）

#### Scenario: 无缓存数据

- **Given** 聚类尚未生成缓存
- **When** 查询该聚类
- **Then** 应返回空数组
- **And** 不应触发实时计算

---

### Requirement: Confusion By Cluster Summary API

系统 **SHALL** 提供按聚类汇总混淆词对数量的 API。

#### Scenario: 获取主题列表及混淆词对数

- **Given** 系统有多个聚类
- **When** 请求 `GET /api/semantic/confusion-by-cluster`
- **Then** 应返回聚类列表
- **And** 每个聚类应包含 clusterId, themeLabel, confusionPairCount
- **And** 按 confusionPairCount 降序排列

#### Scenario: 聚类无混淆词对

- **Given** 某聚类内词之间距离都 > 0.3
- **When** 查询汇总
- **Then** 该聚类的 confusionPairCount 应为 0
- **And** 可选择不在列表中显示

---

### Requirement: Confusion Cache Worker

系统 **MUST** 运行后台 Worker 维护缓存数据。

#### Scenario: 新增 Embedding 时更新缓存

- **Given** Worker 正在运行
- **When** 单词 "word-001" 新增 embedding
- **Then** 应计算该词与同词书所有已嵌入词的距离
- **And** 将 distance < 0.3 的词对写入缓存

#### Scenario: 删除 Embedding 时清理缓存

- **Given** 缓存表有 word-001 相关的词对
- **When** word-001 的 embedding 被删除
- **Then** 应删除缓存表中所有包含 word-001 的记录

#### Scenario: 批量初始化

- **Given** 词书有 1000 个已嵌入词但无缓存
- **When** 触发批量初始化任务
- **Then** 应计算所有词对并填充缓存
- **And** 进度应可查询

---

## MODIFIED Requirements

### Requirement: Confusion Words Pagination (from semantic-search)

易混淆词列表 **MUST** 支持分页查询，并满足性能要求。

> 原需求保持不变，API 内部实现改为查询缓存表。

#### Scenario: 性能基准

- **Given** 词书有 5000+ 单词
- **When** 查询易混淆词对
- **Then** 响应时间 **MUST** < 500ms（原无此约束）

---
