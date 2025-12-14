#!/usr/bin/env ts-node
/**
 * 依赖关系和耦合度分析工具
 * 生成依赖关系图、耦合度指标、内聚度评估
 */

import * as fs from 'fs';
import * as path from 'path';

// 模块节点定义
interface ModuleNode {
  id: string;
  path: string;
  imports: string[]; // 导入的模块
  exports: string[]; // 导出的符号
  lineCount: number;
  category: 'service' | 'route' | 'amas' | 'model' | 'utility' | 'config' | 'middleware' | 'repository' | 'monitoring';
}

// 依赖边定义
interface DependencyEdge {
  from: string;
  to: string;
  weight: number; // 导入次数
}

// 模块耦合度
interface CouplingMetrics {
  afferentCoupling: number; // 入度 (Ca) - 有多少模块依赖我
  efferentCoupling: number; // 出度 (Ce) - 我依赖多少模块
  instability: number; // 不稳定性 I = Ce / (Ca + Ce)
  abstractness: number; // 抽象度 (接口/抽象类比例)
  distance: number; // 与主序列距离 D = |A + I - 1|
}

// 循环依赖
interface CircularDependency {
  cycle: string[];
  severity: 'low' | 'medium' | 'high';
}

class DependencyAnalyzer {
  private srcRoot: string;
  private modules: Map<string, ModuleNode> = new Map();
  private edges: DependencyEdge[] = [];
  private couplingMetrics: Map<string, CouplingMetrics> = new Map();

  constructor(srcRoot: string) {
    this.srcRoot = srcRoot;
  }

  // 扫描所有TypeScript文件
  async scanFiles() {
    console.log('🔍 扫描文件...');
    const files = this.getAllTsFiles(this.srcRoot);
    console.log(`发现 ${files.length} 个TypeScript文件`);

    for (const file of files) {
      const moduleNode = await this.analyzeFile(file);
      if (moduleNode) {
        this.modules.set(moduleNode.id, moduleNode);
      }
    }

    console.log(`✅ 解析了 ${this.modules.size} 个模块`);
  }

  // 递归获取所有TS文件
  private getAllTsFiles(dir: string): string[] {
    const files: string[] = [];
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
    } catch (e) {
      // ignore errors
    }

