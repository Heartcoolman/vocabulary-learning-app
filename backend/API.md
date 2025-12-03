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

## AMAS 监控服务

监控服务用于采集AMAS智能学习算法的运行指标，评估系统健康状态，并在异常时触发告警。

### MonitoringService API

> 注意：以下是服务层API，不是HTTP端点。用于系统内部调用和测试。

#### 指标记录方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `recordDecisionLatency(latencyMs: number)` | 延迟毫秒数 | 记录AMAS决策延迟 |
| `recordSuccess()` | 无 | 记录成功请求 |
| `recordError()` | 无 | 记录错误请求 |
| `recordTimeout()` | 无 | 记录超时请求 |
| `recordDegradation()` | 无 | 记录降级请求 |
| `recordCircuitState(isOpen: boolean)` | 是否打开 | 记录熔断器状态 |
| `recordRewardResult(success: boolean)` | 是否成功 | 记录延迟奖励处理结果 |

#### 状态查询方法

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `getHealthStatus()` | `HealthStatus` | 获取系统健康状态 |
| `getActiveAlerts()` | `Alert[]` | 获取活动告警列表 |
| `getAlertHistory(limit?)` | `Alert[]` | 获取告警历史 |
| `getStats()` | `MonitoringStats` | 获取监控统计 |
| `resolveAlert(alertId: string)` | `boolean` | 手动解决告警 |

#### HealthStatus 结构

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    decision: ComponentHealth;  // 决策组件
    circuit: ComponentHealth;   // 熔断器
    reward: ComponentHealth;    // 延迟奖励
  };
  slo: {
    decisionLatency: boolean;   // 延迟SLO达成
    errorRate: boolean;         // 错误率SLO达成
    circuitHealth: boolean;     // 熔断器SLO达成
    rewardQueueHealth: boolean; // 奖励队列SLO达成
  };
  checkedAt: Date;
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  metrics?: Record<string, number>;
}
```

#### 告警严重级别

| 级别 | 响应时间 | 说明 |
|------|----------|------|
| P0 | 立即(15分钟内) | 关键告警，影响核心功能 |
| P1 | 1小时内 | 高优先级，影响性能或部分功能 |
| P2 | 4小时内 | 中优先级，影响较小 |
| P3 | 24小时内 | 低优先级，信息性告警 |

#### 默认SLO配置

| 指标 | 阈值 | 说明 |
|------|------|------|
| `decisionLatencyP95` | 100ms | 决策延迟P95 |
| `decisionLatencyP99` | 200ms | 决策延迟P99 |
| `errorRate` | 5% | 错误率 |
| `circuitOpenRate` | 10% | 熔断器打开率 |
| `degradationRate` | 20% | 降级率 |
| `timeoutRate` | 5% | 超时率 |
| `rewardFailureRate` | 10% | 延迟奖励失败率 |

---

## 学习队列相关

### 获取学习单词

**GET** `/api/learning/study-words`

获取掌握模式的学习单词列表。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `targetCount` (number, optional): 目标掌握数量，默认使用用户配置，最大100

**响应** (200):
```json
{
  "success": true,
  "data": {
    "words": [...],
    "targetCount": 10,
    "currentMastered": 5
  }
}
```

---

### 获取下一批学习单词

**POST** `/api/learning/next-words`

动态获取下一批学习单词（AMAS驱动的按需加载）。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sessionId": "session-uuid",
  "currentWordIds": ["word-1", "word-2"],
  "masteredWordIds": ["word-3"],
  "requestCount": 5
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "words": [...],
    "isComplete": false,
    "progress": { "mastered": 5, "target": 10 }
  }
}
```

---

### 调整学习队列

**POST** `/api/learning/adjust-words`

