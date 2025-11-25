#!/bin/bash

# 后端部署脚本
# 用法: ./scripts/deploy-backend.sh
# 环境变量:
#   RUN_DB_SEED=true     - 执行数据库种子（首次部署时使用）
#   SKIP_NPM_PRUNE=true  - 跳过 npm prune（保留 devDependencies）
#   HEALTHCHECK_URL      - 健康检查 URL（默认: http://localhost:3000/health）

set -euo pipefail  # 遇到错误立即退出，未定义变量报错，管道错误传递

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

cd "backend"

# 1. 检查环境变量文件
echo -e "${YELLOW}📋 检查环境变量...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
    echo "请复制 .env.example 并配置环境变量"
    exit 1
fi

# 2. 检查数据库连接 URL
DATABASE_URL_VALUE="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL_VALUE" ]; then
    DATABASE_URL_VALUE="$(grep '^DATABASE_URL=' ".env" | head -n 1 | cut -d '=' -f2- || true)"
fi
if [ -z "$DATABASE_URL_VALUE" ]; then
    echo -e "${RED}❌ 错误: DATABASE_URL 未设置${NC}"
    echo "请在 .env 文件中设置 DATABASE_URL 或导出环境变量"
    exit 1
fi
echo -e "${GREEN}✅ DATABASE_URL 已配置${NC}"

# 3. 安装依赖（包含 devDependencies 以便编译）
echo -e "${YELLOW}📦 安装依赖...${NC}"
npm ci

# 4. 生成 Prisma 客户端
echo -e "${YELLOW}⚙️  生成 Prisma 客户端...${NC}"
npx prisma generate

# 5. 运行数据库迁移
echo -e "${YELLOW}🗄️  运行数据库迁移...${NC}"
npx prisma migrate deploy

# 6. 种子数据（可选，首次部署时使用）
if [ "${RUN_DB_SEED:-false}" = "true" ]; then
    echo -e "${YELLOW}🌱 执行数据库种子...${NC}"
    npx prisma db seed
fi

# 7. 构建应用
echo -e "${YELLOW}🔨 构建应用...${NC}"
npm run build

# 8. 移除开发依赖（可选，生产环境推荐）
if [ "${SKIP_NPM_PRUNE:-false}" != "true" ]; then
    echo -e "${YELLOW}🧹 清理开发依赖...${NC}"
    npm prune --production
fi

# 9. 重启 PM2 进程（使用 reload 实现零停机）
echo -e "${YELLOW}🔄 重启应用...${NC}"
if command -v pm2 >/dev/null 2>&1; then
    if pm2 list | grep -q "vocabulary-api"; then
        pm2 reload vocabulary-api
        echo -e "${GREEN}✅ 应用已平滑重启${NC}"
    else
        echo -e "${YELLOW}⚠️  PM2 进程不存在，请手动启动:${NC}"
        echo "   pm2 start dist/index.js --name vocabulary-api"
    fi
else
    echo -e "${YELLOW}⚠️  PM2 未安装，请手动启动应用${NC}"
fi

# 10. 健康检查
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://localhost:3000/health}"
if command -v curl >/dev/null 2>&1; then
    echo -e "${YELLOW}💚 执行健康检查...${NC}"
    sleep 3  # 等待应用启动
    if curl -fsSL --max-time 10 "$HEALTHCHECK_URL" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过${NC}"
    else
        echo -e "${YELLOW}⚠️  健康检查失败，请检查应用状态${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  curl 不可用，跳过健康检查${NC}"
fi

echo -e "${GREEN}✅ 后端部署完成！${NC}"
echo ""
echo "查看日志: pm2 logs vocabulary-api"
echo "查看状态: pm2 status"
