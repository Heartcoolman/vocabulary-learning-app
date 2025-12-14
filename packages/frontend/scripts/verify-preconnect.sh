#!/bin/bash

# 资源预加载功能验证脚本
# 用于快速验证 preconnect 和 dns-prefetch 是否正确注入

echo "=================================="
echo "资源预加载功能验证"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境变量
echo "1️⃣  检查环境变量配置"
if [ -f .env.local ]; then
  API_URL=$(grep VITE_API_URL .env.local | cut -d '=' -f 2)
  echo -e "   ${GREEN}✓${NC} 找到 .env.local"
  echo "   VITE_API_URL = $API_URL"
else
  echo -e "   ${YELLOW}⚠${NC}  未找到 .env.local，将使用默认值"
  API_URL="http://localhost:3000"
fi
echo ""

# 启动开发服务器
echo "2️⃣  启动开发服务器 (5秒)..."
pnpm run dev --port 5174 > /tmp/vite-dev.log 2>&1 &
DEV_PID=$!
sleep 5

# 检查服务器是否启动
if ! curl -s http://localhost:5174 > /dev/null; then
  echo -e "   ${RED}✗${NC} 服务器启动失败"
  kill $DEV_PID 2>/dev/null
  exit 1
fi
echo -e "   ${GREEN}✓${NC} 服务器已启动"
echo ""

# 获取 HTML 并检查 preconnect
echo "3️⃣  检查 HTML 标签注入"
HTML=$(curl -s http://localhost:5174/)

if echo "$HTML" | grep -q 'rel="preconnect"'; then
  PRECONNECT_TAG=$(echo "$HTML" | grep 'rel="preconnect"' | sed 's/^[ \t]*//')
  echo -e "   ${GREEN}✓${NC} preconnect 标签已注入"
  echo "   $PRECONNECT_TAG"
else
  echo -e "   ${RED}✗${NC} 未找到 preconnect 标签"
fi

if echo "$HTML" | grep -q 'rel="dns-prefetch"'; then
  DNS_TAG=$(echo "$HTML" | grep 'rel="dns-prefetch"' | sed 's/^[ \t]*//')
  echo -e "   ${GREEN}✓${NC} dns-prefetch 标签已注入"
  echo "   $DNS_TAG"
else
  echo -e "   ${RED}✗${NC} 未找到 dns-prefetch 标签"
fi
echo ""

# 检查注释
if echo "$HTML" | grep -q 'API 资源预连接 (动态注入)'; then
  echo -e "   ${GREEN}✓${NC} 找到动态注入标识注释"
else
  echo -e "   ${YELLOW}⚠${NC}  未找到标识注释"
fi
echo ""

# 清理
echo "4️⃣  清理"
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
echo -e "   ${GREEN}✓${NC} 服务器已停止"
echo ""

echo "=================================="
echo -e "${GREEN}验证完成！${NC}"
echo "=================================="
