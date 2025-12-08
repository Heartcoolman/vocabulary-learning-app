#!/bin/bash

# Bundle分析报告查看脚本
# 用于快速打开和查看Bundle分析报告

echo "=================================================="
echo "   Bundle 分析报告查看工具"
echo "=================================================="
echo ""
echo "可用的报告:"
echo ""
echo "1. 交互式可视化报告 (stats.html)"
echo "2. 详细分析报告 (BUNDLE_ANALYSIS_REPORT.md)"
echo "3. 性能基线数据 (performance-baseline.json)"
echo "4. 执行摘要 (bundle-analysis-summary.txt)"
echo ""
echo "请选择要查看的报告 (1-4) 或按 q 退出:"

read -r choice

case $choice in
    1)
        echo ""
        echo "正在启动HTTP服务器..."
        echo "浏览器将在 http://localhost:8080/stats.html 打开"
        echo "按 Ctrl+C 停止服务器"
        echo ""
        cd dist || exit
        python3 -m http.server 8080
        ;;
    2)
        echo ""
        echo "正在打开详细分析报告..."
        if command -v bat &> /dev/null; then
            bat BUNDLE_ANALYSIS_REPORT.md
        elif command -v less &> /dev/null; then
            less BUNDLE_ANALYSIS_REPORT.md
        else
            cat BUNDLE_ANALYSIS_REPORT.md
        fi
        ;;
    3)
        echo ""
        echo "正在打开性能基线数据..."
        if command -v jq &> /dev/null; then
            jq . performance-baseline.json
        elif command -v python3 &> /dev/null; then
            python3 -m json.tool performance-baseline.json
        else
            cat performance-baseline.json
        fi
        ;;
    4)
        echo ""
        echo "正在打开执行摘要..."
        if command -v bat &> /dev/null; then
            bat bundle-analysis-summary.txt
        elif command -v less &> /dev/null; then
            less bundle-analysis-summary.txt
        else
            cat bundle-analysis-summary.txt
        fi
        ;;
    q|Q)
        echo "退出"
        exit 0
        ;;
    *)
        echo "无效的选择"
        exit 1
        ;;
esac
