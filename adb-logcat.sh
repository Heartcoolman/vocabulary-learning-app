#!/bin/bash

echo "=== Danci Android应用实时日志 ==="
echo "按 Ctrl+C 停止"
echo "-----------------------------------"
echo ""

# 清除旧日志
adb logcat -c

# 实时查看应用相关日志
adb logcat \
  -v time \
  --pid=$(adb shell pidof -s com.danci.app 2>/dev/null || echo "0") \
  | grep -E "(danci|Danci|chromium|Web Console|FATAL|AndroidRuntime|Error)" --color=always

