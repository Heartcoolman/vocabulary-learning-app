#!/bin/bash

# 依赖版本一致性检查工具
# 用于 CI/CD 和本地开发验证

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  依赖版本一致性检查${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查函数
check_dependency_consistency() {
    local dep_name=$1
    local expected_version=$2

    echo -e "${YELLOW}🔍 检查 ${dep_name}...${NC}"

    # 获取所有版本
    versions=$(pnpm list "$dep_name" --depth=0 -r --json 2>/dev/null | \
        node -e "
            const readline = require('readline');
            const rl = readline.createInterface({ input: process.stdin });
            let data = '';
            rl.on('line', (line) => { data += line; });
            rl.on('close', () => {
                try {
                    const packages = JSON.parse(data);
                    const versions = new Set();
                    packages.forEach(pkg => {
                        const deps = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {})};
                        if (deps['$dep_name']) {
                            versions.add(deps['$dep_name'].version);
                        }
                    });
                    console.log([...versions].join(','));
                } catch (e) {
                    // 忽略解析错误
                }
            });
        "
    )

    if [ -z "$versions" ]; then
        echo -e "${BLUE}  ℹ️  未使用 ${dep_name}${NC}"
        return 0
    fi

    unique_count=$(echo "$versions" | tr ',' '\n' | sort -u | wc -l)

    if [ "$unique_count" -eq 1 ]; then
        current_version=$(echo "$versions" | cut -d',' -f1)
        if [ -n "$expected_version" ] && [ "$current_version" != "$expected_version" ]; then
            echo -e "${YELLOW}  ⚠️  版本不匹配: 期望 ${expected_version}, 实际 ${current_version}${NC}"
            FAILED=$((FAILED + 1))
        else
            echo -e "${GREEN}  ✅ 版本一致: ${current_version}${NC}"
        fi
    else
        echo -e "${RED}  ❌ 检测到多个版本: ${versions}${NC}"
        FAILED=$((FAILED + 1))
        echo -e "${BLUE}  详细信息:${NC}"
        pnpm list "$dep_name" --depth=0 -r | grep "$dep_name"
    fi
    echo ""
}

# 关键依赖检查
echo -e "${BLUE}关键依赖版本检查:${NC}"
echo ""

check_dependency_consistency "zod" "3.25.76"
check_dependency_consistency "typescript" ""
check_dependency_consistency "vitest" ""
check_dependency_consistency "@prisma/client" ""
check_dependency_consistency "prisma" ""

# 检查 pnpm overrides
echo -e "${YELLOW}🔍 检查 pnpm overrides 配置...${NC}"
if node -e "
    const pkg = require('./package.json');
    const overrides = pkg.pnpm?.overrides || {};
    if (overrides.zod !== '3.25.76') {
        console.log('❌ 缺少 zod 版本覆盖配置');
        process.exit(1);
    }
    console.log('✅ pnpm overrides 配置正确');
" 2>/dev/null; then
    echo ""
else
    echo -e "${RED}  ❌ pnpm overrides 配置缺失或不正确${NC}"
    FAILED=$((FAILED + 1))
    echo ""
fi

# TypeScript 配置检查
echo -e "${YELLOW}🔍 检查 TypeScript 配置一致性...${NC}"
TS_CONFIGS=$(find packages -name "tsconfig.json" -type f)
EXTENDS_ERRORS=0

for config in $TS_CONFIGS; do
    if grep -q '"extends"' "$config"; then
        extends_path=$(grep '"extends"' "$config" | head -1 | sed 's/.*"extends": "\(.*\)".*/\1/')
        if [[ ! "$extends_path" =~ ^(\.\./\.\.|@) ]]; then
            echo -e "${YELLOW}  ⚠️  ${config} 的 extends 路径可能不正确: ${extends_path}${NC}"
        fi
    fi
done

if [ "$EXTENDS_ERRORS" -eq 0 ]; then
    echo -e "${GREEN}  ✅ TypeScript 配置结构正常${NC}"
fi
echo ""

# 幽灵依赖检查（简化版）
echo -e "${YELLOW}🔍 检查潜在的幽灵依赖问题...${NC}"
if [ -f ".npmrc" ] && grep -q "node-linker=isolated" .npmrc; then
    echo -e "${GREEN}  ✅ 已启用 isolated 模式，防止幽灵依赖${NC}"
else
    echo -e "${YELLOW}  ⚠️  建议在 .npmrc 中启用 node-linker=isolated${NC}"
fi
echo ""

# 总结
echo -e "${BLUE}========================================${NC}"
if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过!${NC}"
    echo -e "${BLUE}========================================${NC}"
    exit 0
else
    echo -e "${RED}❌ 检查失败: $FAILED 个问题${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}修复建议:${NC}"
    echo "  1. 运行修复脚本: ${BLUE}./scripts/fix-zod-versions.sh${NC}"
    echo "  2. 手动更新 package.json 文件"
    echo "  3. 执行: ${BLUE}pnpm install --force${NC}"
    exit 1
fi
