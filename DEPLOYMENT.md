# 部署指南

本文档描述如何将词汇学习应用部署到生产环境。

## 目录

- [前置要求](#前置要求)
- [后端部署](#后端部署)
- [前端部署](#前端部署)
- [数据库设置](#数据库设置)
- [环境变量配置](#环境变量配置)
- [HTTPS配置](#https配置)
- [监控和日志](#监控和日志)

## 前置要求

### 系统要求

- Node.js 18+ 
- PostgreSQL 14+
- Nginx (推荐)
- SSL证书 (Let's Encrypt推荐)

### 域名和DNS

- 后端API域名: `api.yourdomain.com`
- 前端域名: `app.yourdomain.com`

## 后端部署

### 1. 准备服务器

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 安装PM2（进程管理器）
sudo npm install -g pm2
```

### 2. 克隆代码

```bash
# 创建应用目录
sudo mkdir -p /var/www/vocabulary-app
cd /var/www/vocabulary-app

# 克隆代码（或使用其他方式上传）
git clone <your-repo-url> .

# 进入后端目录
cd backend
```

### 3. 安装依赖

```bash
npm install --production
```

### 4. 配置环境变量

```bash
# 创建生产环境配置
cp .env.example .env

# 编辑环境变量
nano .env
```

配置以下变量：

```env
# 数据库
DATABASE_URL=postgresql://username:password@localhost:5432/vocabulary_db

# JWT密钥（使用强随机字符串）
JWT_SECRET=your_very_long_and_random_secret_key_here
JWT_EXPIRES_IN=24h

# 服务器
PORT=3000
NODE_ENV=production

# CORS（前端域名）
CORS_ORIGIN=https://app.yourdomain.com
```

### 5. 数据库迁移

```bash
# 运行Prisma迁移
npx prisma migrate deploy

# （可选）运行种子数据
npx prisma db seed
```

### 6. 构建应用

```bash
npm run build
```

### 7. 使用PM2启动

```bash
# 启动应用
pm2 start dist/index.js --name vocabulary-api

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs vocabulary-api
```

### 8. 配置Nginx反向代理

创建Nginx配置文件：

```bash
sudo nano /etc/nginx/sites-available/vocabulary-api
```

添加以下内容：

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
sudo ln -s /etc/nginx/sites-available/vocabulary-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 前端部署

### 1. 构建前端

```bash
# 在本地或CI/CD环境中
cd frontend

# 安装依赖
npm install

# 配置环境变量
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production

# 构建
npm run build
```

### 2. 上传构建文件

```bash
# 将dist目录上传到服务器
scp -r dist/* user@server:/var/www/vocabulary-app/frontend/
```

### 3. 配置Nginx

创建前端Nginx配置：

```bash
sudo nano /etc/nginx/sites-available/vocabulary-frontend
```

添加以下内容：

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;
    root /var/www/vocabulary-app/frontend;
    index index.html;

    # Gzip压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/vocabulary-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS配置

使用Let's Encrypt获取免费SSL证书：

```bash
# 安装Certbot
sudo apt install -y certbot python3-certbot-nginx

# 为后端API获取证书
sudo certbot --nginx -d api.yourdomain.com

# 为前端获取证书
sudo certbot --nginx -d app.yourdomain.com

# 设置自动续期
sudo certbot renew --dry-run
```

Certbot会自动修改Nginx配置以启用HTTPS。

## 数据库设置

### PostgreSQL安全配置

```bash
# 切换到postgres用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE vocabulary_db;
CREATE USER vocabulary_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE vocabulary_db TO vocabulary_user;

# 退出
\q
```

### 数据库备份

设置自动备份：

```bash
# 创建备份脚本
sudo nano /usr/local/bin/backup-vocabulary-db.sh
```

添加以下内容：

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/vocabulary-db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U vocabulary_user vocabulary_db | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# 保留最近7天的备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

设置权限和定时任务：

```bash
sudo chmod +x /usr/local/bin/backup-vocabulary-db.sh

# 添加到crontab（每天凌晨2点备份）
sudo crontab -e
# 添加: 0 2 * * * /usr/local/bin/backup-vocabulary-db.sh
```

## 环境变量配置

### 后端环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| DATABASE_URL | PostgreSQL连接字符串 | postgresql://user:pass@localhost:5432/db |
| JWT_SECRET | JWT签名密钥 | 至少32字符的随机字符串 |
| JWT_EXPIRES_IN | JWT过期时间 | 24h |
| PORT | 服务器端口 | 3000 |
| NODE_ENV | 运行环境 | production |
| CORS_ORIGIN | 允许的前端域名 | https://app.yourdomain.com |

### 前端环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_API_URL | 后端API地址 | https://api.yourdomain.com |

## 监控和日志

### PM2监控

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs vocabulary-api

# 查看详细信息
pm2 show vocabulary-api

# 重启应用
pm2 restart vocabulary-api

# 停止应用
pm2 stop vocabulary-api
```

### Nginx日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 数据库日志

```bash
# PostgreSQL日志
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

## 性能优化

### 1. 启用Nginx缓存

```nginx
# 在http块中添加
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

# 在location块中添加
proxy_cache api_cache;
proxy_cache_valid 200 10m;
proxy_cache_bypass $http_cache_control;
add_header X-Cache-Status $upstream_cache_status;
```

### 2. 数据库连接池

在后端代码中已配置Prisma连接池，默认设置：

```javascript
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3. 启用HTTP/2

在Nginx配置中：

```nginx
listen 443 ssl http2;
```

## 故障排查

### 后端无法启动

```bash
# 检查日志
pm2 logs vocabulary-api

# 检查端口占用
sudo lsof -i :3000

# 检查数据库连接
psql -U vocabulary_user -d vocabulary_db -h localhost
```

### 前端无法访问

```bash
# 检查Nginx配置
sudo nginx -t

# 检查Nginx状态
sudo systemctl status nginx

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

### 数据库连接失败

```bash
# 检查PostgreSQL状态
sudo systemctl status postgresql

# 检查连接
psql -U vocabulary_user -d vocabulary_db

# 查看PostgreSQL日志
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

## 更新部署

### 后端更新

```bash
cd /var/www/vocabulary-app/backend

# 拉取最新代码
git pull

# 安装依赖
npm install --production

# 运行迁移
npx prisma migrate deploy

# 重新构建
npm run build

# 重启应用
pm2 restart vocabulary-api
```

### 前端更新

```bash
# 在本地构建
npm run build

# 上传到服务器
scp -r dist/* user@server:/var/www/vocabulary-app/frontend/

# 清除Nginx缓存
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx
```

## 安全检查清单

- [ ] 使用HTTPS
- [ ] 配置强JWT密钥
- [ ] 限制CORS来源
- [ ] 启用速率限制
- [ ] 定期更新依赖
- [ ] 配置防火墙
- [ ] 定期备份数据库
- [ ] 监控应用日志
- [ ] 使用环境变量存储敏感信息
- [ ] 禁用不必要的端口

## 支持

如有问题，请查看：
- 后端日志: `pm2 logs vocabulary-api`
- Nginx日志: `/var/log/nginx/`
- 数据库日志: `/var/log/postgresql/`

---

**最后更新**: 2024年
