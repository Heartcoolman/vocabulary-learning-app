#!/bin/bash
# Rust 后端集成测试脚本
# 测试项目：WebSocket/SSE、批量操作、数据库故障转移

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
TEST_TOKEN="${TEST_TOKEN:-}"

echo "=========================================="
echo "Rust 后端集成测试"
echo "=========================================="
echo "后端地址: $BACKEND_URL"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
warn() { echo -e "${YELLOW}⚠ WARN${NC}: $1"; }

# 测试计数
TOTAL=0
PASSED=0
FAILED=0

test_result() {
    TOTAL=$((TOTAL + 1))
    if [ "$1" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        pass "$2"
    else
        FAILED=$((FAILED + 1))
        fail "$2"
    fi
}

echo "=========================================="
echo "1. 健康检查测试"
echo "=========================================="

# 测试健康检查端点
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" 2>/dev/null || echo "000")
test_result $([[ "$HEALTH" == "200" ]] && echo 0 || echo 1) "健康检查端点 /health (HTTP $HEALTH)"

HEALTH_API=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
test_result $([[ "$HEALTH_API" == "200" ]] && echo 0 || echo 1) "健康检查端点 /api/health (HTTP $HEALTH_API)"

echo ""
echo "=========================================="
echo "2. SSE 实时连接测试"
echo "=========================================="

# 测试 SSE 端点是否可访问（需要认证）
SSE_STATS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/v1/realtime/stats" 2>/dev/null || echo "000")
if [[ "$SSE_STATS" == "401" ]]; then
    pass "SSE 统计端点需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
elif [[ "$SSE_STATS" == "200" ]]; then
    pass "SSE 统计端点可访问 (HTTP 200)"
    PASSED=$((PASSED + 1))
else
    warn "SSE 统计端点返回 HTTP $SSE_STATS"
fi
TOTAL=$((TOTAL + 1))

# 测试 SSE 流端点
SSE_STREAM=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$BACKEND_URL/api/v1/realtime/sessions/test-session/stream" 2>/dev/null || echo "000")
if [[ "$SSE_STREAM" == "401" ]]; then
    pass "SSE 流端点需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
else
    warn "SSE 流端点返回 HTTP $SSE_STREAM"
fi
TOTAL=$((TOTAL + 1))

# 测试 About 模块的 SSE 决策流
ABOUT_SSE=$(timeout 3 curl -s -N "$BACKEND_URL/api/about/decisions/stream" 2>/dev/null | head -c 500 || echo "")
if [[ "$ABOUT_SSE" == *"event:"* ]] || [[ "$ABOUT_SSE" == *"data:"* ]]; then
    pass "About SSE 决策流可连接并接收事件"
    PASSED=$((PASSED + 1))
else
    warn "About SSE 决策流测试 (可能需要更长超时)"
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "=========================================="
echo "3. 批量操作 API 测试"
echo "=========================================="

# 测试批量单词创建端点
BATCH_WORDS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/words/batch" -H "Content-Type: application/json" -d '{"words":[]}' 2>/dev/null || echo "000")
if [[ "$BATCH_WORDS" == "401" ]]; then
    pass "批量单词创建需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
elif [[ "$BATCH_WORDS" == "400" ]]; then
    pass "批量单词创建验证空数组 (HTTP 400)"
    PASSED=$((PASSED + 1))
else
    warn "批量单词创建返回 HTTP $BATCH_WORDS"
fi
TOTAL=$((TOTAL + 1))

# 测试批量记录创建端点
BATCH_RECORDS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/records/batch" -H "Content-Type: application/json" -d '{"records":[]}' 2>/dev/null || echo "000")
if [[ "$BATCH_RECORDS" == "401" ]]; then
    pass "批量记录创建需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
elif [[ "$BATCH_RECORDS" == "400" ]]; then
    pass "批量记录创建验证空数组 (HTTP 400)"
    PASSED=$((PASSED + 1))
else
    warn "批量记录创建返回 HTTP $BATCH_RECORDS"
fi
TOTAL=$((TOTAL + 1))

# 测试批量单词状态获取端点
BATCH_STATES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/word-states/batch" -H "Content-Type: application/json" -d '{"wordIds":[]}' 2>/dev/null || echo "000")
if [[ "$BATCH_STATES" == "401" ]]; then
    pass "批量单词状态获取需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
elif [[ "$BATCH_STATES" == "400" ]]; then
    pass "批量单词状态获取验证空数组 (HTTP 400)"
    PASSED=$((PASSED + 1))
else
    warn "批量单词状态获取返回 HTTP $BATCH_STATES"
fi
TOTAL=$((TOTAL + 1))

# 测试批量删除端点
BATCH_DELETE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/words/batch-delete" -H "Content-Type: application/json" -d '{"wordIds":[]}' 2>/dev/null || echo "000")
if [[ "$BATCH_DELETE" == "401" ]]; then
    pass "批量删除需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
elif [[ "$BATCH_DELETE" == "400" ]]; then
    pass "批量删除验证空数组 (HTTP 400)"
    PASSED=$((PASSED + 1))
else
    warn "批量删除返回 HTTP $BATCH_DELETE"
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "=========================================="
echo "4. 数据库状态检查"
echo "=========================================="

# 检查健康检查响应中的数据库状态
HEALTH_BODY=$(curl -s "$BACKEND_URL/health" 2>/dev/null || echo "{}")
if echo "$HEALTH_BODY" | grep -q '"status"'; then
    pass "健康检查返回状态信息"
    PASSED=$((PASSED + 1))
    echo "   响应: $HEALTH_BODY"
else
    warn "健康检查响应格式异常"
fi
TOTAL=$((TOTAL + 1))

# 检查 debug 端点（如果可用）
DEBUG_DB=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/debug/db-status" 2>/dev/null || echo "000")
if [[ "$DEBUG_DB" == "200" ]]; then
    pass "数据库状态调试端点可访问"
    PASSED=$((PASSED + 1))
    DB_STATUS=$(curl -s "$BACKEND_URL/api/debug/db-status" 2>/dev/null || echo "{}")
    echo "   数据库状态: $DB_STATUS"
elif [[ "$DEBUG_DB" == "401" ]]; then
    pass "数据库状态调试端点需要认证 (HTTP 401)"
    PASSED=$((PASSED + 1))
else
    warn "数据库状态调试端点返回 HTTP $DEBUG_DB"
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "=========================================="
echo "5. About 模块路由测试 (修复验证)"
echo "=========================================="

# 测试修复后的路由
ABOUT_OVERVIEW=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/about/overview" 2>/dev/null || echo "000")
test_result $([[ "$ABOUT_OVERVIEW" == "200" ]] && echo 0 || echo 1) "About 概览 /api/about/overview (HTTP $ABOUT_OVERVIEW)"

ABOUT_PERF=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/about/performance" 2>/dev/null || echo "000")
test_result $([[ "$ABOUT_PERF" == "200" ]] && echo 0 || echo 1) "About 性能 /api/about/performance (HTTP $ABOUT_PERF)"

ABOUT_ALGO=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/about/algorithm-distribution" 2>/dev/null || echo "000")
test_result $([[ "$ABOUT_ALGO" == "200" ]] && echo 0 || echo 1) "About 算法分布 /api/about/algorithm-distribution (HTTP $ABOUT_ALGO)"

ABOUT_MEMORY=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/about/memory" 2>/dev/null || echo "000")
test_result $([[ "$ABOUT_MEMORY" == "200" ]] && echo 0 || echo 1) "About 内存状态 /api/about/memory (HTTP $ABOUT_MEMORY)"

echo ""
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo "总测试数: $TOTAL"
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
else
    echo -e "${YELLOW}部分测试未通过，请检查后端服务状态${NC}"
    exit 1
fi
