# semantic-search Specification

## Purpose

TBD - created by archiving change fix-audit-missing-features. Update Purpose after archive.

## Requirements

### Requirement: Semantic Search Page

系统 **MUST** 提供语义搜索页面供用户按含义搜索单词。

#### Scenario: 执行语义搜索

- **Given** 用户已登录
- **When** 用户在语义搜索页输入查询词
- **Then** 系统应返回语义相似的单词列表
- **And** 结果按相似度排序

#### Scenario: 无搜索结果

- **Given** 查询词无匹配结果
- **When** 搜索完成
- **Then** 应显示友好的空状态提示

#### Scenario: 搜索性能

- **Given** 词库有大量数据
- **When** 执行语义搜索
- **Then** 响应时间应在2秒内

---

### Requirement: Similar Words Component

系统 **SHALL** 在单词详情中展示语义相似词。

#### Scenario: 显示相似词

- **Given** 用户查看某单词详情
- **When** 页面加载完成
- **Then** 应显示Top 5相似词
- **And** 可点击跳转到相似词详情

#### Scenario: 无相似词数据

- **Given** 单词未生成嵌入向量
- **When** 查看详情
- **Then** 应显示"暂无相似词数据"

---

### Requirement: Confusion Words Pagination

易混淆词列表 **MUST** 支持分页查询。

#### Scenario: 分页获取易混淆词

- **Given** 用户有大量易混淆词记录
- **When** 请求 `GET /api/semantic/confusion?page=1&pageSize=20`
- **Then** 应返回分页结果
- **And** 包含total、page、pageSize字段

#### Scenario: 默认分页参数

- **Given** 请求未指定分页参数
- **When** 调用API
- **Then** 应使用默认值 page=1, pageSize=20

---

### Requirement: Cluster Learning Integration

聚类数据 **SHALL** 集成到学习推荐流程。

#### Scenario: 基于聚类推荐

- **Given** 用户正在学习
- **And** 词库已完成聚类
- **When** 系统推荐下一组单词
- **Then** 应优先推荐同聚类的相关词

#### Scenario: 聚类未完成

- **Given** 词库未完成聚类
- **When** 学习推荐
- **Then** 应使用默认推荐策略
- **And** 不影响学习流程

---
