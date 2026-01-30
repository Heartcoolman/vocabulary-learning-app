#!/bin/bash
# 生产环境 OTA 更新服务
# 此脚本应在宿主机上运行，处理来自容器的更新请求

SOCKET_DIR="/var/run/danci"
SOCKET_PATH="$SOCKET_DIR/updater.sock"
STATUS_FILE="$SOCKET_DIR/update-status.json"
DEPLOY_DIR="/opt/danci"
GITHUB_REPO="heartcoolman/vocabulary-learning-app"

# 确保以 root 运行
if [[ $EUID -ne 0 ]]; then
   echo "❌ 此脚本需要 root 权限运行"
   echo "   请使用: sudo $0"
   exit 1
fi

cleanup() {
    rm -f "$SOCKET_PATH"
    echo "$(date '+%Y-%m-%d %H:%M:%S') OTA 服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

write_status() {
    local stage="$1"
    local progress="$2"
    local message="$3"
    local error="$4"

    if [ -z "$error" ]; then
        echo "{\"stage\":\"$stage\",\"progress\":$progress,\"message\":\"$message\",\"error\":null,\"timestamp\":\"$(date -Iseconds)\"}" > "$STATUS_FILE"
    else
        echo "{\"stage\":\"$stage\",\"progress\":$progress,\"message\":\"$message\",\"error\":\"$error\",\"timestamp\":\"$(date -Iseconds)\"}" > "$STATUS_FILE"
    fi
}

# 创建目录
mkdir -p "$SOCKET_DIR"
chmod 755 "$SOCKET_DIR"

# 移除旧的 socket
rm -f "$SOCKET_PATH"

# 初始化状态文件
write_status "idle" 0 "等待更新" ""

echo "=============================================="
echo "🔄 生产环境 OTA 更新服务"
echo "=============================================="
echo "   Socket: $SOCKET_PATH"
echo "   Status: $STATUS_FILE"
echo "   Deploy: $DEPLOY_DIR"
echo "   时间:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "   按 Ctrl+C 停止"
echo "=============================================="
echo ""

# 使用 while 循环持续监听
while true; do
    # 等待连接并读取命令
    cmd=$(nc -lU "$SOCKET_PATH" 2>/dev/null)

    if [[ "$cmd" == *"update"* ]]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') 🔄 收到更新请求"

        cd "$DEPLOY_DIR" || {
            write_status "failed" 0 "部署目录不存在" "$DEPLOY_DIR not found"
            echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ 部署目录不存在: $DEPLOY_DIR"
            sleep 0.1
            rm -f "$SOCKET_PATH"
            continue
        }

        # 阶段1: 拉取新镜像
        write_status "pulling" 0 "正在拉取新镜像..." ""
        echo "$(date '+%Y-%m-%d %H:%M:%S') 📥 拉取镜像中..."

        if docker compose pull 2>&1; then
            write_status "pulling" 100 "镜像拉取完成" ""
            echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ 镜像拉取完成"
        else
            write_status "failed" 0 "镜像拉取失败" "docker compose pull failed"
            echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ 镜像拉取失败"
            sleep 0.1
            rm -f "$SOCKET_PATH"
            continue
        fi

        # 阶段2: 重启服务
        write_status "restarting" 50 "正在重启服务..." ""
        echo "$(date '+%Y-%m-%d %H:%M:%S') 🔄 重启服务中..."

        if docker compose up -d --force-recreate 2>&1; then
            write_status "restarting" 80 "等待服务启动..." ""
            sleep 5

            # 健康检查
            if docker compose ps | grep -q "healthy\|running"; then
                write_status "completed" 100 "更新完成" ""
                echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ 更新完成"
            else
                write_status "completed" 100 "更新完成，请检查服务状态" ""
                echo "$(date '+%Y-%m-%d %H:%M:%S') ⚠️ 更新完成，服务状态需确认"
            fi
        else
            write_status "failed" 0 "服务重启失败" "docker compose up failed"
            echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ 服务重启失败"
        fi
    fi

    # 短暂休眠后重新创建 socket
    sleep 0.1
    rm -f "$SOCKET_PATH"
done
