#!/bin/bash
# E2E测试执行脚本
# 用途: 运行所有或特定的E2E测试并生成报告

set -e

echo "========================================="
echo "单词学习应用 - E2E测试执行"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKEND_URL="${E2E_BACKEND_URL:-http://localhost:3000}"
FRONTEND_URL="${E2E_FRONTEND_URL:-http://localhost:5173}"
HEALTHCHECK_ENDPOINT="${HEALTHCHECK_ENDPOINT:-/health}"

# 规范化 URL/路径，避免重复斜杠
BACKEND_URL="${BACKEND_URL%/}"
FRONTEND_URL="${FRONTEND_URL%/}"
HEALTHCHECK_ENDPOINT="/${HEALTHCHECK_ENDPOINT#/}"
HEALTHCHECK_ENDPOINT="${HEALTHCHECK_ENDPOINT%/}"

BACKEND_READY_URL="${BACKEND_URL}${HEALTHCHECK_ENDPOINT}/ready"

# 检查依赖
check_dependencies() {
    echo -e "${YELLOW}检查测试依赖...${NC}"

    if ! command -v npx &> /dev/null; then
        echo -e "${RED}错误: 未找到 npx，请安装 Node.js${NC}"
        exit 1
    fi

    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}错误: 未找到 pnpm，请安装 pnpm${NC}"
        exit 1
    fi

    echo -e "${GREEN}依赖检查通过${NC}"
    echo ""
}

# 检查服务状态
check_services() {
    echo -e "${YELLOW}检查服务状态...${NC}"

    # 检查后端
    if ! curl -sf "$BACKEND_READY_URL" > /dev/null 2>&1; then
        echo -e "${RED}警告: 后端服务未运行 (${BACKEND_READY_URL})${NC}"
        echo "请在另一个终端运行: pnpm --filter @danci/backend dev"
        read -p "按回车键继续，或 Ctrl+C 取消..."
    else
        echo -e "${GREEN}✓ 后端服务运行中${NC}"
    fi

    # 检查前端
    if ! curl -sf "$FRONTEND_URL" > /dev/null 2>&1; then
        echo -e "${RED}警告: 前端服务未运行 (${FRONTEND_URL})${NC}"
        echo "请在另一个终端运行: pnpm --filter @danci/frontend dev"
        read -p "按回车键继续，或 Ctrl+C 取消..."
    else
        echo -e "${GREEN}✓ 前端服务运行中${NC}"
    fi

    echo ""
}

# 运行测试
run_tests() {
    local test_pattern="$1"
    local test_name="$2"

    echo -e "${YELLOW}运行测试: ${test_name}${NC}"
    echo "测试模式: ${test_pattern}"
    echo ""

    if [ -z "$test_pattern" ]; then
        # 运行所有测试
        npx playwright test --reporter=html,list
    else
        # 运行特定测试
        npx playwright test "$test_pattern" --reporter=html,list
    fi
}

# 显示帮助
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  all              运行所有测试 (默认)"
    echo "  new              仅运行新增的测试 (SSE, 实验, v1 API)"
    echo "  auth             运行认证测试"
    echo "  learning         运行学习流程测试"
    echo "  amas             运行 AMAS 决策测试"
    echo "  realtime         运行实时反馈测试"
    echo "  experiments      运行 A/B 实验和迁移测试"
    echo "  api              运行 v1 API 测试"
    echo "  list             列出所有测试用例"
    echo "  help             显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0              # 运行所有测试"
    echo "  $0 new          # 运行新增测试"
    echo "  $0 auth         # 运行认证测试"
    echo "  $0 list         # 列出所有测试"
    echo ""
}

# 主函数
main() {
    local command="${1:-all}"

    case "$command" in
        help|--help|-h)
            show_help
            exit 0
            ;;
        list)
            echo -e "${YELLOW}测试用例列表:${NC}"
            echo ""
            npx playwright test --list
            exit 0
            ;;
        all)
            check_dependencies
            check_services
            run_tests "" "所有测试"
            ;;
        new)
            check_dependencies
            check_services
            run_tests "tests/e2e/realtime-sse.spec.ts tests/e2e/experiments-and-migration.spec.ts tests/e2e/api-v1-and-eventbus.spec.ts" "新增测试"
            ;;
        auth)
            check_dependencies
            check_services
            run_tests "tests/e2e/auth.spec.ts" "认证测试"
            ;;
        learning)
            check_dependencies
            check_services
            run_tests "tests/e2e/learning*.spec.ts" "学习流程测试"
            ;;
        amas)
            check_dependencies
            check_services
            run_tests "tests/e2e/amas-decision.spec.ts" "AMAS决策测试"
            ;;
        realtime)
            check_dependencies
            check_services
            run_tests "tests/e2e/realtime-sse.spec.ts" "实时反馈测试"
            ;;
        experiments)
            check_dependencies
            check_services
            run_tests "tests/e2e/experiments-and-migration.spec.ts" "A/B实验和迁移测试"
            ;;
        api)
            check_dependencies
            check_services
            run_tests "tests/e2e/api-v1-and-eventbus.spec.ts" "v1 API测试"
            ;;
        *)
            echo -e "${RED}错误: 未知命令 '$command'${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac

    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}测试执行完成${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "HTML报告已生成: playwright-report/index.html"
    echo "查看报告: npx playwright show-report"
}

# 执行主函数
main "$@"
