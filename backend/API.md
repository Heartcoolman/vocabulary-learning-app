# API 文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json`

## 认证相关

### 注册用户

**POST** `/api/auth/register`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "张三"
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "张三",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**错误响应** (409):
```json
{
  "success": false,
  "error": "该邮箱已被注册",
  "code": "CONFLICT"
}
```

---

### 用户登录

**POST** `/api/auth/login`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "张三",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 退出登录

**POST** `/api/auth/logout`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "message": "退出登录成功"
}
```

---

## 用户相关

### 获取当前用户信息

**GET** `/api/users/me`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "张三",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 修改密码

**PUT** `/api/users/me/password`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "oldPassword": "old_password",
  "newPassword": "new_password"
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "密码修改成功"
}
```

---

### 获取用户统计信息

**GET** `/api/users/me/statistics`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "totalWords": 50,
    "totalRecords": 200,
    "correctCount": 150,
    "accuracy": 75.0
  }
}
```

---

## 单词相关

### 获取所有单词

**GET** `/api/words`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "spelling": "hello",
      "phonetic": "həˈloʊ",
      "meanings": ["你好", "问候"],
      "examples": ["Hello, how are you?"],
      "audioUrl": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 获取单个单词

**GET** `/api/words/:id`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "spelling": "hello",
    "phonetic": "həˈloʊ",
    "meanings": ["你好", "问候"],
    "examples": ["Hello, how are you?"],
    "audioUrl": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 添加单词

**POST** `/api/words`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "spelling": "hello",
  "phonetic": "həˈloʊ",
  "meanings": ["你好", "问候"],
  "examples": ["Hello, how are you?"],
  "audioUrl": "https://example.com/audio.mp3"
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "spelling": "hello",
    "phonetic": "həˈloʊ",
    "meanings": ["你好", "问候"],
    "examples": ["Hello, how are you?"],
    "audioUrl": "https://example.com/audio.mp3",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 批量添加单词

**POST** `/api/words/batch`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "words": [
    {
      "spelling": "hello",
      "phonetic": "həˈloʊ",
      "meanings": ["你好"],
      "examples": ["Hello!"]
    },
    {
      "spelling": "world",
      "phonetic": "wɜːrld",
      "meanings": ["世界"],
      "examples": ["Hello world!"]
    }
  ]
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "count": 2
  }
}
```

---

### 更新单词

**PUT** `/api/words/:id`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "spelling": "hello",
  "phonetic": "həˈloʊ",
  "meanings": ["你好", "问候", "打招呼"],
  "examples": ["Hello, how are you?", "Say hello to everyone."]
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "spelling": "hello",
    "phonetic": "həˈloʊ",
    "meanings": ["你好", "问候", "打招呼"],
    "examples": ["Hello, how are you?", "Say hello to everyone."],
    "audioUrl": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 删除单词

**DELETE** `/api/words/:id`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "message": "单词删除成功"
}
```

---

## 学习记录相关

### 获取学习记录

**GET** `/api/records`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "wordId": "uuid",
      "selectedAnswer": "你好",
      "correctAnswer": "你好",
      "isCorrect": true,
      "timestamp": "2024-01-01T00:00:00.000Z",
      "word": {
        "spelling": "hello",
        "phonetic": "həˈloʊ",
        "meanings": ["你好"]
      }
    }
  ]
}
```

---

### 保存答题记录

**POST** `/api/records`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "wordId": "uuid",
  "selectedAnswer": "你好",
  "correctAnswer": "你好",
  "isCorrect": true
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "wordId": "uuid",
    "selectedAnswer": "你好",
    "correctAnswer": "你好",
    "isCorrect": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 批量保存答题记录

