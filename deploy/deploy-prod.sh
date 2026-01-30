#!/bin/bash
set -e

DEPLOY_DIR="/opt/danci"
COMPOSE_FILE="docker-compose.prod.yml"
GITHUB_REPO="heartcoolman/vocabulary-learning-app"

echo "=== Danci Production Deployment (Pre-built Images) ==="

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash deploy-prod.sh"
  exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "[1/7] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[1/7] Docker already installed"
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  echo "[2/7] Installing Docker Compose..."
  apt-get update && apt-get install -y docker-compose-plugin
else
  echo "[2/7] Docker Compose already installed"
fi

# Install netcat if not present (required for restart listener)
if ! command -v nc &> /dev/null; then
  echo "[3/7] Installing netcat..."
  apt-get update && apt-get install -y netcat-openbsd
else
  echo "[3/7] Netcat already installed"
fi

# Create deploy directory
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/scripts"
mkdir -p /var/run/danci
cd "$DEPLOY_DIR"

# Download docker-compose.prod.yml
echo "[4/7] Downloading compose file..."
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.prod.yml" -o docker-compose.yml
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/infrastructure/docker/init-db.sql" -o init-db.sql 2>/dev/null || true
mkdir -p infrastructure/docker
mv init-db.sql infrastructure/docker/ 2>/dev/null || true

# Download service scripts
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/prod-restart-listener.sh" -o scripts/prod-restart-listener.sh
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/prod-ota-service.sh" -o scripts/prod-ota-service.sh
chmod +x scripts/prod-restart-listener.sh scripts/prod-ota-service.sh

# Configure environment
echo "[5/7] Configuring environment..."
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")

  cat > .env << EOF
# Production Environment - Auto-generated $(date)
POSTGRES_USER=danci
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=vocabulary_db
POSTGRES_PORT=5432

REDIS_PORT=6379

JWT_SECRET=${JWT_SECRET}
RUST_LOG=info

BACKEND_RUST_PORT=3000
BACKEND_PORT=3000
FRONTEND_PORT=5173

CORS_ORIGIN=http://${SERVER_IP}:5173

SQLITE_FALLBACK_ENABLED=true
DB_FENCING_ENABLED=false

# Image versions (default: latest)
BACKEND_IMAGE=ghcr.io/${GITHUB_REPO}/backend:latest
FRONTEND_IMAGE=ghcr.io/${GITHUB_REPO}/frontend:latest
EOF
  echo "Created .env with secure random secrets"
else
  echo ".env already exists, skipping"
fi

# Install and start system services
echo "[6/7] Setting up system services..."
cat > /etc/systemd/system/danci-restart-listener.service << EOF
[Unit]
Description=Danci Backend Restart Listener
Documentation=https://github.com/heartcoolman/vocabulary-learning-app
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=$DEPLOY_DIR/scripts/prod-restart-listener.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/danci-ota-service.service << EOF
[Unit]
Description=Danci OTA Update Service
Documentation=https://github.com/heartcoolman/vocabulary-learning-app
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=$DEPLOY_DIR/scripts/prod-ota-service.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable danci-restart-listener danci-ota-service
systemctl restart danci-restart-listener danci-ota-service

# Login to GitHub Container Registry (if token provided)
echo "[7/7] Pulling images..."
if [ -n "$GITHUB_TOKEN" ]; then
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
fi

# Pull and start services
docker compose pull
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d

# Wait for services
echo ""
echo "Waiting for services to start..."
sleep 10

# Health check
echo ""
echo "=== Deployment Complete ==="
echo ""
docker compose ps
echo ""
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
echo "Service URLs:"
echo "  Frontend: http://${SERVER_IP}:5173"
echo "  Backend:  http://${SERVER_IP}:3000"
echo ""
echo "Useful commands:"
echo "  View logs:          cd $DEPLOY_DIR && docker compose logs -f"
echo "  Stop:               cd $DEPLOY_DIR && docker compose down"
echo "  Restart:            cd $DEPLOY_DIR && docker compose restart"
echo "  Update:             cd $DEPLOY_DIR && docker compose pull && docker compose up -d"
echo "  Restart listener:   journalctl -u danci-restart-listener -f"
echo "  OTA service:        journalctl -u danci-ota-service -f"