    return files;
  }

  // 分析单个文件
  private async analyzeFile(filePath: string): Promise<ModuleNode | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(this.srcRoot, filePath);
      const id = this.pathToModuleId(relativePath);

      // 提取imports
      const imports = this.extractImports(content, filePath);

      // 提取exports
      const exports = this.extractExports(content);

      // 计算行数
      const lineCount = content.split('\n').length;

      // 确定模块分类
      const category = this.categorizeModule(relativePath);

      return {
        id,
        path: relativePath,
        imports,
        exports,
        lineCount,
        category
      };
    } catch (error) {
      return null;
    }
  }

  // 提取import语句
  private extractImports(content: string, currentFile: string): string[] {
    const imports: string[] = [];

    // 匹配各种import语句
    const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      // 只处理本地导入
      if (importPath.startsWith('.') || importPath.startsWith('@/')) {
        const resolvedPath = this.resolveImportPath(importPath, currentFile);
        if (resolvedPath) {
          imports.push(resolvedPath);
        }
      }
    }

    return imports;
  }

  // 解析导入路径
  private resolveImportPath(importPath: string, currentFile: string): string | null {
    const currentDir = path.dirname(currentFile);

    // 处理相对路径
    if (importPath.startsWith('.')) {
      let resolved = path.join(this.srcRoot, currentDir, importPath);

      // 尝试添加.ts扩展名
      if (!fs.existsSync(resolved) && !resolved.endsWith('.ts')) {
        if (fs.existsSync(resolved + '.ts')) {
          resolved += '.ts';
        } else if (fs.existsSync(path.join(resolved, 'index.ts'))) {
          resolved = path.join(resolved, 'index.ts');
        }
      }

      if (fs.existsSync(resolved)) {
        const relativePath = path.relative(this.srcRoot, resolved);
        return this.pathToModuleId(relativePath);
      }
    }

    return null;
  }

  // 路径转模块ID
  private pathToModuleId(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
  }

  // 提取exports
  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // export const/let/var
    const exportVarRegex = /export\s+(?:const|let|var)\s+(\w+)/g;
    let match;
    while ((match = exportVarRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // export function
    const exportFuncRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    while ((match = exportFuncRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // export class/interface/type
    const exportTypeRegex = /export\s+(?:class|interface|type|enum)\s+(\w+)/g;
    while ((match = exportTypeRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // export default
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }

    return exports;
  }

  // 模块分类
  private categorizeModule(relativePath: string): ModuleNode['category'] {
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

  // 构建依赖图
  buildDependencyGraph() {
    console.log('🔨 构建依赖图...');

    for (const [moduleId, module] of this.modules) {
      for (const importPath of module.imports) {
        // 检查导入的模块是否存在
        if (this.modules.has(importPath)) {
          // 检查是否已有该边
          const existingEdge = this.edges.find(e => e.from === moduleId && e.to === importPath);
          if (existingEdge) {
            existingEdge.weight++;
          } else {
            this.edges.push({ from: moduleId, to: importPath, weight: 1 });
          }
        }
      }
    }

    console.log(`✅ 生成 ${this.edges.length} 条依赖边`);
  }

  // 计算耦合度指标
  calculateCouplingMetrics() {
    console.log('📊 计算耦合度指标...');

    for (const [moduleId, module] of this.modules) {
      // 计算出度 (Ce) - 该模块依赖多少其他模块
      const efferentCoupling = new Set(module.imports).size;

      // 计算入度 (Ca) - 有多少模块依赖该模块
      const afferentCoupling = this.edges.filter(e => e.to === moduleId).length;

      // 不稳定性 I = Ce / (Ca + Ce)
      const total = afferentCoupling + efferentCoupling;
      const instability = total > 0 ? efferentCoupling / total : 0;

      // 抽象度 (简单估计：interface/type/abstract 比例)
      const abstractness = this.estimateAbstractness(module);

      // 与主序列距离 D = |A + I - 1|
      const distance = Math.abs(abstractness + instability - 1);

      this.couplingMetrics.set(moduleId, {
        afferentCoupling,
        efferentCoupling,
        instability,
        abstractness,
        distance
      });
    }

    console.log('✅ 耦合度指标计算完成');
  }

  // 估算抽象度
  private estimateAbstractness(module: ModuleNode): number {
    let abstractCount = 0;

    for (const exp of module.exports) {
      // 简单检查导出名称
      if (exp.endsWith('Interface') || exp.endsWith('Type') || exp.startsWith('I')) {
        abstractCount++;
      }
    }

    return module.exports.length > 0 ? abstractCount / module.exports.length : 0;
  }

  // 检测循环依赖
  detectCircularDependencies(): CircularDependency[] {
    console.log('🔄 检测循环依赖...');
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
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
            // 找到循环
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

    console.log(`${cycles.length > 0 ? '⚠️' : '✅'} 发现 ${cycles.length} 个循环依赖`);
    return cycles;
  }

  // 评估循环严重程度
  private assessCycleSeverity(cycle: string[]): CircularDependency['severity'] {
    // 跨层循环（service <-> amas）更严重
    const hasServiceAmasCycle = cycle.some(m => m.includes('/services/')) &&
                                cycle.some(m => m.includes('/amas/'));
    if (hasServiceAmasCycle) return 'high';

    // 中等长度的循环
    if (cycle.length > 4) return 'medium';

    return 'low';
  }

  // 生成依赖关系可视化 (Mermaid格式)
  generateDependencyVisualization(): string {
    console.log('🎨 生成依赖关系图...');

    let mermaid = 'graph TB\n';

    // 按类别分组
    const categories = new Map<string, string[]>();
    for (const [moduleId, module] of this.modules) {
      if (!categories.has(module.category)) {
        categories.set(module.category, []);
      }
      categories.get(module.category)!.push(moduleId);
    }

    // 生成子图
    for (const [category, moduleIds] of categories) {
      mermaid += `  subgraph ${category}\n`;
      for (const moduleId of moduleIds.slice(0, 20)) { // 限制每个分类的显示数量
        const shortName = this.getShortModuleName(moduleId);
        mermaid += `    ${this.sanitizeId(moduleId)}["${shortName}"]\n`;
      }
      mermaid += `  end\n`;
    }

    // 生成边（只显示重要的依赖）
    const importantEdges = this.edges
      .filter(e => e.weight >= 1)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 50); // 限制显示数量

    for (const edge of importantEdges) {
      mermaid += `  ${this.sanitizeId(edge.from)} -->|${edge.weight}| ${this.sanitizeId(edge.to)}\n`;
    }

    return mermaid;
  }

  // 获取模块短名
  private getShortModuleName(moduleId: string): string {
    const parts = moduleId.split('/');
    return parts[parts.length - 1];
  }

  // 清理ID用于Mermaid
  private sanitizeId(id: string): string {
    return id.replace(/[\/\-\.]/g, '_');
  }

  // 生成耦合度热力图数据
  generateCouplingHeatmap(): any[] {
    console.log('🔥 生成耦合度热力图数据...');

    const heatmapData = [];

    for (const [moduleId, metrics] of this.couplingMetrics) {
      heatmapData.push({
        module: this.getShortModuleName(moduleId),
        fullPath: moduleId,
        afferentCoupling: metrics.afferentCoupling,
        efferentCoupling: metrics.efferentCoupling,
        instability: metrics.instability,
        distance: metrics.distance,
        risk: this.calculateRiskScore(metrics)
      });
    }

    // 按风险排序
    heatmapData.sort((a, b) => b.risk - a.risk);

    return heatmapData;
  }

  // 计算风险分数
  private calculateRiskScore(metrics: CouplingMetrics): number {
    // 高不稳定性 + 高距离 = 高风险
    return metrics.instability * 0.5 + metrics.distance * 0.5 +
           (metrics.efferentCoupling > 10 ? 0.2 : 0);
  }

  // 识别高风险依赖
  identifyHighRiskDependencies(): any[] {
    console.log('⚠️  识别高风险依赖...');

    const highRisk = [];

    for (const [moduleId, metrics] of this.couplingMetrics) {
      const module = this.modules.get(moduleId)!;

      // 高风险条件
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
          issues: this.diagnoseIssues(metrics)
        });
      }
    }

    return highRisk;
  }

  // 诊断问题
  private diagnoseIssues(metrics: CouplingMetrics): string[] {
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

  // 生成解耦建议
  generateDecouplingRecommendations(): any[] {
    console.log('💡 生成解耦建议...');

    const recommendations = [];

    // 建议1: 引入仓储模式
    const serviceToDbCoupling = this.analyzeLayerCoupling('service', 'model');
    if (serviceToDbCoupling.count > 5) {
      recommendations.push({
        type: 'Repository Pattern',
        priority: 'high',
        description: '服务层直接依赖数据模型过多',
        suggestion: '引入统一的Repository层来抽象数据访问',
        affectedModules: serviceToDbCoupling.modules.slice(0, 10),
        estimatedImpact: '降低20-30%的耦合度'
      });
    }

    // 建议2: 事件驱动架构
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      recommendations.push({
        type: 'Event-Driven Architecture',
        priority: 'high',
        description: `发现${circularDeps.length}个循环依赖`,
        suggestion: '使用事件总线解耦循环依赖的模块',
        affectedModules: circularDeps.slice(0, 3).flatMap(c => c.cycle),
        estimatedImpact: '消除循环依赖,提高可维护性'
      });
    }

    // 建议3: 依赖注入
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
        estimatedImpact: '提高可测试性和灵活性'
      });
    }

    // 建议4: 模块分层
    const crossLayerDeps = this.analyzeCrossLayerDependencies();
    if (crossLayerDeps.length > 10) {
      recommendations.push({
        type: 'Layered Architecture',
        priority: 'medium',
        description: '存在过多跨层依赖',
        suggestion: '严格定义层次边界,禁止反向依赖',
        affectedModules: crossLayerDeps.slice(0, 10),
        estimatedImpact: '提高架构清晰度'
      });
    }

    return recommendations;
  }

  // 分析层间耦合
  private analyzeLayerCoupling(fromCategory: string, toCategory: string): any {
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

  // 分析跨层依赖
  private analyzeCrossLayerDependencies(): string[] {
    const crossLayerDeps = [];
    const layerHierarchy = ['route', 'service', 'repository', 'model'];

    for (const edge of this.edges) {
      const fromModule = this.modules.get(edge.from);
      const toModule = this.modules.get(edge.to);

      if (fromModule && toModule) {
        const fromLevel = layerHierarchy.indexOf(fromModule.category);
        const toLevel = layerHierarchy.indexOf(toModule.category);

        // 反向依赖（下层依赖上层）
        if (fromLevel > toLevel && fromLevel !== -1 && toLevel !== -1) {
          crossLayerDeps.push(`${edge.from} -> ${edge.to}`);
        }
      }
    }

    return crossLayerDeps;
  }

  // 生成完整报告
  generateReport(): any {
    console.log('📄 生成分析报告...');

    const circularDeps = this.detectCircularDependencies();
    const heatmap = this.generateCouplingHeatmap();
    const highRisk = this.identifyHighRiskDependencies();
    const recommendations = this.generateDecouplingRecommendations();

    // 统计数据
    const stats = {
      totalModules: this.modules.size,
      totalDependencies: this.edges.length,
      circularDependencies: circularDeps.length,
      highRiskModules: highRisk.length,
      averageInstability: this.calculateAverageInstability(),
      categoryDistribution: this.getCategoryDistribution()
    };

    return {
      stats,
      circularDependencies: circularDeps,
      couplingHeatmap: heatmap.slice(0, 30), // Top 30
      highRiskDependencies: highRisk,
      recommendations,
      dependencyGraph: this.generateDependencyVisualization()
    };
  }

  // 计算平均不稳定性
  private calculateAverageInstability(): number {
    let sum = 0;
    for (const metrics of this.couplingMetrics.values()) {
      sum += metrics.instability;
    }
    return sum / this.couplingMetrics.size;
  }

  // 获取分类分布
  private getCategoryDistribution(): any {
    const dist: any = {};
    for (const module of this.modules.values()) {
      dist[module.category] = (dist[module.category] || 0) + 1;
    }
    return dist;
  }
}

