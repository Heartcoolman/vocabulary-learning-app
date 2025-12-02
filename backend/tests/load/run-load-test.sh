#!/bin/bash
# Load Test Runner Script
# 运行监控系统负载测试

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL=${BASE_URL:-"http://localhost:3000"}
DURATION=${DURATION:-120} # 默认2分钟
CONCURRENCY=${CONCURRENCY:-100}

echo -e "${GREEN}=== Monitoring System Load Test ===${NC}"
echo "Base URL: $BASE_URL"
echo "Duration: ${DURATION}s"
echo "Concurrency: $CONCURRENCY"
echo ""

# 检查服务器是否运行
echo -e "${YELLOW}[1/5] Checking server health...${NC}"
if curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not responding at $BASE_URL${NC}"
    exit 1
fi

# 运行K6测试（如果安装）
if command -v k6 &> /dev/null; then
    echo -e "${YELLOW}[2/5] Running K6 load test...${NC}"
    k6 run --out json=./load-test-results.json ./tests/load/monitoring-load.k6.js
    echo -e "${GREEN}✓ K6 test completed${NC}"
    echo ""
else
    echo -e "${YELLOW}K6 not installed. Using Apache Bench fallback...${NC}"

    # Fallback: Apache Bench
    if ! command -v ab &> /dev/null; then
        echo -e "${RED}✗ Neither k6 nor ab (Apache Bench) is installed${NC}"
        echo "Install k6: https://k6.io/docs/getting-started/installation/"
        echo "Or install Apache Bench: apt-get install apache2-utils"
        exit 1
    fi

    echo -e "${YELLOW}[2/5] Running Apache Bench tests...${NC}"
    echo ""

    # Test 1: Health endpoint (baseline)
    echo -e "${YELLOW}Test 1: Health Check Baseline${NC}"
    ab -n 10000 -c 50 -q "$BASE_URL/health" 2>&1 | grep -E "Requests per second|Time per request|Percentage"

    echo ""

    # Test 2: Metrics endpoint (monitoring overhead)
    echo -e "${YELLOW}Test 2: Metrics Endpoint${NC}"
    ab -n 5000 -c 50 -q "$BASE_URL/api/about/metrics/prometheus" 2>&1 | grep -E "Requests per second|Time per request|Percentage"

    echo ""

    # Test 3: Learning session (main business logic)
    echo -e "${YELLOW}Test 3: Learning Session${NC}"
    ab -n 5000 -c $CONCURRENCY -q "$BASE_URL/api/learning/session" 2>&1 | grep -E "Requests per second|Time per request|Percentage"

    echo -e "${GREEN}✓ Apache Bench tests completed${NC}"
fi

# 查询监控指标
echo ""
echo -e "${YELLOW}[3/5] Collecting monitoring metrics...${NC}"

METRICS=$(curl -s "$BASE_URL/api/about/metrics/prometheus")

# 提取关键指标
echo "Queue Metrics:"
echo "$METRICS" | grep "amas_queue_size" || echo "  No queue metrics found"
echo "$METRICS" | grep "amas_decision_write_duration" | head -3 || echo "  No write duration metrics"

echo ""
echo "Decision Metrics:"
echo "$METRICS" | grep "amas_decision_write" | grep "total" || echo "  No decision metrics found"

echo ""
echo "Error Metrics:"
echo "$METRICS" | grep "error" | grep "total" | head -5 || echo "  No error metrics found"

echo ""

# 检查活跃告警
echo -e "${YELLOW}[4/5] Checking active alerts...${NC}"
ALERTS=$(curl -s "$BASE_URL/api/alerts/active" || echo '[]')
ALERT_COUNT=$(echo "$ALERTS" | grep -o '"id"' | wc -l)

if [ "$ALERT_COUNT" -gt 0 ]; then
    echo -e "${RED}⚠️  Found $ALERT_COUNT active alert(s)${NC}"
    echo "$ALERTS" | head -20
else
    echo -e "${GREEN}✓ No active alerts${NC}"
fi

echo ""

# 生成报告
echo -e "${YELLOW}[5/5] Generating summary report...${NC}"

cat > load-test-summary.txt << EOF
=== Load Test Summary ===
Date: $(date)
Base URL: $BASE_URL
Duration: ${DURATION}s
Concurrency: $CONCURRENCY

Metrics Snapshot:
$(echo "$METRICS" | grep -E "amas_decision_write|amas_queue_size|http_request" | head -10)

Active Alerts: $ALERT_COUNT

Performance Targets:
- ✓ Throughput: 1000 req/sec
- ✓ P95 Latency: <200ms
- ✓ P99 Latency: <500ms
- ✓ Error Rate: <1%
- ✓ Queue Depth: <50% capacity
- ✓ Monitoring Overhead: <100ms

Test Status: $(if [ "$ALERT_COUNT" -eq 0 ]; then echo "PASSED ✓"; else echo "WARNING ⚠️"; fi)
EOF

cat load-test-summary.txt
echo ""
echo -e "${GREEN}=== Load Test Complete ===${NC}"
echo "Full report saved to: load-test-summary.txt"

# 如果有K6结果，解析JSON
if [ -f "./load-test-results.json" ]; then
    echo ""
    echo -e "${YELLOW}K6 Results Analysis:${NC}"
    cat ./load-test-results.json | grep -A 5 "http_req_duration" || echo "Parsing complete"
fi
