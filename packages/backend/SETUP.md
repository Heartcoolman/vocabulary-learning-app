# 快速设置指南

本指南帮助你快速设置和运行后端服务。

## 步骤1: 安装PostgreSQL

### Windows

1. 下载PostgreSQL安装程序：
   - 访问 https://www.postgresql.org/download/windows/
   - 下载最新版本（推荐14或更高版本）

2. 运行安装程序：
   - 记住你设置的postgres用户密码
   - 默认端口：5432
   - 安装完成后，PostgreSQL会自动启动

3. 验证安装：
   打开命令提示符，运行：
   ```cmd
   psql --version
   ```

### macOS

使用Homebrew安装：

```bash
# 安装PostgreSQL
brew install postgresql@14

# 启动PostgreSQL服务
brew services start postgresql@14

# 验证安装
psql --version
```

### Linux (Ubuntu/Debian)

```bash
# 更新包列表
sudo apt update

# 安装PostgreSQL
sudo apt install postgresql postgresql-contrib

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 验证安装
psql --version
```

## 步骤2: 创建数据库

### Windows

1. 打开"SQL Shell (psql)"（从开始菜单）
2. 按Enter使用默认值，直到要求输入密码
3. 输入你在安装时设置的密码
4. 运行以下命令：

```sql
CREATE DATABASE vocab_db;
\q
```

### macOS/Linux

```bash
# 登录PostgreSQL
psql postgres

# 创建数据库
CREATE DATABASE vocab_db;

# 退出
\q
```

## 步骤3: 配置后端

1. 进入backend目录：
```bash
cd backend
```

2. 复制环境变量示例文件：
```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

3. 编辑 `.env` 文件，更新数据库连接字符串：

**如果你使用默认的postgres用户和密码：**
```env
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/vocab_db"
```

**其他配置保持默认即可：**
```env
JWT_SECRET="dev_secret_key_change_in_production_12345"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
```

## 步骤4: 安装依赖

```bash
npm install
```

## 步骤5: 初始化数据库

```bash
# 生成Prisma客户端
npm run prisma:generate

# 运行数据库迁移（创建表）
npm run prisma:migrate
```

当提示输入迁移名称时，输入：`init`

## 步骤6: 启动服务器

```bash
npm run dev
```

你应该看到：
```
✅ 数据库连接成功
🚀 服务器运行在 http://localhost:3000
📝 环境: development
🔒 CORS允许来源: http://localhost:5173
```

## 步骤7: 测试API

打开浏览器访问：
```
http://localhost:3000/health
```

你应该看到：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 常见问题

### Q: 数据库连接失败

**A:** 检查以下几点：
1. PostgreSQL服务是否正在运行
2. `.env` 文件中的数据库密码是否正确
3. 数据库名称是否为 `vocab_db`
4. 端口是否为 5432

### Q: 端口3000已被占用

**A:** 修改 `.env` 文件中的 `PORT` 值：
```env
PORT=3001
```

### Q: Prisma迁移失败

**A:** 尝试重置数据库：
```bash
npm run prisma:migrate reset
```
然后重新运行迁移。

### Q: 如何查看数据库内容？

**A:** 使用Prisma Studio：
```bash
npm run prisma:studio
```
这会在浏览器中打开一个可视化界面。

## 下一步

- 查看 [API文档](./API.md) 了解所有可用的API端点
- 查看 [README](./README.md) 了解更多功能
- 开始开发前端应用并连接到这个后端

## 需要帮助？

如果遇到问题：
1. 检查终端中的错误消息
2. 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 获取更详细的部署信息
3. 在GitHub上提交Issue

---

**提示**: 开发时，服务器会自动重启当你修改代码时（热重载）。
