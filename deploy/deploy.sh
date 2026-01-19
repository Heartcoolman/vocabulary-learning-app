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
  echo "[1/5] 正在安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker 安装完成"
else
  echo "[1/5] ✅ Docker 已安装"
fi

# 安装Docker Compose
if ! docker compose version &> /dev/null; then
  echo "[2/5] 正在安装 Docker Compose..."
  apt-get update && apt-get install -y docker-compose-plugin
  echo "✅ Docker Compose 安装完成"
else
  echo "[2/5] ✅ Docker Compose 已安装"
fi

# 创建部署目录
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# 下载配置文件
echo "[3/5] 正在下载配置文件..."
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.prod.yml" -o docker-compose.yml
echo "✅ 配置文件下载完成"

# 生成环境变量
echo "[4/5] 正在配置环境变量..."
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

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

# 数据库回退配置
SQLITE_FALLBACK_ENABLED=true
DB_FENCING_ENABLED=false

# Docker镜像（默认使用最新版）
BACKEND_IMAGE=ghcr.io/${GITHUB_REPO}/backend:latest
FRONTEND_IMAGE=ghcr.io/${GITHUB_REPO}/frontend:latest
EOF
  echo "✅ 环境变量配置完成（已生成安全密钥）"
else
  echo "✅ 环境变量文件已存在，跳过生成"
fi

# 拉取镜像并启动
echo "[5/5] 正在拉取镜像并启动服务..."
docker compose pull
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 10

# 显示结果
echo ""
echo "╔════════════════════════════════════════════╗"
echo "║            🎉 部署完成！                   ║"
echo "╚════════════════════════════════════════════╝"
echo ""
docker compose ps
echo ""

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")
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
