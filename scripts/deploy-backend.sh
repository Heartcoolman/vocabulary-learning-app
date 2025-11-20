#!/bin/bash

# 后端部署脚本
# 用法: ./scripts/deploy-backend.sh

set -e  # 遇到错误立即退出

echo "🚀 开始部署后端..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -d "backend" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

cd backend

# 1. 检查环境变量
echo -e "${YELLOW}📋 检查环境变量...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
    echo "请复制 .env.example 并配置环境变量"
    exit 1
fi

# 2. 安装依赖
echo -e "${YELLOW}📦 安装依赖...${NC}"
npm install --production

# 3. 运行数据库迁移
echo -e "${YELLOW}🗄️  运行数据库迁移...${NC}"
npx prisma migrate deploy

# 4. 生成Prisma客户端
echo -e "${YELLOW}⚙️  生成Prisma客户端...${NC}"
npx prisma generate

# 5. 构建应用
echo -e "${YELLOW}🔨 构建应用...${NC}"
npm run build

# 6. 重启PM2进程（如果存在）
echo -e "${YELLOW}🔄 重启应用...${NC}"
if pm2 list | grep -q "vocabulary-api"; then
    pm2 restart vocabulary-api
    echo -e "${GREEN}✅ 应用已重启${NC}"
else
    echo -e "${YELLOW}⚠️  PM2进程不存在，请手动启动:${NC}"
    echo "   pm2 start dist/index.js --name vocabulary-api"
fi

echo -e "${GREEN}✅ 后端部署完成！${NC}"
echo ""
echo "查看日志: pm2 logs vocabulary-api"
echo "查看状态: pm2 status"
