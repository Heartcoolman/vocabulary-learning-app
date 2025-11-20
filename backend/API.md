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
