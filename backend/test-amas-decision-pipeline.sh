#!/bin/bash

# AMAS Decision Pipeline 测试脚本
# 测试所有新增的监控、特性开关和统计端点

BASE_URL="http://localhost:3000"
ABOUT_BASE="${BASE_URL}/api/about"

echo "========================================="
echo "AMAS Decision Pipeline 功能测试"
echo "========================================="
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}

    echo -n "测试: ${name}... "

    response=$(curl -s -w "\n%{http_code}" "${url}")
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ 通过${NC} (HTTP $status_code)"
        if [ -n "$body" ] && [ "$body" != "null" ]; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        fi
    else
        echo -e "${RED}✗ 失败${NC} (HTTP $status_code, 期望 $expected_status)"
        echo "$body"
    fi
    echo ""
}

# 等待服务启动
echo -e "${YELLOW}等待服务启动...${NC}"
sleep 3
echo ""

# 1. 健康检查
echo "=== 1. 健康检查 ==="
test_endpoint "健康状态" "${ABOUT_BASE}/health"

# 2. 特性开关
echo "=== 2. 特性开关配置 ==="
test_endpoint "特性开关" "${ABOUT_BASE}/feature-flags"

# 3. 监控指标
echo "=== 3. 监控指标 ==="
test_endpoint "JSON格式指标" "${ABOUT_BASE}/metrics"
echo "---"
test_endpoint "Prometheus格式指标" "${ABOUT_BASE}/metrics/prometheus"

# 4. 统计数据端点（虚拟数据源）
echo "=== 4. 统计数据端点 (默认虚拟数据源) ==="
test_endpoint "概览统计" "${ABOUT_BASE}/stats/overview"
test_endpoint "算法分布" "${ABOUT_BASE}/stats/algorithm-distribution"
test_endpoint "状态分布" "${ABOUT_BASE}/stats/state-distribution"
test_endpoint "近期决策" "${ABOUT_BASE}/stats/recent-decisions"
test_endpoint "流水线快照" "${ABOUT_BASE}/pipeline/snapshot"

# 5. 验证数据源标识
echo "=== 5. 验证数据源标识 ==="
echo -n "检查数据源字段... "
overview=$(curl -s "${ABOUT_BASE}/stats/overview")
source=$(echo "$overview" | jq -r '.source // "未找到"')

if [ "$source" = "virtual" ] || [ "$source" = "real" ]; then
    echo -e "${GREEN}✓ 数据源: $source${NC}"
else
    echo -e "${RED}✗ 数据源字段异常: $source${NC}"
fi
echo ""

# 6. 测试错误处理
echo "=== 6. 错误处理测试 ==="
test_endpoint "不存在的端点" "${ABOUT_BASE}/stats/nonexistent" 404

# 总结
echo "========================================="
echo -e "${GREEN}测试完成！${NC}"
echo "========================================="
echo ""
echo "提示:"
echo "1. 要启用真实数据源，设置环境变量: AMAS_ABOUT_DATA_SOURCE=real"
echo "2. 要启用决策记录写入，设置: AMAS_REAL_DATA_WRITE_ENABLED=true"
echo "3. 查看 Prometheus 指标: curl ${ABOUT_BASE}/metrics/prometheus"
echo "4. 查看特性开关: curl ${ABOUT_BASE}/feature-flags"
echo ""
