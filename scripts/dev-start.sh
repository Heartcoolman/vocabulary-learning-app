#!/bin/bash
# ============================================
# 本地开发环境启动脚本
# 启动 Docker 数据库 + 执行迁移 + 启动后端
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${GREEN}🚀 单词学习应用 - 本地开发环境${NC}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装${NC}"
    exit 1
fi

# 选择 docker compose 命令
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

case "${1:-}" in
    "db")
        echo -e "${GREEN}🐘 启动数据库服务...${NC}"
        $COMPOSE_CMD -f docker-compose.dev.yml up -d
        
        echo -e "${YELLOW}⏳ 等待数据库就绪...${NC}"
        sleep 5
        
        # 检查数据库是否就绪
        for i in {1..30}; do
            if docker exec danci-postgres-dev pg_isready -U danci -d vocabulary_db > /dev/null 2>&1; then
                echo -e "${GREEN}✅ 数据库已就绪${NC}"
                break
            fi
            if [ $i -eq 30 ]; then
                echo -e "${RED}❌ 数据库启动超时${NC}"
                exit 1
            fi
            sleep 1
        done
        
        echo ""
        echo -e "${GREEN}📦 数据库服务已启动:${NC}"
        echo -e "   PostgreSQL: localhost:5432"
        echo -e "   Redis:      localhost:6379"
        echo ""
        echo -e "运行迁移: ${YELLOW}./scripts/dev-start.sh migrate${NC}"
        ;;
        
    "migrate")
        echo -e "${GREEN}📦 执行数据库迁移...${NC}"
        cd backend
        npx prisma migrate deploy
        echo -e "${GREEN}✅ 迁移完成${NC}"
        ;;
        
    "seed")
        echo -e "${GREEN}🌱 执行数据库种子...${NC}"
        cd backend
        npx prisma db seed
        echo -e "${GREEN}✅ 种子数据已导入${NC}"
        ;;
        
    "reset")
        echo -e "${YELLOW}⚠️  重置数据库（会删除所有数据）...${NC}"
        read -p "确认重置? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd backend
            npx prisma migrate reset --force
            echo -e "${GREEN}✅ 数据库已重置${NC}"
        fi
        ;;
        
    "backend")
        echo -e "${GREEN}🔧 启动后端服务...${NC}"
        cd backend
        npm run dev
        ;;
        
    "frontend")
        echo -e "${GREEN}🎨 启动前端服务...${NC}"
        npm run dev
        ;;
        
    "all")
        echo -e "${GREEN}🚀 启动完整开发环境...${NC}"
        
        # 1. 启动数据库
        $COMPOSE_CMD -f docker-compose.dev.yml up -d
        
        echo -e "${YELLOW}⏳ 等待数据库就绪...${NC}"
        sleep 5
        
        for i in {1..30}; do
            if docker exec danci-postgres-dev pg_isready -U danci -d vocabulary_db > /dev/null 2>&1; then
                echo -e "${GREEN}✅ 数据库已就绪${NC}"
                break
            fi
            sleep 1
        done
        
        # 2. 执行迁移
        echo -e "${GREEN}📦 执行数据库迁移...${NC}"
        cd backend
        npx prisma migrate deploy
        
        echo ""
        echo -e "${GREEN}✅ 开发环境已就绪！${NC}"
        echo ""
        echo -e "启动后端: ${YELLOW}cd backend && npm run dev${NC}"
        echo -e "启动前端: ${YELLOW}npm run dev${NC}"
        ;;
        
    "stop")
        echo -e "${YELLOW}🛑 停止数据库服务...${NC}"
        $COMPOSE_CMD -f docker-compose.dev.yml down
        echo -e "${GREEN}✅ 服务已停止${NC}"
        ;;
        
    "clean")
        echo -e "${RED}🧹 清理所有开发数据...${NC}"
        read -p "确认清理? 这将删除所有本地数据库数据 (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $COMPOSE_CMD -f docker-compose.dev.yml down -v
            echo -e "${GREEN}✅ 已清理${NC}"
        fi
        ;;
        
    "remote")
        echo -e "${YELLOW}🔄 切换到远程数据库...${NC}"
        if [ -f "backend/.env.remote" ]; then
            cp backend/.env.remote backend/.env
            echo -e "${GREEN}✅ 已切换到远程数据库${NC}"
            echo -e "   DATABASE_URL 已更新为远程地址"
        else
            echo -e "${RED}❌ backend/.env.remote 文件不存在${NC}"
        fi
        ;;
        
    "local")
        echo -e "${YELLOW}🔄 切换到本地数据库...${NC}"
        cat > backend/.env << 'EOF'
# ============================================
# 本地 Docker 数据库配置
# 切换到远程: cp .env.remote .env
# ============================================

# 数据库配置 - 本地 Docker PostgreSQL + TimescaleDB
DATABASE_URL="postgresql://danci:danci_dev_2024@localhost:5432/vocabulary_db"

# Redis 配置
REDIS_URL="redis://localhost:6379"

# JWT配置
JWT_SECRET="vocab_learning_jwt_secret_key_2024_change_this_in_production"
JWT_EXPIRES_IN="24h"

# 服务器配置
PORT=3000
NODE_ENV="development"

# CORS配置 - 允许前端访问
CORS_ORIGIN="http://localhost:5173"

# AMAS Decision Pipeline 配置
AMAS_ABOUT_DATA_SOURCE="real"
AMAS_REAL_DATA_READ_ENABLED="true"
AMAS_REAL_DATA_WRITE_ENABLED="true"
EOF
        echo -e "${GREEN}✅ 已切换到本地数据库${NC}"
        ;;
        
    "status")
        echo -e "${GREEN}📊 服务状态:${NC}"
        $COMPOSE_CMD -f docker-compose.dev.yml ps
        ;;
        
    "logs")
        $COMPOSE_CMD -f docker-compose.dev.yml logs -f "${2:-}"
        ;;
        
    *)
        echo "用法: $0 {命令}"
        echo ""
        echo "数据库命令:"
        echo "  db        - 启动 Docker 数据库服务"
        echo "  migrate   - 执行数据库迁移"
        echo "  seed      - 导入种子数据"
        echo "  reset     - 重置数据库（危险）"
        echo "  stop      - 停止数据库服务"
        echo "  clean     - 清理所有数据（危险）"
        echo ""
        echo "开发命令:"
        echo "  all       - 启动数据库 + 执行迁移（推荐首次使用）"
        echo "  backend   - 启动后端服务"
        echo "  frontend  - 启动前端服务"
        echo ""
        echo "切换数据库:"
        echo "  local     - 切换到本地 Docker 数据库"
        echo "  remote    - 切换到远程数据库"
        echo ""
        echo "其他:"
        echo "  status    - 查看服务状态"
        echo "  logs      - 查看日志"
        echo ""
        echo -e "${YELLOW}首次使用推荐流程:${NC}"
        echo "  1. $0 all       # 启动数据库并迁移"
        echo "  2. $0 seed      # 导入种子数据（可选）"
        echo "  3. $0 backend   # 启动后端（新终端）"
        echo "  4. $0 frontend  # 启动前端（新终端）"
        exit 1
        ;;
esac
