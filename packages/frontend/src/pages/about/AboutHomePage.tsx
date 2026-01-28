/**
 * AMAS 公开展示 - 首页宣传页
 * Bento Grid 布局 + 亮色玻璃拟态
 */

import { motion } from 'framer-motion';
import { Eye, Brain, Lightning, Target } from '../../components/Icon';
import {
  staggerContainerVariants,
  staggerItemVariants,
  fadeInVariants,
} from '../../utils/animations';

interface StageConfig {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  description: string;
  details: string[];
  accentColor: string;
  bgColor: string;
}

const STAGES: StageConfig[] = [
  {
    title: '感知层',
    subtitle: 'Perception',
    icon: <Eye size={32} />,
    description: '多维度捕捉学习者的实时状态与环境信息，构建全面的用户画像。',
    details: ['注意力追踪与响应分析', '实时疲劳度监测', '学习动机与情绪评估', '环境场景自适应'],
    accentColor: 'bg-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    title: '建模层',
    subtitle: 'Modeling',
    icon: <Brain size={32} />,
    description: '构建动态的学习者认知模型，量化核心认知能力维度。',
    details: [
      '个性化遗忘曲线拟合',
      'ACT-R 记忆激活度追踪',
      '认知反应速度建模',
      'TrendAnalyzer 学习趋势洞察',
    ],
    accentColor: 'bg-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
  {
    title: '学习层',
    subtitle: 'Learning',
    icon: <Lightning size={32} />,
    description: '持续进化的算法集成引擎，从交互数据中提取最优策略。',
    details: [
      'Thompson Sampling 采样',
      'LinUCB 上下文赌博机',
      'FSRS 个性化间隔调度',
      'Ensemble 集成策略投票',
    ],
    accentColor: 'bg-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  {
    title: '决策层',
    subtitle: 'Decision',
    icon: <Target size={32} />,
    description: '生成个性化的学习策略与即时反馈，实现精准教学。',
    details: ['多目标路径优化', '动态复习间隔调度', '自适应难度匹配', '心流体验维持'],
    accentColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
];

function StageCard({
  title,
  subtitle,
  icon,
  description,
  details,
  accentColor,
  bgColor,
}: StageConfig) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-white/60 p-8 shadow-floating shadow-slate-200/50 backdrop-blur-xl transition-all hover:bg-white/80 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:transform-none dark:border-slate-700/40 dark:bg-slate-800/60 dark:shadow-none dark:hover:bg-slate-800/80"
    >
      <div
        aria-hidden="true"
        className={`absolute -right-12 -top-12 h-40 w-40 rounded-full ${bgColor} blur-3xl transition-transform duration-g3-slow group-hover:scale-125 motion-reduce:transition-none`}
      />
      <div
        aria-hidden="true"
        className={`absolute -bottom-8 -left-8 h-32 w-32 rounded-full ${bgColor} opacity-50 blur-2xl transition-transform duration-g3-slow group-hover:scale-125 motion-reduce:transition-none`}
      />

      <div className="relative z-10 mb-6 flex items-start justify-between">
        <div
          aria-hidden="true"
          className={`flex h-16 w-16 items-center justify-center rounded-card ${bgColor} text-slate-700 shadow-soft ring-1 ring-white/50 transition-colors group-hover:bg-white group-hover:text-blue-600 dark:text-slate-300 dark:ring-slate-600/50 dark:group-hover:bg-slate-700 dark:group-hover:text-blue-400`}
        >
          {icon}
        </div>
        <div className="text-right">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h3>
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
            {subtitle}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex-1">
        <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>

        <div className="space-y-3">
          {details.map((detail, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className={`h-1.5 w-1.5 rounded-full ${accentColor}`} />
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function AboutHomePage() {
  return (
    <div className="min-h-full p-8 md:p-12 lg:p-16">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="mb-16 text-left"
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1 text-xs font-medium text-blue-600 backdrop-blur-sm dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
          >
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            Core Architecture
          </motion.div>

          <h1 className="mb-6 max-w-3xl text-5xl font-bold tracking-tight text-slate-900 dark:text-white md:text-7xl">
            <span className="block text-slate-300 dark:text-slate-600">AMAS</span>
            <span className="bg-gradient-to-r from-blue-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              Adaptive Intelligence
            </span>
          </h1>

          <p className="max-w-2xl text-xl leading-relaxed text-slate-500 dark:text-slate-400">
            像私人教练一样懂你的自适应学习系统。
            <br />
            <span className="text-base text-slate-400 dark:text-slate-500">
              Adaptive Multi-modal Assessment System
            </span>
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-6 md:grid-cols-2"
        >
          {STAGES.map((stage, index) => (
            <motion.div key={index} variants={staggerItemVariants}>
              <StageCard {...stage} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
