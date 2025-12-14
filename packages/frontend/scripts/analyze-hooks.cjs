#!/usr/bin/env node

/**
 * React Hook 复杂度分析工具
 * 用于自动检测 Hook 的状态管理问题
 *
 * 使用方法:
 *   node scripts/analyze-hooks.js <hook-file-path>
 *
 * 示例:
 *   node scripts/analyze-hooks.js src/hooks/useMasteryLearning.ts
 */

const fs = require('fs');
const path = require('path');

// 配置阈值
const THRESHOLDS = {
  useState: 5,
  useRef: 5,
  useCallback: 5,
  useEffect: 5,
  codeLines: 200,
  cyclomaticComplexity: 15,
};

class HookAnalyzer {
  constructor(filePath) {
    this.filePath = filePath;
    this.content = '';
    this.results = {
      fileName: path.basename(filePath),
      metrics: {},
      issues: [],
      score: 100,
    };
  }

  analyze() {
    try {
      this.content = fs.readFileSync(this.filePath, 'utf-8');

      this.countHooks();
      this.countLines();
      this.detectCircularDependencies();
      this.detectUnnecessaryRefs();
      this.calculateScore();

      return this.results;
    } catch (error) {
      console.error(`Error analyzing file: ${error.message}`);
      process.exit(1);
    }
  }

  countHooks() {
    const hooks = ['useState', 'useRef', 'useCallback', 'useEffect', 'useMemo', 'useReducer'];

    hooks.forEach((hook) => {
      const regex = new RegExp(`\\b${hook}\\b`, 'g');
      const matches = this.content.match(regex) || [];
      const count = matches.length;

      this.results.metrics[hook] = count;

      const threshold = THRESHOLDS[hook];
      if (threshold && count > threshold) {
        this.results.issues.push({
          severity: 'warning',
          type: hook,
          message: `Too many ${hook} (${count} > ${threshold})`,
          suggestion: this.getSuggestion(hook, count),
        });
        this.results.score -= 10;
      }
    });
  }

  countLines() {
    const lines = this.content.split('\n');
    const codeLines = lines.filter(
      (line) => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('*'),
    ).length;

    this.results.metrics.codeLines = codeLines;

    if (codeLines > THRESHOLDS.codeLines) {
      this.results.issues.push({
        severity: 'warning',
        type: 'codeLines',
        message: `Too many lines of code (${codeLines} > ${THRESHOLDS.codeLines})`,
        suggestion: 'Consider splitting into multiple hooks',
      });
      this.results.score -= 10;
    }
  }

  detectCircularDependencies() {
    // 检测 ref.current = value 模式（避免依赖循环的常见模式）
    const refAssignmentPattern = /(\w+Ref)\.current\s*=\s*(\w+)/g;
    const matches = [...this.content.matchAll(refAssignmentPattern)];

    if (matches.length > 3) {
      this.results.issues.push({
        severity: 'error',
        type: 'circularDependency',
        message: `Detected ${matches.length} ref assignments (possible circular dependency workaround)`,
        suggestion: 'Use useReducer to eliminate circular dependencies',
        details: matches.map((m) => `${m[1]}.current = ${m[2]}`),
      });
      this.results.score -= 20;
    }
  }

