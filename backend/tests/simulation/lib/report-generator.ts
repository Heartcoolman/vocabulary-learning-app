/**
 * 报告生成器
 * 生成HTML格式的模拟测试报告
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SessionResult, UserState, StateHistoryItem, HabitProfile } from './user-simulator';

/**
 * 验证结果项
 */
export interface ValidationItem {
  name: string;
  description: string;
  passed: boolean;
  details?: string;
}

/**
 * 用户模拟结果
 */
export interface UserSimulationResult {
  userId: string;
  username: string;
  sessionResult: SessionResult;
  stateHistory: StateHistoryItem[];
  habitProfile: HabitProfile | null;
  validations: ValidationItem[];
}

/**
 * 模拟报告数据
 */
export interface SimulationReportData {
  title: string;
  generatedAt: Date;
  duration: number;
  summary: {
    totalUsers: number;
    totalEvents: number;
    successRate: number;
    failureCount: number;
    breakSuggestions: number;
  };
  users: UserSimulationResult[];
  validationSummary: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * 报告生成器类
 */
export class ReportGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    // 使用绝对路径，基于当前文件位置
    this.outputDir = outputDir ?? path.resolve(__dirname, '../reports');
  }

  /**
   * 生成完整HTML报告
   */
  generateHtmlReport(data: SimulationReportData): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(data.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #1a1a1a; }
    h2 { font-size: 20px; margin: 24px 0 16px; color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 16px 0 12px; color: #555; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card-title { font-size: 14px; color: #666; margin-bottom: 8px; }
    .card-value { font-size: 32px; font-weight: 600; color: #1a1a1a; }
    .card-value.success { color: #22c55e; }
    .card-value.warning { color: #f59e0b; }
    .card-value.error { color: #ef4444; }
    .chart-container { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 24px; }
    .chart-wrapper { height: 300px; position: relative; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #555; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .user-section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .validation-list { list-style: none; }
    .validation-list li { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 12px; }
    .validation-list li:last-child { border-bottom: none; }
    .validation-icon { font-size: 18px; }
    .validation-icon.pass { color: #22c55e; }
    .validation-icon.fail { color: #ef4444; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(data.title)}</h1>
    <p class="meta">
      生成时间: ${data.generatedAt.toLocaleString('zh-CN')} |
      总耗时: ${(data.duration / 1000).toFixed(2)}秒
    </p>

    <!-- 摘要卡片 -->
    <div class="grid">
      <div class="card">
        <div class="card-title">用户数量</div>
        <div class="card-value">${data.summary.totalUsers}</div>
      </div>
      <div class="card">
        <div class="card-title">总答题数</div>
        <div class="card-value">${data.summary.totalEvents}</div>
      </div>
      <div class="card">
        <div class="card-title">成功率</div>
        <div class="card-value ${data.summary.successRate >= 95 ? 'success' : data.summary.successRate >= 80 ? 'warning' : 'error'}">
          ${(data.summary.successRate).toFixed(1)}%
        </div>
      </div>
      <div class="card">
        <div class="card-title">失败数</div>
        <div class="card-value ${data.summary.failureCount === 0 ? 'success' : 'error'}">
          ${data.summary.failureCount}
        </div>
      </div>
      <div class="card">
        <div class="card-title">休息建议触发</div>
        <div class="card-value">${data.summary.breakSuggestions}</div>
      </div>
    </div>

    <!-- 验证摘要 -->
    <h2>验证结果摘要</h2>
    <div class="grid">
      <div class="card">
        <div class="card-title">总验证项</div>
        <div class="card-value">${data.validationSummary.total}</div>
      </div>
      <div class="card">
        <div class="card-title">通过</div>
        <div class="card-value success">${data.validationSummary.passed}</div>
      </div>
      <div class="card">
        <div class="card-title">失败</div>
        <div class="card-value ${data.validationSummary.failed === 0 ? 'success' : 'error'}">
          ${data.validationSummary.failed}
        </div>
      </div>
    </div>

    <!-- 状态演变图表 -->
    ${this.renderStateCharts(data.users)}

    <!-- 各用户详情 -->
    <h2>用户详情</h2>
    ${data.users.map((user, index) => this.renderUserSection(user, index)).join('')}

    <div class="footer">
      AMAS 模拟学习测试报告 | 自动生成
    </div>
  </div>

  <script>
    ${this.generateChartScript(data.users)}
  </script>
</body>
</html>`;
  }

  /**
   * 渲染状态演变图表区域
   */
  private renderStateCharts(users: UserSimulationResult[]): string {
    if (users.length === 0) return '';

    // 取第一个用户的状态历史作为示例图表
    const user = users[0];
    if (!user.stateHistory || user.stateHistory.length === 0) {
      return '<div class="chart-container"><p>暂无状态历史数据</p></div>';
    }

    return `
    <h2>状态演变图表</h2>
    <div class="chart-container">
      <h3>用户 ${this.escapeHtml(user.username)} 的状态变化</h3>
      <div class="chart-wrapper">
        <canvas id="stateChart"></canvas>
      </div>
    </div>
    `;
  }

  /**
   * 渲染单个用户详情
   */
  private renderUserSection(user: UserSimulationResult, index: number): string {
    const result = user.sessionResult;
    const successRate = result.totalEvents > 0
      ? (result.successCount / result.totalEvents * 100).toFixed(1)
      : '0.0';

    return `
    <div class="user-section">
      <h3>用户 #${index + 1}: ${this.escapeHtml(user.username)}</h3>

      <div class="grid" style="margin: 16px 0;">
        <div class="card">
          <div class="card-title">答题数</div>
          <div class="card-value" style="font-size: 24px;">${result.totalEvents}</div>
        </div>
        <div class="card">
          <div class="card-title">成功/失败</div>
          <div class="card-value" style="font-size: 24px;">${result.successCount}/${result.failureCount}</div>
        </div>
        <div class="card">
          <div class="card-title">成功率</div>
          <div class="card-value" style="font-size: 24px;">${successRate}%</div>
        </div>
        <div class="card">
          <div class="card-title">耗时</div>
          <div class="card-value" style="font-size: 24px;">${(result.durationMs / 1000).toFixed(2)}s</div>
        </div>
      </div>

      ${result.shouldBreakSuggested ? `
        <p><span class="badge badge-warning">休息建议</span> 在第 ${result.breakSuggestedAt} 个事件时触发</p>
      ` : ''}

      ${result.finalState ? this.renderFinalState(result.finalState) : ''}

      <h4 style="margin-top: 16px;">验证结果</h4>
      <ul class="validation-list">
        ${user.validations.map(v => `
          <li>
            <span class="validation-icon ${v.passed ? 'pass' : 'fail'}">${v.passed ? '✓' : '✗'}</span>
            <span><strong>${this.escapeHtml(v.name)}</strong>: ${this.escapeHtml(v.description)}</span>
            ${v.details ? `<span style="color: #666; font-size: 12px;">(${this.escapeHtml(v.details)})</span>` : ''}
          </li>
        `).join('')}
      </ul>

      ${result.failures.length > 0 ? this.renderFailures(result.failures) : ''}
    </div>
    `;
  }

  /**
   * 渲染最终状态
   */
  private renderFinalState(state: UserState): string {
    return `
    <h4 style="margin-top: 16px;">最终AMAS状态</h4>
    <table>
      <thead>
        <tr>
          <th>指标</th>
          <th>值</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>注意力 (Attention)</td>
          <td>${state.attention?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.attention, 'attention')}</td>
        </tr>
        <tr>
          <td>疲劳度 (Fatigue)</td>
          <td>${state.fatigue?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.fatigue, 'fatigue')}</td>
        </tr>
        <tr>
          <td>动机 (Motivation)</td>
          <td>${state.motivation?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.motivation, 'motivation')}</td>
        </tr>
        <tr>
          <td>记忆力 (Memory)</td>
          <td>${state.memory?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.memory, 'cognitive')}</td>
        </tr>
        <tr>
          <td>速度 (Speed)</td>
          <td>${state.speed?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.speed, 'cognitive')}</td>
        </tr>
        <tr>
          <td>稳定性 (Stability)</td>
          <td>${state.stability?.toFixed(3) ?? 'N/A'}</td>
          <td>${this.getStateBadge(state.stability, 'cognitive')}</td>
        </tr>
      </tbody>
    </table>
    `;
  }

  /**
   * 获取状态徽章
   */
  private getStateBadge(value: number | undefined, type: string): string {
    if (value === undefined || value === null) {
      return '<span class="badge badge-warning">未知</span>';
    }

    // 对于疲劳度，低值是好的
    if (type === 'fatigue') {
      if (value < 0.3) return '<span class="badge badge-success">良好</span>';
      if (value < 0.6) return '<span class="badge badge-warning">中等</span>';
      return '<span class="badge badge-error">需休息</span>';
    }

    // 对于其他指标，高值是好的
    if (value >= 0.7) return '<span class="badge badge-success">良好</span>';
    if (value >= 0.4) return '<span class="badge badge-warning">中等</span>';
    return '<span class="badge badge-error">较低</span>';
  }

  /**
   * 渲染失败详情
   */
  private renderFailures(failures: SessionResult['failures']): string {
    return `
    <h4 style="margin-top: 16px; color: #991b1b;">失败详情</h4>
    <table>
      <thead>
        <tr>
          <th>序号</th>
          <th>单词ID</th>
          <th>错误信息</th>
        </tr>
      </thead>
      <tbody>
        ${failures.slice(0, 10).map(f => `
          <tr>
            <td>${f.index}</td>
            <td>${this.escapeHtml(f.event.wordId)}</td>
            <td>${this.escapeHtml(f.error)}</td>
          </tr>
        `).join('')}
        ${failures.length > 10 ? `<tr><td colspan="3">... 还有 ${failures.length - 10} 个失败</td></tr>` : ''}
      </tbody>
    </table>
    `;
  }

  /**
   * 生成图表JavaScript
   */
  private generateChartScript(users: UserSimulationResult[]): string {
    if (users.length === 0 || !users[0].stateHistory || users[0].stateHistory.length === 0) {
      return '';
    }

    const history = users[0].stateHistory;
    const labels = history.map(h => h.date);
    const attention = history.map(h => h.attention);
    const fatigue = history.map(h => h.fatigue);
    const motivation = history.map(h => h.motivation);

    return `
    document.addEventListener('DOMContentLoaded', function() {
      const ctx = document.getElementById('stateChart');
      if (!ctx) return;

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [
            {
              label: '注意力',
              data: ${JSON.stringify(attention)},
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.3,
              fill: false
            },
            {
              label: '疲劳度',
              data: ${JSON.stringify(fatigue)},
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: false
            },
            {
              label: '动机',
              data: ${JSON.stringify(motivation)},
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              tension: 0.3,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top'
            },
            title: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 1,
              title: {
                display: true,
                text: '值'
              }
            },
            x: {
              title: {
                display: true,
                text: '日期'
              }
            }
          }
        }
      });
    });
    `;
  }

  /**
   * 保存HTML报告
   */
  saveHtmlReport(data: SimulationReportData, filename?: string): string {
    const html = this.generateHtmlReport(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = filename || `simulation-report-${timestamp}.html`;
    const filePath = path.join(this.outputDir, file);

    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');

    return filePath;
  }

  /**
   * 保存JSON数据备份
   */
  saveJsonData(data: SimulationReportData, filename?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = filename || `simulation-data-${timestamp}.json`;
    const filePath = path.join(this.outputDir, file);

    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    return filePath;
  }

  /**
   * HTML转义
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * 创建验证项
 */
export function createValidation(
  name: string,
  description: string,
  condition: boolean,
  details?: string
): ValidationItem {
  return {
    name,
    description,
    passed: condition,
    details,
  };
}
