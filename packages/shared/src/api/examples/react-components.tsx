/**
 * React组件使用示例
 */

import React, { useEffect } from 'react';
import {
  useRealtimeConnection,
  useRealtimeEvent,
  useWordState,
  useDueWords,
  useUserProfile,
  useHabitProfile,
  useUserLearningStats,
} from '@danci/shared/api/hooks';
import { realtimeAdapter, learningStateAdapter, userProfileAdapter } from './basic-usage';

// ==================== 示例1: SSE实时反馈 ====================

export function RealtimeFeedbackComponent({ sessionId }: { sessionId: string }) {
  // 建立SSE连接
  const { isConnected, isConnecting, error, connect, disconnect } = useRealtimeConnection(
    realtimeAdapter,
    {
      sessionId,
      eventTypes: ['feedback', 'alert'],
      autoConnect: true,
      autoReconnect: true,
    },
  );

  // 监听反馈事件
  const { latestEvent: feedback, events: feedbacks } = useRealtimeEvent(
    realtimeAdapter,
    'feedback',
    {
      maxHistory: 50,
      onEvent: (event) => {
        console.log('收到反馈:', event.payload);
      },
    },
  );

  // 监听警报事件
  const { latestEvent: alert, events: alerts } = useRealtimeEvent(realtimeAdapter, 'alert', {
    maxHistory: 20,
  });

  return (
    <div className="realtime-feedback">
      <div className="connection-status">
        {isConnecting && <span>连接中...</span>}
        {isConnected && <span className="status-connected">✓ 已连接</span>}
        {error && <span className="status-error">✗ 连接错误: {error.message}</span>}
      </div>

      <div className="actions">
        <button onClick={connect} disabled={isConnected}>
          连接
        </button>
        <button onClick={disconnect} disabled={!isConnected}>
          断开
        </button>
      </div>

      {feedback && (
        <div className="latest-feedback">
          <h3>最新反馈</h3>
          <p>类型: {feedback.payload.feedbackType}</p>
          <p>消息: {feedback.payload.message}</p>
          <p>得分变化: {feedback.payload.scoreChange}</p>
        </div>
      )}

      <div className="feedback-history">
        <h3>反馈历史 ({feedbacks.length})</h3>
        <ul>
          {feedbacks.map((event, index) => (
            <li key={index}>
              {event.payload.message} - {event.payload.timestamp}
            </li>
          ))}
        </ul>
      </div>

      {alert && (
        <div className={`alert alert-${alert.payload.alertType}`}>
          <h4>{alert.payload.title}</h4>
          <p>{alert.payload.content}</p>
        </div>
      )}
    </div>
  );
}

// ==================== 示例2: 单词学习状态 ====================

export function WordStateComponent({ userId, wordId }: { userId: string; wordId: string }) {
  const { data, loading, error, refresh, updateState } = useWordState(
    learningStateAdapter,
    userId,
    wordId,
    true, // 包含掌握度评估
  );

  const handleReview = async (isCorrect: boolean) => {
    await updateState({
      state: 'REVIEWING',
      reviewCount: (data?.learningState?.reviewCount || 0) + 1,
      lastReviewDate: new Date().toISOString(),
    });
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error">错误: {error.message}</div>;
  }

  if (!data) {
    return <div className="empty">暂无数据</div>;
  }

  return (
    <div className="word-state">
      <h3>单词状态</h3>

      <div className="learning-state">
        <p>状态: {data.learningState?.state}</p>
        <p>掌握度等级: {data.learningState?.masteryLevel}</p>
        <p>复习次数: {data.learningState?.reviewCount}</p>
        <p>
          上次复习:{' '}
          {data.learningState?.lastReviewDate
            ? new Date(data.learningState.lastReviewDate).toLocaleString()
            : '未复习'}
        </p>
      </div>

      {data.score && (
        <div className="score">
          <p>总分: {data.score.totalScore}</p>
        </div>
      )}

      {data.mastery && (
        <div className="mastery">
          <h4>掌握度评估</h4>
          <p>评分: {data.mastery.score.toFixed(2)}</p>
          <p>置信度: {data.mastery.confidence.toFixed(2)}</p>
          <p>是否已掌握: {data.mastery.isLearned ? '是' : '否'}</p>
          <p>推荐: {data.mastery.recommendation}</p>

          <div className="factors">
            <h5>评估因素</h5>
            <ul>
              <li>复习次数: {data.mastery.factors.reviewCount}</li>
              <li>正确率: {(data.mastery.factors.correctRate * 100).toFixed(1)}%</li>
              <li>平均响应时间: {data.mastery.factors.avgResponseTime}ms</li>
              <li>ACT-R回忆概率: {(data.mastery.factors.actrRecall * 100).toFixed(1)}%</li>
            </ul>
          </div>
        </div>
      )}

      <div className="actions">
        <button onClick={() => handleReview(true)}>正确</button>
        <button onClick={() => handleReview(false)}>错误</button>
        <button onClick={refresh}>刷新</button>
      </div>
    </div>
  );
}

