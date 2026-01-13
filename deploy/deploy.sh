#!/bin/bash
set -e

REPO_URL="https://github.com/Heartcoolman/vocabulary-learning-app.git"
DEPLOY_DIR="/opt/danci"
BRANCH="dev"

echo "=== Danci Vocabulary App Deployment ==="

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash deploy.sh"
  exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "[1/5] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[1/5] Docker already installed"
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  echo "[2/5] Installing Docker Compose..."
  apt-get update && apt-get install -y docker-compose-plugin
else
  echo "[2/5] Docker Compose already installed"
fi

# Clone or update repository
if [ -d "$DEPLOY_DIR" ]; then
  echo "[3/5] Updating repository..."
  cd "$DEPLOY_DIR"
  git fetch origin
  git checkout $BRANCH
  git pull origin $BRANCH
else
  echo "[3/5] Cloning repository..."
  git clone -b $BRANCH "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# Create production environment file
echo "[4/5] Configuring environment..."
if [ ! -f .env.production ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)

  cat > .env.production << EOF
# Production Environment - Auto-generated $(date)
POSTGRES_USER=danci
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=vocabulary_db
POSTGRES_PORT=5432

REDIS_PORT=6379

JWT_SECRET=${JWT_SECRET}
RUST_LOG=info

BACKEND_RUST_PORT=3001
BACKEND_PORT=3002
FRONTEND_PORT=80

CORS_ORIGIN=http://$(curl -s ifconfig.me)

SQLITE_FALLBACK_ENABLED=true
DB_FENCING_ENABLED=false
EOF
  echo "Created .env.production with secure random secrets"
else
  echo ".env.production already exists, skipping"
fi

# Build and start services
echo "[5/5] Building and starting services..."
cp .env.production .env
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --no-cache
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
echo "Service URLs:"
echo "  Frontend: http://$(curl -s ifconfig.me)"
echo "  Backend:  http://$(curl -s ifconfig.me):3001"
echo ""
echo "Useful commands:"
echo "  View logs:     cd $DEPLOY_DIR && docker compose logs -f"
echo "  Stop:          cd $DEPLOY_DIR && docker compose down"
echo "  Restart:       cd $DEPLOY_DIR && docker compose restart"