根据用户状态动态调整学习单词难度。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sessionId": "session-uuid",
  "currentWordIds": ["word-1", "word-2"],
  "masteredWordIds": ["word-3"],
  "userState": { "fatigue": 0.3, "attention": 0.8, "motivation": 0.7 },
  "recentPerformance": {
    "accuracy": 0.75,
    "avgResponseTime": 2500,
    "consecutiveWrong": 0
  },
  "adjustReason": "periodic"
}
```

**adjustReason 可选值**: `fatigue` | `struggling` | `excelling` | `periodic`

**响应** (200):
```json
{
  "success": true,
  "data": {
    "adjustments": {
      "remove": ["word-1"],
      "add": [{ "id": "word-4", "spelling": "example", "difficulty": 0.5 }]
    },
    "targetDifficulty": { "min": 0.3, "max": 0.6 },
    "reason": "检测到用户疲劳，降低难度",
    "nextCheckIn": 3
  }
}
```

---

### 提交答题结果

**POST** `/api/learning/submit-answer`

提交单词答题结果，触发AMAS状态更新。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sessionId": "session-uuid",
  "wordId": "word-1",
  "isCorrect": true,
  "responseTime": 2500,
  "dwellTime": 5000
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "isMastered": false,
    "newState": { ... },
    "suggestion": "保持当前节奏"
  }
}
```

---

## AMAS 核心相关

### 处理学习事件

**POST** `/api/amas/process`

处理单个学习事件，更新用户状态并获取策略建议。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "wordId": "word-1",
  "isCorrect": true,
  "responseTime": 2500,
  "dwellTime": 5000,
  "timestamp": 1701619200000,
  "pauseCount": 0,
  "switchCount": 0
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "strategy": {
      "interval_scale": 1.0,
      "new_ratio": 0.2,
      "difficulty": "mid",
      "batch_size": 8,
      "hint_level": 1
    },
    "state": {
      "A": 0.8,
      "F": 0.2,
      "M": 0.6,
      "C": { "mem": 0.7, "speed": 0.8, "stability": 0.75 }
    },
    "suggestion": "状态良好，继续学习",
    "shouldBreak": false
  }
}
```

---

### 获取用户状态

**GET** `/api/amas/state`

获取当前用户的AMAS状态。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "A": 0.8,
    "F": 0.2,
    "M": 0.6,
    "C": { "mem": 0.7, "speed": 0.8, "stability": 0.75 },
    "conf": 0.9,
    "ts": 1701619200000
  }
}
```

---

### 获取学习时间推荐

**GET** `/api/amas/time-recommend`

获取基于用户历史数据的最佳学习时间推荐。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "bestHours": [9, 10, 14, 15],
    "hourlyEfficiency": [...],
    "recommendation": "建议在上午9-10点学习，此时您的效率最高"
  }
}
```

---

### 获取趋势分析

**GET** `/api/amas/trends`

获取用户学习趋势分析报告。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `days` (number, optional): 分析天数，默认7天

**响应** (200):
```json
{
  "success": true,
  "data": {
    "accuracyTrend": "improving",
    "responseTimeTrend": "stable",
    "motivationTrend": "declining",
    "suggestions": ["建议增加休息时间", "尝试更多样化的学习内容"]
  }
}
```

---

### 获取状态历史

**GET** `/api/amas/state-history`

获取用户状态历史记录。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `period` (string): `7d` | `30d` | `90d`

**响应** (200):
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "history": [
      { "date": "2024-12-01", "avgAttention": 0.8, "avgFatigue": 0.2, "avgMotivation": 0.7 }
    ]
  }
}
```

---

## AMAS 可解释性相关

### 获取决策解释

**GET** `/api/amas/explain-decision`

获取特定决策的详细解释。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `decisionId` (string): 决策ID

**响应** (200):
```json
{
  "success": true,
  "data": {
    "decisionId": "dec-123",
    "stateSnapshot": { "A": 0.8, "F": 0.2, "M": 0.6 },
    "difficultyFactors": { "lengthFactor": 0.3, "accuracyFactor": 0.4 },
    "explanation": "由于用户注意力较高且疲劳度低，选择中等难度策略"
  }
}
```

