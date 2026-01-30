import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  SpeakerHigh,
  Clock,
  Fire,
  ChartLine,
  Warning,
  CheckCircle,
  CircleNotch,
  Lightbulb,
  TrendUp,
  Target,
} from '../Icon';
import { MemoryTraceChart } from './MemoryTraceChart';
import { RelatedWords } from '../semantic';
import { useWordDetailData } from '../../hooks/useWordDetailData';
import type { MasteryEvaluation } from '../../types/word-mastery';
import {
  scaleInVariants,
  backdropVariants,
  staggerContainerVariants,
  staggerItemVariants,
} from '../../utils/animations';

interface WordMasteryDetailModalProps {
  wordId: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 单词掌握度详情模态框 (Redesigned)
 * 采用极简主义设计，同时保留丰富的数据展示
 */
export const WordMasteryDetailModal: React.FC<WordMasteryDetailModalProps> = ({
  wordId,
  isOpen,
  onClose,
}) => {
  const [currentWordId, setCurrentWordId] = useState(wordId);

  useEffect(() => {
    if (isOpen) {
      setCurrentWordId(wordId);
    }
  }, [wordId, isOpen]);

  const { loading, error, data, reload } = useWordDetailData(currentWordId, isOpen);

  const normalizePhonetic = (phonetic: string) => phonetic.replace(/^\/+|\/+$/g, '').trim();

  const getMasteryLevel = (mastery: MasteryEvaluation | null) => {
    if (!mastery) {
      return {
        label: '未学习',
        color: 'text-gray-500',
        borderColor: 'border-gray-200',
        bgGradient: 'from-gray-50 to-gray-100',
        icon: <Warning size={20} weight="bold" />,
      };
    }
    if (mastery.isLearned) {
      return {
        label: '已掌握',
        color: 'text-emerald-600',
        borderColor: 'border-emerald-200',
        bgGradient: 'from-emerald-50 to-emerald-100',
        icon: <CheckCircle size={20} weight="fill" />,
      };
    }
    if (mastery.score >= 0.7) {
      return {
        label: '熟练',
        color: 'text-blue-600',
        borderColor: 'border-blue-200',
        bgGradient: 'from-blue-50 to-blue-100',
        icon: <Fire size={20} />,
      };
    }
    if (mastery.score >= 0.4) {
      return {
        label: '学习中',
        color: 'text-amber-600',
        borderColor: 'border-amber-200',
        bgGradient: 'from-amber-50 to-amber-100',
        icon: <ChartLine size={20} />,
      };
    }
    return {
      label: '需复习',
      color: 'text-orange-600',
      borderColor: 'border-orange-200',
      bgGradient: 'from-orange-50 to-orange-100',
      icon: <Clock size={20} />,
    };
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-32">
          <CircleNotch size={48} className="animate-spin text-blue-500" weight="bold" />
          <p className="mt-4 font-medium text-gray-400 dark:text-slate-500">加载数据中...</p>
        </div>
      );
    }

    if (error || !data) {
      return (
        <div className="flex flex-col items-center justify-center py-24">
          <Warning size={64} className="mb-6 text-red-400" />
          <p className="mb-2 text-xl font-medium text-gray-800 dark:text-slate-100">
            无法加载单词信息
          </p>
          <p className="mb-8 text-gray-500 dark:text-slate-400">
            {error || '请检查网络连接后重试'}
          </p>
          <button
            onClick={reload}
            className="rounded-card bg-gray-900 px-8 py-3 font-medium text-white shadow-elevated transition-all hover:scale-105 active:scale-95 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            重试
          </button>
        </div>
      );
    }

    const level = getMasteryLevel(data.mastery);
    const phonetic = normalizePhonetic(data.phonetic);

