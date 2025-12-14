/**
 * 性能趋势图组件
 *
 * 显示系统响应时间的时间序列图表
 * 包含 P50、P95、P99 等百分位指标
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { env } from '../../../config/env';

// ============================================
// 类型定义
// ============================================

interface PerformanceDataPoint {
  timestamp: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

interface PerformanceTrendChartProps {
  /** 时间范围（分钟） */
  timeRange?: number;
  /** 刷新间隔（秒） */
  refreshInterval?: number;
  /** 图表高度 */
  height?: number;
}

// ============================================
// 常量
// ============================================

const CHART_COLORS = {
  avg: '#2196f3',
  p50: '#4caf50',
  p95: '#ff9800',
  p99: '#f44336',
  grid: '#e0e0e0',
  text: '#666',
  background: '#ffffff',
};

// ============================================
// 组件样式
// ============================================

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
    margin: 0,
  } as React.CSSProperties,
  controls: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  button: {
    padding: '4px 12px',
    fontSize: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  buttonActive: {
    backgroundColor: '#1976d2',
    color: 'white',
    borderColor: '#1976d2',
  } as React.CSSProperties,
  chartContainer: {
    position: 'relative' as const,
    width: '100%',
  } as React.CSSProperties,
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    marginTop: '16px',
  } as React.CSSProperties,
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#666',
    cursor: 'pointer',
    opacity: 1,
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  legendItemDisabled: {
    opacity: 0.3,
  } as React.CSSProperties,
  legendLine: {
    width: '20px',
    height: '2px',
  } as React.CSSProperties,
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #eee',
  } as React.CSSProperties,
  statItem: {
    textAlign: 'center' as const,
  } as React.CSSProperties,
  statValue: {
    fontSize: '20px',
    fontWeight: 600,
  } as React.CSSProperties,
  statLabel: {
    fontSize: '12px',
    color: '#999',
    marginTop: '4px',
  } as React.CSSProperties,
  noData: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================
// 辅助函数
// ============================================

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

