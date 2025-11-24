import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient, {
    WordLearningHistory,
    WordScoreHistory,
    UserLearningHeatmap,
    AnomalyFlag,
} from '../../services/ApiClient';
import {
    ArrowLeft,
    ChartBar,
    Clock,
    CheckCircle,
    XCircle,
    Warning,
} from '../../components/Icon';
import { Flag } from '@phosphor-icons/react';

export default function WordDetailPage() {
    const { userId } = useParams<{ userId: string }>();
    const [searchParams] = useSearchParams();
    const wordId = searchParams.get('wordId');
    const navigate = useNavigate();

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
            console.error('加载数据失败:', err);
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
            console.error('标记失败:', err);
            alert(err instanceof Error ? err.message : '标记失败');
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
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                        <p className="text-gray-600">加载中...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !history) {
        return (
            <div className="p-8">
                <div className="text-center py-12">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">加载失败</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate(`/admin/users/${userId}`)}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                    >
                        返回用户详情
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 animate-fade-in">
            {/* 返回按钮 */}
            <button
                onClick={() => navigate(`/admin/users/${userId}`)}
                className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
                <ArrowLeft size={20} weight="bold" />
                <span>返回用户详情</span>
            </button>

            {/* 单词信息头部 */}
            {history && (
                <div className="mb-8 p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="text-center mb-6">
                        <h1 className="text-6xl font-bold text-gray-900 mb-2">
                            {history.word.spelling}
                        </h1>
                        <p className="text-2xl text-gray-400">{history.word.phonetic}</p>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-6"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 释义 */}
                        <div>
                            <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                释义
                            </h4>
                            <div className="space-y-3">
                                {history.word.meanings.map((meaning, index) => (
                                    <div key={index} className="flex items-baseline">
                                        <span className="text-blue-500 font-bold text-lg mr-4">
                                            {index + 1}.
                                        </span>
                                        <span className="text-gray-900 text-lg">{meaning}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 例句 */}
                        <div>
                            <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                例句
                            </h4>
                            <div className="space-y-3">
                                {history.word.examples.map((example, index) => (
                                    <blockquote
                                        key={index}
                                        className="border-l-4 border-blue-500 pl-6 py-2 italic text-gray-700"
                                    >
                                        {example}
                                    </blockquote>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 当前状态 */}
                    {history.wordState && (
                        <div className="mt-8 pt-6 border-t border-gray-200">
                            <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                当前学习状态
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-blue-600 mb-1">
                                        {history.wordState.masteryLevel}
                                    </div>
                                    <div className="text-sm text-gray-600">掌握程度</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-purple-600 mb-1">
                                        {history.wordState.reviewCount}
                                    </div>
                                    <div className="text-sm text-gray-600">复习次数</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-green-600 mb-1">
                                        {history.wordState.easeFactor.toFixed(2)}
                                    </div>
                                    <div className="text-sm text-gray-600">难度因子</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-sm font-medium text-gray-900 mb-1">
                                        {history.wordState.state}
                                    </div>
                                    <div className="text-sm text-gray-600">学习状态</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 当前得分 */}
                    {history.wordScore && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <h4 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4">
                                当前得分详情
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="p-4 bg-blue-50 rounded-lg">
                                    <div className="text-2xl font-bold text-blue-600 mb-1">
                                        {history.wordScore.totalScore.toFixed(0)}
                                    </div>
                                    <div className="text-sm text-gray-600">总分</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xl font-bold text-gray-700 mb-1">
                                        {history.wordScore.accuracyScore.toFixed(0)}
                                    </div>
                                    <div className="text-sm text-gray-600">正确率分</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xl font-bold text-gray-700 mb-1">
                                        {history.wordScore.speedScore.toFixed(0)}
                                    </div>
                                    <div className="text-sm text-gray-600">速度分</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xl font-bold text-gray-700 mb-1">
                                        {history.wordScore.stabilityScore.toFixed(0)}
                                    </div>
                                    <div className="text-sm text-gray-600">稳定性分</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xl font-bold text-gray-700 mb-1">
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
                <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <ChartBar size={24} weight="duotone" className="text-blue-500" />
                            单词得分变化曲线
                        </h2>
                        <div className="text-sm text-gray-600">
                            当前得分: <span className="font-bold text-blue-600">{scoreHistory.currentScore.toFixed(0)}</span>
                        </div>
                    </div>

                    {/* 简化的曲线图 - 使用SVG */}
                    <div className="relative h-64 bg-gray-50 rounded-lg p-4">
                        <svg className="w-full h-full" viewBox="0 0 800 200">
                            {/* 网格线 */}
                            {[0, 25, 50, 75, 100].map((y) => (
                                <line
                                    key={y}
                                    x1="0"
                                    y1={200 - (y * 2)}
                                    x2="800"
                                    y2={200 - (y * 2)}
                                    stroke="#e5e7eb"
                                    strokeWidth="1"
                                />
                            ))}

                            {/* 得分曲线 */}
                            <polyline
                                points={scoreHistory.scoreHistory
                                    .map((point, index) => {
                                        const x = (index / (scoreHistory.scoreHistory.length - 1)) * 800;
                                        const y = 200 - (point.score * 2);
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
                                const y = 200 - (point.score * 2);
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
                        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 pr-2">
                            <span>100</span>
                            <span>75</span>
                            <span>50</span>
                            <span>25</span>
                            <span>0</span>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-gray-600">答对</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-gray-600">答错</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 用户学习热力图 */}
            {heatmap.length > 0 && (
                <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Clock size={24} weight="duotone" className="text-orange-500" />
                        学习热力图（最近90天）
                    </h2>

                    <div className="grid grid-cols-7 gap-2">
                        {heatmap.slice(-90).map((day) => {
                            const intensity = Math.min(day.activityLevel / 20, 1);
                            const bgColor = intensity === 0
                                ? 'bg-gray-100'
                                : `bg-blue-${Math.ceil(intensity * 5) * 100}`;

                            return (
                                <div
                                    key={day.date}
                                    className={`aspect-square rounded ${bgColor} hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer relative group`}
                                    title={`${day.date}\n活跃度: ${day.activityLevel}\n正确率: ${day.accuracy.toFixed(1)}%\n平均得分: ${day.averageScore}`}
                                >
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
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
                            <div className="w-4 h-4 bg-gray-100 rounded"></div>
                            <span>低</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-blue-300 rounded"></div>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-blue-500 rounded"></div>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 bg-blue-700 rounded"></div>
                            <span>高</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 完整学习历史 */}
            {history && history.records.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                    <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">完整学习历史</h2>
                        <button
                            onClick={() => {
                                setFlagRecordId(undefined);
                                setShowFlagDialog(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg transition-colors"
                        >
                            <Flag size={16} weight="bold" />
                            <span>标记异常</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                        时间
                                    </th>
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
                                    <tr
                                        key={record.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {formatDate(record.timestamp)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {record.isCorrect ? (
                                                <CheckCircle
                                                    size={24}
                                                    weight="fill"
                                                    className="text-green-500 mx-auto"
                                                />
                                            ) : (
                                                <XCircle
                                                    size={24}
                                                    weight="fill"
                                                    className="text-red-500 mx-auto"
                                                />
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {record.selectedAnswer}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {record.correctAnswer}
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-gray-600">
                                            {formatTime(record.responseTime)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-gray-600">
                                            {formatTime(record.dwellTime)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm">
                                            {record.masteryLevelBefore !== null &&
                                            record.masteryLevelAfter !== null ? (
                                                <span
                                                    className={`font-medium ${
                                                        record.masteryLevelAfter >
                                                        record.masteryLevelBefore
                                                            ? 'text-green-600'
                                                            : record.masteryLevelAfter <
                                                              record.masteryLevelBefore
                                                            ? 'text-red-600'
                                                            : 'text-gray-600'
                                                    }`}
                                                >
                                                    {record.masteryLevelBefore} →{' '}
                                                    {record.masteryLevelAfter}
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
                                                className="text-yellow-600 hover:text-yellow-700 transition-colors"
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full animate-slide-up">
                        <div className="flex items-center gap-3 mb-6">
                            <Warning size={32} weight="duotone" className="text-yellow-500" />
                            <h3 className="text-2xl font-bold text-gray-900">标记异常</h3>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    标记原因 *
                                </label>
                                <select
                                    value={flagReason}
                                    onChange={(e) => setFlagReason(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    备注
                                </label>
                                <textarea
                                    value={flagNotes}
                                    onChange={(e) => setFlagNotes(e.target.value)}
                                    placeholder="请输入详细说明..."
                                    rows={4}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
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
                                className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-all"
                                disabled={isFlagging}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleFlagRecord}
                                disabled={!flagReason.trim() || isFlagging}
                                className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
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
