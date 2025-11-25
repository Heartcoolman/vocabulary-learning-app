#!/bin/bash

# 前端部署脚本
# 用法: ./scripts/deploy-frontend.sh [production|staging]
# 环境变量:
#   SKIP_TYPE_CHECK=true - 跳过类型检查（不推荐）

set -euo pipefail  # 遇到错误立即退出，未定义变量报错，管道错误传递

echo "🚀 开始部署前端..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 获取环境参数
ENV="${1:-production}"

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 错误: 请在前端项目根目录运行此脚本${NC}"
    exit 1
fi

# 1. 检查环境变量文件
echo -e "${YELLOW}📋 检查环境变量...${NC}"
ENV_FILE=".env.${ENV}"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ 错误: $ENV_FILE 文件不存在${NC}"
    echo "请创建环境变量文件"
    exit 1
fi
echo -e "${GREEN}✅ 环境变量文件已找到: $ENV_FILE${NC}"

# 2. 安装依赖（使用 ci 确保可复现性）
echo -e "${YELLOW}📦 安装依赖...${NC}"
npm ci

# 3. 运行类型检查
if [ "${SKIP_TYPE_CHECK:-false}" != "true" ]; then
    echo -e "${YELLOW}🔍 运行类型检查...${NC}"
    if ! npm run type-check; then
        echo -e "${RED}❌ 类型检查失败，请修复错误后重试${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ 类型检查通过${NC}"
else
    echo -e "${YELLOW}⚠️  跳过类型检查（SKIP_TYPE_CHECK=true）${NC}"
fi

# 4. 构建应用
echo -e "${YELLOW}🔨 构建应用 (${ENV})...${NC}"
if [ "$ENV" = "production" ]; then
    npm run build
else
    npm run build -- --mode "$ENV"
fi

# 5. 检查构建输出
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ 错误: 构建失败，dist 目录不存在${NC}"
    exit 1
fi

# 6. 显示构建统计
echo -e "${YELLOW}📊 构建统计:${NC}"
if command -v du >/dev/null 2>&1; then
    echo "   总大小: $(du -sh dist | cut -f1)"
    echo "   文件数: $(find dist -type f | wc -l)"
fi

echo -e "${GREEN}✅ 前端构建完成！${NC}"
echo ""
echo "构建输出目录: dist/"
echo ""
echo "部署到服务器:"
echo "  scp -r dist/* user@server:/var/www/vocabulary-app/frontend/"
echo ""
echo "或使用 rsync:"
echo "  rsync -avz --delete dist/ user@server:/var/www/vocabulary-app/frontend/"
