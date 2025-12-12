#!/bin/bash
echo "=== 开始收集崩溃日志 ==="
echo ""
echo "1. 清除旧日志"
adb logcat -c
echo ""

echo "2. 启动应用"
adb shell am start -n com.danci.app/.MainActivity
sleep 2
echo ""

echo "3. 收集崩溃日志（10秒）"
timeout 10 adb logcat | tee crash.log | grep -E "(FATAL|AndroidRuntime|danci|Danci|MainActivity|chromium)"
echo ""
echo "完整日志已保存到 crash.log"
