#!/bin/bash
set -e

DEPLOY_DIR="/opt/danci"
GITHUB_REPO="heartcoolman/vocabulary-learning-app"

# 解析命令行参数
ACTION="${1:-deploy}"

show_help() {
  echo "用法: sudo bash deploy.sh [命令]"
  echo ""
  echo "命令:"
  echo "  deploy    完整部署（默认，首次安装使用）"
  echo "  update    版本更新（拉取最新镜像并重启）"
  echo "  help      显示帮助信息"
  echo ""
  echo "示例:"
  echo "  sudo bash deploy.sh          # 完整部署"
  echo "  sudo bash deploy.sh update   # 更新到最新版本"
}

if [ "$ACTION" = "help" ] || [ "$ACTION" = "-h" ] || [ "$ACTION" = "--help" ]; then
  show_help
  exit 0
fi

echo "╔════════════════════════════════════════════╗"
if [ "$ACTION" = "update" ]; then
echo "║     单词学习应用 - 版本更新                ║"
else
echo "║     单词学习应用 - 一键部署脚本            ║"
fi
echo "║     使用预构建镜像，无需本地编译           ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查root权限
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用root权限运行: sudo bash deploy.sh"
  exit 1
fi

# 版本更新模式
if [ "$ACTION" = "update" ]; then
  if [ ! -d "$DEPLOY_DIR" ] || [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    echo "❌ 未找到部署目录，请先执行完整部署: sudo bash deploy.sh"
    exit 1
  fi

  cd "$DEPLOY_DIR"

  echo "[1/3] 拉取最新镜像..."
  docker compose pull

  echo "[2/3] 重启服务..."
  docker compose up -d

  echo "[3/3] 等待服务就绪..."
  sleep 5
  MAX_RETRIES=30
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5173/health &>/dev/null; then
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
  done

  SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

  echo ""
  echo "╔════════════════════════════════════════════╗"
  echo "║            🎉 更新完成！                   ║"
  echo "╚════════════════════════════════════════════╝"
  echo ""
  docker compose ps
  echo ""
  echo "📍 访问地址："
  echo "   前端界面: http://${SERVER_IP}:5173"
  echo "   管理后台: http://${SERVER_IP}:5173/admin"
  exit 0
fi

# OTA 更新服务安装
install_ota_service() {
  echo "[OTA] 安装 OTA 更新服务..."

  mkdir -p /var/run/danci
  chmod 755 /var/run/danci

  cat > /opt/danci/updater.sh << 'UPDATER_EOF'
#!/bin/bash
set -e

STATUS_FILE="/var/run/danci/update-status.json"

update_status() {
  local stage="$1"
  local progress="$2"
  local message="$3"
  local error="${4:-null}"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  if [ "$error" = "null" ]; then
    echo "{\"stage\":\"$stage\",\"progress\":$progress,\"message\":\"$message\",\"error\":null,\"timestamp\":\"$timestamp\"}" > "$STATUS_FILE"
  else
    echo "{\"stage\":\"$stage\",\"progress\":$progress,\"message\":\"$message\",\"error\":\"$error\",\"timestamp\":\"$timestamp\"}" > "$STATUS_FILE"
  fi
}

cd /opt/danci

update_status "pulling" 10 "正在拉取最新镜像..."

if ! docker compose pull 2>&1; then
  update_status "failed" 10 "镜像拉取失败" "docker compose pull failed"
  exit 1
fi

update_status "pulling" 50 "镜像拉取完成，准备重启服务..."

update_status "restarting" 60 "正在重启服务..."

if ! docker compose up -d 2>&1; then
  update_status "failed" 60 "服务重启失败" "docker compose up -d failed"
  exit 1
fi

update_status "restarting" 80 "等待服务就绪..."

MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:5173/health &>/dev/null; then
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  update_status "failed" 90 "服务启动超时" "health check timeout"
  exit 1
fi

update_status "completed" 100 "更新完成"
UPDATER_EOF

  chmod +x /opt/danci/updater.sh

  # 后端重启脚本
  cat > /opt/danci/restart-backend.sh << 'RESTART_EOF'
#!/bin/bash
set -e
cd /opt/danci
docker compose restart backend-rust
RESTART_EOF

  chmod +x /opt/danci/restart-backend.sh

  # OTA Updater Socket
  cat > /etc/systemd/system/danci-updater.socket << 'SOCKET_EOF'
[Unit]
Description=Danci OTA Updater Socket

[Socket]
ListenStream=/var/run/danci/updater.sock
SocketMode=0660
SocketUser=root
SocketGroup=root
Accept=no

[Install]
WantedBy=sockets.target
SOCKET_EOF

  cat > /etc/systemd/system/danci-updater.service << 'SERVICE_EOF'
[Unit]
Description=Danci OTA Updater Service
Requires=danci-updater.socket
After=danci-updater.socket

[Service]
Type=oneshot
ExecStart=/opt/danci/updater.sh
StandardInput=socket
StandardOutput=journal
StandardError=journal
WorkingDirectory=/opt/danci

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  # Backend Restart Socket
  cat > /etc/systemd/system/danci-restart.socket << 'SOCKET_EOF'
[Unit]
Description=Danci Backend Restart Socket

[Socket]
ListenStream=/var/run/danci/restart.sock
SocketMode=0660
SocketUser=root
SocketGroup=root
Accept=no

[Install]
WantedBy=sockets.target
SOCKET_EOF

  cat > /etc/systemd/system/danci-restart.service << 'SERVICE_EOF'
[Unit]
Description=Danci Backend Restart Service
Requires=danci-restart.socket
After=danci-restart.socket

[Service]
Type=oneshot
ExecStart=/opt/danci/restart-backend.sh
StandardInput=socket
StandardOutput=journal
StandardError=journal
WorkingDirectory=/opt/danci

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload
  systemctl enable danci-updater.socket danci-restart.socket
  systemctl start danci-updater.socket danci-restart.socket

  echo "[OTA] ✅ OTA 更新服务和后端重启服务安装完成"
}

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
FRONTEND_PORT=5173

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
  if curl -s http://localhost:5173/health &>/dev/null; then
    echo "✅ 后端服务已就绪"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️ 后端启动超时，请检查日志: docker compose logs backend-rust"
fi

# 显示迁移日志
echo ""
echo "📋 数据库迁移日志："
docker compose logs backend-rust 2>&1 | grep -E "(migration|Migration|migrat)" | tail -10 || echo "   (无迁移日志)"

# 校验数据库迁移完成（等待迁移稳定）
echo ""
echo "🔍 校验数据库迁移状态..."
MAX_RETRIES=30
RETRY_COUNT=0
PREV_COUNT=-1
STABLE_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  MIGRATION_COUNT=$(docker compose exec -T postgres psql -U danci -d vocabulary_db -t -c "SELECT COUNT(*) FROM _migrations" 2>/dev/null | tr -d ' ' || echo "0")

  # 迁移数量大于0且连续3次相同表示稳定完成
  if [ "$MIGRATION_COUNT" -gt 0 ] && [ "$MIGRATION_COUNT" -eq "$PREV_COUNT" ]; then
    STABLE_COUNT=$((STABLE_COUNT + 1))
    if [ "$STABLE_COUNT" -ge 2 ]; then
      echo "✅ 数据库迁移完成（共 ${MIGRATION_COUNT} 个迁移）"
      break
    fi
  else
    STABLE_COUNT=0
  fi

  echo "   等待迁移完成... (当前 ${MIGRATION_COUNT} 个)"
  PREV_COUNT=$MIGRATION_COUNT
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ "$MIGRATION_COUNT" -eq 0 ] || [ "$STABLE_COUNT" -lt 2 ]; then
  echo "⚠️ 数据库迁移状态未知（检测到 ${MIGRATION_COUNT} 个迁移）"
  echo "   后端健康检查已通过，继续执行..."
