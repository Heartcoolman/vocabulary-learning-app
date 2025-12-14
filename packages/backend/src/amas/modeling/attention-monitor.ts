/**
 * 注意力监测模型兼容导出
 *
 * 历史路径: amas/modeling/attention-monitor
 * 现实现: 统一收敛到 amas/models/cognitive
 */

export {
  AttentionMonitor,
  defaultAttentionMonitor,
  type AttentionFeatures,
} from '../models/cognitive';
