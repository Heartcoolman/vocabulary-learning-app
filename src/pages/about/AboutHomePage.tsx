/**
 * AMAS 公开展示 - 首页宣传页
 *
 * 展示 AMAS 决策引擎的四层架构：
 * 感知层 → 建模层 → 学习层 → 决策层
 *
 * 特点：
 * - 交互式卡片展开动画
 * - G3 弹簧物理系统
 * - 渐进式信息揭示
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Brain, Lightning, Target, CaretDown } from '../../components/Icon';
import {
  g3SpringStandard,
  staggerContainerVariants,
  staggerItemVariants,
  fadeInVariants,
} from '../../utils/animations';

// ==================== 类型定义 ====================

interface StageConfig {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  description: string;
  details: string[];
  accentColor: string;
  bgColor: string;
}

interface StageCardProps extends StageConfig {
  isOpen: boolean;
  onClick: () => void;
}

// ==================== 阶段配置 ====================

const STAGES: StageConfig[] = [
  {
    title: '感知层',
    subtitle: 'Perception',
    icon: <Eye size={24} />,
    description: '多维度捕捉学习者的实时状态与环境信息，构建全面的用户画像。',
    details: [
      '注意力追踪：分析响应时间、暂停频率等指标',
      '疲劳度监测：识别认知负荷与学习效率下降',
      '动机评估：判断学习意愿与情绪状态',
      '环境感知：适应不同时段的学习场景',
    ],
    accentColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    title: '建模层',
    subtitle: 'Modeling',
    icon: <Brain size={24} />,
    description: '构建动态的学习者认知模型，量化核心认知能力维度。',
    details: [
      '记忆力模型：基于 Ebbinghaus 遗忘曲线',
      '处理速度：反应时间分布分析',
      '稳定性：表现波动与一致性评估',
      '知识图谱：词汇掌握度映射',
    ],
    accentColor: 'bg-purple-500',
    bgColor: 'bg-purple-50',
  },
  {
    title: '学习层',
    subtitle: 'Learning',
    icon: <Lightning size={24} />,
    description: '持续进化的算法集成引擎，从交互数据中提取最优策略。',
    details: [
      'Thompson Sampling：概率匹配探索最优解',
      'LinUCB：上下文感知的多臂赌博机策略',
      'ACT-R：认知架构模拟人类记忆',
      '集成学习：动态权重调整与算法融合',
    ],
    accentColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
  },
  {
    title: '决策层',
    subtitle: 'Decision',
    icon: <Target size={24} />,
    description: '生成个性化的学习策略与即时反馈，实现精准教学。',
    details: [
      '难度动态匹配：维持最优心流体验',
      '复习间隔优化：最大化长期记忆保持',
      '新词摄入控制：平衡认知负荷',
      '助记辅助策略：针对性提示与解释',
    ],
    accentColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
  },
];

// ==================== 子组件 ====================

function StageCard({
  title,
  subtitle,
  icon,
  description,
  details,
  accentColor,
  bgColor,
  isOpen,
  onClick,
}: StageCardProps) {
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl border cursor-pointer
        transition-colors duration-300
        ${isOpen
          ? 'bg-white border-slate-300 shadow-lg'
          : 'bg-white/60 border-slate-200 hover:border-slate-300 hover:bg-white/80'
        }
      `}
      initial={false}
      animate={{ height: isOpen ? 'auto' : 120 }}
      transition={g3SpringStandard}
    >
      {/* 左侧强调色条 */}
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />

      <div className="p-6">
        {/* 头部：图标 + 标题 + 展开指示器 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div
              className={`
                p-3 rounded-xl transition-colors duration-200
                ${isOpen ? `${bgColor} text-slate-700` : 'bg-slate-100 text-slate-500'}
              `}
            >
              {icon}
            </div>
            <div>
              <h3
                className={`
                  text-lg font-bold transition-colors duration-200
                  ${isOpen ? 'text-slate-900' : 'text-slate-700'}
                `}
              >
                {title}
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {subtitle}
                </span>
              </h3>
              {!isOpen && (
                <p className="text-sm text-slate-500 line-clamp-1">{description}</p>
              )}
            </div>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={g3SpringStandard}
            className="text-slate-400"
          >
            <CaretDown size={20} />
          </motion.div>
        </div>

        {/* 展开内容 */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pl-[60px] pt-2"
            >
              <p className="text-slate-600 mb-4 leading-relaxed">{description}</p>
              <ul className="space-y-2">
                {details.map((detail, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="flex items-start gap-2 text-sm text-slate-500"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${accentColor}`}
                    />
                    {detail}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ==================== 主组件 ====================

export default function AboutHomePage() {
  const [openStage, setOpenStage] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenStage(openStage === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        {/* 标题区 */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            AMAS{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              智能引擎
            </span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            <span className="text-slate-400">Adaptive Multi-modal Assessment System</span>
            <br />
            像私教一样懂你的自适应学习系统
          </p>
        </motion.div>

        {/* 流程连接线指示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center items-center gap-2 mb-8 text-sm text-slate-400"
        >
          <span>感知</span>
          <span>→</span>
          <span>建模</span>
          <span>→</span>
          <span>学习</span>
          <span>→</span>
          <span>决策</span>
        </motion.div>

        {/* 阶段卡片列表 */}
        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-4"
        >
          {STAGES.map((stage, index) => (
            <motion.div key={index} variants={staggerItemVariants}>
              <StageCard
                {...stage}
                isOpen={openStage === index}
                onClick={() => handleToggle(index)}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* 底部提示 */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-sm text-slate-400 mt-12"
        >
          点击卡片展开查看详情 · 前往「模拟演示」体验决策过程
        </motion.p>
      </div>
    </div>
  );
}