// 主函数
async function main() {
  const srcRoot = path.join(__dirname, 'packages/backend/src');

  console.log('==========================================');
  console.log('🔬 代码库依赖关系和耦合度分析');
  console.log('==========================================\n');

  const analyzer = new DependencyAnalyzer(srcRoot);

  // 执行分析
  await analyzer.scanFiles();
  analyzer.buildDependencyGraph();
  analyzer.calculateCouplingMetrics();

  // 生成报告
  const report = analyzer.generateReport();

  // 输出到JSON文件
  const outputPath = path.join(__dirname, 'dependency-analysis-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ 报告已保存到: ${outputPath}`);

  // 输出Mermaid图
  const mermaidPath = path.join(__dirname, 'dependency-graph.mmd');
  fs.writeFileSync(mermaidPath, report.dependencyGraph);
  console.log(`✅ 依赖图已保存到: ${mermaidPath}`);

  // 输出摘要到控制台
  console.log('\n==========================================');
  console.log('📊 分析摘要');
  console.log('==========================================\n');
  console.log(`总模块数: ${report.stats.totalModules}`);
  console.log(`总依赖边数: ${report.stats.totalDependencies}`);
  console.log(`循环依赖数: ${report.stats.circularDependencies}`);
  console.log(`高风险模块数: ${report.stats.highRiskModules}`);
  console.log(`平均不稳定性: ${report.stats.averageInstability.toFixed(3)}`);
  console.log('\n模块分类分布:');
  for (const [category, count] of Object.entries(report.stats.categoryDistribution)) {
    console.log(`  - ${category}: ${count}`);
  }

  console.log('\n🔝 耦合度最高的10个模块:');
  for (const item of report.couplingHeatmap.slice(0, 10)) {
    console.log(`  - ${item.module} (风险: ${item.risk.toFixed(2)}, 不稳定性: ${item.instability.toFixed(2)})`);
  }

  console.log('\n⚠️  高风险依赖:');
  for (const risk of report.highRiskDependencies.slice(0, 5)) {
    console.log(`  - ${risk.module}`);
    console.log(`    问题: ${risk.issues.join(', ')}`);
  }

  console.log('\n💡 解耦建议:');
  for (const rec of report.recommendations) {
    console.log(`  [${rec.priority.toUpperCase()}] ${rec.type}`);
    console.log(`    描述: ${rec.description}`);
    console.log(`    建议: ${rec.suggestion}`);
  }

  console.log('\n==========================================');
}

// 运行分析
main().catch(console.error);
