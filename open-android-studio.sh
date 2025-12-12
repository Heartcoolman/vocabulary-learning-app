#!/bin/bash

ANDROID_PROJECT_PATH="/home/liji/danci/danci/packages/tauri-app/src-tauri/gen/android"

echo "=== 在Android Studio中打开Tauri Android项目 ==="
echo ""
echo "项目路径: $ANDROID_PROJECT_PATH"
echo ""

# 检查Android Studio是否安装
if command -v studio.sh &> /dev/null; then
    echo "✅ 找到Android Studio"
    studio.sh "$ANDROID_PROJECT_PATH" &
elif command -v android-studio &> /dev/null; then
    echo "✅ 找到Android Studio"
    android-studio "$ANDROID_PROJECT_PATH" &
else
    echo "❌ 未找到Android Studio命令"
    echo ""
    echo "请手动在Android Studio中打开以下路径："
    echo "$ANDROID_PROJECT_PATH"
    echo ""
    echo "或者在终端运行："
    echo "studio.sh $ANDROID_PROJECT_PATH"
fi

echo ""
echo "📝 调试步骤："
echo "1. 在Android Studio中打开项目"
echo "2. 连接你的Android设备（USB调试已开启）"
echo "3. 选择设备：顶部工具栏 - 设备选择器"
echo "4. 点击运行按钮（绿色三角形）或调试按钮（虫子图标）"
echo "5. 查看Logcat了解应用日志"
