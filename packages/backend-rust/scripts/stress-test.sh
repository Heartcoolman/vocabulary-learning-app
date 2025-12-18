#!/bin/bash
# Rust Backend Stress Test Script
# Usage: ./stress-test.sh [target_url] [concurrency] [requests]

set -e

TARGET_URL="${1:-http://localhost:3001}"
CONCURRENCY="${2:-10}"
TOTAL_REQUESTS="${3:-1000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Danci Rust Backend Stress Test ===${NC}"
echo "Target: $TARGET_URL"
echo "Concurrency: $CONCURRENCY"
echo "Total Requests: $TOTAL_REQUESTS"
echo ""

check_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3

    echo -n "Testing $name... "
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}OK${NC} (HTTP $status)"
        return 0
    else
        echo -e "${RED}FAILED${NC} (HTTP $status, expected $expected_status)"
        return 1
    fi
}

echo -e "${YELLOW}[Phase 1] Endpoint Validation${NC}"
check_endpoint "Health Root" "$TARGET_URL/health" "200"
check_endpoint "Health Live" "$TARGET_URL/health/live" "200"
check_endpoint "Health Info" "$TARGET_URL/health/info" "200"
check_endpoint "Health Metrics" "$TARGET_URL/health/metrics" "200"
check_endpoint "Health Ready" "$TARGET_URL/health/ready" "200"
check_endpoint "Database Status" "$TARGET_URL/health/database" "200"
echo ""

echo -e "${YELLOW}[Phase 2] Load Test - Health Endpoint${NC}"
if command -v wrk &> /dev/null; then
    echo "Using wrk for load testing..."
    wrk -t4 -c$CONCURRENCY -d30s "$TARGET_URL/health/live"
elif command -v ab &> /dev/null; then
    echo "Using Apache Bench for load testing..."
    ab -n $TOTAL_REQUESTS -c $CONCURRENCY "$TARGET_URL/health/live"
else
    echo "Using curl-based load test (install wrk or ab for better results)..."

    start_time=$(date +%s.%N)
    success=0
    fail=0

    for i in $(seq 1 $TOTAL_REQUESTS); do
        if curl -s -o /dev/null -w "" "$TARGET_URL/health/live" 2>/dev/null; then
            ((success++))
        else
            ((fail++))
        fi

        if [ $((i % 100)) -eq 0 ]; then
            echo "Progress: $i/$TOTAL_REQUESTS requests"
        fi
    done &

    for job in $(jobs -p); do
        wait $job
    done

    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)
    rps=$(echo "scale=2; $TOTAL_REQUESTS / $duration" | bc)

    echo ""
    echo -e "${GREEN}Results:${NC}"
    echo "  Total Requests: $TOTAL_REQUESTS"
    echo "  Duration: ${duration}s"
    echo "  Requests/sec: $rps"
    echo "  Success: $success"
    echo "  Failed: $fail"
fi
echo ""

echo -e "${YELLOW}[Phase 3] Latency Test${NC}"
echo "Measuring P50, P95, P99 latency (100 samples)..."

latencies=()
for i in $(seq 1 100); do
    latency=$(curl -s -o /dev/null -w "%{time_total}" "$TARGET_URL/health/live" 2>/dev/null)
    latency_ms=$(echo "$latency * 1000" | bc)
    latencies+=("$latency_ms")
done

sorted=($(printf '%s\n' "${latencies[@]}" | sort -n))
p50=${sorted[49]}
p95=${sorted[94]}
p99=${sorted[98]}

echo "  P50: ${p50}ms"
echo "  P95: ${p95}ms"
echo "  P99: ${p99}ms"
echo ""

echo -e "${YELLOW}[Phase 4] Memory Check${NC}"
metrics=$(curl -s "$TARGET_URL/health/metrics" 2>/dev/null)
if [ -n "$metrics" ]; then
    heap_used=$(echo "$metrics" | grep -o '"heapUsed":[0-9]*' | cut -d: -f2)
    rss=$(echo "$metrics" | grep -o '"rss":[0-9]*' | cut -d: -f2)

    if [ -n "$heap_used" ]; then
        heap_mb=$(echo "scale=2; $heap_used / 1048576" | bc)
        echo "  Heap Used: ${heap_mb}MB"
    fi
    if [ -n "$rss" ]; then
        rss_mb=$(echo "scale=2; $rss / 1048576" | bc)
        echo "  RSS: ${rss_mb}MB"
    fi
fi
echo ""

echo -e "${GREEN}=== Stress Test Complete ===${NC}"
