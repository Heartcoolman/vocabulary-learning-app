#!/bin/bash

# Zod 版本统一修复脚本
# 将所有包的 Zod 版本统一到 3.25.76

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Zod 版本统一修复工具${NC}"
echo -e "${BLUE}  目标版本: 3.25.76${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查是否在项目根目录
if [ ! -f "pnpm-workspace.yaml" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# Step 1: 显示当前版本状态
echo -e "${YELLOW}📊 当前 Zod 版本状态:${NC}"
pnpm list zod --depth=0 -r 2>/dev/null || true
echo ""

# Step 2: 备份当前 package.json 文件
echo -e "${YELLOW}💾 备份 package.json 文件...${NC}"
mkdir -p .backups
cp package.json .backups/package.json.backup
cp packages/backend/package.json .backups/backend-package.json.backup
cp packages/frontend/package.json .backups/frontend-package.json.backup
echo -e "${GREEN}✅ 备份完成: .backups/${NC}"
echo ""

# Step 3: 更新根 package.json 添加 overrides
echo -e "${YELLOW}🔧 更新根 package.json 添加版本覆盖...${NC}"

# 使用 Node.js 脚本更新 package.json
node -e "
const fs = require('fs');
const path = './package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

// 添加或更新 pnpm overrides
if (!pkg.pnpm) {
  pkg.pnpm = {};
}
if (!pkg.pnpm.overrides) {
  pkg.pnpm.overrides = {};
}
pkg.pnpm.overrides.zod = '3.25.76';

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ 根 package.json 已更新');
"

echo ""

# Step 4: 更新 backend package.json
echo -e "${YELLOW}🔧 更新 backend/package.json...${NC}"

node -e "
const fs = require('fs');
const path = './packages/backend/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

if (pkg.dependencies && pkg.dependencies.zod) {
  const oldVersion = pkg.dependencies.zod;
  pkg.dependencies.zod = '^3.25.76';
  console.log(\`✅ Backend: \${oldVersion} → ^3.25.76\`);
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
}
"

echo ""

# Step 5: 更新 frontend package.json
echo -e "${YELLOW}🔧 更新 frontend/package.json...${NC}"

node -e "
const fs = require('fs');
const path = './packages/frontend/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

if (pkg.dependencies && pkg.dependencies.zod) {
  const oldVersion = pkg.dependencies.zod;
  pkg.dependencies.zod = '^3.25.76';
  console.log(\`✅ Frontend: \${oldVersion} → ^3.25.76\`);
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
}
"

echo ""

# Step 6: 清理并重新安装依赖
echo -e "${YELLOW}🧹 清理旧依赖并重新安装...${NC}"
echo -e "${BLUE}这可能需要几分钟...${NC}"

pnpm install --force

echo ""

# Step 7: 验证版本统一
echo -e "${YELLOW}🔍 验证 Zod 版本统一性...${NC}"

ZOD_VERSIONS=$(pnpm list zod --depth=0 -r --json 2>/dev/null | \
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
          if (pkg.dependencies?.zod) {
            versions.add(pkg.dependencies.zod.version);
          }
        });
        console.log([...versions].join(','));
      } catch (e) {
        console.error('解析错误');
      }
    });
  "
)

UNIQUE_VERSIONS=$(echo "$ZOD_VERSIONS" | tr ',' '\n' | sort -u | wc -l)

echo ""
if [ "$UNIQUE_VERSIONS" -eq 1 ] && echo "$ZOD_VERSIONS" | grep -q "3.25.76"; then
    echo -e "${GREEN}✅ 成功! 所有包已统一到 Zod 3.25.76${NC}"
    echo ""
    echo -e "${BLUE}📊 版本详情:${NC}"
    pnpm list zod --depth=0 -r
else
    echo -e "${RED}⚠️  警告: 检测到多个 Zod 版本${NC}"
    echo -e "${YELLOW}发现的版本: $ZOD_VERSIONS${NC}"
    echo ""
    echo -e "${BLUE}详细信息:${NC}"
    pnpm list zod --depth=1 -r
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  修复完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}下一步操作:${NC}"
echo "1. 运行测试: ${YELLOW}pnpm test${NC}"
echo "2. 类型检查: ${YELLOW}pnpm --filter @danci/backend tsc --noEmit${NC}"
echo "3. 构建验证: ${YELLOW}pnpm build${NC}"
echo ""
echo -e "${BLUE}如需回滚:${NC}"
echo "  ${YELLOW}cp .backups/*.backup packages/*/package.json${NC}"
echo "  ${YELLOW}pnpm install --force${NC}"
echo ""