  detectUnnecessaryRefs() {
    // 检测 useState + useRef 同时使用相同变量名的情况
    const stateVars = new Set();
    const stateMatches = this.content.matchAll(/const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/g);
    for (const match of stateMatches) {
      stateVars.add(match[1]);
    }

    const refVars = new Set();
    const refMatches = this.content.matchAll(/const\s+(\w+Ref)\s*=\s*useRef/g);
    for (const match of refMatches) {
      const varName = match[1].replace('Ref', '');
      if (stateVars.has(varName)) {
        this.results.issues.push({
          severity: 'warning',
          type: 'redundantRef',
          message: `Both state and ref exist for '${varName}'`,
          suggestion: 'Consider if the ref is really necessary',
        });
        this.results.score -= 5;
      }
      refVars.add(match[1]);
    }

    // 检测 useCallback 依赖不完整的情况（通过注释判断）
    const disabledDepsPattern = /eslint-disable.*exhaustive-deps/g;
    const disabledDeps = this.content.match(disabledDepsPattern);
    if (disabledDeps && disabledDeps.length > 0) {
      this.results.issues.push({
        severity: 'error',
        type: 'disabledDependencies',
        message: `Found ${disabledDeps.length} disabled exhaustive-deps warnings`,
        suggestion: 'Fix the root cause instead of disabling the warning',
      });
      this.results.score -= 15;
    }
  }

  calculateScore() {
    // 确保分数在 0-100 之间
    this.results.score = Math.max(0, Math.min(100, this.results.score));

    // 添加评级
    if (this.results.score >= 90) {
      this.results.grade = 'A (Excellent)';
    } else if (this.results.score >= 80) {
      this.results.grade = 'B (Good)';
    } else if (this.results.score >= 70) {
      this.results.grade = 'C (Fair)';
    } else if (this.results.score >= 60) {
      this.results.grade = 'D (Poor)';
    } else {
      this.results.grade = 'F (Needs Refactoring)';
    }
  }

  getSuggestion(hook, count) {
    switch (hook) {
      case 'useState':
        return 'Consider using useReducer to consolidate related states';
      case 'useRef':
        return 'Check if all refs are necessary. Consider using useReducer.';
      case 'useCallback':
        return 'Consider if all callbacks need to be memoized';
      case 'useEffect':
        return 'Consider splitting effects into multiple smaller effects';
      default:
        return 'Consider refactoring for better maintainability';
    }
  }

  printReport() {
    console.log('\n========================================');
    console.log('React Hook Complexity Analysis');
    console.log('========================================\n');

    console.log(`File: ${this.results.fileName}`);
    console.log(`Score: ${this.results.score}/100 (${this.results.grade})`);
    console.log('\n--- Metrics ---');

    Object.entries(this.results.metrics).forEach(([key, value]) => {
      const threshold = THRESHOLDS[key];
      const status = threshold && value > threshold ? '❌' : '✅';
      const thresholdStr = threshold ? ` (threshold: ${threshold})` : '';
      console.log(`  ${status} ${key}: ${value}${thresholdStr}`);
    });

    if (this.results.issues.length > 0) {
      console.log('\n--- Issues ---');
      this.results.issues.forEach((issue, index) => {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`\n${index + 1}. ${icon} ${issue.message}`);
        console.log(`   Type: ${issue.type}`);
        console.log(`   Suggestion: ${issue.suggestion}`);
        if (issue.details) {
          console.log(`   Details:`);
          issue.details.forEach((detail) => console.log(`     - ${detail}`));
        }
      });
    } else {
      console.log('\n✅ No issues found!');
    }

    console.log('\n--- Recommendations ---');
    if (this.results.score < 70) {
      console.log('  🔴 This hook needs refactoring!');
      console.log('  📖 Read: docs/STATE_MANAGEMENT_OPTIMIZATION.md');
    } else if (this.results.score < 90) {
      console.log('  🟡 Consider improvements for better maintainability');
    } else {
      console.log('  🟢 This hook looks healthy!');
    }

    console.log('\n========================================\n');
  }
}

// CLI 执行
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node analyze-hooks.js <hook-file-path>');
    console.error('Example: node analyze-hooks.js src/hooks/useMasteryLearning.ts');
    process.exit(1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const analyzer = new HookAnalyzer(filePath);
  analyzer.analyze();
  analyzer.printReport();

  // 如果分数低于 70，退出码为 1（用于 CI）
  if (analyzer.results.score < 70) {
    process.exit(1);
  }
}

module.exports = HookAnalyzer;
