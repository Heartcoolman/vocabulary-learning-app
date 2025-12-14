#!/bin/bash

###############################################################################
# 快速用户体验测试脚本
#
# 该脚本提供快速的用户体验测试，适合在开发过程中频繁运行
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   快速用户体验测试${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查是否有参数指定特定场景
SCENARIO="$1"

if [ -z "$SCENARIO" ]; then
    echo -e "${YELLOW}提示: 可以通过参数指定要测试的场景${NC}"
    echo "用法: $0 [scenario-number]"
    echo ""
    echo "场景列表:"
    echo "  1 - 新用户首次访问"
    echo "  2 - 老用户重复访问"
    echo "  3 - 快速连续操作"
    echo "  4 - 弱网络环境"
    echo "  5 - 长时间使用"
    echo "  6 - 跨浏览器测试"
    echo "  7 - 边缘场景"
    echo "  all - 运行所有场景（默认）"
    echo ""
fi

# 构建测试命令
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "all" ]; then
    TEST_GREP=""
    echo -e "${BLUE}运行所有用户体验测试场景...${NC}"
else
    TEST_GREP="--grep \"场景${SCENARIO}\""
    echo -e "${BLUE}运行场景 ${SCENARIO}...${NC}"
fi

# 运行测试
echo ""
echo -e "${YELLOW}开始测试...${NC}"
echo ""

pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts \
    $TEST_GREP \
    --reporter=list,html

TEST_EXIT_CODE=$?

echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   ✓ 测试完成${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}   ⚠ 部分测试失败${NC}"
    echo -e "${YELLOW}========================================${NC}"
fi

echo ""
echo -e "${BLUE}查看详细报告:${NC}"
echo -e "  pnpm playwright show-report"
echo ""

exit $TEST_EXIT_CODE