// ==================== 示例3: 需要复习的单词列表 ====================

export function DueWordsComponent({ userId }: { userId: string }) {
  const { data, loading, error, refresh } = useDueWords(learningStateAdapter, userId);

  useEffect(() => {
    // 每5分钟刷新一次
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error">错误: {error.message}</div>;
  }

  return (
    <div className="due-words">
      <div className="header">
        <h3>需要复习的单词</h3>
        <button onClick={refresh}>刷新</button>
      </div>

      <p>共 {data?.length || 0} 个单词需要复习</p>

      <ul className="word-list">
        {data?.map((word) => (
          <li key={word.wordId} className={`word-item state-${word.state}`}>
            <span className="word-id">{word.wordId}</span>
            <span className="state">{word.state}</span>
            <span className="mastery-level">等级: {word.masteryLevel}</span>
            <span className="review-count">复习次数: {word.reviewCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==================== 示例4: 用户画像展示 ====================

export function UserProfileComponent({ userId }: { userId: string }) {
  const { data, loading, error, refresh } = useUserProfile(userProfileAdapter, userId, {
    includeHabit: true,
    includeCognitive: true,
    includeLearning: true,
  });

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error">错误: {error.message}</div>;
  }

  if (!data) {
    return <div className="empty">暂无数据</div>;
  }

  return (
    <div className="user-profile">
      <div className="header">
        <h2>用户画像</h2>
        <button onClick={refresh}>刷新</button>
      </div>

      <div className="user-info">
        <h3>基本信息</h3>
        <p>用户名: {data.user.username}</p>
        <p>邮箱: {data.user.email}</p>
        <p>角色: {data.user.role}</p>
      </div>

      {data.habitProfile && (
        <div className="habit-profile">
          <h3>习惯画像</h3>
          <p>学习节奏: {data.habitProfile.rhythmPref.sessionMedianMinutes}分钟/次</p>
          <p>每次学习: {data.habitProfile.rhythmPref.batchMedian}个单词</p>

          <div className="time-preference">
            <h4>时间偏好</h4>
            <div className="time-chart">
              {data.habitProfile.timePref.preferredTimes.map((value, hour) => (
                <div
                  key={hour}
                  className="time-bar"
                  style={{ height: `${value * 10}px` }}
                  title={`${hour}:00 - 偏好度: ${value}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {data.cognitiveProfile.chronotype && (
        <div className="chronotype">
          <h3>时间节律</h3>
          <p>类型: {data.cognitiveProfile.chronotype.type}</p>
          <p>置信度: {(data.cognitiveProfile.chronotype.confidence * 100).toFixed(1)}%</p>
          <p>峰值时段: {data.cognitiveProfile.chronotype.peakHours.join(', ')}</p>
          <p>分析: {data.cognitiveProfile.chronotype.analysis}</p>
        </div>
      )}

      {data.cognitiveProfile.learningStyle && (
        <div className="learning-style">
          <h3>学习风格</h3>
          <p>主导风格: {data.cognitiveProfile.learningStyle.dominantStyle}</p>
          <p>置信度: {(data.cognitiveProfile.learningStyle.confidence * 100).toFixed(1)}%</p>

          <div className="style-scores">
            <h4>风格评分</h4>
            {Object.entries(data.cognitiveProfile.learningStyle.styleScores).map(
              ([style, score]) => (
                <div key={style} className="style-score">
                  <span>{style}:</span>
                  <span>{(score * 100).toFixed(1)}%</span>
                </div>
              ),
            )}
          </div>

          <div className="recommendations">
            <h4>建议</h4>
            <ul>
              {data.cognitiveProfile.learningStyle.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data.learningProfile && (
        <div className="learning-profile">
          <h3>学习档案</h3>
          <p>注意力: {(data.learningProfile.attention * 100).toFixed(1)}%</p>
          <p>疲劳度: {(data.learningProfile.fatigue * 100).toFixed(1)}%</p>
          <p>动机: {(data.learningProfile.motivation * 100).toFixed(1)}%</p>
          <p>情绪基线: {data.learningProfile.emotionBaseline}</p>
          <p>心流得分: {(data.learningProfile.flowScore * 100).toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}

// ==================== 示例5: 学习统计仪表板 ====================

export function LearningStatsDashboard({ userId }: { userId: string }) {
  const { data, loading, error, refresh } = useUserLearningStats(learningStateAdapter, userId);

  if (loading) {
    return <div className="loading">加载统计数据...</div>;
  }

  if (error) {
    return <div className="error">加载失败: {error.message}</div>;
  }

  if (!data) {
    return <div className="empty">暂无统计数据</div>;
  }

  return (
    <div className="learning-stats-dashboard">
      <div className="header">
        <h2>学习统计</h2>
        <button onClick={refresh}>刷新</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>单词状态</h3>
          <div className="stat-item">
            <span>总单词数:</span>
            <span className="value">{data.stateStats.totalWords}</span>
          </div>
          <div className="stat-item">
            <span>新单词:</span>
            <span className="value">{data.stateStats.newWords}</span>
          </div>
          <div className="stat-item">
            <span>学习中:</span>
            <span className="value">{data.stateStats.learningWords}</span>
          </div>
          <div className="stat-item">
            <span>复习中:</span>
            <span className="value">{data.stateStats.reviewingWords}</span>
          </div>
          <div className="stat-item">
            <span>已掌握:</span>
            <span className="value highlight">{data.stateStats.masteredWords}</span>
          </div>
        </div>

        <div className="stat-card">
          <h3>得分统计</h3>
          <div className="stat-item">
            <span>平均得分:</span>
            <span className="value">{data.scoreStats.averageScore.toFixed(1)}</span>
          </div>
          <div className="stat-item">
            <span>高分单词:</span>
            <span className="value success">{data.scoreStats.highScoreCount}</span>
          </div>
          <div className="stat-item">
            <span>中等得分:</span>
            <span className="value">{data.scoreStats.mediumScoreCount}</span>
          </div>
          <div className="stat-item">
            <span>低分单词:</span>
            <span className="value warning">{data.scoreStats.lowScoreCount}</span>
          </div>
        </div>

        <div className="stat-card">
          <h3>掌握度统计</h3>
          <div className="stat-item">
            <span>平均掌握度:</span>
            <span className="value">{(data.masteryStats.averageScore * 100).toFixed(1)}%</span>
          </div>
          <div className="stat-item">
            <span>平均回忆率:</span>
            <span className="value">{(data.masteryStats.averageRecall * 100).toFixed(1)}%</span>
          </div>
          <div className="stat-item">
            <span>需要复习:</span>
            <span className="value warning">{data.masteryStats.needReviewCount}</span>
          </div>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-label">
          <span>学习进度</span>
          <span>
            {((data.stateStats.masteredWords / data.stateStats.totalWords) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${(data.stateStats.masteredWords / data.stateStats.totalWords) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
