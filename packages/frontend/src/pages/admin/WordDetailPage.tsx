import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient, {
  WordLearningHistory,
  WordScoreHistory,
  UserLearningHeatmap,
  AnomalyFlag,
} from '../../services/client';
import {
  ArrowLeft,
  ChartBar,
  Clock,
  CheckCircle,
  XCircle,
  Warning,
  WarningCircle,
} from '../../components/Icon';
import { Flag } from '@phosphor-icons/react';
import { useToast } from '../../components/ui';
import { adminLogger } from '../../utils/logger';

export default function WordDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const wordId = searchParams.get('wordId');
  const navigate = useNavigate();
  const toast = useToast();

  const [history, setHistory] = useState<WordLearningHistory | null>(null);
  const [scoreHistory, setScoreHistory] = useState<WordScoreHistory | null>(null);
  const [heatmap, setHeatmap] = useState<UserLearningHeatmap[]>([]);
  const [flags, setFlags] = useState<AnomalyFlag[]>([]);

  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [flagRecordId, setFlagRecordId] = useState<string | undefined>();
  const [flagReason, setFlagReason] = useState('');
  const [flagNotes, setFlagNotes] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);

  useEffect(() => {
    if (userId && wordId) {
      loadData();
    }
  }, [userId, wordId]);

  const loadData = async () => {
    if (!userId || !wordId) return;

    try {
      setError(null);

      // 并行加载所有数据
      const [historyData, scoreData, heatmapData, flagsData] = await Promise.all([
        apiClient.adminGetWordLearningHistory(userId, wordId, 100),
        apiClient.adminGetWordScoreHistory(userId, wordId),
        apiClient.adminGetUserLearningHeatmap(userId, 90),
        apiClient.adminGetAnomalyFlags(userId, wordId),
      ]);

      setHistory(historyData);
      setScoreHistory(scoreData);
      setHeatmap(heatmapData);
      setFlags(flagsData);
    } catch (err) {
      adminLogger.error({ err, userId, wordId }, '加载单词学习详情失败');
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFlagRecord = async () => {
    if (!userId || !wordId || !flagReason.trim()) return;

    try {
      setIsFlagging(true);
      const flag = await apiClient.adminFlagAnomalyRecord(userId, wordId, {
        recordId: flagRecordId,
        reason: flagReason,
        notes: flagNotes,
      });

      setFlags([...flags, flag]);
      setShowFlagDialog(false);
      setFlagRecordId(undefined);
      setFlagReason('');
      setFlagNotes('');
    } catch (err) {
      adminLogger.error({ err, userId, wordId, flagReason }, '标记异常记录失败');
      toast.error(err instanceof Error ? err.message : '标记失败');
    } finally {
      setIsFlagging(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (isLoadingHistory && !history) {
    return (
      <div className="p-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
            <p className="text-gray-600">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !history) {
    return (
      <div className="p-8">
        <div className="py-12 text-center">
          <WarningCircle size={64} weight="fill" className="mx-auto mb-4 text-red-500" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">加载失败</h2>
          <p className="mb-6 text-gray-600">{error}</p>
          <button
            onClick={() => navigate(`/admin/users/${userId}`)}
            className="rounded-button bg-blue-500 px-6 py-3 text-white transition-all hover:bg-blue-600"
          >
            返回用户详情
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-g3-fade-in p-8">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate(`/admin/users/${userId}`)}
        className="mb-6 flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={20} weight="bold" />
        <span>返回用户详情</span>
      </button>

      {/* 单词信息头部 */}
      {history && (
        <div className="mb-8 rounded-card border border-gray-200 bg-white p-8 shadow-soft">
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-6xl font-bold text-gray-900">{history.word.spelling}</h1>
            <p className="text-2xl text-gray-400">{history.word.phonetic}</p>
          </div>

          <div className="mb-6 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* 释义 */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                释义
              </h4>
              <div className="space-y-3">
                {history.word.meanings.map((meaning, index) => (
                  <div key={index} className="flex items-baseline">
                    <span className="mr-4 text-lg font-bold text-blue-500">{index + 1}.</span>
                    <span className="text-lg text-gray-900">{meaning}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 例句 */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                例句
              </h4>
              <div className="space-y-3">
                {history.word.examples.map((example, index) => (
                  <blockquote
                    key={index}
                    className="border-l-4 border-blue-500 py-2 pl-6 italic text-gray-700"
                  >
                    {example}
                  </blockquote>
                ))}
              </div>
            </div>
          </div>

          {/* 当前状态 */}
          {history.wordState && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                当前学习状态
              </h4>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-2xl font-bold text-blue-600">
                    {history.wordState.masteryLevel}
                  </div>
                  <div className="text-sm text-gray-600">掌握程度</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-2xl font-bold text-purple-600">
                    {history.wordState.reviewCount}
                  </div>
                  <div className="text-sm text-gray-600">复习次数</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-2xl font-bold text-green-600">
                    {history.wordState.easeFactor.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">难度因子</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-sm font-medium text-gray-900">
                    {history.wordState.state}
                  </div>
                  <div className="text-sm text-gray-600">学习状态</div>
                </div>
              </div>
            </div>
          )}

          {/* 当前得分 */}
          {history.wordScore && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                当前得分详情
              </h4>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <div className="rounded-button bg-blue-50 p-4">
                  <div className="mb-1 text-2xl font-bold text-blue-600">
                    {history.wordScore.totalScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-gray-600">总分</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-xl font-bold text-gray-700">
                    {history.wordScore.accuracyScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-gray-600">正确率分</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-xl font-bold text-gray-700">
                    {history.wordScore.speedScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-gray-600">速度分</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-xl font-bold text-gray-700">
                    {history.wordScore.stabilityScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-gray-600">稳定性分</div>
                </div>
                <div className="rounded-button bg-gray-50 p-4">
                  <div className="mb-1 text-xl font-bold text-gray-700">
                    {history.wordScore.proficiencyScore.toFixed(0)}
                  </div>
                  <div className="text-sm text-gray-600">熟练度分</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 单词得分曲线图 */}
      {scoreHistory && scoreHistory.scoreHistory.length > 0 && (
        <div className="mb-8 rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <ChartBar size={24} weight="duotone" className="text-blue-500" />
              单词得分变化曲线
            </h2>
            <div className="text-sm text-gray-600">
              当前得分:{' '}
              <span className="font-bold text-blue-600">
                {scoreHistory.currentScore.toFixed(0)}
              </span>
            </div>
          </div>

          {/* 简化的曲线图 - 使用SVG */}
          <div className="relative h-64 rounded-button bg-gray-50 p-4">
            <svg className="h-full w-full" viewBox="0 0 800 200">
              {/* 网格线 */}
              {[0, 25, 50, 75, 100].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={200 - y * 2}
                  x2="800"
                  y2={200 - y * 2}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
              ))}

              {/* 得分曲线 */}
              <polyline
                points={scoreHistory.scoreHistory
                  .map((point, index) => {
                    const x = (index / (scoreHistory.scoreHistory.length - 1)) * 800;
                    const y = 200 - point.score * 2;
                    return `${x},${y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
              />

              {/* 数据点 */}
              {scoreHistory.scoreHistory.map((point, index) => {
                const x = (index / (scoreHistory.scoreHistory.length - 1)) * 800;
                const y = 200 - point.score * 2;
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={point.isCorrect ? '#10b981' : '#ef4444'}
                  />
                );
              })}
            </svg>

            {/* Y轴标签 */}
            <div className="absolute bottom-0 left-0 top-0 flex flex-col justify-between pr-2 text-xs text-gray-500">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span className="text-gray-600">答对</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <span className="text-gray-600">答错</span>
            </div>
          </div>
        </div>
      )}

      {/* 用户学习热力图 */}
      {heatmap.length > 0 && (
        <div className="mb-8 rounded-card border border-gray-200 bg-white p-6 shadow-soft">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-gray-900">
            <Clock size={24} weight="duotone" className="text-orange-500" />
            学习热力图（最近90天）
          </h2>

          <div className="grid grid-cols-7 gap-2">
            {heatmap.slice(-90).map((day) => {
              const intensity = Math.min(day.activityLevel / 20, 1);
              // 使用预定义颜色数组避免Tailwind JIT动态class问题
              const heatmapColors = [
                'bg-gray-100', // intensity = 0
                'bg-blue-100', // intensity <= 0.2
                'bg-blue-200', // intensity <= 0.4
                'bg-blue-300', // intensity <= 0.6
                'bg-blue-400', // intensity <= 0.8
                'bg-blue-500', // intensity <= 1.0
              ];
              const colorIndex = intensity === 0 ? 0 : Math.ceil(intensity * 5);
              const bgColor = heatmapColors[colorIndex];

              return (
                <div
                  key={day.date}
                  className={`aspect-square rounded ${bgColor} group relative cursor-pointer transition-all hover:ring-2 hover:ring-blue-500`}
                  title={`${day.date}\n活跃度: ${day.activityLevel}\n正确率: ${day.accuracy.toFixed(1)}%\n平均得分: ${day.averageScore}`}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 transform group-hover:block">
                    <div className="whitespace-nowrap rounded-button bg-gray-900 px-3 py-2 text-xs text-white">
                      <div>{day.date}</div>
                      <div>活跃度: {day.activityLevel}</div>
                      <div>正确率: {day.accuracy.toFixed(1)}%</div>
                      <div>平均得分: {day.averageScore}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-600">
            <span>活跃度:</span>
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 rounded bg-gray-100"></div>
              <span>低</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 rounded bg-blue-300"></div>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 rounded bg-blue-500"></div>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 rounded bg-blue-700"></div>
              <span>高</span>
            </div>
          </div>
        </div>
      )}

      {/* 完整学习历史 */}
      {history && history.records.length > 0 && (
        <div className="rounded-card border border-gray-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900">完整学习历史</h2>
            <button
              onClick={() => {
                setFlagRecordId(undefined);
                setShowFlagDialog(true);
              }}
              className="flex items-center gap-2 rounded-button bg-yellow-100 px-4 py-2 text-yellow-700 transition-colors hover:bg-yellow-200"
            >
              <Flag size={16} weight="bold" />
              <span>标记异常</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">时间</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    结果
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    选择的答案
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    正确答案
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    响应时间
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    停留时长
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    掌握程度变化
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.records.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(record.timestamp)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {record.isCorrect ? (
                        <CheckCircle size={24} weight="fill" className="mx-auto text-green-500" />
                      ) : (
                        <XCircle size={24} weight="fill" className="mx-auto text-red-500" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{record.selectedAnswer}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{record.correctAnswer}</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                      {formatTime(record.responseTime)}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                      {formatTime(record.dwellTime)}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {record.masteryLevelBefore !== null && record.masteryLevelAfter !== null ? (
                        <span
                          className={`font-medium ${
                            record.masteryLevelAfter > record.masteryLevelBefore
                              ? 'text-green-600'
                              : record.masteryLevelAfter < record.masteryLevelBefore
                                ? 'text-red-600'
                                : 'text-gray-600'
                          }`}
                        >
                          {record.masteryLevelBefore} → {record.masteryLevelAfter}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          setFlagRecordId(record.id);
                          setShowFlagDialog(true);
                        }}
                        className="text-yellow-600 transition-colors hover:text-yellow-700"
                        title="标记此记录"
                      >
                        <Flag size={18} weight="bold" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 异常标记对话框 */}
      {showFlagDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-6">
          <div className="w-full max-w-md animate-g3-slide-up rounded-card bg-white p-8 shadow-floating">
            <div className="mb-6 flex items-center gap-3">
              <Warning size={32} weight="duotone" className="text-yellow-500" />
              <h3 className="text-2xl font-bold text-gray-900">标记异常</h3>
            </div>

            <div className="mb-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">标记原因 *</label>
                <select
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="w-full rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">请选择原因</option>
                  <option value="异常响应时间">异常响应时间</option>
                  <option value="异常停留时长">异常停留时长</option>
                  <option value="掌握程度异常变化">掌握程度异常变化</option>
                  <option value="疑似作弊">疑似作弊</option>
                  <option value="数据异常">数据异常</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">备注</label>
                <textarea
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  placeholder="请输入详细说明..."
                  rows={4}
                  className="w-full resize-none rounded-button border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowFlagDialog(false);
                  setFlagRecordId(undefined);
                  setFlagReason('');
                  setFlagNotes('');
                }}
                className="flex-1 rounded-card bg-gray-100 px-6 py-3 font-medium text-gray-900 transition-all hover:bg-gray-200"
                disabled={isFlagging}
              >
                取消
              </button>
              <button
                onClick={handleFlagRecord}
                disabled={!flagReason.trim() || isFlagging}
                className="flex-1 rounded-card bg-yellow-500 px-6 py-3 font-medium text-white shadow-elevated transition-all hover:bg-yellow-600 hover:shadow-floating disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFlagging ? '标记中...' : '确认标记'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