---

### 获取学习曲线

**GET** `/api/amas/learning-curve`

获取用户学习曲线数据。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `wordId` (string, optional): 特定单词ID
- `days` (number, optional): 天数，默认30

**响应** (200):
```json
{
  "success": true,
  "data": {
    "curve": [
      { "date": "2024-12-01", "retention": 0.85, "reviewCount": 3 }
    ],
    "predictedRetention": 0.9
  }
}
```

---

### 获取决策时间线

**GET** `/api/amas/decision-timeline`

获取决策历史时间线。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `limit` (number, optional): 数量限制，默认20

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "decisionId": "dec-123",
      "timestamp": "2024-12-01T10:00:00Z",
      "action": { "difficulty": "mid", "batch_size": 8 },
      "triggerReason": "periodic"
    }
  ]
}
```

---

### 反事实分析

**POST** `/api/amas/counterfactual`

进行反事实分析，评估不同策略的可能结果。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "decisionId": "dec-123",
  "alternativeAction": { "difficulty": "easy", "batch_size": 5 }
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "originalOutcome": { "accuracy": 0.8, "retention": 0.85 },
    "counterfactualOutcome": { "accuracy": 0.9, "retention": 0.75 },
    "analysis": "降低难度可能提高短期准确率，但长期记忆效果可能下降"
  }
}
```

---

## 单词掌握度相关

### 获取单词掌握度评估

**GET** `/api/word-mastery/:wordId`

获取单个单词的掌握度评估。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `userFatigue` (number, optional): 用户疲劳度 0-1

**响应** (200):
```json
{
  "success": true,
  "data": {
    "wordId": "word-1",
    "rawScore": 0.75,
    "confidence": 0.9,
    "isLearned": true,
    "components": {
      "srsScore": 0.8,
      "actrRecall": 0.7,
      "recentAccuracy": 0.85
    },
    "suggestion": "已掌握，建议3天后复习"
  }
}
```

---

### 批量获取掌握度评估

**POST** `/api/word-mastery/batch`

批量获取多个单词的掌握度评估。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "wordIds": ["word-1", "word-2", "word-3"],
  "userFatigue": 0.3
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "evaluations": [
      { "wordId": "word-1", "rawScore": 0.75, "isLearned": true },
      { "wordId": "word-2", "rawScore": 0.45, "isLearned": false }
    ]
  }
}
```

---

### 获取复习历史轨迹

**GET** `/api/word-mastery/:wordId/trace`

获取单词的复习历史轨迹。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `limit` (number, optional): 数量限制，最大100

**响应** (200):
```json
{
  "success": true,
  "data": {
    "wordId": "word-1",
    "trace": [
      { "secondsAgo": 86400, "isCorrect": true },
      { "secondsAgo": 259200, "isCorrect": false }
    ],
    "count": 2
  }
}
```

---

### 获取用户掌握统计

**GET** `/api/word-mastery/stats`

获取用户整体掌握统计数据。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "totalWords": 500,
    "masteredWords": 150,
    "learningWords": 200,
    "newWords": 150,
    "averageScore": 0.65,
    "averageRecall": 0.72,
    "needReviewCount": 45
  }
}
```

---

### 预测最佳复习间隔

**GET** `/api/word-mastery/:wordId/interval`

预测单词的最佳复习间隔。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `targetRecall` (number, optional): 目标回忆率 0-1，默认0.9

**响应** (200):
```json
{
  "success": true,
  "data": {
    "interval": 172800,
    "humanReadable": "2天后"
  }
}
```

---

## 习惯画像相关

### 获取习惯画像

**GET** `/api/habit-profile`

