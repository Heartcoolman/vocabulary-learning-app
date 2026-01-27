/**
 * VirtualWordList - 虚拟滚动单词列表组件
 *
 * 使用 react-window v2 实现虚拟滚动，优化大量单词列表的渲染性能
 * 只渲染可视区域内的单词项，大幅减少 DOM 节点数量
 */
import { memo, useEffect, createContext, useContext, CSSProperties } from 'react';
import { List, useListCallbackRef, RowComponentProps } from 'react-window';
import { Star, Target, Clock, CheckCircle, Warning, ArrowClockwise } from './Icon';
import { IconColor } from '../utils/iconColors';
import { highlightText } from '../utils/textHighlight';
import {
  ITEM_HEIGHT,
  ITEM_GAP,
  ROW_HEIGHT,
  type WordWithState,
  type VirtualWordListProps,
} from './virtualWordList.types';

// 创建 Context 来传递数据给 Row 组件
interface WordListContextValue {
  words: WordWithState[];
  onAdjustWord: (word: WordWithState, action: 'mastered' | 'needsPractice' | 'reset') => void;
  searchQuery?: string;
}

const WordListContext = createContext<WordListContextValue | null>(null);

/**
 * 单个单词项组件 - 使用 memo 避免不必要的重渲染
 */
const WordItem = memo<{
  word: WordWithState;
  style: CSSProperties;
  onAdjustWord: (word: WordWithState, action: 'mastered' | 'needsPractice' | 'reset') => void;
  searchQuery?: string;
}>(({ word, style, onAdjustWord, searchQuery }) => {
  return (
    <div
      style={{
        ...style,
        height: ITEM_HEIGHT,
        paddingBottom: ITEM_GAP,
      }}
    >
      <div className="h-full rounded-card border border-gray-200/60 bg-white/80 p-6 shadow-soft backdrop-blur-sm transition-all duration-g3-fast hover:scale-[1.01] hover:shadow-elevated dark:border-slate-700/60 dark:bg-slate-800/80">
        <div className="flex h-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* 单词信息 */}
          <div className="flex-1">
            <h3 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
              {highlightText(word.spelling, searchQuery || '')}
            </h3>
            <p className="mb-2 text-gray-600 dark:text-gray-400">/{word.phonetic}/</p>
            <p className="line-clamp-2 text-gray-700 dark:text-gray-300">
              {highlightText(word.meanings[0], searchQuery || '')}
            </p>
          </div>

          {/* 学习状态 */}
          <div className="flex flex-wrap gap-6">
            {/* 掌握程度 */}
            <div className="flex flex-col items-center">
              <span className="mb-1 text-xs text-gray-500 dark:text-gray-400">掌握程度</span>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, index) => (
                  <Star
                    key={index}
                    size={16}
                    weight={index < word.masteryLevel ? 'fill' : 'regular'}
                    color={index < word.masteryLevel ? IconColor.star : IconColor.starEmpty}
                  />
                ))}
              </div>
            </div>

            {/* 单词得分 */}
            <div className="flex flex-col items-center">
              <span className="mb-1 text-xs text-gray-500 dark:text-gray-400">得分</span>
              <div className="flex items-center gap-1">
                <Target size={16} color={IconColor.target} />
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {Math.round(word.score)}
                </span>
              </div>
            </div>

            {/* 下次复习 */}
            <div className="flex flex-col items-center">
              <span className="mb-1 text-xs text-gray-500 dark:text-gray-400">下次复习</span>
              <div className="flex items-center gap-1">
                <Clock size={16} color={IconColor.time} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {word.nextReviewDate}
                </span>
              </div>
            </div>

            {/* 手动调整按钮 */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onAdjustWord(word, 'mastered')}
                className="flex items-center gap-1 rounded-button bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 transition-all duration-g3-fast hover:scale-105 hover:bg-green-200 active:scale-95 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                title="标记为已掌握"
              >
                <CheckCircle size={14} weight="bold" />
                已掌握
              </button>
              <button
                onClick={() => onAdjustWord(word, 'needsPractice')}
                className="flex items-center gap-1 rounded-button bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700 transition-all duration-g3-fast hover:scale-105 hover:bg-yellow-200 active:scale-95 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50"
                title="标记为需要重点学习"
              >
                <Warning size={14} weight="bold" />
                重点学习
              </button>
              <button
                onClick={() => onAdjustWord(word, 'reset')}
                className="flex items-center gap-1 rounded-button bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-g3-fast hover:scale-105 hover:bg-gray-200 active:scale-95 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                title="重置学习进度"
              >
                <ArrowClockwise size={14} />
                重置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

WordItem.displayName = 'WordItem';

/**
 * 行渲染组件 - react-window v2 要求的渲染组件
 */
function Row({ index, style, ariaAttributes }: RowComponentProps<object>) {
  const context = useContext(WordListContext);
  if (!context) {
    return <div {...ariaAttributes} style={style} />;
  }

  const { words, onAdjustWord, searchQuery } = context;
  const word = words[index];

  if (!word) {
    return <div {...ariaAttributes} style={style} />;
  }

  return (
    <div {...ariaAttributes} style={style}>
      <WordItem
        word={word}
        style={{ height: ITEM_HEIGHT, paddingBottom: ITEM_GAP }}
        onAdjustWord={onAdjustWord}
        searchQuery={searchQuery}
      />
    </div>
  );
}

/**
 * 虚拟滚动单词列表
 *
 * @example
 * ```tsx
 * <VirtualWordList
 *   words={filteredWords}
 *   onAdjustWord={handleAdjustWord}
 *   containerHeight={600}
 * />
 * ```
 */
export default function VirtualWordList({
  words,
  onAdjustWord,
  containerHeight = 600,
  searchQuery,
}: VirtualWordListProps) {
  const [listRef, setListRef] = useListCallbackRef();

  // 当单词列表变化时（如搜索/过滤），滚动到顶部
  useEffect(() => {
    if (listRef) {
      listRef.scrollToRow({ index: 0, align: 'start' });
    }
  }, [words, listRef]);

  // 计算动态高度：min(可视区域高度, 内容实际高度)
  const calculatedHeight = Math.min(containerHeight, words.length * ROW_HEIGHT);

  return (
    <WordListContext.Provider value={{ words, onAdjustWord, searchQuery }}>
      <div className="virtual-word-list">
        <List
          listRef={setListRef}
          defaultHeight={calculatedHeight}
          rowCount={words.length}
          rowHeight={ROW_HEIGHT}
          rowComponent={Row}
          rowProps={{}}
          overscanCount={3} // 预渲染3行，提升滚动平滑度
          className="scrollbar-thin scrollbar-track-gray-100 dark:scrollbar-track-slate-800 scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600"
          style={{ width: '100%', height: calculatedHeight }}
        />
      </div>
    </WordListContext.Provider>
  );
}
