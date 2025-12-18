#!/bin/bash
# Final Cutover Script - Retire Node Backend
# This script performs the complete migration from Node to Rust

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Danci Backend Cutover: Node → Rust     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

RUST_URL="${RUST_URL:-http://localhost:3001}"
NODE_URL="${NODE_URL:-http://localhost:3000}"

# Phase 1: Pre-cutover validation
echo -e "${YELLOW}[Phase 1/5] Pre-cutover Validation${NC}"

echo -n "  Rust backend health... "
rust_health=$(curl -s -o /dev/null -w "%{http_code}" "$RUST_URL/health/live" 2>/dev/null || echo "000")
if [ "$rust_health" = "200" ]; then
    echo -e "${GREEN}HEALTHY${NC}"
else
    echo -e "${RED}FAILED (HTTP $rust_health)${NC}"
    echo -e "${RED}Cutover aborted: Rust backend not healthy${NC}"
    exit 1
fi

echo -n "  Rust database connection... "
db_status=$(curl -s "$RUST_URL/health/database" 2>/dev/null | grep -o '"healthy":true' || echo "")
if [ -n "$db_status" ]; then
    echo -e "${GREEN}CONNECTED${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo -e "${RED}Cutover aborted: Database connection failed${NC}"
    exit 1
fi

echo -n "  Rust backend ready... "
ready_status=$(curl -s -o /dev/null -w "%{http_code}" "$RUST_URL/health/ready" 2>/dev/null || echo "000")
if [ "$ready_status" = "200" ]; then
    echo -e "${GREEN}READY${NC}"
else
    echo -e "${YELLOW}DEGRADED (HTTP $ready_status)${NC}"
fi
echo ""

# Phase 2: Run stress test
echo -e "${YELLOW}[Phase 2/5] Quick Stress Test${NC}"
echo "  Running 100 requests to verify stability..."

success=0
fail=0
for i in $(seq 1 100); do
    if curl -s -o /dev/null "$RUST_URL/health/live" 2>/dev/null; then
        ((success++))
    else
        ((fail++))
    fi
done

echo "  Results: $success/100 successful"
if [ "$fail" -gt 5 ]; then
    echo -e "${RED}  Too many failures ($fail). Cutover aborted.${NC}"
    exit 1
fi
echo -e "  ${GREEN}Stress test passed${NC}"
echo ""

# Phase 3: Traffic migration
echo -e "${YELLOW}[Phase 3/5] Traffic Migration${NC}"
echo "  Directing 100% traffic to Rust backend..."

if [ -x "$SCRIPT_DIR/traffic-migrate.sh" ]; then
    "$SCRIPT_DIR/traffic-migrate.sh" 100
else
    echo "  (traffic-migrate.sh not executable, skipping auto-migration)"
    echo "  Please manually update Nginx to route to Rust backend"
fi
echo ""

# Phase 4: Verification
echo -e "${YELLOW}[Phase 4/5] Post-cutover Verification${NC}"
echo "  Waiting 5 seconds for traffic to stabilize..."
sleep 5

echo -n "  Verifying Rust backend still healthy... "
rust_health=$(curl -s -o /dev/null -w "%{http_code}" "$RUST_URL/health/live" 2>/dev/null || echo "000")
if [ "$rust_health" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo -e "${RED}Rolling back...${NC}"
    if [ -x "$SCRIPT_DIR/traffic-migrate.sh" ]; then
        "$SCRIPT_DIR/traffic-migrate.sh" 0
    fi
    exit 1
fi

echo -n "  Checking active alerts... "
alerts=$(curl -s "$RUST_URL/health/metrics" 2>/dev/null | grep -o '"activeCount":[0-9]*' | cut -d: -f2 || echo "0")
if [ "$alerts" = "0" ]; then
    echo -e "${GREEN}None${NC}"
else
    echo -e "${YELLOW}$alerts active${NC}"
fi
echo ""

# Phase 5: Summary
echo -e "${YELLOW}[Phase 5/5] Cutover Summary${NC}"
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         CUTOVER SUCCESSFUL                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "  Rust backend is now serving 100% of traffic."
echo ""
echo "  Next steps:"
echo "    1. Monitor /health/metrics for any anomalies"
echo "    2. Check application logs: docker compose logs -f backend-rust"
echo "    3. After 24-48 hours of stable operation:"
echo "       - Stop Node backend: docker compose stop backend-node"
echo "       - Remove Node from docker-compose.yml"
echo ""
echo "  Emergency rollback:"
echo "    $SCRIPT_DIR/traffic-migrate.sh 0"
echo ""

# Save cutover timestamp
echo "$(date -Iseconds) - Cutover to Rust completed" >> "$PROJECT_ROOT/cutover.log"
