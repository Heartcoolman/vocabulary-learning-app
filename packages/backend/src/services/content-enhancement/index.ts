/**
 * Content Enhancement Module
 * 内容增强模块导出
 */

// 词库质量检查服务
export {
  WordQualityService,
  wordQualityService,
  CheckType,
  IssueSeverity,
  CheckStatus,
  WordIssue,
  QualityCheckResult,
  CheckOptions,
} from './word-quality.service';

// 内容增强服务
export {
  ContentEnhanceService,
  contentEnhanceService,
  EnhanceType,
  EnhanceStatus,
  EnhanceResult,
  BatchEnhanceResult,
  EnhanceOptions,
} from './content-enhance.service';
