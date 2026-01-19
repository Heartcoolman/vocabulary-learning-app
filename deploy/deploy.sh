#!/bin/bash
set -e

DEPLOY_DIR="/opt/danci"
GITHUB_REPO="heartcoolman/vocabulary-learning-app"

echo "╔════════════════════════════════════════════╗"
echo "║     单词学习应用 - 一键部署脚本            ║"
echo "║     使用预构建镜像，无需本地编译           ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查root权限
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用root权限运行: sudo bash deploy.sh"
  exit 1
fi

# 安装Docker
if ! command -v docker &> /dev/null; then
  echo "[1/6] 正在安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker 安装完成"
else
  echo "[1/6] ✅ Docker 已安装"
fi

# 安装Docker Compose
if ! docker compose version &> /dev/null; then
  echo "[2/6] 正在安装 Docker Compose..."
  apt-get update && apt-get install -y docker-compose-plugin
  echo "✅ Docker Compose 安装完成"
else
  echo "[2/6] ✅ Docker Compose 已安装"
fi

# 创建部署目录
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# 下载配置文件
echo "[3/6] 正在下载配置文件..."
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.prod.yml" -o docker-compose.yml
echo "✅ 配置文件下载完成"

# 生成环境变量
echo "[4/6] 正在配置环境变量..."
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)
  SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

  cat > .env << EOF
# 生产环境配置 - 自动生成于 $(date +"%Y-%m-%d %H:%M:%S")
# ⚠️ 请妥善保管此文件，包含敏感信息

# 数据库配置
POSTGRES_USER=danci
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=vocabulary_db
POSTGRES_PORT=5432

# Redis配置
REDIS_PORT=6379

# 应用配置
JWT_SECRET=${JWT_SECRET}
RUST_LOG=info

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=5173

# 跨域配置（根据实际域名修改）
CORS_ORIGIN=http://${SERVER_IP}:5173

# Docker镜像（默认使用最新版）
BACKEND_IMAGE=ghcr.io/${GITHUB_REPO}/backend:latest
FRONTEND_IMAGE=ghcr.io/${GITHUB_REPO}/frontend:latest
EOF
  echo "✅ 环境变量配置完成（已生成安全密钥）"
else
  echo "✅ 环境变量文件已存在，跳过生成"
fi

# 拉取镜像并启动
echo "[5/6] 正在拉取镜像并启动服务..."
docker compose pull
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d

# 等待数据库就绪
echo ""
echo "[6/6] 正在初始化数据库..."
echo "⏳ 等待 PostgreSQL 启动..."

MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker compose exec -T postgres pg_isready -U danci -d vocabulary_db &>/dev/null; then
    echo "✅ PostgreSQL 已就绪"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️ PostgreSQL 启动超时，请检查日志: docker compose logs postgres"
fi

# 等待后端完成数据库迁移
echo "⏳ 等待后端服务启动并执行数据库迁移..."
sleep 5

MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3000/health &>/dev/null; then
    echo "✅ 后端服务已就绪"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️ 后端启动超时，请检查日志: docker compose logs backend"
fi

# 显示迁移日志
echo ""
echo "📋 数据库迁移日志："
docker compose logs backend 2>&1 | grep -E "(migration|Migration|migrat)" | tail -10 || echo "   (无迁移日志)"

# 校验数据库迁移完成
echo ""
echo "🔍 校验数据库迁移状态..."
EXPECTED_MIGRATIONS=29
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  MIGRATION_COUNT=$(docker compose exec -T postgres psql -U danci -d vocabulary_db -t -c "SELECT COUNT(*) FROM _migrations" 2>/dev/null | tr -d ' ' || echo "0")

  if [ "$MIGRATION_COUNT" -eq "$EXPECTED_MIGRATIONS" ]; then
    echo "✅ 数据库迁移完成（${MIGRATION_COUNT}/${EXPECTED_MIGRATIONS}）"
    break
  fi

  echo "   等待迁移完成... (${MIGRATION_COUNT}/${EXPECTED_MIGRATIONS})"
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ "$MIGRATION_COUNT" -ne "$EXPECTED_MIGRATIONS" ]; then
  echo "❌ 数据库迁移未完成（${MIGRATION_COUNT}/${EXPECTED_MIGRATIONS}）"
  echo "   请检查后端日志: docker compose logs backend"
  echo ""
  echo "最近的迁移记录："
  docker compose exec -T postgres psql -U danci -d vocabulary_db -c "SELECT name, applied_at FROM _migrations ORDER BY id DESC LIMIT 5" 2>/dev/null || true
  exit 1
fi

# 获取服务器IP (强制使用IPv4)
SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

# 创建默认管理员账户
echo ""
echo "👤 检查管理员账户..."
ADMIN_EXISTS=$(docker compose exec -T postgres psql -U danci -d vocabulary_db -t -c "SELECT COUNT(*) FROM users WHERE role = 'ADMIN'" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$ADMIN_EXISTS" -eq "0" ]; then
  echo "   ℹ️  暂无管理员账户"
  echo ""
  echo "   📝 创建管理员步骤："
  echo "   1. 访问 http://${SERVER_IP}:5173 注册新账户"
  echo "   2. 运行以下命令升级为管理员："
  echo "      cd $DEPLOY_DIR && docker compose exec postgres psql -U danci -d vocabulary_db -c \"UPDATE users SET role = 'ADMIN' WHERE email = '你的邮箱';\""
else
  echo "   ✅ 管理员账户已存在（共 ${ADMIN_EXISTS} 个）"
fi

# 显示结果
echo ""
echo "╔════════════════════════════════════════════╗"
echo "║            🎉 部署完成！                   ║"
echo "╚════════════════════════════════════════════╝"
echo ""
docker compose ps
echo ""

echo "📍 访问地址："
echo "   前端界面: http://${SERVER_IP}:5173"
echo "   后端API:  http://${SERVER_IP}:3000"
echo ""
echo "📋 常用命令："
echo "   查看日志:  cd $DEPLOY_DIR && docker compose logs -f"
echo "   停止服务:  cd $DEPLOY_DIR && docker compose down"
echo "   重启服务:  cd $DEPLOY_DIR && docker compose restart"
echo "   更新版本:  cd $DEPLOY_DIR && docker compose pull && docker compose up -d"
echo ""
echo "📁 部署目录: $DEPLOY_DIR"
echo "📄 配置文件: $DEPLOY_DIR/.env"
