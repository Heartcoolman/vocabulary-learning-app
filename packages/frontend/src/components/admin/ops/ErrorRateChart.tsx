/**
 * 错误率图表组件
 *
 * 显示系统错误率的时间序列图表
 * 用于监控系统稳定性和发现异常
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { env } from '../../../config/env';
import { chartColors } from '../../../utils/iconColors';

// ============================================
// 类型定义
// ============================================

interface ErrorDataPoint {
  timestamp: number;
  totalRequests: number;
  errorRequests: number;
  errorRate: number;
}

interface ErrorRateChartProps {
  /** 时间范围（分钟） */
  timeRange?: number;
  /** 刷新间隔（秒） */
  refreshInterval?: number;
  /** 图表高度 */
  height?: number;
}

// ============================================
// 常量 - Canvas 绘制颜色
// ============================================

const CHART_COLORS = {
  primary: chartColors.primary,
  error: chartColors.error,
  warning: chartColors.warning,
  success: chartColors.success,
  grid: chartColors.grid,
  text: chartColors.text,
  background: '#ffffff',
};

// ============================================
// 辅助函数
// ============================================

/**
 * 生成模拟数据（用于演示）
 */
function generateMockData(count: number): ErrorDataPoint[] {
  const now = Date.now();
  const data: ErrorDataPoint[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - i * 60000; // 每分钟一个点
    const totalRequests = Math.floor(Math.random() * 500) + 100;
    const errorRequests = Math.floor(Math.random() * 10);
    const errorRate = (errorRequests / totalRequests) * 100;

    data.push({
      timestamp,
      totalRequests,
      errorRequests,
      errorRate,
    });
  }

  return data;
}