获取用户学习习惯画像。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "chronotype": {
      "peakHours": [9, 10, 14],
      "type": "morning"
    },
    "learningStyle": {
      "visual": 0.6,
      "auditory": 0.3,
      "kinesthetic": 0.1
    },
    "sessionPattern": {
      "avgDuration": 1800,
      "preferredBatchSize": 10
    }
  }
}
```

---

### 结束学习会话

**POST** `/api/habit-profile/end-session`

结束学习会话并持久化习惯画像。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sessionId": "session-uuid"
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "会话已结束，习惯画像已更新"
}
```

---

## 徽章相关

### 获取用户徽章列表

**GET** `/api/badges`

获取用户已解锁的徽章列表。

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
      "id": "streak-7",
      "name": "连续学习7天",
      "category": "streak",
      "unlockedAt": "2024-12-01T10:00:00Z",
      "icon": "fire"
    }
  ]
}
```

---

### 检查并解锁徽章

**POST** `/api/badges/check`

检查并解锁符合条件的新徽章。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "newBadges": [
      { "id": "accuracy-90", "name": "准确率达到90%" }
    ]
  }
}
```

---

## 学习计划相关

### 获取学习计划

**GET** `/api/plan`

获取用户当前学习计划。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "dailyTarget": 20,
    "weeklyMilestone": 100,
    "currentProgress": {
      "today": 15,
      "thisWeek": 65
    },
    "wordBookAllocations": [
      { "wordBookId": "wb-1", "dailyCount": 10 }
    ]
  }
}
```

---

### 更新学习计划

**PUT** `/api/plan`

更新用户学习计划。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "dailyTarget": 25,
  "weeklyMilestone": 120
}
```

**响应** (200):
```json
{
  "success": true,
  "data": { ... }
}
```

---

## 监控告警相关

### 获取活跃告警

**GET** `/api/alerts/active`

获取当前所有活跃告警。

**响应** (200):
```json
{
  "count": 1,
  "alerts": [
    {
      "id": "alert-123",
      "metric": "http.request.duration.p95",
      "status": "firing",
      "severity": "high",
      "value": 1.5,
      "threshold": 1.0,
      "occurredAt": "2024-12-01T10:00:00Z",
      "message": "请求延迟P95超过阈值"
    }
  ]
}
```

---

### 获取告警历史

**GET** `/api/alerts/history`

获取告警历史记录。

**查询参数**:
- `limit` (number, optional): 数量限制，默认100，最大200

**响应** (200):
```json
{
  "count": 50,
  "alerts": [...]
}
```

---

## 统计展示相关 (About)

### 获取统计概览

**GET** `/api/about/stats/overview`

获取AMAS系统统计概览（无需认证）。

**响应** (200):
```json
{
  "success": true,
  "data": {
    "source": "real",
    "totalDecisions": 10000,
    "avgLatency": 50,
    "errorRate": 0.01
  }
}
```

---

### 获取算法分布

**GET** `/api/about/stats/algorithm-distribution`

获取算法使用分布统计。

**响应** (200):
```json
{
  "success": true,
  "data": {
    "linucb": 0.6,
    "thompson": 0.3,
    "heuristic": 0.1
  }
}
```

---

### 获取近期决策

**GET** `/api/about/stats/recent-decisions`

获取近期决策记录。

**查询参数**:
- `limit` (number, optional): 数量限制

**响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "decisionId": "dec-123",
      "timestamp": "2024-12-01T10:00:00Z",
      "algorithm": "linucb",
      "outcome": "success"
    }
  ]
}
```

---

### 获取Prometheus指标

**GET** `/api/about/metrics/prometheus`

获取Prometheus格式的监控指标。

**响应** (200):
```
# TYPE amas_decision_latency histogram
amas_decision_latency_bucket{le="10"} 100
amas_decision_latency_bucket{le="50"} 500
...
```

---

### 模拟决策

**POST** `/api/about/simulate`

模拟AMAS决策过程（用于演示）。

**请求体**:
```json
{
  "userState": { "A": 0.8, "F": 0.2, "M": 0.6 },
  "recentPerformance": { "accuracy": 0.75 }
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "decision": { ... },
    "pipeline": { ... },
    "explanation": "..."
  }
}
```

---

## 实验相关

### 获取实验状态

**GET** `/api/experiments/thompson-vs-linucb/status`

获取Thompson vs LinUCB实验的状态和分析结果。

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
    "status": "running",
    "pValue": 0.03,
    "effectSize": 0.15,
    "isSignificant": true,
    "winner": "thompson",
    "recommendation": "建议采用Thompson Sampling",
    "sampleSizes": [
      { "variantId": "thompson", "sampleCount": 500 },
      { "variantId": "linucb", "sampleCount": 480 }
    ]
  }
}
```

