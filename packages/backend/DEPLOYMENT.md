# 部署指南

本文档提供了后端服务的详细部署步骤。

## 前置要求

- Node.js 20+
- PostgreSQL 14+
- npm 或 yarn

## 本地开发部署

### 1. 安装PostgreSQL

#### Windows
下载并安装 [PostgreSQL](https://www.postgresql.org/download/windows/)

#### macOS
```bash
brew install postgresql@14
brew services start postgresql@14
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. 创建数据库

```bash
# 登录PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE vocab_db;

# 创建用户（可选）
CREATE USER vocab_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE vocab_db TO vocab_user;

# 退出
\q
```

### 3. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，设置正确的数据库连接字符串：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vocab_db"
JWT_SECRET="your_strong_secret_key_here"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
```

### 4. 安装依赖

```bash
npm install
```

### 5. 运行数据库迁移

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 6. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

访问 `http://localhost:3000/health` 检查服务器状态。

## 生产环境部署

### 方案1: 传统服务器部署

#### 1. 准备服务器

- Ubuntu 20.04+ 或其他Linux发行版
- 至少1GB RAM
- 安装Node.js和PostgreSQL

#### 2. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 安装PM2（进程管理器）
sudo npm install -g pm2
```

#### 3. 配置PostgreSQL

```bash
# 切换到postgres用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE vocab_db;
CREATE USER vocab_user WITH PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE vocab_db TO vocab_user;
\q
```

#### 4. 部署应用

```bash
# 克隆代码或上传文件
cd /var/www
git clone <your-repo-url>
cd vocab-learning-app/backend

# 安装依赖
npm ci --only=production

# 配置环境变量
nano .env
```

设置生产环境变量：

```env
DATABASE_URL="postgresql://vocab_user:strong_password_here@localhost:5432/vocab_db"
JWT_SECRET="<generate_strong_random_secret>"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="production"
CORS_ORIGIN="https://your-frontend-domain.com"
```

#### 5. 运行迁移和构建

```bash
npm run prisma:generate
npm run prisma:migrate
npm run build
```

#### 6. 使用PM2启动应用

```bash
# 启动应用
pm2 start dist/index.js --name vocab-backend

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs vocab-backend

# 查看状态
pm2 status
```

#### 7. 配置Nginx反向代理

安装Nginx：

```bash
sudo apt install -y nginx
```

创建Nginx配置：

```bash
sudo nano /etc/nginx/sites-available/vocab-backend
```

添加配置：

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/vocab-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 8. 配置SSL（使用Let's Encrypt）

```bash
# 安装Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d api.yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

### 方案2: Docker部署

#### 1. 创建Dockerfile

在backend目录创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制package文件
COPY package*.json ./
COPY prisma ./prisma/

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生成Prisma客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
```

#### 2. 创建docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: vocab_db
      POSTGRES_USER: vocab_user
      POSTGRES_PASSWORD: strong_password_here
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vocab_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://vocab_user:strong_password_here@postgres:5432/vocab_db
      JWT_SECRET: your_strong_secret_key
      JWT_EXPIRES_IN: 24h
      PORT: 3000
      NODE_ENV: production
      CORS_ORIGIN: https://your-frontend-domain.com
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -c "npx prisma migrate deploy && npm start"

volumes:
  postgres_data:
```

#### 3. 构建和运行

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend

# 停止服务
docker-compose down
```

### 方案3: 云平台部署

#### Heroku

1. 安装Heroku CLI
2. 创建应用：
```bash
heroku create vocab-backend
```

3. 添加PostgreSQL：
```bash
heroku addons:create heroku-postgresql:mini
```

4. 设置环境变量：
```bash
heroku config:set JWT_SECRET=your_secret
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://your-frontend.com
```

5. 部署：
```bash
git push heroku main
```

6. 运行迁移：
```bash
heroku run npm run prisma:migrate
```

#### Railway

1. 在 [Railway](https://railway.app) 创建新项目
2. 添加PostgreSQL数据库
3. 连接GitHub仓库
4. 设置环境变量
5. 自动部署

#### DigitalOcean App Platform

1. 在DigitalOcean创建新App
2. 连接GitHub仓库
3. 添加PostgreSQL数据库
4. 配置环境变量
5. 部署

## 数据库备份

### 手动备份

```bash
# 备份数据库
pg_dump -U vocab_user vocab_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复数据库
psql -U vocab_user vocab_db < backup_20240101_120000.sql
```

### 自动备份脚本

创建 `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/vocab_db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR
pg_dump -U vocab_user vocab_db > $BACKUP_FILE
gzip $BACKUP_FILE

# 删除7天前的备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

设置定时任务：

```bash
# 编辑crontab
crontab -e

# 每天凌晨2点备份
0 2 * * * /path/to/backup.sh
```

## 监控和日志

### PM2监控

```bash
# 查看实时日志
pm2 logs vocab-backend

# 查看监控面板
pm2 monit

# 查看详细信息
pm2 show vocab-backend
```

### 日志管理

使用PM2的日志轮转：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 性能优化

### 1. 数据库优化

```sql
-- 创建索引
CREATE INDEX idx_words_user_id ON words(user_id);
CREATE INDEX idx_records_user_id ON answer_records(user_id);
CREATE INDEX idx_records_word_id ON answer_records(word_id);
CREATE INDEX idx_sessions_token ON sessions(token);
```

### 2. 启用压缩

在Express中添加压缩中间件：

```bash
npm install compression
```

```typescript
import compression from 'compression';
app.use(compression());
```

### 3. 配置连接池

在Prisma schema中：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  pool_timeout = 20
  connection_limit = 10
}
```

## 故障排除

### 数据库连接失败

检查PostgreSQL是否运行：
```bash
sudo systemctl status postgresql
```

检查连接字符串是否正确：
```bash
psql $DATABASE_URL
```

### 端口被占用

查找占用端口的进程：
```bash
lsof -i :3000
```

杀死进程：
```bash
kill -9 <PID>
```

### PM2应用崩溃

查看错误日志：
```bash
pm2 logs vocab-backend --err
```

重启应用：
```bash
pm2 restart vocab-backend
```

### 内存不足

增加Node.js内存限制：
```bash
pm2 start dist/index.js --name vocab-backend --node-args="--max-old-space-size=2048"
```

## 安全检查清单

- [ ] 使用强随机JWT密钥
- [ ] 启用HTTPS
- [ ] 配置正确的CORS源
- [ ] 设置速率限制
- [ ] 定期更新依赖
- [ ] 使用环境变量存储敏感信息
- [ ] 配置防火墙规则
- [ ] 定期备份数据库
- [ ] 监控应用日志
- [ ] 使用非root用户运行应用

## 更新应用

```bash
# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 运行迁移
npm run prisma:migrate

# 重新构建
npm run build

# 重启应用
pm2 restart vocab-backend
```

## 回滚

```bash
# 回滚到上一个版本
git checkout <previous-commit-hash>

# 重新构建和重启
npm run build
pm2 restart vocab-backend

# 如需回滚数据库迁移
npm run prisma:migrate reset
```

## 支持

如遇到问题，请查看：
- [API文档](./API.md)
- [README](./README.md)
- GitHub Issues

---

**最后更新**: 2024年
