#!/bin/bash

###############################################################################
# 用户体验测试验证脚本
#
# 该脚本用于验证测试环境是否正确配置，并运行一个简单的冒烟测试
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   用户体验测试环境验证${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查清单
CHECKS_PASSED=0
CHECKS_FAILED=0

# 辅助函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. 检查 Node.js
echo -e "${BLUE}1. 检查 Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js 已安装: $NODE_VERSION"
else
    check_fail "Node.js 未安装"
fi

# 2. 检查 pnpm
echo -e "${BLUE}2. 检查 pnpm...${NC}"
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    check_pass "pnpm 已安装: v$PNPM_VERSION"
else
    check_fail "pnpm 未安装"
    echo "   安装方法: npm install -g pnpm"
fi

# 3. 检查项目依赖
echo -e "${BLUE}3. 检查项目依赖...${NC}"
if [ -d "node_modules" ]; then
    check_pass "项目依赖已安装"
else
    check_warn "项目依赖未安装，运行 'pnpm install'"
fi

# 4. 检查 Playwright
echo -e "${BLUE}4. 检查 Playwright...${NC}"
if [ -f "node_modules/.bin/playwright" ]; then
    check_pass "Playwright 已安装"

    # 检查浏览器
    if pnpm playwright --version &> /dev/null; then
        check_pass "Playwright 浏览器已安装"
    else
        check_warn "Playwright 浏览器可能未安装，运行 'pnpm playwright install'"
    fi
else
    check_fail "Playwright 未安装"
fi

# 5. 检查测试文件
echo -e "${BLUE}5. 检查测试文件...${NC}"
if [ -f "tests/e2e/user-experience-scenarios.spec.ts" ]; then
    check_pass "用户体验测试套件存在"
else
    check_fail "用户体验测试套件不存在"
fi

# 6. 检查脚本文件
echo -e "${BLUE}6. 检查脚本文件...${NC}"
if [ -f "scripts/quick-ux-test.sh" ]; then
    check_pass "快速测试脚本存在"
else
    check_fail "快速测试脚本不存在"
fi

if [ -f "scripts/run-user-experience-tests.sh" ]; then
    check_pass "完整测试脚本存在"
else
    check_fail "完整测试脚本不存在"
fi

# 7. 检查配置文件
echo -e "${BLUE}7. 检查配置文件...${NC}"
if [ -f "playwright.config.ts" ]; then
    check_pass "Playwright 配置文件存在"
else
    check_fail "Playwright 配置文件不存在"
fi

# 8. 检查文档
echo -e "${BLUE}8. 检查文档...${NC}"
if [ -f "docs/USER_EXPERIENCE_TESTING.md" ]; then
    check_pass "测试文档存在"
else
    check_warn "测试文档不存在"
fi

# 9. 检查端口占用
echo -e "${BLUE}9. 检查端口占用...${NC}"

# 检查 3000 端口（后端）
if ! lsof -i:3000 &> /dev/null && ! netstat -tuln 2>/dev/null | grep :3000 &> /dev/null; then
    check_pass "端口 3000 (后端) 可用"
else
    check_warn "端口 3000 (后端) 已被占用"
fi

# 检查 5173 端口（前端）
if ! lsof -i:5173 &> /dev/null && ! netstat -tuln 2>/dev/null | grep :5173 &> /dev/null; then
    check_pass "端口 5173 (前端) 可用"
else
    check_warn "端口 5173 (前端) 已被占用"
fi

# 10. 运行快速冒烟测试（可选）
echo ""
echo -e "${BLUE}10. 运行冒烟测试...${NC}"
echo -e "${YELLOW}提示: 按 Ctrl+C 跳过冒烟测试${NC}"
read -p "是否运行快速冒烟测试? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}启动服务并运行测试...${NC}"

    # 启动后端
    echo "启动后端服务..."
    NODE_ENV=test pnpm --filter @danci/backend dev &
    BACKEND_PID=$!

    # 等待后端启动
    MAX_WAIT=30
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s http://localhost:3000/api/about/health > /dev/null 2>&1; then
            check_pass "后端服务启动成功"
            break
        fi
        sleep 1
        WAIT_COUNT=$((WAIT_COUNT + 1))
    done

    if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
        check_fail "后端服务启动超时"
        kill $BACKEND_PID 2>/dev/null || true
    else
        # 启动前端
        echo "启动前端服务..."
        pnpm --filter @danci/frontend dev &
        FRONTEND_PID=$!

        # 等待前端启动
        WAIT_COUNT=0
        while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
            if curl -s http://localhost:5173 > /dev/null 2>&1; then
                check_pass "前端服务启动成功"
                break
            fi
            sleep 1
            WAIT_COUNT=$((WAIT_COUNT + 1))
        done

        if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
            check_fail "前端服务启动超时"
        else
            # 运行快速测试
            echo ""
            echo -e "${BLUE}运行场景 1 的第一轮测试...${NC}"
            pnpm playwright test tests/e2e/user-experience-scenarios.spec.ts \
                --grep "第1轮 - 测量首次加载性能" \
                --reporter=list || true
        fi

        # 清理
        echo ""
        echo -e "${BLUE}停止服务...${NC}"
        kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
        sleep 2
    fi
fi

# 总结
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   验证总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "通过检查: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "失败检查: ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 测试环境配置正确！${NC}"
    echo ""
    echo "可以运行以下命令开始测试:"
    echo -e "  ${BLUE}./scripts/quick-ux-test.sh${NC}           # 快速测试"
    echo -e "  ${BLUE}./scripts/run-user-experience-tests.sh${NC}  # 完整测试"
    echo ""
    exit 0
else
    echo -e "${RED}⚠ 测试环境配置不完整，请先解决上述问题${NC}"
    echo ""
    echo "常见解决方法:"
    echo "  1. 安装依赖: pnpm install"
    echo "  2. 安装浏览器: pnpm playwright install"
    echo "  3. 检查脚本权限: chmod +x scripts/*.sh"
    echo ""
    exit 1
fi
