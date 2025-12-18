#!/bin/bash
# Traffic Migration Script - Node to Rust Backend
# Supports gradual traffic shifting via Nginx upstream weights

set -e

NGINX_CONF="${NGINX_CONF:-/home/liji/danci/danci/infrastructure/docker/nginx.conf}"
RUST_WEIGHT="${1:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <rust_percentage>"
    echo ""
    echo "Traffic distribution presets:"
    echo "  0   - 100% Node, 0% Rust (default/rollback)"
    echo "  10  - 90% Node, 10% Rust (canary)"
    echo "  25  - 75% Node, 25% Rust"
    echo "  50  - 50% Node, 50% Rust"
    echo "  75  - 25% Node, 75% Rust"
    echo "  90  - 10% Node, 90% Rust"
    echo "  100 - 0% Node, 100% Rust (full cutover)"
    echo ""
    echo "Examples:"
    echo "  $0 10   # Start canary deployment"
    echo "  $0 50   # 50/50 split"
    echo "  $0 100  # Full Rust"
    echo "  $0 0    # Emergency rollback to Node"
}

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

if ! [[ "$RUST_WEIGHT" =~ ^[0-9]+$ ]] || [ "$RUST_WEIGHT" -gt 100 ]; then
    echo -e "${RED}Error: Invalid percentage. Must be 0-100.${NC}"
    usage
    exit 1
fi

NODE_WEIGHT=$((100 - RUST_WEIGHT))

echo -e "${BLUE}=== Traffic Migration ===${NC}"
echo "Target: ${RUST_WEIGHT}% Rust, ${NODE_WEIGHT}% Node"
echo ""

check_backend() {
    local name=$1
    local url=$2

    echo -n "Checking $name... "
    if curl -s -o /dev/null -w "" --connect-timeout 5 "$url/health/live" 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}UNREACHABLE${NC}"
        return 1
    fi
}

echo -e "${YELLOW}[Step 1] Pre-flight Checks${NC}"

if [ "$RUST_WEIGHT" -gt 0 ]; then
    if ! check_backend "Rust Backend (3001)" "http://localhost:3001"; then
        echo -e "${RED}Error: Rust backend not available. Aborting.${NC}"
        exit 1
    fi
fi

if [ "$NODE_WEIGHT" -gt 0 ]; then
    if ! check_backend "Node Backend (3000)" "http://localhost:3000"; then
        echo -e "${YELLOW}Warning: Node backend not available.${NC}"
        if [ "$RUST_WEIGHT" -lt 100 ]; then
            echo -e "${RED}Error: Cannot proceed with split traffic when Node is down.${NC}"
            exit 1
        fi
    fi
fi
echo ""

echo -e "${YELLOW}[Step 2] Generating Nginx Configuration${NC}"

generate_upstream() {
    local rust_w=$1
    local node_w=$2

    cat << EOF
    # Traffic Distribution: ${rust_w}% Rust, ${node_w}% Node
    # Generated: $(date -Iseconds)
EOF

    if [ "$rust_w" -eq 100 ]; then
        echo "    upstream backend_active {"
        echo "        server backend-rust:3000;"
        echo "        keepalive 32;"
        echo "    }"
    elif [ "$rust_w" -eq 0 ]; then
        echo "    upstream backend_active {"
        echo "        server backend-node:3000;"
        echo "        keepalive 32;"
        echo "    }"
    else
        echo "    upstream backend_active {"
        if [ "$rust_w" -gt 0 ]; then
            echo "        server backend-rust:3000 weight=$rust_w;"
        fi
        if [ "$node_w" -gt 0 ]; then
            echo "        server backend-node:3000 weight=$node_w;"
        fi
        echo "        keepalive 32;"
        echo "    }"
    fi
}

NEW_UPSTREAM=$(generate_upstream $RUST_WEIGHT $NODE_WEIGHT)
echo "$NEW_UPSTREAM"
echo ""

echo -e "${YELLOW}[Step 3] Updating Nginx Configuration${NC}"

if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "${NGINX_CONF}.bak"
    echo "Backup created: ${NGINX_CONF}.bak"

    sed -i '/# Traffic Distribution:/,/keepalive 32;/{ /upstream backend_active/,/}/d }' "$NGINX_CONF" 2>/dev/null || true

    if grep -q "upstream backend_active" "$NGINX_CONF"; then
        if [ "$RUST_WEIGHT" -eq 100 ]; then
            sed -i 's/upstream backend_active {[^}]*}/upstream backend_active { server backend-rust:3000; keepalive 32; }/g' "$NGINX_CONF"
        elif [ "$RUST_WEIGHT" -eq 0 ]; then
            sed -i 's/upstream backend_active {[^}]*}/upstream backend_active { server backend-node:3000; keepalive 32; }/g' "$NGINX_CONF"
        else
            sed -i "s/upstream backend_active {[^}]*}/upstream backend_active { server backend-rust:3000 weight=$RUST_WEIGHT; server backend-node:3000 weight=$NODE_WEIGHT; keepalive 32; }/g" "$NGINX_CONF"
        fi
        echo -e "${GREEN}Configuration updated.${NC}"
    else
        echo -e "${YELLOW}Warning: Could not find upstream backend_active block.${NC}"
        echo "Please manually update the configuration."
    fi
else
    echo -e "${YELLOW}Warning: Nginx config not found at $NGINX_CONF${NC}"
    echo "Configuration to apply:"
    echo "$NEW_UPSTREAM"
fi
echo ""

echo -e "${YELLOW}[Step 4] Reload Nginx${NC}"
echo "Run one of the following commands to apply changes:"
echo ""
echo "  # Docker Compose:"
echo "  docker compose exec nginx nginx -s reload"
echo ""
echo "  # System Nginx:"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""

echo -e "${GREEN}=== Migration Prepared ===${NC}"
echo ""
echo "Current state: ${RUST_WEIGHT}% Rust, ${NODE_WEIGHT}% Node"
echo ""

if [ "$RUST_WEIGHT" -eq 100 ]; then
    echo -e "${GREEN}Full cutover to Rust backend.${NC}"
    echo "Node backend can be safely stopped after verification."
elif [ "$RUST_WEIGHT" -eq 0 ]; then
    echo -e "${YELLOW}Rollback to Node backend complete.${NC}"
else
    echo "Recommended progression:"
    echo "  10% -> 25% -> 50% -> 75% -> 90% -> 100%"
    echo "  Monitor metrics and errors between each step."
fi