fi

# 获取服务器IP (强制使用IPv4)
SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

# 创建默认管理员账户
echo ""
echo "👤 检查管理员账户..."
ADMIN_EXISTS=$(docker compose exec -T postgres psql -U danci -d vocabulary_db -t -c "SELECT COUNT(*) FROM admin_users" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$ADMIN_EXISTS" -eq "0" ]; then
  ADMIN_SUFFIX=$(openssl rand -hex 3)
  ADMIN_USERNAME="admin_${ADMIN_SUFFIX}"
  ADMIN_EMAIL="${ADMIN_USERNAME}@example.com"
  ADMIN_PASSWORD="A1!$(openssl rand -hex 8)"

  echo "   ⏳ 正在创建管理员账户..."
  SEED_RESULT=$(docker compose exec -T backend-rust /app/danci-backend-rust seed-admin \
    --username "$ADMIN_USERNAME" \
    --email "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" 2>&1)

  if echo "$SEED_RESULT" | grep -q "ADMIN_CREATED"; then
    echo ""
    echo "╔═══════════════════════════════════════════════╗"
    echo "║          🔐 管理员账户已创建                  ║"
    echo "╠═══════════════════════════════════════════════╣"
    echo "║  邮箱:     $ADMIN_EMAIL"
    echo "║  用户名:   $ADMIN_USERNAME"
    echo "║  密码:     $ADMIN_PASSWORD"
    echo "║                                               ║"
    echo "║  管理后台: http://${SERVER_IP}:5173/admin     ║"
    echo "║                                               ║"
    echo "║  ⚠️  请立即保存此信息！密码仅显示一次！       ║"
    echo "╚═══════════════════════════════════════════════╝"
    echo ""
  elif echo "$SEED_RESULT" | grep -q "ADMIN_EXISTS"; then
    echo "   ✅ 管理员账户已存在"
  else
    echo "   ⚠️ 管理员创建失败: $SEED_RESULT"
  fi
else
  echo "   ✅ 管理员账户已存在（共 ${ADMIN_EXISTS} 个）"
fi

# 安装 OTA 更新服务
install_ota_service

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
echo "   管理后台: http://${SERVER_IP}:5173/admin"
echo ""
echo "📋 常用命令："
echo "   查看日志:  cd $DEPLOY_DIR && docker compose logs -f"
echo "   停止服务:  cd $DEPLOY_DIR && docker compose down"
echo "   重启服务:  cd $DEPLOY_DIR && docker compose restart"
echo "   更新版本:  cd $DEPLOY_DIR && docker compose pull && docker compose up -d"
echo ""
echo "📁 部署目录: $DEPLOY_DIR"
echo "📄 配置文件: $DEPLOY_DIR/.env"
