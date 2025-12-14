#!/usr/bin/env tsx
/**
 * 代码复杂度分析工具
 * 分析圈复杂度、认知复杂度、函数长度等指标
 */

import * as fs from 'fs';
import * as path from 'path';

interface ComplexityResult {
  file: string;
  functionName: string;
  lineNumber: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  nestedDepth: number;
  parameterCount: number;
}

interface FileAnalysis {
  file: string;
  totalLines: number;
  functions: ComplexityResult[];
  avgComplexity: number;
  maxComplexity: number;
  classCount: number;
  importCount: number;
}

/**
 * 计算圈复杂度
 * 基于决策点数量: if, while, for, case, &&, ||, ?, catch
 */
function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // 基础复杂度

  // 控制流语句
  complexity += (code.match(/\bif\b/g) || []).length;
  complexity += (code.match(/\belse if\b/g) || []).length;
  complexity += (code.match(/\bwhile\b/g) || []).length;
  complexity += (code.match(/\bfor\b/g) || []).length;
  complexity += (code.match(/\bcase\b/g) || []).length;
  complexity += (code.match(/\bcatch\b/g) || []).length;

  // 逻辑运算符 (但要排除注释中的)
  const codeWithoutComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  complexity += (codeWithoutComments.match(/&&/g) || []).length;
  complexity += (codeWithoutComments.match(/\|\|/g) || []).length;
  complexity += (codeWithoutComments.match(/\?/g) || []).length;

  return complexity;
}

/**
 * 计算认知复杂度
 * 考虑嵌套层次和逻辑流的复杂性
 */
function calculateCognitiveComplexity(code: string): number {
  let complexity = 0;
  let nestingLevel = 0;
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // 增加嵌套层次
    if (trimmed.match(/\{/)) {
      if (trimmed.match(/\b(if|else|while|for|switch|try|catch|finally)\b/)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
    }

    // 减少嵌套层次
    if (trimmed.match(/\}/)) {
      nestingLevel = Math.max(0, nestingLevel - 1);
    }

    // 逻辑运算符增加复杂度
    const logicalOps = (trimmed.match(/&&|\|\|/g) || []).length;
    complexity += logicalOps;

    // 递归调用增加复杂度
    if (trimmed.match(/\breturn\s+\w+\s*\(/)) {
      complexity += 1;
    }
  }

  return complexity;
}

/**
 * 计算最大嵌套深度
 */
function calculateNestedDepth(code: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    currentDepth += (trimmed.match(/\{/g) || []).length;
    maxDepth = Math.max(maxDepth, currentDepth);
    currentDepth -= (trimmed.match(/\}/g) || []).length;
  }

  return maxDepth;
}

/**
 * 提取函数/方法
 */
