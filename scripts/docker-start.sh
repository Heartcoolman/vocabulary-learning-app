#!/bin/bash
# ============================================
# Docker 一键启动脚本
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🐳 单词学习应用 Docker 部署${NC}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose 未安装${NC}"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，从 .env.docker 复制...${NC}"
    cp .env.docker .env
    echo -e "${YELLOW}⚠️  请编辑 .env 文件配置密钥后重新运行${NC}"
fi

# 选择 docker-compose 命令
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

case "${1:-}" in
    "up"|"")
        echo -e "${GREEN}🚀 启动所有服务...${NC}"
        $COMPOSE_CMD up -d --build
        echo ""
        echo -e "${GREEN}✅ 服务已启动！${NC}"
        echo -e "   前端: http://localhost:${FRONTEND_PORT:-5173}"
        echo -e "   后端: http://localhost:${BACKEND_PORT:-3000}"
        echo -e "   数据库: localhost:${POSTGRES_PORT:-5432}"
        echo -e "   Redis: localhost:${REDIS_PORT:-6379}"
        ;;
    "down")
        echo -e "${YELLOW}🛑 停止所有服务...${NC}"
        $COMPOSE_CMD down
        ;;
    "logs")
        $COMPOSE_CMD logs -f "${2:-}"
        ;;
    "restart")
        echo -e "${YELLOW}🔄 重启所有服务...${NC}"
        $COMPOSE_CMD restart
        ;;
    "clean")
        echo -e "${RED}🧹 清理所有容器和数据卷...${NC}"
        $COMPOSE_CMD down -v --rmi local
        ;;
    "seed")
        echo -e "${GREEN}🌱 执行数据库种子...${NC}"
        $COMPOSE_CMD exec backend npx prisma db seed
        ;;
    "migrate")
        echo -e "${GREEN}📦 执行数据库迁移...${NC}"
        $COMPOSE_CMD exec backend npx prisma migrate deploy
        ;;
    "status")
        $COMPOSE_CMD ps
        ;;
    *)
        echo "用法: $0 {up|down|logs|restart|clean|seed|migrate|status}"
        echo ""
        echo "  up       - 启动所有服务 (默认)"
        echo "  down     - 停止所有服务"
        echo "  logs     - 查看日志 (可选: logs backend)"
        echo "  restart  - 重启所有服务"
        echo "  clean    - 清理容器和数据卷"
        echo "  seed     - 执行数据库种子"
        echo "  migrate  - 执行数据库迁移"
        echo "  status   - 查看服务状态"
        exit 1
        ;;
esac