**POST** `/api/records/batch`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
[
  {
    "wordId": "uuid1",
    "selectedAnswer": "你好",
    "correctAnswer": "你好",
    "isCorrect": true
  },
  {
    "wordId": "uuid2",
    "selectedAnswer": "世界",
    "correctAnswer": "世界",
    "isCorrect": true
  }
]
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "count": 2
  }
}
```

---

### 获取学习统计

**GET** `/api/records/statistics`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "totalRecords": 200,
    "correctRecords": 150,
    "accuracy": 75.0,
    "recentRecords": [
      {
        "id": "uuid",
        "userId": "uuid",
        "wordId": "uuid",
        "selectedAnswer": "你好",
        "correctAnswer": "你好",
        "isCorrect": true,
        "timestamp": "2024-01-01T00:00:00.000Z",
        "word": {
          "spelling": "hello",
          "phonetic": "həˈloʊ"
        }
      }
    ]
  }
}
```

---

## 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": "错误消息",
  "code": "ERROR_CODE"
}
```

### 错误代码

| 代码 | HTTP状态码 | 说明 |
|------|-----------|------|
| `VALIDATION_ERROR` | 400 | 输入验证失败 |
| `UNAUTHORIZED` | 401 | 未授权访问 |
| `INVALID_CREDENTIALS` | 401 | 凭证无效 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 资源冲突 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 认证说明

大多数API端点需要认证。在请求头中包含JWT令牌：

```
Authorization: Bearer <your_jwt_token>
```

令牌在注册或登录时获得，有效期为24小时。

---

## 速率限制

API实施速率限制以防止滥用：

- 窗口期：15分钟
- 最大请求数：100次

超过限制将返回429状态码。

---

## 健康检查

**GET** `/health`

检查服务器状态，无需认证。

**响应** (200):
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 单词得分相关

### 按得分范围获取单词

**GET** `/api/word-scores/range`

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `minScore` (number, required): 最小得分
- `maxScore` (number, required): 最大得分

**示例请求**:
```
GET /api/word-scores/range?minScore=0&maxScore=50
```

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "wordId": "uuid",
      "totalScore": 45.5,
      "accuracyScore": 50.0,
      "speedScore": 40.0,
      "stabilityScore": 45.0,
      "proficiencyScore": 48.0,
      "lastCalculated": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 算法配置相关

### 获取当前算法配置

**GET** `/api/algorithm-config`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "默认配置",
    "config": {
      "initialEaseFactor": 2.5,
      "minEaseFactor": 1.3,
      "maxEaseFactor": 3.0,
      "easeFactorIncrement": 0.15,
      "easeFactorDecrement": 0.2,
      "intervalMultiplier": 2.0
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 更新算法配置

**PUT** `/api/algorithm-config`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "config": {
    "initialEaseFactor": 2.5,
    "minEaseFactor": 1.3,
    "maxEaseFactor": 3.0,
    "easeFactorIncrement": 0.15,
    "easeFactorDecrement": 0.2,
    "intervalMultiplier": 2.0
  },
  "changedBy": "user@example.com",
  "changeReason": "调整算法参数以提高学习效率"
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "默认配置",
    "config": {
      "initialEaseFactor": 2.5,
      "minEaseFactor": 1.3,
      "maxEaseFactor": 3.0,
      "easeFactorIncrement": 0.15,
      "easeFactorDecrement": 0.2,
      "intervalMultiplier": 2.0
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 重置算法配置为默认值

**POST** `/api/algorithm-config/reset`

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "changedBy": "user@example.com"
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "默认配置",
    "config": {
      "initialEaseFactor": 2.5,
      "minEaseFactor": 1.3,
      "maxEaseFactor": 3.0,
      "easeFactorIncrement": 0.15,
      "easeFactorDecrement": 0.2,
      "intervalMultiplier": 2.0
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 获取算法配置历史记录

**GET** `/api/algorithm-config/history`

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `limit` (number, optional): 返回记录数量限制，默认为 10

**示例请求**:
```
GET /api/algorithm-config/history?limit=5
```

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "configId": "uuid",
      "changedBy": "user@example.com",
      "changeReason": "调整算法参数",
      "configBefore": {
        "initialEaseFactor": 2.5,
        "minEaseFactor": 1.3
      },
      "configAfter": {
        "initialEaseFactor": 2.6,
        "minEaseFactor": 1.4
      },
      "changedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 单词学习状态相关

### 删除单词学习状态

**DELETE** `/api/word-states/:wordId`

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "message": "单词学习状态删除成功"
}
```

