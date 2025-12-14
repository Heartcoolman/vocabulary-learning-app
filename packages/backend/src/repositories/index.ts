export {
  DatabaseStateRepository,
  DatabaseModelRepository,
  databaseStateRepository,
  databaseModelRepository,
} from './database-repository';

export {
  CachedStateRepository,
  CachedModelRepository,
  cachedStateRepository,
  cachedModelRepository,
} from './cached-repository';

// 默认导出带缓存的仓库（推荐使用）
export { cachedStateRepository as stateRepository } from './cached-repository';
export { cachedModelRepository as modelRepository } from './cached-repository';
