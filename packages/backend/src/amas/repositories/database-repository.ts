/**
 * AMAS 命名空间 - 数据库仓库导出
 *
 * 历史原因：仓库实现位于 `src/repositories/*`，但部分测试/调用方使用 `src/amas/repositories/*` 路径。
 * 这里提供轻量重导出以保持兼容，避免重复实现。
 */

export {
  DatabaseStateRepository,
  DatabaseModelRepository,
  databaseStateRepository,
  databaseModelRepository,
} from '../../repositories/database-repository';