---

## 管理员相关

### 获取用户详细统计数据

**GET** `/api/admin/users/:id/statistics/detailed`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**响应** (200):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "张三",
      "role": "USER",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "masteryDistribution": {
      "level0": 10,
      "level1": 15,
      "level2": 20,
      "level3": 25,
      "level4": 20,
      "level5": 10
    },
    "studyDays": 30,
    "consecutiveDays": 5,
    "totalStudyTime": 1200,
    "totalWordsLearned": 100,
    "averageScore": 75.5,
    "accuracy": 0.85
  }
}
```

---

### 导出用户单词数据

**GET** `/api/admin/users/:id/words/export`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**查询参数**:
- `format` (string, required): 导出格式，可选值：`csv` 或 `excel`

**示例请求**:
```
GET /api/admin/users/:id/words/export?format=csv
```

**响应** (200):
- Content-Type: `text/csv` 或 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="用户单词数据_<userId>_<date>.csv"`

返回文件包含以下字段：
- 单词拼写 (Spelling)
- 音标 (Phonetic)
- 释义 (Meanings)
- 例句 (Examples)
- 掌握程度 (Mastery Level)
- 得分 (Score)
- 准确率 (Accuracy)
- 复习次数 (Review Count)
- 上次复习时间 (Last Review Date)
- 下次复习时间 (Next Review Date)
- 学习状态 (State)

---

### 获取用户单词列表

**GET** `/api/admin/users/:id/words`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**查询参数**:
- `page` (number, optional): 页码，默认为 1
- `pageSize` (number, optional): 每页数量，默认为 20
- `scoreRange` (string, optional): 得分范围，可选值：`low`、`medium`、`high`
- `masteryLevel` (number, optional): 掌握程度，0-5
- `minAccuracy` (number, optional): 最小准确率，0-100
- `state` (string, optional): 学习状态，可选值：`new`、`learning`、`reviewing`、`mastered`
- `sortBy` (string, optional): 排序字段，可选值：`score`、`accuracy`、`reviewCount`、`lastReview`
- `sortOrder` (string, optional): 排序顺序，可选值：`asc`、`desc`