function extractFunctions(code: string, filePath: string): ComplexityResult[] {
  const results: ComplexityResult[] = [];
  const lines = code.split('\n');

  // 匹配函数定义的正则
  const functionRegex = /(?:async\s+)?(?:function\s+(\w+)|(?:private|public|protected)?\s*(?:async\s+)?(\w+)\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?\()/g;

  let match;
  while ((match = functionRegex.exec(code)) !== null) {
    const functionName = match[1] || match[2] || match[3];
    if (!functionName) continue;

    // 找到函数起始行号
    const beforeMatch = code.substring(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;

    // 提取函数体
    const startIndex = match.index;
    let braceCount = 0;
    let inFunction = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < code.length; i++) {
      if (code[i] === '{') {
        braceCount++;
        inFunction = true;
      }
      if (code[i] === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    const functionCode = code.substring(startIndex, endIndex);
    const functionLines = functionCode.split('\n').length;

    // 计算参数数量
    const paramMatch = functionCode.match(/\(([^)]*)\)/);
    const params = paramMatch ? paramMatch[1].split(',').filter(p => p.trim()).length : 0;

    results.push({
      file: filePath,
      functionName,
      lineNumber,
      cyclomaticComplexity: calculateCyclomaticComplexity(functionCode),
      cognitiveComplexity: calculateCognitiveComplexity(functionCode),
      linesOfCode: functionLines,
      nestedDepth: calculateNestedDepth(functionCode),
      parameterCount: params,
    });
  }

  return results;
}

/**
 * 分析单个文件
 */
function analyzeFile(filePath: string): FileAnalysis | null {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const lines = code.split('\n');
    const functions = extractFunctions(code, filePath);

    const complexities = functions.map(f => f.cyclomaticComplexity);
    const avgComplexity = complexities.length > 0
      ? complexities.reduce((a, b) => a + b, 0) / complexities.length
      : 0;
    const maxComplexity = complexities.length > 0 ? Math.max(...complexities) : 0;

    return {
      file: filePath,
      totalLines: lines.length,
      functions,
      avgComplexity,
      maxComplexity,
      classCount: (code.match(/\bclass\s+\w+/g) || []).length,
      importCount: (code.match(/\bimport\s+/g) || []).length,
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
    return null;
  }
}

/**
 * 递归查找所有 TypeScript 文件
 */
function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * 主分析函数
 */
function analyze(targetDir: string) {
  console.log('🔍 开始代码复杂度分析...\n');

  const files = findTypeScriptFiles(targetDir);
  console.log(`📁 找到 ${files.length} 个 TypeScript 文件\n`);

  const analyses: FileAnalysis[] = [];
  const highComplexityFunctions: ComplexityResult[] = [];
  const longFunctions: ComplexityResult[] = [];
  const deeplyNestedFunctions: ComplexityResult[] = [];

  files.forEach(file => {
    const analysis = analyzeFile(file);
    if (analysis) {
      analyses.push(analysis);

      analysis.functions.forEach(fn => {
        if (fn.cyclomaticComplexity > 10) {
          highComplexityFunctions.push(fn);
        }
        if (fn.linesOfCode > 50) {
          longFunctions.push(fn);
        }
        if (fn.nestedDepth > 4) {
          deeplyNestedFunctions.push(fn);
        }
      });
    }
  });

  // 统计报告
  console.log('📊 分析报告\n');
  console.log('=' .repeat(80));

  console.log('\n1️⃣  高圈复杂度函数 (>10):');
  console.log('-'.repeat(80));
  highComplexityFunctions
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .slice(0, 20)
    .forEach(fn => {
      console.log(`  📍 ${fn.functionName} (${path.relative(process.cwd(), fn.file)}:${fn.lineNumber})`);
      console.log(`     圈复杂度: ${fn.cyclomaticComplexity}, 认知复杂度: ${fn.cognitiveComplexity}, 行数: ${fn.linesOfCode}`);
    });

  console.log('\n2️⃣  超长函数 (>50行):');
  console.log('-'.repeat(80));
  longFunctions
    .sort((a, b) => b.linesOfCode - a.linesOfCode)
    .slice(0, 20)
    .forEach(fn => {
      console.log(`  📍 ${fn.functionName} (${path.relative(process.cwd(), fn.file)}:${fn.lineNumber})`);
      console.log(`     行数: ${fn.linesOfCode}, 圈复杂度: ${fn.cyclomaticComplexity}, 嵌套深度: ${fn.nestedDepth}`);
    });

  console.log('\n3️⃣  深度嵌套函数 (>4层):');
  console.log('-'.repeat(80));
  deeplyNestedFunctions
    .sort((a, b) => b.nestedDepth - a.nestedDepth)
    .slice(0, 20)
    .forEach(fn => {
      console.log(`  📍 ${fn.functionName} (${path.relative(process.cwd(), fn.file)}:${fn.lineNumber})`);
      console.log(`     嵌套深度: ${fn.nestedDepth}, 圈复杂度: ${fn.cyclomaticComplexity}, 认知复杂度: ${fn.cognitiveComplexity}`);
    });

  console.log('\n4️⃣  最大文件 (按行数):');
  console.log('-'.repeat(80));
  analyses
    .sort((a, b) => b.totalLines - a.totalLines)
    .slice(0, 10)
    .forEach(analysis => {
      console.log(`  📁 ${path.relative(process.cwd(), analysis.file)}`);
      console.log(`     总行数: ${analysis.totalLines}, 函数数: ${analysis.functions.length}, 平均复杂度: ${analysis.avgComplexity.toFixed(2)}`);
    });

  console.log('\n5️⃣  整体统计:');
  console.log('-'.repeat(80));
  const totalFunctions = analyses.reduce((sum, a) => sum + a.functions.length, 0);
  const totalLines = analyses.reduce((sum, a) => sum + a.totalLines, 0);
  const avgFileSize = totalLines / analyses.length;
  const allComplexities = analyses.flatMap(a => a.functions.map(f => f.cyclomaticComplexity));
  const avgComplexity = allComplexities.reduce((a, b) => a + b, 0) / allComplexities.length;

  console.log(`  • 总文件数: ${analyses.length}`);
  console.log(`  • 总函数数: ${totalFunctions}`);
  console.log(`  • 总代码行数: ${totalLines}`);
  console.log(`  • 平均文件大小: ${avgFileSize.toFixed(0)} 行`);
  console.log(`  • 平均圈复杂度: ${avgComplexity.toFixed(2)}`);
  console.log(`  • 高复杂度函数数: ${highComplexityFunctions.length} (${((highComplexityFunctions.length / totalFunctions) * 100).toFixed(1)}%)`);
  console.log(`  • 超长函数数: ${longFunctions.length} (${((longFunctions.length / totalFunctions) * 100).toFixed(1)}%)`);

  console.log('\n' + '='.repeat(80));
}

// 运行分析
const targetDir = process.argv[2] || './packages/backend/src';
analyze(targetDir);
