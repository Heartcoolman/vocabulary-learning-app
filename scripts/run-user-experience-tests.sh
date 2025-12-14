#!/bin/bash

###############################################################################
# 用户体验场景测试执行脚本
#
# 该脚本用于运行完整的用户体验测试套件，并生成详细的测试报告
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试结果目录
RESULTS_DIR="test-results/user-experience"
REPORTS_DIR="reports/user-experience"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 创建目录
mkdir -p "$RESULTS_DIR"
mkdir -p "$REPORTS_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   用户体验场景测试套件${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}测试时间:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${YELLOW}结果目录:${NC} $RESULTS_DIR"
echo -e "${YELLOW}报告目录:${NC} $REPORTS_DIR"
echo ""

# 检查依赖
echo -e "${BLUE}1. 检查测试环境...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}错误: 未安装 pnpm${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装 Node.js${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 测试环境检查通过${NC}"
echo ""

# 安装依赖
echo -e "${BLUE}2. 安装测试依赖...${NC}"
pnpm install --frozen-lockfile
echo -e "${GREEN}✓ 依赖安装完成${NC}"
echo ""

# 启动后端服务（后台）
echo -e "${BLUE}3. 启动后端服务...${NC}"
NODE_ENV=test pnpm --filter @danci/backend dev &
BACKEND_PID=$!
echo -e "${YELLOW}后端服务 PID: $BACKEND_PID${NC}"

# 等待后端服务启动
echo "等待后端服务启动..."
MAX_WAIT=60
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3000/api/about/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 后端服务已启动${NC}"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo -e "${RED}错误: 后端服务启动超时${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi
echo ""

# 启动前端服务（后台）
echo -e "${BLUE}4. 启动前端服务...${NC}"
pnpm --filter @danci/frontend dev &
FRONTEND_PID=$!
echo -e "${YELLOW}前端服务 PID: $FRONTEND_PID${NC}"

# 等待前端服务启动
echo "等待前端服务启动..."
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 前端服务已启动${NC}"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo -e "${RED}错误: 前端服务启动超时${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 1
fi
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${BLUE}清理测试环境...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}✓ 清理完成${NC}"
}

# 注册退出时清理
trap cleanup EXIT

# 运行用户体验测试
echo -e "${BLUE}5. 运行用户体验测试套件...${NC}"
echo ""

# 测试场景配置
declare -a scenarios=(
    "场景1:新用户首次访问"
    "场景2:老用户重复访问"
    "场景3:快速连续操作"
    "场景4:弱网络环境"
    "场景5:长时间使用"
    "场景6:跨浏览器测试"
    "场景7:边缘场景"
)

# 创建测试结果汇总文件
SUMMARY_FILE="$REPORTS_DIR/summary_${TIMESTAMP}.json"
echo "{\"timestamp\": \"$TIMESTAMP\", \"scenarios\": []}" > "$SUMMARY_FILE"

# 运行 Playwright 测试
echo -e "${YELLOW}开始执行 Playwright 测试...${NC}"
TEST_EXIT_CODE=0

# 使用 Playwright 运行测试并生成报告
pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts \
    --reporter=html,json \
    --output="$RESULTS_DIR" \
    --timeout=120000 || TEST_EXIT_CODE=$?

echo ""

# 生成测试报告
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   ✓ 所有测试通过${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}   ⚠ 部分测试失败${NC}"
    echo -e "${YELLOW}========================================${NC}"
fi

echo ""
echo -e "${BLUE}测试结果:${NC}"
echo -e "  - 测试报告: ${YELLOW}playwright-report/index.html${NC}"
echo -e "  - 测试结果: ${YELLOW}$RESULTS_DIR${NC}"
echo -e "  - 测试汇总: ${YELLOW}$SUMMARY_FILE${NC}"
echo ""

# 如果有 Playwright HTML 报告，自动打开
if [ -f "playwright-report/index.html" ]; then
    echo -e "${BLUE}打开测试报告...${NC}"
    if command -v xdg-open &> /dev/null; then
        xdg-open playwright-report/index.html &
    elif command -v open &> /dev/null; then
        open playwright-report/index.html &
    else
        echo -e "${YELLOW}请手动打开: playwright-report/index.html${NC}"
    fi
fi

echo ""
echo -e "${BLUE}测试完成时间:${NC} $(date '+%Y-%m-%d %H:%M:%S')"

exit $TEST_EXIT_CODE
