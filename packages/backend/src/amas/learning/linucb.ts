/**
 * LinUCB 兼容导出层
 *
 * 历史路径: amas/learning/linucb
 * 现实现: 统一收敛到 amas/algorithms/learners
 */

export {
  LinUCB,
  defaultLinUCB,
  type LinUCBContext,
  type ContextBuildInput,
  type LinUCBOptions,
  type ActionSelection,
  type LearnerCapabilities,
} from '../algorithms/learners';
