import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DependencyAnalyzer {
  constructor(srcRoot) {
    this.srcRoot = srcRoot;
    this.modules = new Map();
    this.edges = [];
    this.couplingMetrics = new Map();
  }

  async scanFiles() {
    console.log('扫描文件...');
    const files = this.getAllTsFiles(this.srcRoot);
    console.log('发现 ' + files.length + ' 个TypeScript文件');

    for (const file of files) {
      const moduleNode = await this.analyzeFile(file);
      if (moduleNode) {
        this.modules.set(moduleNode.id, moduleNode);
      }
    }

    console.log('解析了 ' + this.modules.size + ' 个模块');
  }

  getAllTsFiles(dir) {
    const files = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...this.getAllTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    } catch (e) {}
    return files;
  }

  async analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(this.srcRoot, filePath);
      const id = this.pathToModuleId(relativePath);
      const imports = this.extractImports(content, filePath);
      const exports = this.extractExports(content);
      const lineCount = content.split('\n').length;
      const category = this.categorizeModule(relativePath);
      return { id, path: relativePath, imports, exports, lineCount, category };
    } catch (error) {
      return null;
    }
  }

  extractImports(content, currentFile) {
    const imports = [];
    const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.') || importPath.startsWith('@/')) {
        const resolvedPath = this.resolveImportPath(importPath, currentFile);
        if (resolvedPath) imports.push(resolvedPath);
      }
    }
    return imports;
  }

  resolveImportPath(importPath, currentFile) {
    const currentDir = path.dirname(currentFile);
    if (importPath.startsWith('.')) {
      let resolved = path.join(this.srcRoot, currentDir, importPath);
      if (!fs.existsSync(resolved) && !resolved.endsWith('.ts')) {
        if (fs.existsSync(resolved + '.ts')) {
          resolved += '.ts';
        } else if (fs.existsSync(path.join(resolved, 'index.ts'))) {
          resolved = path.join(resolved, 'index.ts');
        }
      }
      if (fs.existsSync(resolved)) {
        return this.pathToModuleId(path.relative(this.srcRoot, resolved));
      }
    }
    return null;
  }

  pathToModuleId(relativePath) {
    return relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
  }

  extractExports(content) {
    const exports = [];
    const exportVarRegex = /export\s+(?:const|let|var)\s+(\w+)/g;
    let match;
    while ((match = exportVarRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    const exportFuncRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    while ((match = exportFuncRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    const exportTypeRegex = /export\s+(?:class|interface|type|enum)\s+(\w+)/g;
    while ((match = exportTypeRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }
    return exports;
  }

  categorizeModule(relativePath) {
    if (relativePath.includes('/services/')) return 'service';
    if (relativePath.includes('/routes/')) return 'route';
    if (relativePath.includes('/amas/')) return 'amas';
    if (relativePath.includes('/models/') || relativePath.includes('/entities/')) return 'model';
    if (relativePath.includes('/config/')) return 'config';
    if (relativePath.includes('/middleware/')) return 'middleware';
    if (relativePath.includes('/repositories/')) return 'repository';
    if (relativePath.includes('/monitoring/')) return 'monitoring';
    return 'utility';
  }

  buildDependencyGraph() {
    console.log('构建依赖图...');
    for (const [moduleId, module] of this.modules) {
      for (const importPath of module.imports) {
        if (this.modules.has(importPath)) {
          const existingEdge = this.edges.find((e) => e.from === moduleId && e.to === importPath);
          if (existingEdge) {
            existingEdge.weight++;
          } else {
            this.edges.push({ from: moduleId, to: importPath, weight: 1 });
          }
        }
      }
    }
    console.log('生成 ' + this.edges.length + ' 条依赖边');
  }

  calculateCouplingMetrics() {
    console.log('计算耦合度指标...');
    for (const [moduleId, module] of this.modules) {
      const efferentCoupling = new Set(module.imports).size;
      const afferentCoupling = this.edges.filter((e) => e.to === moduleId).length;
      const total = afferentCoupling + efferentCoupling;
      const instability = total > 0 ? efferentCoupling / total : 0;
      const abstractness = this.estimateAbstractness(module);
      const distance = Math.abs(abstractness + instability - 1);
      this.couplingMetrics.set(moduleId, {
        afferentCoupling,
        efferentCoupling,
        instability,
        abstractness,
        distance,
      });
    }
    console.log('耦合度指标计算完成');
  }

  estimateAbstractness(module) {
    let abstractCount = 0;
    for (const exp of module.exports) {
      if (exp.endsWith('Interface') || exp.endsWith('Type') || exp.startsWith('I')) {
        abstractCount++;
      }
    }
    return module.exports.length > 0 ? abstractCount / module.exports.length : 0;
  }

  detectCircularDependencies() {
    console.log('检测循环依赖...');
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const dfs = (nodeId, path) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      const module = this.modules.get(nodeId);
      if (module) {
        for (const importPath of module.imports) {
          if (!recursionStack.has(importPath)) {
            if (!visited.has(importPath)) {
              dfs(importPath, [...path]);
            }
          } else {
            const cycleStart = path.indexOf(importPath);
            if (cycleStart !== -1) {
              const cycle = [...path.slice(cycleStart), importPath];
              const severity = this.assessCycleSeverity(cycle);
              cycles.push({ cycle, severity });
            }
          }
        }
      }
      recursionStack.delete(nodeId);
    };
    for (const moduleId of this.modules.keys()) {
      if (!visited.has(moduleId)) {
        dfs(moduleId, []);
      }
    }
    console.log('发现 ' + cycles.length + ' 个循环依赖');
    return cycles;
  }

  assessCycleSeverity(cycle) {
    const hasServiceAmasCycle =
      cycle.some((m) => m.includes('/services/')) && cycle.some((m) => m.includes('/amas/'));
    if (hasServiceAmasCycle) return 'high';
    if (cycle.length > 4) return 'medium';
    return 'low';
  }

  generateCouplingHeatmap() {
    console.log('生成耦合度热力图数据...');
    const heatmapData = [];
    for (const [moduleId, metrics] of this.couplingMetrics) {
      heatmapData.push({
        module: this.getShortModuleName(moduleId),
        fullPath: moduleId,
        afferentCoupling: metrics.afferentCoupling,
        efferentCoupling: metrics.efferentCoupling,
        instability: metrics.instability,
        distance: metrics.distance,
        risk: this.calculateRiskScore(metrics),
      });
    }
    heatmapData.sort((a, b) => b.risk - a.risk);
    return heatmapData;
  }

  calculateRiskScore(metrics) {
    return (
      metrics.instability * 0.5 + metrics.distance * 0.5 + (metrics.efferentCoupling > 10 ? 0.2 : 0)
    );
  }

  identifyHighRiskDependencies() {
    console.log('识别高风险依赖...');
    const highRisk = [];
    for (const [moduleId, metrics] of this.couplingMetrics) {
      const module = this.modules.get(moduleId);
      if (
        metrics.instability > 0.7 ||
        metrics.distance > 0.5 ||
        metrics.efferentCoupling > 15 ||
        (metrics.afferentCoupling > 10 && metrics.efferentCoupling > 10)
      ) {
        highRisk.push({
          module: moduleId,
          category: module.category,
          metrics,
          issues: this.diagnoseIssues(metrics),
        });
      }
    }
    return highRisk;
  }

  diagnoseIssues(metrics) {
    const issues = [];
    if (metrics.instability > 0.8) {
      issues.push('极不稳定 - 过度依赖其他模块');
    }
    if (metrics.distance > 0.6) {
      issues.push('偏离主序列 - 架构设计问题');
    }
    if (metrics.efferentCoupling > 15) {
      issues.push('出度过高 - 职责过多');
    }
    if (metrics.afferentCoupling > 15) {
      issues.push('入度过高 - 过度被依赖');
    }
    if (metrics.afferentCoupling > 10 && metrics.efferentCoupling > 10) {
      issues.push('双向高耦合 - 核心枢纽但不稳定');
    }
    return issues;
  }

  generateDecouplingRecommendations() {
    console.log('生成解耦建议...');
    const recommendations = [];
    const serviceToDbCoupling = this.analyzeLayerCoupling('service', 'model');
    if (serviceToDbCoupling.count > 5) {
      recommendations.push({
        type: 'Repository Pattern',
        priority: 'high',
        description: '服务层直接依赖数据模型过多',
        suggestion: '引入统一的Repository层来抽象数据访问',
        affectedModules: serviceToDbCoupling.modules.slice(0, 10),
        estimatedImpact: '降低20-30%的耦合度',
      });
    }
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      recommendations.push({
        type: 'Event-Driven Architecture',
        priority: 'high',
        description: '发现' + circularDeps.length + '个循环依赖',
        suggestion: '使用事件总线解耦循环依赖的模块',
        affectedModules: circularDeps.slice(0, 3).flatMap((c) => c.cycle),
        estimatedImpact: '消除循环依赖,提高可维护性',
      });
    }
    const highCouplingModules = Array.from(this.couplingMetrics.entries())
      .filter(([_, m]) => m.efferentCoupling > 10)
      .map(([id, _]) => id);
    if (highCouplingModules.length > 5) {
      recommendations.push({
        type: 'Dependency Injection',
        priority: 'medium',
        description: '多个模块存在高出度耦合',
        suggestion: '引入DI容器,通过接口注入依赖',
        affectedModules: highCouplingModules.slice(0, 10),
        estimatedImpact: '提高可测试性和灵活性',
      });
    }
    const crossLayerDeps = this.analyzeCrossLayerDependencies();
    if (crossLayerDeps.length > 10) {
      recommendations.push({
        type: 'Layered Architecture',
        priority: 'medium',
        description: '存在过多跨层依赖',
        suggestion: '严格定义层次边界,禁止反向依赖',
        affectedModules: crossLayerDeps.slice(0, 10),
        estimatedImpact: '提高架构清晰度',
      });
    }
    return recommendations;
  }

  analyzeLayerCoupling(fromCategory, toCategory) {
    const modules = [];
    let count = 0;
    for (const [moduleId, module] of this.modules) {
      if (module.category === fromCategory) {
        for (const importPath of module.imports) {
          const importedModule = this.modules.get(importPath);
          if (importedModule && importedModule.category === toCategory) {
            modules.push({ from: moduleId, to: importPath });
            count++;
          }
        }
      }
    }
    return { count, modules };
  }

  analyzeCrossLayerDependencies() {
    const crossLayerDeps = [];
    const layerHierarchy = ['route', 'service', 'repository', 'model'];
    for (const edge of this.edges) {
      const fromModule = this.modules.get(edge.from);
      const toModule = this.modules.get(edge.to);
      if (fromModule && toModule) {
        const fromLevel = layerHierarchy.indexOf(fromModule.category);
        const toLevel = layerHierarchy.indexOf(toModule.category);
        if (fromLevel > toLevel && fromLevel !== -1 && toLevel !== -1) {
          crossLayerDeps.push(edge.from + ' -> ' + edge.to);
        }
      }
    }
    return crossLayerDeps;
  }

  generateReport() {
    console.log('生成分析报告...');
    const circularDeps = this.detectCircularDependencies();
    const heatmap = this.generateCouplingHeatmap();
    const highRisk = this.identifyHighRiskDependencies();
    const recommendations = this.generateDecouplingRecommendations();
    const stats = {
      totalModules: this.modules.size,
      totalDependencies: this.edges.length,
      circularDependencies: circularDeps.length,
      highRiskModules: highRisk.length,
      averageInstability: this.calculateAverageInstability(),
      categoryDistribution: this.getCategoryDistribution(),
    };
    return {
      stats,
      circularDependencies: circularDeps,
      couplingHeatmap: heatmap.slice(0, 30),
      highRiskDependencies: highRisk,
      recommendations,
    };
  }

  calculateAverageInstability() {
    let sum = 0;
    for (const metrics of this.couplingMetrics.values()) {
      sum += metrics.instability;
    }
    return sum / this.couplingMetrics.size;
  }

  getCategoryDistribution() {
    const dist = {};
    for (const module of this.modules.values()) {
      dist[module.category] = (dist[module.category] || 0) + 1;
    }
    return dist;
  }

  getShortModuleName(moduleId) {
    const parts = moduleId.split('/');
    return parts[parts.length - 1];
  }
}

async function main() {
  const srcRoot = path.join(__dirname, 'packages/backend/src');
  console.log(
    '==========================================' +
      '\n' +
      '代码库依赖关系和耦合度分析' +
      '\n' +
      '==========================================' +
      '\n',
  );
  const analyzer = new DependencyAnalyzer(srcRoot);
  await analyzer.scanFiles();
  analyzer.buildDependencyGraph();
  analyzer.calculateCouplingMetrics();
  const report = analyzer.generateReport();
  const outputPath = path.join(__dirname, 'dependency-analysis-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log('\n' + '报告已保存到: ' + outputPath + '\n');
  console.log(
    '==========================================' +
      '\n' +
      '分析摘要' +
      '\n' +
      '==========================================',
  );
  console.log('总模块数: ' + report.stats.totalModules);
  console.log('总依赖边数: ' + report.stats.totalDependencies);
  console.log('循环依赖数: ' + report.stats.circularDependencies);
  console.log('高风险模块数: ' + report.stats.highRiskModules);
  console.log('平均不稳定性: ' + report.stats.averageInstability.toFixed(3));
  console.log('\n模块分类分布:');
  for (const [category, count] of Object.entries(report.stats.categoryDistribution)) {
    console.log('  - ' + category + ': ' + count);
  }
  console.log('\n耦合度最高的10个模块:');
  for (const item of report.couplingHeatmap.slice(0, 10)) {
    console.log(
      '  - ' +
        item.module +
        ' (风险: ' +
        item.risk.toFixed(2) +
        ', 不稳定性: ' +
        item.instability.toFixed(2) +
        ')',
    );
  }
  console.log('\n高风险依赖 (前5个):');
  for (const risk of report.highRiskDependencies.slice(0, 5)) {
    console.log('  - ' + risk.module);
    console.log('    问题: ' + risk.issues.join(', '));
  }
  console.log('\n解耦建议:');
  for (const rec of report.recommendations) {
    console.log('  [' + rec.priority.toUpperCase() + '] ' + rec.type);
    console.log('    描述: ' + rec.description);
    console.log('    建议: ' + rec.suggestion);
  }
  console.log('\n==========================================');
}

main().catch(console.error);