    return (
      <motion.div
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
        className="pb-12"
      >
        {/* === Header Section (Immersive, Minimalist) === */}
        <div className="relative pb-12 pt-8 text-center">
          <div className="mb-6 flex items-center justify-center gap-6">
            <h2 className="text-6xl font-bold tracking-tight text-gray-900 dark:text-white md:text-8xl">
              {data.spelling}
            </h2>
            <button
              type="button"
              aria-label="播放发音"
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-floating transition-all hover:scale-110 hover:bg-blue-600 hover:shadow-2xl active:scale-95"
            >
              <SpeakerHigh size={32} />
            </button>
          </div>

          {phonetic ? (
            <p className="mb-8 font-sans text-3xl font-normal text-gray-400 dark:text-slate-500">
              /{phonetic}/
            </p>
          ) : null}

          {/* Meanings */}
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-x-8 gap-y-2 px-6">
            {data.meanings.map((meaning, idx) => (
              <span
                key={idx}
                className="text-xl font-medium text-gray-700 opacity-90 dark:text-slate-300"
              >
                {meaning}
              </span>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="mb-12 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-700" />

        {/* === Data Scroll Section (Card-based Layout) === */}
        <div className="space-y-8 px-8">
          {/* 1. Mastery Dashboard Card */}
          {data.mastery && (
            <motion.div
              variants={staggerItemVariants}
              className="rounded-3xl border border-slate-100 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ChartLine size={28} className="text-slate-700 dark:text-slate-300" />
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    掌握度评估
                  </h3>
                </div>
                <div
                  className={`rounded-full border px-4 py-1.5 ${level.borderColor} bg-gradient-to-r ${level.bgGradient} flex items-center gap-2`}
                >
                  <span className={`${level.color}`}>{level.icon}</span>
                  <span className={`text-sm font-bold ${level.color}`}>{level.label}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
                <div>
                  <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">综合得分</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {Math.round(data.mastery.score * 100)}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-slate-800 dark:bg-slate-300"
                      style={{ width: `${data.mastery.score * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">置信度</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {Math.round(data.mastery.confidence * 100)}%
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
                    记忆强度 (Recall)
                  </p>
                  <div className="flex items-center gap-2">
                    <Target size={20} className="text-emerald-500" />
                    <p className="text-2xl font-bold text-emerald-600">
                      {Math.round(data.mastery.factors.msmtRecall * 100)}%
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">近期准确率</p>
                  <div className="flex items-center gap-2">
                    <TrendUp size={20} className="text-blue-500" />
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round(data.mastery.factors.recentAccuracy * 100)}%
                    </p>
                  </div>
                </div>
              </div>

              {data.mastery.suggestion && (
                <div className="mt-6 rounded-card bg-blue-50 p-4 dark:bg-blue-900/30">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {data.mastery.suggestion}
                  </p>
                </div>
              )}

              {data.mastery.fatigueWarning && (
                <div className="mt-4 rounded-card bg-amber-50 p-4 dark:bg-amber-900/30">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {data.mastery.fatigueWarning}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* 2. Learning Trace Chart */}
          {data.trace.length > 0 && (
            <motion.div
              variants={staggerItemVariants}
              className="rounded-3xl border border-slate-100 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-6 flex items-center gap-3">
                <Fire size={28} className="text-orange-500" />
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">学习轨迹</h3>
              </div>
              <div className="h-64 w-full">
                <MemoryTraceChart trace={data.trace} />
              </div>
            </motion.div>
          )}

          {/* 3. Review Suggestion */}
          {data.interval && (
            <motion.div
              variants={staggerItemVariants}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white shadow-elevated"
            >
              <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <Lightbulb size={28} className="text-yellow-300" />
                    <h3 className="text-2xl font-bold">下次复习建议</h3>
                  </div>
                  <p className="max-w-md text-blue-100 opacity-90">
                    基于间隔重复算法 (SRS)，我们为您计算了最佳的复习时间点。
                  </p>
                </div>

                <div className="flex items-center gap-4 rounded-card border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                  <div className="border-r border-white/20 px-4 text-center">
                    <p className="mb-1 text-xs text-blue-200">最小间隔</p>
                    <p className="text-lg font-bold">{data.interval.humanReadable.min}</p>
                  </div>
                  <div className="px-4 text-center">
                    <p className="mb-1 text-xs font-bold text-yellow-300">最佳推荐</p>
                    <p className="text-3xl font-bold">{data.interval.humanReadable.optimal}</p>
                  </div>
                  <div className="border-l border-white/20 px-4 text-center">
                    <p className="mb-1 text-xs text-blue-200">最大间隔</p>
                    <p className="text-lg font-bold">{data.interval.humanReadable.max}</p>
                  </div>
                </div>
              </div>

              {/* Decorative Background */}
              <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10">
                <Clock size={200} />
              </div>
            </motion.div>
          )}

          {/* 4. Related Words */}
          <motion.div variants={staggerItemVariants}>
            <RelatedWords
              wordId={currentWordId}
              onSelectWord={setCurrentWordId}
              limit={8}
              variant="card"
            />
          </motion.div>
        </div>
      </motion.div>
    );
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            variants={scaleInVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="单词掌握度详情"
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="absolute right-6 top-6 z-10 rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-white"
            >
              <X size={24} />
            </button>

            {/* Scrollable Content */}
            <div className="custom-scrollbar flex-1 overflow-y-auto">{renderContent()}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
