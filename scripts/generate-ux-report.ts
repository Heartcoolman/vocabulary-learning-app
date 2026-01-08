/**
 * 用户体验测试报告生成器
 *
 * 该脚本分析 Playwright 测试结果，生成详细的用户体验报告
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  scenario: string;
  round: number;
  metrics: {
    fcp?: number;
    lcp?: number;
    tti?: number;
    cls?: number;
    loadTime?: number;
    memoryUsage?: number;
    cacheHitRate?: number;
    errorRate?: number;
  };
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
}

interface ScenarioSummary {
  scenario: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageMetrics: any;
  recommendations: string[];
}

interface Report {
  timestamp: string;
  duration: number;
  scenarios: ScenarioSummary[];
  overallScore: number;
  criticalIssues: string[];
  recommendations: string[];
}

/**
 * 解析 Playwright JSON 报告
 */
function parsePlaywrightReport(reportPath: string): TestResult[] {
  const results: TestResult[] = [];

  if (!fs.existsSync(reportPath)) {
    console.error('测试报告文件不存在:', reportPath);
    return results;
  }

  try {
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

    // 解析测试套件
    if (reportData.suites) {
      reportData.suites.forEach((suite: any) => {
        suite.specs.forEach((spec: any) => {
          spec.tests.forEach((test: any) => {
            const result: TestResult = {
              scenario: suite.title,
              round: 1, // 从测试标题中提取轮次
              metrics: {},
              status: test.results[0]?.status || 'skipped',
              duration: test.results[0]?.duration || 0,
            };

            // 从测试输出中提取性能指标
            const stdout = test.results[0]?.stdout || '';
            result.metrics = extractMetricsFromOutput(stdout);

            results.push(result);
          });
        });
      });
    }
  } catch (error) {
    console.error('解析测试报告失败:', error);
  }

  return results;
}

/**
 * 从测试输出中提取性能指标
 */
function extractMetricsFromOutput(output: string): any {
  const metrics: any = {};

  // FCP
  const fcpMatch = output.match(/fcp[:\s]+(\d+)/i);
  if (fcpMatch) metrics.fcp = parseInt(fcpMatch[1]);

  // LCP
  const lcpMatch = output.match(/lcp[:\s]+(\d+)/i);
  if (lcpMatch) metrics.lcp = parseInt(lcpMatch[1]);

  // TTI
  const ttiMatch = output.match(/tti[:\s]+(\d+)/i);
  if (ttiMatch) metrics.tti = parseInt(ttiMatch[1]);

  // Load Time
  const loadTimeMatch = output.match(/loadTime[:\s]+(\d+)/i);
  if (loadTimeMatch) metrics.loadTime = parseInt(loadTimeMatch[1]);

  // Memory Usage
  const memoryMatch = output.match(/usedJSHeapSize[:\s]+(\d+)/i);
  if (memoryMatch) metrics.memoryUsage = parseInt(memoryMatch[1]);

  // Cache Hit Rate
  const cacheMatch = output.match(/cached[:\s]+(\d+)/i);
  if (cacheMatch) metrics.cacheHitRate = parseInt(cacheMatch[1]);

  return metrics;
}

/**
 * 计算场景汇总
 */
function calculateScenarioSummary(results: TestResult[]): ScenarioSummary[] {
  const scenarioMap = new Map<string, TestResult[]>();

  // 按场景分组
  results.forEach((result) => {
    if (!scenarioMap.has(result.scenario)) {
      scenarioMap.set(result.scenario, []);
    }
    scenarioMap.get(result.scenario)!.push(result);
  });

  // 计算每个场景的汇总
  const summaries: ScenarioSummary[] = [];

  scenarioMap.forEach((tests, scenario) => {
    const passedTests = tests.filter((t) => t.status === 'passed').length;
    const failedTests = tests.filter((t) => t.status === 'failed').length;

    // 计算平均指标
    const averageMetrics: any = {};
    const metricKeys = ['fcp', 'lcp', 'tti', 'loadTime', 'memoryUsage'];

    metricKeys.forEach((key) => {
      const values = tests.map((t) => t.metrics[key]).filter((v) => v !== undefined);

      if (values.length > 0) {
        averageMetrics[key] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      }
    });

    // 生成建议
    const recommendations = generateRecommendations(scenario, averageMetrics, tests);

    summaries.push({
      scenario,
      totalTests: tests.length,
      passedTests,
      failedTests,
      averageMetrics,
      recommendations,
    });
  });

  return summaries;
}

/**
 * 生成性能建议
 */
