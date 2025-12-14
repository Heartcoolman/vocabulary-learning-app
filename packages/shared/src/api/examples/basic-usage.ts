/**
 * API适配器基础使用示例
 */

import {
  createApiClient,
  createRealtimeAdapter,
  createLearningStateAdapter,
  createUserProfileAdapter,
} from '@danci/shared/api';

// ==================== 1. 创建API客户端 ====================

export const apiClient = createApiClient({
  baseURL: '/api',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  enableLog: process.env.NODE_ENV === 'development',
  getToken: () => {
    return localStorage.getItem('auth_token');
  },
});

// ==================== 2. 添加拦截器 ====================

// 请求拦截器：添加自定义请求头
apiClient.addRequestInterceptor(async (config) => {
  config.headers = {
    ...config.headers,
    'X-Client-Version': '1.0.0',
    'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  };
  return config;
});

// 响应拦截器：处理响应数据
apiClient.addResponseInterceptor(async (response) => {
  // 检查API版本警告
  if (response.data && 'deprecated' in response.data) {
    console.warn('[API Deprecated]', response.data);
  }
  return response;
});

// 错误拦截器：统一错误处理
apiClient.addErrorInterceptor(async (error) => {
  switch (error.status) {
    case 401:
      // 未授权，跳转到登录页
      console.error('未授权，请重新登录');
      window.location.href = '/login';
      break;

    case 403:
      // 禁止访问
      console.error('禁止访问');
      break;

    case 404:
      // 资源不存在
      console.error('资源不存在');
      break;

    case 429:
      // 请求过于频繁
      console.error('请求过于频繁，请稍后再试');
      break;

    case 500:
    case 502:
    case 503:
      // 服务器错误
      console.error('服务器错误，请稍后重试');
      break;

    default:
      console.error('请求失败:', error.message);
  }

  return error;
});

// ==================== 3. 创建适配器 ====================

export const realtimeAdapter = createRealtimeAdapter(apiClient);
export const learningStateAdapter = createLearningStateAdapter(apiClient);
export const userProfileAdapter = createUserProfileAdapter(apiClient);

// ==================== 4. 基础使用示例 ====================

/**
 * 示例1: 获取单词学习状态
 */
export async function getWordStateExample(userId: string, wordId: string) {
  try {
    const state = await learningStateAdapter.getWordState(userId, wordId, true);

    console.log('学习状态:', state.learningState);
    console.log('得分:', state.score);
    console.log('掌握度:', state.mastery);

    return state;
  } catch (error) {
    console.error('获取单词状态失败:', error);
    throw error;
  }
}

/**
 * 示例2: 批量获取单词状态
 */
export async function batchGetWordStatesExample(userId: string, wordIds: string[]) {
  try {
    const states = await learningStateAdapter.batchGetWordStates(userId, wordIds, true);

    console.log(`成功获取 ${Object.keys(states).length} 个单词状态`);

    for (const [wordId, state] of Object.entries(states)) {
      console.log(`单词 ${wordId}:`, state.learningState?.state);
    }

    return states;
  } catch (error) {
    console.error('批量获取单词状态失败:', error);
    throw error;
  }
}

/**
 * 示例3: 更新单词状态
 */
export async function updateWordStateExample(userId: string, wordId: string, isCorrect: boolean) {
  try {
    // 更新学习状态
    await learningStateAdapter.updateWordState(userId, wordId, {
      state: 'REVIEWING',
      reviewCount: 1,
      lastReviewDate: new Date().toISOString(),
    });

    // 更新得分
    await learningStateAdapter.updateWordScore(userId, wordId, {
      isCorrect,
      responseTime: 2500,
    });

    // 记录复习事件
    await learningStateAdapter.recordReview(userId, wordId, {
      timestamp: Date.now(),
      isCorrect,
      responseTime: 2500,
    });

    console.log('单词状态更新成功');
  } catch (error) {
    console.error('更新单词状态失败:', error);
    throw error;
  }
}

/**
 * 示例4: 获取用户画像
 */
export async function getUserProfileExample(userId: string) {
  try {
    const profile = await userProfileAdapter.getUserProfile(userId, {
      includeHabit: true,
      includeCognitive: true,
      includeLearning: true,
    });

    console.log('用户信息:', profile.user);
    console.log('习惯画像:', profile.habitProfile);
    console.log('认知画像:', profile.cognitiveProfile);
    console.log('学习档案:', profile.learningProfile);

    return profile;
  } catch (error) {
    console.error('获取用户画像失败:', error);
    throw error;
  }
}

/**
 * 示例5: 建立SSE连接
 */
export function connectRealtimeExample(sessionId: string) {
  try {
    // 连接到SSE流
    realtimeAdapter.connect({
      sessionId,
      eventTypes: ['feedback', 'alert', 'flow-update'],
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatTimeout: 60000,
    });

    // 监听反馈事件
    realtimeAdapter.on('feedback', (event) => {
      console.log('收到反馈:', event.payload);
    });

    // 监听警报事件
    realtimeAdapter.on('alert', (event) => {
      console.log('收到警报:', event.payload);
    });

    // 监听流程更新事件
    realtimeAdapter.on('flow-update', (event) => {
      console.log('流程更新:', event.payload);
    });

    // 监听所有事件
    realtimeAdapter.onAll((event) => {
      console.log('收到事件:', event.type, event);
    });

    console.log('SSE连接已建立');

    // 返回断开连接函数
    return () => {
      realtimeAdapter.disconnect();
      console.log('SSE连接已断开');
    };
  } catch (error) {
    console.error('建立SSE连接失败:', error);
    throw error;
  }
}

/**
 * 示例6: 请求取消
 */
export async function cancellableRequestExample(userId: string) {
  const controller = new AbortController();

  try {
    // 5秒后自动取消
    setTimeout(() => controller.abort(), 5000);

    const stats = await learningStateAdapter.getUserLearningStats(userId, {
      signal: controller.signal,
    });

    console.log('统计信息:', stats);
    return stats;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
    } else {
      console.error('请求失败:', error);
    }
    throw error;
  }
}

/**
 * 示例7: 错误处理
 */
export async function errorHandlingExample(userId: string, wordId: string) {
  try {
    const state = await learningStateAdapter.getWordState(userId, wordId, true);
    return state;
  } catch (error) {
    // 使用类型守卫检查错误类型
    if (error instanceof Error) {
      if (error.name === 'ApiError') {
        const apiError = error as any;
        console.error('API错误:', {
          code: apiError.code,
          status: apiError.status,
          message: apiError.message,
        });
      } else if (error.name === 'NetworkError') {
        console.error('网络错误，请检查网络连接');
      } else {
        console.error('未知错误:', error.message);
      }
    }
    throw error;
  }
}
