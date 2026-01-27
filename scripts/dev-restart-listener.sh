#!/bin/bash
# 开发环境后端重启监听服务

SOCKET_PATH="/tmp/danci-restart.sock"

cleanup() {
    rm -f "$SOCKET_PATH"
    echo "已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

rm -f "$SOCKET_PATH"

echo "🔌 后端重启监听服务已启动"
echo "   Socket: $SOCKET_PATH"
echo "   按 Ctrl+C 停止"
echo ""

# 使用 while 循环持续监听
while true; do
    # 等待连接并读取命令
    cmd=$(nc -lU "$SOCKET_PATH" 2>/dev/null)
    if [[ "$cmd" == *"restart"* ]]; then
        echo "🔄 $(date '+%H:%M:%S') 收到重启命令"
        # 查找并终止当前的后端进程
        pkill -f "target/debug/danci-backend-rust" 2>/dev/null
        pkill -f "target/release/danci-backend-rust" 2>/dev/null
        echo "✅ 后端进程已终止，请手动重启后端"
    fi
    # 短暂休眠后重新创建 socket
    sleep 0.1
    rm -f "$SOCKET_PATH"
done