function generateRecommendations(scenario: string, metrics: any, tests: TestResult[]): string[] {
  const recommendations: string[] = [];

  // 场景1: 新用户首次访问
  if (scenario.includes('场景1') || scenario.includes('新用户')) {
    if (metrics.fcp > 2000) {
      recommendations.push('FCP 偏高，建议优化关键渲染路径');
    }
    if (metrics.lcp > 4000) {
      recommendations.push('LCP 偏高，建议优化最大内容元素加载');
    }
    if (metrics.loadTime > 5000) {
      recommendations.push('总加载时间过长，建议压缩资源、启用 CDN');
    }
  }

  // 场景2: 老用户重复访问
  if (scenario.includes('场景2') || scenario.includes('重复访问')) {
    if (metrics.cacheHitRate < 0.5) {
      recommendations.push('缓存命中率偏低，建议优化缓存策略');
    }
    if (metrics.loadTime > 3000) {
      recommendations.push('重复访问加载时间仍然较长，检查缓存配置');
    }
  }

  // 场景3: 快速连续操作
  if (scenario.includes('场景3') || scenario.includes('快速操作')) {
    const errorRate = tests.filter((t) => t.status === 'failed').length / tests.length;
    if (errorRate > 0.1) {
      recommendations.push('错误率较高，建议增强防抖和节流机制');
    }
  }

  // 场景4: 弱网络环境
  if (scenario.includes('场景4') || scenario.includes('弱网络')) {
    if (metrics.loadTime > 10000) {
      recommendations.push('弱网络下加载时间过长，建议实现渐进式加载');
    }
    recommendations.push('考虑添加骨架屏或加载指示器');
  }

  // 场景5: 长时间使用
  if (scenario.includes('场景5') || scenario.includes('长时间')) {
    if (metrics.memoryUsage) {
      const initialMemory = tests[0]?.metrics?.memoryUsage || 0;
      const finalMemory = tests[tests.length - 1]?.metrics?.memoryUsage || 0;
      const growthRate = (finalMemory - initialMemory) / initialMemory;

      if (growthRate > 0.5) {
        recommendations.push('内存增长较快，检查是否存在内存泄漏');
      }
    }
  }

  // 场景6: 跨浏览器
  if (scenario.includes('场景6') || scenario.includes('跨浏览器')) {
    if (tests.some((t) => t.status === 'failed')) {
      recommendations.push('存在浏览器兼容性问题，检查 CSS 和 JavaScript 兼容性');
    }
  }

  // 场景7: 边缘场景
  if (scenario.includes('场景7') || scenario.includes('边缘')) {
    if (tests.some((t) => t.status === 'failed')) {
      recommendations.push('边缘场景处理不完善，增强输入验证和错误处理');
    }
  }

  return recommendations;
}

/**
 * 计算总体评分
 */
function calculateOverallScore(summaries: ScenarioSummary[]): number {
  let totalScore = 100;

  summaries.forEach((summary) => {
    const passRate = summary.passedTests / summary.totalTests;

    // 测试通过率影响分数
    if (passRate < 1.0) {
      totalScore -= (1 - passRate) * 10;
    }

    // 性能指标影响分数
    const metrics = summary.averageMetrics;

    if (metrics.fcp && metrics.fcp > 2000) {
      totalScore -= Math.min(5, (metrics.fcp - 2000) / 1000);
    }

    if (metrics.lcp && metrics.lcp > 4000) {
      totalScore -= Math.min(5, (metrics.lcp - 4000) / 1000);
    }

    if (metrics.loadTime && metrics.loadTime > 5000) {
      totalScore -= Math.min(5, (metrics.loadTime - 5000) / 1000);
    }
  });

  return Math.max(0, Math.round(totalScore));
}

/**
 * 识别关键问题
 */
function identifyCriticalIssues(summaries: ScenarioSummary[]): string[] {
  const issues: string[] = [];

  summaries.forEach((summary) => {
    // 测试失败率高
    const failRate = summary.failedTests / summary.totalTests;
    if (failRate > 0.2) {
      issues.push(`${summary.scenario}: 测试失败率高达 ${Math.round(failRate * 100)}%`);
    }

    // 性能指标超标
    const metrics = summary.averageMetrics;

    if (metrics.fcp && metrics.fcp > 3000) {
      issues.push(`${summary.scenario}: FCP 严重超标 (${metrics.fcp}ms > 3000ms)`);
    }

    if (metrics.lcp && metrics.lcp > 5000) {
      issues.push(`${summary.scenario}: LCP 严重超标 (${metrics.lcp}ms > 5000ms)`);
    }

    if (metrics.loadTime && metrics.loadTime > 8000) {
      issues.push(`${summary.scenario}: 加载时间过长 (${metrics.loadTime}ms > 8000ms)`);
    }
  });

  return issues;
}

/**
 * 生成综合报告
 */
