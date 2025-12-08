/**
 * Backend类型定义
 * 大部分类型已迁移到 @danci/shared
 * 这里只保留后端特有的类型和重导出共享类型
 */

// 从shared导入所有共享类型
export * from '@danci/shared/types';

// 注意：AuthRequest, AuthUser等已在shared中定义
// 后端代码可以直接从 '@danci/shared/types' 或从这里导入
