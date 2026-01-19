# Wordbook Center Template

使用 GitHub + jsDelivr CDN 免费托管词库中心。

## 快速开始

### 1. Fork 或创建仓库

在 GitHub 上创建新仓库，将此模板内容上传。

### 2. 配置词库中心 URL

在应用中设置词库中心 URL 为：

```
https://cdn.jsdelivr.net/gh/你的用户名/你的仓库名@main
```

例如：

```
https://cdn.jsdelivr.net/gh/username/wordbook-center@main
```

## 目录结构

```
├── index.json              # 词库列表索引
└── wordbooks/
    ├── cet4-core.json      # 词库文件（包含所有单词）
    ├── cet6-core.json
    └── ...
```

## 文件格式

### index.json（词库索引）

```json
{
  "data": [
    {
      "id": "cet4-core",
      "name": "大学英语四级核心词汇",
      "description": "词库描述",
      "wordCount": 4500,
      "coverImage": null,
      "tags": ["CET4", "大学英语"],
      "version": "1.0.0",
      "author": "作者名",
      "downloadCount": 0
    }
  ]
}
```

### wordbooks/{id}.json（词库详情）

```json
{
  "id": "cet4-core",
  "name": "大学英语四级核心词汇",
  "description": "词库描述",
  "wordCount": 50,
  "coverImage": null,
  "tags": ["CET4"],
  "version": "1.0.0",
  "author": "作者名",
  "downloadCount": 0,
  "words": [
    {
      "spelling": "abandon",
      "phonetic": "/əˈbændən/",
      "meanings": ["放弃", "抛弃"],
      "examples": ["He abandoned his car."],
      "audioUrl": null
    }
  ]
}
```

## 字段说明

### 词库字段

| 字段          | 类型     | 必填 | 说明                       |
| ------------- | -------- | ---- | -------------------------- |
| id            | string   | 是   | 唯一标识符                 |
| name          | string   | 是   | 词库名称                   |
| description   | string   | 否   | 词库描述                   |
| wordCount     | number   | 是   | 单词数量                   |
| coverImage    | string   | 否   | 封面图片URL                |
| tags          | string[] | 是   | 标签数组                   |
| version       | string   | 是   | 版本号                     |
| author        | string   | 否   | 作者                       |
| downloadCount | number   | 否   | 下载次数                   |
| words         | Word[]   | 是   | 单词列表（仅词库详情文件） |

### 单词字段

| 字段     | 类型     | 必填 | 说明        |
| -------- | -------- | ---- | ----------- |
| spelling | string   | 是   | 单词拼写    |
| phonetic | string   | 否   | 音标        |
| meanings | string[] | 是   | 释义数组    |
| examples | string[] | 是   | 例句数组    |
| audioUrl | string   | 否   | 发音音频URL |

## 添加新词库

1. 在 `wordbooks/` 目录下创建 `{id}.json` 文件
2. 在 `index.json` 的 `data` 数组中添加词库信息
3. 提交并推送到 GitHub

## CDN 缓存

jsDelivr CDN 默认缓存 24 小时。更新后如需立即生效：

```
https://purge.jsdelivr.net/gh/用户名/仓库名@main/index.json
```

## 支持的 URL 格式

后端自动识别以下静态托管 URL：

- `https://cdn.jsdelivr.net/gh/...`
- `https://用户名.github.io/...`
- `https://raw.githubusercontent.com/...`
- 以 `.json` 结尾的 URL
