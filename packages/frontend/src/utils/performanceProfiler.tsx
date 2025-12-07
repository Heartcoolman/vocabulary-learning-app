import React, { Profiler, ProfilerOnRenderCallback } from 'react';

export interface PerformanceMetrics {
  componentName: string;
  phase: 'mount' | 'update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  renderCount: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private renderCounts: Map<string, number> = new Map();

  onRender: ProfilerOnRenderCallback = (
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const currentCount = this.renderCounts.get(id) || 0;
    this.renderCounts.set(id, currentCount + 1);

    const metric: PerformanceMetrics = {
      componentName: id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
      renderCount: currentCount + 1,
    };

    const componentMetrics = this.metrics.get(id) || [];
    componentMetrics.push(metric);
    this.metrics.set(id, componentMetrics);

    // Log slow renders (> 16ms for 60fps)
    if (actualDuration > 16) {
      console.warn(
        `[Performance] Slow render detected in ${id}:`,
        `${actualDuration.toFixed(2)}ms (phase: ${phase})`,
      );
    }
  };

  getMetrics(componentName?: string): PerformanceMetrics[] {
    if (componentName) {
      return this.metrics.get(componentName) || [];
    }
    return Array.from(this.metrics.values()).flat();
  }

  getStats(componentName: string): {
    totalRenders: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    mountCount: number;
    updateCount: number;
  } | null {
    const metrics = this.metrics.get(componentName);
    if (!metrics || metrics.length === 0) return null;

    const durations = metrics.map((m) => m.actualDuration);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      totalRenders: metrics.length,
      avgDuration: sum / metrics.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      mountCount: metrics.filter((m) => m.phase === 'mount').length,
      updateCount: metrics.filter((m) => m.phase === 'update').length,
    };
  }

  getAllStats(): Map<
    string,
    {
      totalRenders: number;
      avgDuration: number;
      maxDuration: number;
      minDuration: number;
      mountCount: number;
      updateCount: number;
    }
  > {
    const allStats = new Map();
    for (const [name] of this.metrics) {
      const stats = this.getStats(name);
      if (stats) {
        allStats.set(name, stats);
      }
    }
    return allStats;
  }

  clear(): void {
    this.metrics.clear();
    this.renderCounts.clear();
  }

  generateReport(): string {
    let report = '\n=== React Component Performance Report ===\n\n';

    const allStats = this.getAllStats();
    const sortedStats = Array.from(allStats.entries()).sort(
      (a, b) => b[1].totalRenders - a[1].totalRenders,
    );

    for (const [name, stats] of sortedStats) {
      report += `📊 ${name}\n`;
      report += `  Total Renders: ${stats.totalRenders} (${stats.mountCount} mounts, ${stats.updateCount} updates)\n`;
      report += `  Avg Duration: ${stats.avgDuration.toFixed(2)}ms\n`;
      report += `  Min/Max: ${stats.minDuration.toFixed(2)}ms / ${stats.maxDuration.toFixed(2)}ms\n`;

      // Performance assessment
      if (stats.avgDuration > 16) {
        report += `  ⚠️  Warning: Average render time exceeds 16ms (60fps threshold)\n`;
      }
      if (stats.updateCount > 10 && stats.avgDuration > 5) {
        report += `  ⚠️  Warning: High update count with significant render time\n`;
      }

      report += '\n';
    }

    return report;
  }

  logReport(): void {
    console.log(this.generateReport());
  }
}

export const performanceMonitor = new PerformanceMonitor();

interface PerformanceProfilerProps {
  id: string;
  children: React.ReactNode;
}

/**
 * PerformanceProfiler - Wrapper component for React Profiler
 * Usage:
 * <PerformanceProfiler id="MyComponent">
 *   <MyComponent />
 * </PerformanceProfiler>
 */
export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({ id, children }) => {
  return (
    <Profiler id={id} onRender={performanceMonitor.onRender}>
      {children}
    </Profiler>
  );
};

/**
 * HOC to wrap a component with performance profiler
 */
export function withPerformanceProfiler<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string,
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <PerformanceProfiler id={componentName}>
      <Component {...props} />
    </PerformanceProfiler>
  );

  WrappedComponent.displayName = `withPerformanceProfiler(${componentName})`;

  return WrappedComponent;
}
