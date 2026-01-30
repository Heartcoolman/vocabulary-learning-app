#!/bin/bash
# 生产环境后端重启监听服务
# 此脚本应在宿主机上运行，监听来自容器的重启请求

SOCKET_DIR="/var/run/danci"
SOCKET_PATH="$SOCKET_DIR/restart.sock"
CONTAINER_NAME="danci-backend-rust"

# 确保以 root 运行
if [[ $EUID -ne 0 ]]; then
   echo "❌ 此脚本需要 root 权限运行"
   echo "   请使用: sudo $0"
   exit 1
fi

cleanup() {
    rm -f "$SOCKET_PATH"
    echo "$(date '+%Y-%m-%d %H:%M:%S') 服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 创建 socket 目录
mkdir -p "$SOCKET_DIR"
chmod 755 "$SOCKET_DIR"

# 移除旧的 socket
rm -f "$SOCKET_PATH"

echo "=============================================="
echo "🔌 生产环境后端重启监听服务"
echo "=============================================="
echo "   Socket: $SOCKET_PATH"
echo "   容器:   $CONTAINER_NAME"
echo "   时间:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "   按 Ctrl+C 停止"
echo "=============================================="
echo ""

# 使用 while 循环持续监听
while true; do
    # 等待连接并读取命令
    cmd=$(nc -lU "$SOCKET_PATH" 2>/dev/null)

    if [[ "$cmd" == *"restart"* ]]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') 🔄 收到重启命令"

        # 检查容器是否存在
        if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') 🔄 正在重启容器 $CONTAINER_NAME..."
            docker restart "$CONTAINER_NAME"

            if [[ $? -eq 0 ]]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ 容器重启成功"
            else
                echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ 容器重启失败"
            fi
        else
            echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ 容器 $CONTAINER_NAME 不存在"
        fi
    fi

    # 短暂休眠后重新创建 socket
    sleep 0.1
    rm -f "$SOCKET_PATH"
done
