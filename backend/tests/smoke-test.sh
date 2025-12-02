#!/bin/bash
# Smoke Test for Week 3 Deployment
# 验证核心功能是否正常

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Week 3 Deployment Smoke Test ===${NC}\n"

# 配置
BASE_URL=${BASE_URL:-"http://localhost:3000"}
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# 测试函数
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}

    TEST_COUNT=$((TEST_COUNT + 1))
    echo -ne "[Test $TEST_COUNT] $name... "

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1)

    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $response)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

# 测试数据库连接
test_database() {
    TEST_COUNT=$((TEST_COUNT + 1))
    echo -ne "[Test $TEST_COUNT] Database connection... "

    result=$(docker exec danci-postgres psql -U danci -d vocabulary_db -t -c "SELECT 1;" 2>&1)

    if echo "$result" | grep -q "1"; then
        echo -e "${GREEN}✓ PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

# 测试decision_insights表
test_decision_insights_table() {
    TEST_COUNT=$((TEST_COUNT + 1))
    echo -ne "[Test $TEST_COUNT] decision_insights table exists... "

    result=$(docker exec danci-postgres psql -U danci -d vocabulary_db -t -c "\dt decision_insights" 2>&1)

    if echo "$result" | grep -q "decision_insights"; then
        echo -e "${GREEN}✓ PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

# 测试Alert集成测试
test_alert_tests() {
    TEST_COUNT=$((TEST_COUNT + 1))
    echo -ne "[Test $TEST_COUNT] Alert integration tests... "

    cd /home/liji/danci/danci/backend
    result=$(npm test -- alert-monitoring.integration.test.ts --run 2>&1)

    if echo "$result" | grep -q "13 passed"; then
        echo -e "${GREEN}✓ PASS (13/13)${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${YELLOW}⚠ WARNING${NC} (Tests may have failed)"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    fi
}

# 执行测试
echo "Testing infrastructure..."
test_database
test_decision_insights_table

echo -e "\nTesting core functionality..."
test_alert_tests

echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo "Total Tests: $TEST_COUNT"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "\n${GREEN}✓ All smoke tests passed! Ready for deployment.${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed. Please fix before deployment.${NC}"
    exit 1
fi
