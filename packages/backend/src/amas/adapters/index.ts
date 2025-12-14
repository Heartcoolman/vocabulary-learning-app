/**
 * AMAS 适配器模块统一导出
 *
 * 提供现有学习算法到新接口的适配层
 */

// LinUCB 适配器
export { LinUCBAdapter, defaultLinUCBAdapter } from './linucb-adapter';
export type { LinUCBAdapterOptions } from './linucb-adapter';

// Thompson Sampling 适配器
export { ThompsonAdapter, defaultThompsonAdapter } from './thompson-adapter';
export type { ThompsonAdapterOptions } from './thompson-adapter';

// Ensemble 适配器
export { EnsembleAdapter, defaultEnsembleAdapter } from './ensemble-adapter';
export type { EnsembleAdapterOptions } from './ensemble-adapter';
