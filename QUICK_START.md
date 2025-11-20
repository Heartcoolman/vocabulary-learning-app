# 快速启动指南

## ✅ 数据库已配置

远程PostgreSQL数据库已成功连接：
- **地址**: 120.27.22.134:5432
- **数据库**: vocabulary_db
- **状态**: ✅ 已连接并初始化

## 🚀 启动应用

### 1. 启动后端（已启动）

```bash
cd backend
npm run dev
```

后端运行在: http://localhost:3000

### 2. 启动前端

打开新终端：

```bash
npm run dev
```

前端运行在: http://localhost:5173

## 📝 测试应用

### 1. 注册新用户

访问: http://localhost:5173/register

填写：
- 用户名: 测试用户
- 邮箱: test@example.com
- 密码: test12138

### 2. 登录

使用刚才注册的账号登录

### 3. 添加单词

进入"词库"页面，点击"添加单词"

### 4. 开始学习

进入"学习"页面，开始学习单词

### 5. 查看同步状态

右下角会显示同步状态指示器：
- 🔄 正在同步
- ✅ 已同步
- 🟡 待同步

## 🔍 验证数据同步

### 方法1: 使用Prisma Studio

```bash
cd backend
npx prisma studio
```

会打开一个Web界面，可以查看数据库中的数据

### 方法2: 多设备测试

1. 在电脑上添加单词
2. 在手机浏览器访问应用
3. 登录同一账号
4. 查看是否同步了单词

## 📊 当前状态

✅ 后端服务器: 运行中 (http://localhost:3000)  
✅ 数据库连接: 成功  
✅ 数据库迁移: 完成  
⏳ 前端服务器: 待启动  

## 🛠️ 常用命令

### 后端

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 生产模式
npm start

# 查看数据库
npx prisma studio

# 数据库迁移
npx prisma migrate dev
```

### 前端

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 预览构建
npm run preview

# 运行测试
npm test
```

## 🔐 安全提示

⚠️ **重要**: 当前配置用于开发环境

生产环境部署时需要：
1. 修改JWT_SECRET为强随机字符串
2. 配置HTTPS
3. 设置防火墙规则
4. 配置数据库访问白名单
5. 使用环境变量管理敏感信息

## 📚 更多文档

- [部署指南](./DEPLOYMENT.md)
- [用户指南](./docs/USER_GUIDE.md)
- [API文档](./backend/API.md)
- [实施总结](./IMPLEMENTATION_SUMMARY.md)

---

**祝你使用愉快！** 🎉
