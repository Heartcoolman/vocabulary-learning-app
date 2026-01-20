#!/bin/bash
# 模拟 OTA 更新服务 - 用于开发环境测试
# 使用方法: ./scripts/mock-ota-service.sh

SOCKET_PATH="/tmp/danci-updater.sock"
STATUS_FILE="/tmp/danci-update-status.json"

# 清理旧的 socket
rm -f "$SOCKET_PATH"

# 初始化状态文件
echo '{"stage":"idle","progress":0,"message":"等待更新","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"

echo "=== OTA 模拟服务已启动 ==="
echo "Socket: $SOCKET_PATH"
echo "Status: $STATUS_FILE"
echo ""
echo "请在另一个终端设置后端环境变量后启动:"
echo "  export OTA_SOCKET_PATH=$SOCKET_PATH"
echo "  export OTA_STATUS_FILE=$STATUS_FILE"
echo "  cargo run"
echo ""
echo "等待连接..."

# 监听 socket，收到消息后模拟更新流程
while true; do
  # 使用 nc 监听 socket
  MSG=$(nc -lU "$SOCKET_PATH" 2>/dev/null)

  if [ -n "$MSG" ]; then
    echo "[$(date +%H:%M:%S)] 收到更新请求: $MSG"

    # 模拟更新流程
    echo '{"stage":"pulling","progress":0,"message":"正在拉取新镜像...","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    sleep 1

    echo '{"stage":"pulling","progress":30,"message":"下载中...","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    sleep 1

    echo '{"stage":"pulling","progress":60,"message":"下载中...","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    sleep 1

    echo '{"stage":"pulling","progress":100,"message":"镜像拉取完成","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    sleep 1

    echo '{"stage":"restarting","progress":50,"message":"正在重启服务...","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    sleep 2

    echo '{"stage":"completed","progress":100,"message":"更新完成","error":null,"timestamp":"'$(date -Iseconds)'"}' > "$STATUS_FILE"
    echo "[$(date +%H:%M:%S)] 模拟更新完成"
  fi
done