export const PerformanceTrendChart: React.FC<PerformanceTrendChartProps> = ({
  timeRange = 60,
  refreshInterval = 60,
  height = 300,
}) => {
  const [data, setData] = useState<PerformanceDataPoint[]>([]);
  const [selectedRange, setSelectedRange] = useState(timeRange);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleLines, setVisibleLines] = useState({
    avg: true,
    p50: true,
    p95: true,
    p99: true,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * 切换线条可见性
   */
  const toggleLine = (line: keyof typeof visibleLines) => {
    setVisibleLines((prev) => ({
      ...prev,
      [line]: !prev[line],
    }));
  };

  /**
   * 获取性能数据
   */
  const fetchData = useCallback(async () => {
    try {
      setFetchError(null);
      const response = await fetch(
        `${env.apiUrl}/api/admin/metrics/performance?range=${selectedRange}`,
        { credentials: 'include' },
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setData(result.data);
          return;
        }
      }

      setFetchError('无法获取性能数据');
      setData([]);
    } catch (e) {
      console.error('Failed to fetch performance data:', e);
      setFetchError('请求性能数据失败');
      setData([]);
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
    const allValues: number[] = [];
    if (visibleLines.avg) allValues.push(...data.map((d) => d.avg));
    if (visibleLines.p50) allValues.push(...data.map((d) => d.p50));
    if (visibleLines.p95) allValues.push(...data.map((d) => d.p95));
    if (visibleLines.p99) allValues.push(...data.map((d) => d.p99));

    const maxValue = allValues.length > 0 ? Math.max(...allValues) : 100;
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
      const value = (maxValue * (yGridCount - i)) / yGridCount;
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${value.toFixed(0)}ms`, padding.left - 8, y + 4);
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

    // 绘制数据线的辅助函数
    const drawLine = (values: number[], color: string, lineWidth: number = 2) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;

      data.forEach((point, index) => {
        const x =
          padding.left + ((point.timestamp - minTime) / (maxTime - minTime || 1)) * chartWidth;
        const y =
          padding.top + chartContentHeight - (values[index] / maxValue) * chartContentHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    };

    // 按顺序绘制各条线（从底层到顶层）
    if (visibleLines.avg) {
      drawLine(
        data.map((d) => d.avg),
        CHART_COLORS.avg,
        1.5,
      );
    }
    if (visibleLines.p50) {
      drawLine(
        data.map((d) => d.p50),
        CHART_COLORS.p50,
        2,
      );
    }
    if (visibleLines.p95) {
      drawLine(
        data.map((d) => d.p95),
        CHART_COLORS.p95,
        2,
      );
    }
    if (visibleLines.p99) {
      drawLine(
        data.map((d) => d.p99),
        CHART_COLORS.p99,
        2,
      );
    }

    // 绘制阈值线（200ms）
    const thresholdY = padding.top + chartContentHeight - (200 / maxValue) * chartContentHeight;
    if (thresholdY > padding.top && thresholdY < padding.top + chartContentHeight) {
      ctx.beginPath();
      ctx.strokeStyle = '#9e9e9e';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(padding.left, thresholdY);
      ctx.lineTo(width - padding.right, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 阈值标签
      ctx.fillStyle = '#9e9e9e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('目标 200ms', width - padding.right + 4, thresholdY + 3);
    }

    // Y 轴标题
    ctx.save();
    ctx.translate(12, chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CHART_COLORS.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('响应时间 (ms)', 0, 0);
    ctx.restore();
  }, [data, height, visibleLines]);

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

  // 计算最新的统计数据
  const latestStats = React.useMemo(() => {
    if (data.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    const latest = data[data.length - 1];
    return {
      avg: latest.avg,
      p50: latest.p50,
      p95: latest.p95,
      p99: latest.p99,
    };
  }, [data]);

  /**
   * 获取性能评级颜色
   */
  const getPerformanceColor = (value: number): string => {
    if (value < 100) return CHART_COLORS.p50; // 好
    if (value < 200) return CHART_COLORS.avg; // 可接受
    if (value < 500) return CHART_COLORS.p95; // 需关注
    return CHART_COLORS.p99; // 差
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>响应时间趋势</h3>
        <div style={styles.controls}>
          {[15, 30, 60, 120].map((range) => (
            <button
              key={range}
              style={{
                ...styles.button,
                ...(selectedRange === range ? styles.buttonActive : {}),
              }}
              onClick={() => setSelectedRange(range)}
            >
              {range}分钟
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...styles.chartContainer, height }}>
        {loading ? (
          <div style={{ ...styles.noData, height }}>加载中...</div>
        ) : fetchError ? (
          <div style={{ ...styles.noData, height, color: '#ef4444' }}>{fetchError}</div>
        ) : data.length === 0 ? (
          <div style={{ ...styles.noData, height }}>暂无数据</div>
        ) : (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      <div style={styles.legend}>
        <div
          style={{
            ...styles.legendItem,
            ...(visibleLines.avg ? {} : styles.legendItemDisabled),
          }}
          onClick={() => toggleLine('avg')}
        >
          <div style={{ ...styles.legendLine, backgroundColor: CHART_COLORS.avg }} />
          <span>平均值</span>
        </div>
        <div
          style={{
            ...styles.legendItem,
            ...(visibleLines.p50 ? {} : styles.legendItemDisabled),
          }}
          onClick={() => toggleLine('p50')}
        >
          <div style={{ ...styles.legendLine, backgroundColor: CHART_COLORS.p50 }} />
          <span>P50</span>
        </div>
        <div
          style={{
            ...styles.legendItem,
            ...(visibleLines.p95 ? {} : styles.legendItemDisabled),
          }}
          onClick={() => toggleLine('p95')}
        >
          <div style={{ ...styles.legendLine, backgroundColor: CHART_COLORS.p95 }} />
          <span>P95</span>
        </div>
        <div
          style={{
            ...styles.legendItem,
            ...(visibleLines.p99 ? {} : styles.legendItemDisabled),
          }}
          onClick={() => toggleLine('p99')}
        >
          <div style={{ ...styles.legendLine, backgroundColor: CHART_COLORS.p99 }} />
          <span>P99</span>
        </div>
      </div>

      <div style={styles.stats}>
        <div style={styles.statItem}>
          <div
            style={{
              ...styles.statValue,
              color: getPerformanceColor(latestStats.avg),
            }}
          >
            {latestStats.avg.toFixed(0)}ms
          </div>
          <div style={styles.statLabel}>当前平均</div>
        </div>
        <div style={styles.statItem}>
          <div
            style={{
              ...styles.statValue,
              color: getPerformanceColor(latestStats.p50),
            }}
          >
            {latestStats.p50.toFixed(0)}ms
          </div>
          <div style={styles.statLabel}>P50</div>
        </div>
        <div style={styles.statItem}>
          <div
            style={{
              ...styles.statValue,
              color: getPerformanceColor(latestStats.p95),
            }}
          >
            {latestStats.p95.toFixed(0)}ms
          </div>
          <div style={styles.statLabel}>P95</div>
        </div>
        <div style={styles.statItem}>
          <div
            style={{
              ...styles.statValue,
              color: getPerformanceColor(latestStats.p99),
            }}
          >
            {latestStats.p99.toFixed(0)}ms
          </div>
          <div style={styles.statLabel}>P99</div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceTrendChart;