/**
 * 格式化时间
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// 主组件
// ============================================

export const ErrorRateChart: React.FC<ErrorRateChartProps> = ({
  timeRange = 60,
  refreshInterval = 60,
  height = 300,
}) => {
  const [data, setData] = useState<ErrorDataPoint[]>([]);
  const [selectedRange, setSelectedRange] = useState(timeRange);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * 获取错误数据
   */
  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(
        `${env.apiUrl}/api/admin/metrics/error-rate?range=${selectedRange}`,
        { credentials: 'include' },
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setData(result.data);
          return;
        }
      }

      // 如果获取失败，使用模拟数据
      setData(generateMockData(selectedRange));
    } catch (e) {
      console.error('Failed to fetch error rate data:', e);
      // 使用模拟数据
      setData(generateMockData(selectedRange));
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  /**
   * 绘制图表
   */
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 获取设备像素比
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // 设置 canvas 尺寸
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const chartHeight = height;

    // 图表边距
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartContentHeight = chartHeight - padding.top - padding.bottom;

    // 清除画布
    ctx.fillStyle = CHART_COLORS.background;
    ctx.fillRect(0, 0, width, chartHeight);

    // 计算数据范围
    const maxErrorRate = Math.max(...data.map((d) => d.errorRate), 5);
    const minTime = data[0].timestamp;
    const maxTime = data[data.length - 1].timestamp;

    // 绘制网格线
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;

    // 水平网格线
    const yGridCount = 5;
    for (let i = 0; i <= yGridCount; i++) {
      const y = padding.top + (chartContentHeight * i) / yGridCount;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y 轴标签
      const value = (maxErrorRate * (yGridCount - i)) / yGridCount;
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${value.toFixed(1)}%`, padding.left - 8, y + 4);
    }

    // 垂直网格线和时间标签
    const xGridCount = Math.min(data.length - 1, 6);
    for (let i = 0; i <= xGridCount; i++) {
      const x = padding.left + (chartWidth * i) / xGridCount;
      ctx.beginPath();
      ctx.strokeStyle = CHART_COLORS.grid;
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, chartHeight - padding.bottom);
      ctx.stroke();

      // X 轴时间标签
      const dataIndex = Math.floor((data.length - 1) * (i / xGridCount));
      if (data[dataIndex]) {
        ctx.fillStyle = CHART_COLORS.text;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(data[dataIndex].timestamp), x, chartHeight - padding.bottom + 20);
      }
    }

    // 绘制错误率曲线
    ctx.beginPath();
    ctx.strokeStyle = CHART_COLORS.error;
    ctx.lineWidth = 2;

    data.forEach((point, index) => {
      const x =
        padding.left + ((point.timestamp - minTime) / (maxTime - minTime || 1)) * chartWidth;
      const y =
        padding.top + chartContentHeight - (point.errorRate / maxErrorRate) * chartContentHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // 绘制填充区域
    ctx.lineTo(padding.left + chartWidth, padding.top + chartContentHeight);
    ctx.lineTo(padding.left, padding.top + chartContentHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 67, 54, 0.1)';
    ctx.fill();

    // 绘制数据点
    data.forEach((point) => {
      const x =
        padding.left + ((point.timestamp - minTime) / (maxTime - minTime || 1)) * chartWidth;
      const y =
        padding.top + chartContentHeight - (point.errorRate / maxErrorRate) * chartContentHeight;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = CHART_COLORS.error;
      ctx.fill();
    });

    // 绘制阈值线（2% 错误率）
    const thresholdY = padding.top + chartContentHeight - (2 / maxErrorRate) * chartContentHeight;
    if (thresholdY > padding.top && thresholdY < padding.top + chartContentHeight) {
      ctx.beginPath();
      ctx.strokeStyle = CHART_COLORS.warning;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(padding.left, thresholdY);
      ctx.lineTo(width - padding.right, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 阈值标签
      ctx.fillStyle = CHART_COLORS.warning;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('阈值 2%', width - padding.right + 4, thresholdY + 3);
    }

    // Y 轴标题
    ctx.save();
    ctx.translate(12, chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CHART_COLORS.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('错误率 (%)', 0, 0);
    ctx.restore();
  }, [data, height]);

  // 获取数据
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  // 绘制图表
  useEffect(() => {
    drawChart();

    // 监听窗口大小变化
    const handleResize = () => {
      drawChart();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // 计算统计数据
  const stats = React.useMemo(() => {
    if (data.length === 0) {
      return {
        avgErrorRate: 0,
        maxErrorRate: 0,
        totalErrors: 0,
        totalRequests: 0,
      };
    }

    const totalErrors = data.reduce((sum, d) => sum + d.errorRequests, 0);
    const totalRequests = data.reduce((sum, d) => sum + d.totalRequests, 0);
    const avgErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const maxErrorRate = Math.max(...data.map((d) => d.errorRate));

    return {
      avgErrorRate,
      maxErrorRate,
      totalErrors,
      totalRequests,
    };
  }, [data]);

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="m-0 text-base font-semibold text-gray-800">错误率趋势</h3>
        <div className="flex gap-2">
          {[15, 30, 60, 120].map((range) => (
            <button
              key={range}
              className={`rounded border px-3 py-1 text-xs transition-all ${
                selectedRange === range
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setSelectedRange(range)}
            >
              {range}分钟
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        {loading ? (
          <div
            className="flex items-center justify-center text-sm text-gray-400"
            style={{ height }}
          >
            加载中...
          </div>
        ) : data.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-gray-400"
            style={{ height }}
          >
            暂无数据
          </div>
        ) : (
          <canvas ref={canvasRef} className="h-full w-full" />
        )}
      </div>

      <div className="mt-4 flex justify-center gap-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CHART_COLORS.error }}
          />
          <span>错误率</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CHART_COLORS.warning }}
          />
          <span>告警阈值</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4 border-t border-gray-100 pt-4">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-800">
            {stats.avgErrorRate.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-gray-400">平均错误率</div>
        </div>
        <div className="text-center">
          <div
            className="text-xl font-semibold"
            style={{
              color: stats.maxErrorRate > 2 ? CHART_COLORS.error : CHART_COLORS.success,
            }}
          >
            {stats.maxErrorRate.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-gray-400">最高错误率</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-800">{stats.totalErrors}</div>
          <div className="mt-1 text-xs text-gray-400">错误总数</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-800">
            {stats.totalRequests.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-gray-400">请求总数</div>
        </div>
      </div>
    </div>
  );
};

export default ErrorRateChart;
