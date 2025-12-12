#!/bin/bash

echo "=== 开始Android调试 ==="
echo ""
echo "1. 确保设备已连接："
adb devices
echo ""

echo "2. 清除应用数据并重启："
adb shell pm clear com.danci.app
echo ""

echo "3. 启动应用："
adb shell am start -n com.danci.app/.MainActivity
sleep 2
echo ""

echo "4. 查看应用日志（按Ctrl+C停止）："
echo "-----------------------------------"
adb logcat -c  # 清除之前的日志
adb logcat | grep -E "(danci|Danci|chromium|Web Console)"
