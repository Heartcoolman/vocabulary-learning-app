/**
 * AMAS Evaluation - 评估系统
 * 导出索引
 *
 * @deprecated 此目录已被重组，evaluation模块已合并到rewards目录
 * @see {@link ../rewards/evaluators.ts} - 统一奖励评估器（包含因果推断和单词掌握度评估）
 * @see {@link ../rewards/delayed-reward-aggregator.ts} - 延迟奖励聚合器
 *
 * 为保持向后兼容，此文件提供重新导出。
 * 新代码应直接从 ../rewards 导入。
 */

// 因果推断（重新导出）
export * from '../rewards/evaluators';

// 延迟奖励聚合器（重新导出）
export * from '../rewards/delayed-reward-aggregator';