function generateReport(results: TestResult[]): Report {
  const scenarios = calculateScenarioSummary(results);
  const overallScore = calculateOverallScore(scenarios);
  const criticalIssues = identifyCriticalIssues(scenarios);

  // 生成总体建议
  const recommendations: string[] = [];

  if (overallScore < 60) {
    recommendations.push('整体性能需要显著提升，建议进行全面优化');
  } else if (overallScore < 80) {
    recommendations.push('性能表现良好，但仍有优化空间');
  } else {
    recommendations.push('性能表现优秀，继续保持');
  }

  // 汇总各场景的建议
  scenarios.forEach((scenario) => {
    scenario.recommendations.forEach((rec) => {
      if (!recommendations.includes(rec)) {
        recommendations.push(rec);
      }
    });
  });

  return {
    timestamp: new Date().toISOString(),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
    scenarios,
    overallScore,
    criticalIssues,
    recommendations,
  };
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report: Report): string {
  const lines: string[] = [];

  lines.push('# 用户体验测试报告\n');
  lines.push(`**生成时间**: ${new Date(report.timestamp).toLocaleString('zh-CN')}\n`);
  lines.push(`**测试耗时**: ${Math.round(report.duration / 1000)}秒\n`);
  lines.push(`**综合评分**: ${report.overallScore}/100\n`);

  // 评分等级
  let grade = 'A';
  if (report.overallScore < 60) grade = 'D';
  else if (report.overallScore < 70) grade = 'C';
  else if (report.overallScore < 80) grade = 'B';

  lines.push(`**评级**: ${grade}\n`);
  lines.push('\n---\n');

  // 关键问题
  if (report.criticalIssues.length > 0) {
    lines.push('## ⚠️ 关键问题\n');
    report.criticalIssues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push('\n');
  }

  // 场景详情
  lines.push('## 📊 测试场景详情\n');

  report.scenarios.forEach((scenario, index) => {
    lines.push(`### ${index + 1}. ${scenario.scenario}\n`);
    lines.push(`- **总测试数**: ${scenario.totalTests}`);
    lines.push(`- **通过**: ${scenario.passedTests} ✓`);
    lines.push(`- **失败**: ${scenario.failedTests} ✗`);
    lines.push(
      `- **通过率**: ${Math.round((scenario.passedTests / scenario.totalTests) * 100)}%\n`,
    );

    // 性能指标
    if (Object.keys(scenario.averageMetrics).length > 0) {
      lines.push('**平均性能指标**:');
      if (scenario.averageMetrics.fcp) {
        lines.push(`- FCP: ${scenario.averageMetrics.fcp}ms`);
      }
      if (scenario.averageMetrics.lcp) {
        lines.push(`- LCP: ${scenario.averageMetrics.lcp}ms`);
      }
      if (scenario.averageMetrics.tti) {
        lines.push(`- TTI: ${scenario.averageMetrics.tti}ms`);
      }
      if (scenario.averageMetrics.loadTime) {
        lines.push(`- 总加载时间: ${scenario.averageMetrics.loadTime}ms`);
      }
      if (scenario.averageMetrics.memoryUsage) {
        lines.push(
          `- 内存使用: ${Math.round(scenario.averageMetrics.memoryUsage / 1024 / 1024)}MB`,
        );
      }
      lines.push('');
    }

    // 建议
    if (scenario.recommendations.length > 0) {
      lines.push('**优化建议**:');
      scenario.recommendations.forEach((rec) => {
        lines.push(`- ${rec}`);
      });
      lines.push('');
    }

    lines.push('');
  });

  // 综合建议
  lines.push('## 💡 综合建议\n');
  report.recommendations.forEach((rec) => {
    lines.push(`- ${rec}`);
  });
  lines.push('\n');

  // 性能基准
  lines.push('## 📏 性能基准参考\n');
  lines.push('| 指标 | 优秀 | 良好 | 需要改进 |');
  lines.push('|------|------|------|----------|');
  lines.push('| FCP | < 1.8s | < 3s | > 3s |');
  lines.push('| LCP | < 2.5s | < 4s | > 4s |');
  lines.push('| TTI | < 3.8s | < 7.3s | > 7.3s |');
  lines.push('| 总加载时间 | < 3s | < 5s | > 5s |');
  lines.push('| 缓存命中率 | > 70% | > 50% | < 50% |');
  lines.push('\n');

  return lines.join('\n');
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const reportPath = args[0] || path.join(process.cwd(), 'test-results', 'results.json');
  const outputPath = args[1] || path.join(process.cwd(), 'reports', 'user-experience-report.md');

  console.log('正在生成用户体验测试报告...');
  console.log('输入文件:', reportPath);
  console.log('输出文件:', outputPath);

  // 解析测试结果
  const results = parsePlaywrightReport(reportPath);

  if (results.length === 0) {
    console.warn('警告: 未找到测试结果');
    return;
  }

  // 生成报告
  const report = generateReport(results);

  // 生成 Markdown
  const markdown = generateMarkdownReport(report);

  // 写入文件
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, markdown, 'utf-8');

  // 同时输出 JSON
  const jsonPath = outputPath.replace('.md', '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n✓ 报告生成完成!');
  console.log(`  - Markdown: ${outputPath}`);
  console.log(`  - JSON: ${jsonPath}`);
  console.log(
    `\n综合评分: ${report.overallScore}/100 (${report.overallScore >= 80 ? 'A' : report.overallScore >= 70 ? 'B' : report.overallScore >= 60 ? 'C' : 'D'})`,
  );
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

export { generateReport, generateMarkdownReport, parsePlaywrightReport };