---

## 优化相关

### 获取优化建议

**GET** `/api/optimization/suggest`

获取下一个推荐的超参数组合。

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
    "params": {
      "alpha": 0.7,
      "explorationRate": 0.2
    },
    "paramSpace": { ... }
  }
}
```

---

### 记录优化评估

**POST** `/api/optimization/evaluate`

记录参数评估结果。

**请求头**:
```
Authorization: Bearer <token>
```

**权限要求**: 管理员

**请求体**:
```json
{
  "params": { "alpha": 0.7 },
  "value": 0.85
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "评估结果已记录"
}
```

---

## 评估相关

### 记录因果观察

**POST** `/api/evaluation/causal/observe`

记录因果推断观察数据。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "treatment": "strategy_a",
  "outcome": 0.85,
  "covariates": { "userLevel": "intermediate" }
}
```

**响应** (200):
```json
{
  "success": true,
  "message": "观察已记录"
}
```

---

### 获取因果效应

**GET** `/api/evaluation/causal/ate`

获取平均处理效应（ATE）。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
- `treatment` (string): 处理组标识

**响应** (200):
```json
{
  "success": true,
  "data": {
    "ate": 0.12,
    "confidence": [0.08, 0.16],
    "sampleSize": 1000
  }
}
```

---

## 词书相关

### 获取词书列表

**GET** `/api/wordbooks`

获取用户可用的词书列表。

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
      "id": "wb-1",
      "name": "四级词汇",
      "wordCount": 4500,
      "isSystem": true,
      "progress": { "learned": 1500, "total": 4500 }
    }
  ]
}
```

---

### 获取词书详情

**GET** `/api/wordbooks/:id`

获取词书详细信息。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "wb-1",
    "name": "四级词汇",
    "description": "大学英语四级核心词汇",
    "wordCount": 4500,
    "words": [...]
  }
}
```

---

### 订阅词书

**POST** `/api/wordbooks/:id/subscribe`

订阅/添加词书到用户学习列表。

**请求头**:
```
Authorization: Bearer <token>
```

**响应** (200):
```json
{
  "success": true,
  "message": "词书已添加"
}
```

---

## 版本历史

### v1.3.0 (2025-12-03)
- 新增学习队列API文档（study-words, next-words, adjust-words, submit-answer）
- 新增AMAS核心API文档（process, state, time-recommend, trends, state-history）
- 新增AMAS可解释性API文档（explain-decision, learning-curve, decision-timeline, counterfactual）
- 新增单词掌握度API文档（评估、批量评估、轨迹、统计、间隔预测）
- 新增习惯画像API文档
- 新增徽章API文档
- 新增学习计划API文档
- 新增监控告警API文档
- 新增统计展示API文档（About系列）
- 新增实验API文档（A/B测试）
- 新增优化API文档（贝叶斯优化）
- 新增评估API文档（因果推断）
- 新增词书API文档

### v1.2.0 (2024-11-26)
- 新增AMAS监控服务API文档
- 修复认证服务测试以匹配SHA256哈希token实现
- 修复错误中间件以正确推断业务错误类型
- 修复AB测试方差计算（添加m2参数）
- 修复延迟奖励服务Prisma错误类型

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
