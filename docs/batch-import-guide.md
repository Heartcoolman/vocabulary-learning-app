# 批量导入单词功能使用指南

## 功能位置

管理员后台 → 系统词库管理 → 选择词库 → 点击"导入"按钮

路径：`/admin` → `AdminWordBooks` → 点击词库卡片上的"导入"按钮

## 支持的文件格式

### 1. CSV 格式（.csv）

#### 必需字段
- `spelling` - 单词拼写（必填）
- `phonetic` - 音标（必填）
- `meanings` - 释义（必填，多个释义用 `|` 分隔）
- `examples` - 例句（必填，多个例句用 `|` 分隔）

#### 可选字段
- `audioUrl` - 音频URL（选填）

#### CSV 示例
```csv
spelling,phonetic,meanings,examples
abandon,/əˈbændən/,v. 放弃;遗弃|n. 放任,He abandoned his car in the snow.|They abandoned the project due to lack of funding.
ability,/əˈbɪləti/,n. 能力;才能,She has the ability to solve complex problems.|His ability in mathematics is impressive.
```

参考文件：`docs/batch-import-example.csv`

---

### 2. JSON 格式（.json）

#### 数据结构
必须是数组格式，每个对象包含以下字段：

```json
[
  {
    "spelling": "abandon",          // 必填：单词拼写
    "phonetic": "/əˈbændən/",       // 必填：音标
    "meanings": [                    // 必填：释义数组
      "v. 放弃;遗弃",
      "n. 放任"
    ],
    "examples": [                    // 必填：例句数组
      "He abandoned his car in the snow.",
      "They abandoned the project due to lack of funding."
    ],
    "audioUrl": "https://..."       // 可选：音频URL
  }
]
```

参考文件：`docs/batch-import-example.json`

---

## 使用流程

### 步骤 1: 上传文件
1. 点击上传区域或拖拽文件到上传区域
2. 选择 `.csv` 或 `.json` 格式的文件
3. 文件大小限制：最大 5MB

### 步骤 2: 预览与验证
- 系统自动解析文件并显示预览
- 前5条数据会显示在预览表格中
- 如果有错误，会在红色警告框中显示错误详情
- 有错误时"确认导入"按钮会被禁用

### 步骤 3: 确认导入
- 检查预览数据无误后，点击"确认导入"
- 系统会显示导入进度

### 步骤 4: 查看结果
- 显示成功导入的单词数量
- 显示失败的单词数量（如果有）
- 显示详细错误信息（如果有）

---

## 常见错误及解决方案

### 1. "单词拼写不能为空"
**原因**：CSV/JSON中某行的 `spelling` 字段为空
**解决**：检查并填写所有单词的拼写

### 2. "音标不能为空"
**原因**：CSV/JSON中某行的 `phonetic` 字段为空
**解决**：检查并填写所有单词的音标

### 3. "至少需要一个释义"
**原因**：`meanings` 字段为空或格式错误
**解决**：
- CSV: 确保 `meanings` 列有内容，多个释义用 `|` 分隔
- JSON: 确保 `meanings` 是非空数组

### 4. "至少需要一个例句"
**原因**：`examples` 字段为空或格式错误
**解决**：
- CSV: 确保 `examples` 列有内容，多个例句用 `|` 分隔
- JSON: 确保 `examples` 是非空数组

### 5. "不支持的文件格式"
**原因**：文件扩展名不是 `.csv` 或 `.json`
**解决**：重新保存文件为正确格式

### 6. "文件大小超过限制"
**原因**：文件超过 5MB
**解决**：分批导入，或压缩文件内容

---

## 功能特性

### ✅ 已实现
- CSV 和 JSON 格式支持
- 文件拖拽上传
- 实时解析和验证
- 预览前5条数据
- 详细的错误提示
- 批量导入API调用
- 导入结果统计
- 错误详情展示

### 🎨 UI组件
- `BatchImportModal.tsx` - 主模态框（4个步骤流程）
- `FileUpload.tsx` - 文件上传组件（支持拖拽）
- `importParsers.ts` - CSV/JSON解析工具
- 使用 Framer Motion 实现流畅动画
- 使用 Papa Parse 库解析CSV

---

## 技术细节

### API 调用
```typescript
await apiClient.batchImportWords(wordBookId, [
  {
    spelling: "abandon",
    phonetic: "/əˈbændən/",
    meanings: ["v. 放弃;遗弃", "n. 放任"],
    examples: ["He abandoned his car...", "They abandoned..."]
  }
]);
```

### 响应格式
```typescript
{
  imported: 5,      // 成功导入数量
  failed: 0,        // 失败数量
  errors: []        // 错误详情数组
}
```

---

## 注意事项

1. **CSV编码**：建议使用 UTF-8 编码，避免中文乱码
2. **分隔符**：CSV中多个释义/例句使用 `|` 分隔，不要使用逗号
3. **文件大小**：单次导入建议不超过1000个单词
4. **重复检查**：后端会检查重复单词，重复的会被跳过
5. **权限要求**：仅管理员可使用批量导入功能

---

## 示例文件

- **CSV示例**：`docs/batch-import-example.csv`
- **JSON示例**：`docs/batch-import-example.json`

可直接下载这两个文件作为模板使用。