**示例请求**:
```
GET /api/admin/users/:id/words?page=1&pageSize=20&scoreRange=low&sortBy=score&sortOrder=asc
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "words": [
      {
        "word": {
          "id": "uuid",
          "spelling": "hello",
          "phonetic": "həˈloʊ",
          "meanings": ["你好"],
          "examples": ["Hello!"]
        },
        "score": 45.5,
        "masteryLevel": 2,
        "accuracy": 0.75,
        "reviewCount": 10,
        "lastReviewDate": "2024-01-01T00:00:00.000Z",
        "nextReviewDate": "2024-01-02T00:00:00.000Z",
        "state": "learning"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### 获取单词完整学习历史

**GET** `/api/admin/users/:userId/words/:wordId/learning-history`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**查询参数**:
- `limit` (number, optional): 返回记录数量限制

**示例请求**:
```
GET /api/admin/users/:userId/words/:wordId/learning-history?limit=50
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "word": {
      "id": "uuid",
      "spelling": "hello",
      "phonetic": "həˈloʊ",
      "meanings": ["你好"],
      "examples": ["Hello!"]
    },
    "wordState": {
      "masteryLevel": 3,
      "easeFactor": 2.5,
      "reviewCount": 15,
      "lastReviewDate": "2024-01-01T00:00:00.000Z",
      "nextReviewDate": "2024-01-05T00:00:00.000Z",
      "state": "reviewing"
    },
    "wordScore": {
      "totalScore": 75.5,
      "accuracyScore": 80.0,
      "speedScore": 70.0,
      "stabilityScore": 75.0,
      "proficiencyScore": 78.0,
      "lastCalculated": "2024-01-01T00:00:00.000Z"
    },
    "records": [
      {
        "id": "uuid",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "selectedAnswer": "你好",
        "correctAnswer": "你好",
        "isCorrect": true,
        "responseTime": 2500,
        "dwellTime": 5000,
        "masteryLevelBefore": 2,
        "masteryLevelAfter": 3
      }
    ]
  }
}
```

---

### 获取单词得分历史

**GET** `/api/admin/users/:userId/words/:wordId/score-history`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**响应** (200):
```json
{
  "success": true,
  "data": {
    "currentScore": 75.5,
    "scoreHistory": [
      {
        "timestamp": "2024-01-01T00:00:00.000Z",
        "score": 75.5,
        "masteryLevel": 3,
        "isCorrect": true
      },
      {
        "timestamp": "2023-12-31T00:00:00.000Z",
        "score": 70.0,
        "masteryLevel": 2,
        "isCorrect": true
      }
    ]
  }
}
```

---

### 获取用户学习热力图数据

**GET** `/api/admin/users/:userId/heatmap`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**查询参数**:
- `days` (number, optional): 天数，默认为 90

**示例请求**:
```
GET /api/admin/users/:userId/heatmap?days=30
```

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "activityLevel": 15,
      "accuracy": 0.85,
      "averageScore": 75.5,
      "uniqueWords": 10
    },
    {
      "date": "2024-01-02",
      "activityLevel": 20,
      "accuracy": 0.90,
      "averageScore": 80.0,
      "uniqueWords": 12
    }
  ]
}
```

---

### 标记异常学习记录

**POST** `/api/admin/anomaly-flags`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**请求体**:
```json
{
  "userId": "uuid",
  "wordId": "uuid",
  "recordId": "uuid",
  "reason": "响应时间异常短",
  "notes": "可能存在作弊行为"
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "wordId": "uuid",
    "recordId": "uuid",
    "reason": "响应时间异常短",
    "notes": "可能存在作弊行为",
    "flaggedBy": "admin@example.com",
    "flaggedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 获取异常标记列表

**GET** `/api/admin/users/:userId/words/:wordId/anomaly-flags`

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "wordId": "uuid",
      "recordId": "uuid",
      "reason": "响应时间异常短",
      "notes": "可能存在作弊行为",
      "flaggedBy": "admin@example.com",
      "flaggedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 权限说明

### 用户权限
- 普通用户 (`USER`): 可以访问自己的数据和学习功能
- 管理员 (`ADMIN`): 可以访问所有用户数据和管理功能

### 管理员端点
以下端点需要管理员权限：
- `/api/admin/*` - 所有管理员相关端点

如果非管理员用户尝试访问管理员端点，将返回 403 Forbidden 错误。

---

## 数据导出格式

### CSV 格式
- 编码: UTF-8 with BOM
- 分隔符: 逗号 (,)
- 引号: 双引号 (")
- 换行符: CRLF (\r\n)

### Excel 格式
- 格式: XLSX (Office Open XML)
- 工作表名称: "用户单词数据"
- 包含表头行
- 自动列宽调整

---

## 版本历史

### v1.1.0 (2024-11-24)
- 新增单词得分范围查询端点
- 新增算法配置管理端点
- 新增单词学习状态删除端点
- 新增管理员用户详细统计端点
- 新增管理员数据导出功能（CSV/Excel）
- 新增管理员用户单词列表查询端点
- 新增管理员单词学习历史查询端点
- 新增管理员单词得分历史查询端点
- 新增管理员学习热力图数据端点
- 新增管理员异常标记功能

### v1.0.0 (2024-01-01)
- 初始版本发布
- 基础认证功能
- 单词管理功能
- 学习记录功能
