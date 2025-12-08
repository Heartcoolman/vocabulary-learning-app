/**
 * AdminClient 单元测试
 *
 * 测试管理员 API 客户端的所有方法
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { AdminClient } from '../AdminClient';

// Mock BaseClient 和 TokenManager
vi.mock('../../base/BaseClient', () => ({
  BaseClient: class MockBaseClient {
    request = vi.fn();
    baseUrl = 'http://localhost:3000';
    tokenManager = {
      getToken: vi.fn().mockReturnValue('mock-token'),
    };
  },
}));

describe('AdminClient', () => {
  let client: AdminClient;
  let mockRequest: Mock;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    role: 'USER' as const,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockApiWordBook = {
    id: 'wb-1',
    name: 'CET-4',
    description: '大学英语四级词汇',
    type: 'SYSTEM' as const,
    isPublic: true,
    wordCount: 4000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockApiWord = {
    id: 'word-1',
    spelling: 'apple',
    phonetic: 'ˈæpl',
    meanings: ['苹果'],
    examples: ['I eat an apple.'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AdminClient();
    mockRequest = (client as unknown as { request: Mock }).request;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== 用户管理 API 测试 ====================

  describe('getUsers', () => {
    it('should fetch users without params', async () => {
      const mockResponse = {
        users: [{ ...mockUser, totalWordsLearned: 100, averageScore: 85, accuracy: 0.9 }],
        total: 1,
        page: 1,
        pageSize: 20,
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.getUsers();

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users');
      expect(result.users).toHaveLength(1);
    });

    it('should fetch users with pagination and search', async () => {
      mockRequest.mockResolvedValue({ users: [], total: 0, pagination: {} });

      await client.getUsers({ page: 2, pageSize: 10, search: 'test' });

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users?page=2&pageSize=10&search=test');
    });
  });

  describe('getUserById', () => {
    it('should fetch a single user by id', async () => {
      mockRequest.mockResolvedValue(mockUser);

      const result = await client.getUserById('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1');
      expect(result.id).toBe('user-1');
    });
  });

  describe('getUserLearningData', () => {
    it('should fetch user learning data', async () => {
      const mockData = {
        user: { id: 'user-1', email: 'test@example.com', username: 'test' },
        totalRecords: 500,
        correctRecords: 400,
        averageAccuracy: 0.8,
        totalWordsLearned: 200,
        recentRecords: [],
      };
      mockRequest.mockResolvedValue(mockData);

      const result = await client.getUserLearningData('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/learning-data');
      expect(result.totalRecords).toBe(500);
    });

    it('should fetch user learning data with limit', async () => {
      mockRequest.mockResolvedValue({ recentRecords: [] });

      await client.getUserLearningData('user-1', 10);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/learning-data?limit=10');
    });
  });

  describe('getUserStatistics', () => {
    it('should fetch user statistics', async () => {
      const mockStats = {
        user: mockUser,
        masteryDistribution: {
          level0: 10,
          level1: 20,
          level2: 30,
          level3: 25,
          level4: 10,
          level5: 5,
        },
        studyDays: 30,
        consecutiveDays: 7,
        totalStudyTime: 3600,
        totalWordsLearned: 500,
        averageScore: 85,
        accuracy: 0.9,
      };
      mockRequest.mockResolvedValue(mockStats);

      const result = await client.getUserStatistics('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/statistics');
      expect(result.studyDays).toBe(30);
    });
  });

  describe('getUserWords', () => {
    it('should fetch user words without params', async () => {
      const mockResponse = {
        words: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.getUserWords('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/words');
      expect(result.words).toEqual([]);
    });

    it('should fetch user words with filters', async () => {
      mockRequest.mockResolvedValue({ words: [], pagination: {} });

      await client.getUserWords('user-1', {
        page: 1,
        pageSize: 10,
        scoreRange: 'low',
        masteryLevel: 2,
        state: 'learning',
        sortBy: 'score',
        sortOrder: 'desc',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/admin/users/user-1/words?page=1&pageSize=10&scoreRange=low&masteryLevel=2&state=learning&sortBy=score&sortOrder=desc',
      );
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      const updatedUser = { ...mockUser, role: 'ADMIN' as const };
      mockRequest.mockResolvedValue(updatedUser);

      const result = await client.updateUserRole('user-1', 'ADMIN');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/role', {
        method: 'PUT',
        body: JSON.stringify({ role: 'ADMIN' }),
      });
      expect(result.role).toBe('ADMIN');
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      mockRequest.mockResolvedValue(undefined);

      await client.deleteUser('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1', {
        method: 'DELETE',
      });
    });
  });

  // ==================== 系统词书管理 API 测试 ====================

  describe('getSystemWordBooks', () => {
    it('should fetch system word books', async () => {
      mockRequest.mockResolvedValue([mockApiWordBook]);

      const result = await client.getSystemWordBooks();

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks');
      expect(result).toHaveLength(1);
      expect(typeof result[0].createdAt).toBe('number'); // 验证日期转换
    });
  });

  describe('createSystemWordBook', () => {
    it('should create a system word book', async () => {
      const newBook = { name: 'New Book', description: 'A new book' };
      mockRequest.mockResolvedValue({ ...mockApiWordBook, ...newBook });

      const result = await client.createSystemWordBook(newBook);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks', {
        method: 'POST',
        body: JSON.stringify(newBook),
      });
      expect(result.name).toBe('New Book');
    });
  });

  describe('updateSystemWordBook', () => {
    it('should update a system word book', async () => {
      const updates = { name: 'Updated Name' };
      mockRequest.mockResolvedValue({ ...mockApiWordBook, ...updates });

      const result = await client.updateSystemWordBook('wb-1', updates);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks/wb-1', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('deleteSystemWordBook', () => {
    it('should delete a system word book', async () => {
      mockRequest.mockResolvedValue(undefined);

      await client.deleteSystemWordBook('wb-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks/wb-1', {
        method: 'DELETE',
      });
    });
  });

  describe('batchAddWordsToSystemWordBook', () => {
    it('should batch add words to a word book', async () => {
      const words = [{ spelling: 'test', phonetic: 't', meanings: ['测试'], examples: [] }];
      mockRequest.mockResolvedValue([mockApiWord]);

      const result = await client.batchAddWordsToSystemWordBook('wb-1', words);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/wordbooks/wb-1/words/batch', {
        method: 'POST',
        body: JSON.stringify({ words }),
      });
      expect(result).toHaveLength(1);
    });
  });

  // ==================== 系统统计 API 测试 ====================

  describe('getStatistics', () => {
    it('should fetch admin statistics', async () => {
      const mockStats = {
        totalUsers: 1000,
        totalWords: 50000,
        totalRecords: 500000,
        totalWordBooks: 10,
        activeUsers: 500,
        systemWordBooks: 5,
        userWordBooks: 5,
      };
      mockRequest.mockResolvedValue(mockStats);

      const result = await client.getStatistics();

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/statistics');
      expect(result.totalUsers).toBe(1000);
    });
  });

  // ==================== 单词学习历史 API 测试 ====================

  describe('getWordLearningHistory', () => {
    it('should fetch word learning history', async () => {
      const mockHistory = {
        word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: [], examples: [] },
        wordState: null,
        wordScore: null,
        records: [],
      };
      mockRequest.mockResolvedValue(mockHistory);

      const result = await client.getWordLearningHistory('user-1', 'word-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/words/word-1/history');
      expect(result.word.spelling).toBe('apple');
    });

    it('should fetch word learning history with limit', async () => {
      mockRequest.mockResolvedValue({ records: [] });

      await client.getWordLearningHistory('user-1', 'word-1', 20);

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/admin/users/user-1/words/word-1/history?limit=20',
      );
    });
  });

  describe('getWordScoreHistory', () => {
    it('should fetch word score history', async () => {
      const mockHistory = {
        currentScore: 85,
        scoreHistory: [],
      };
      mockRequest.mockResolvedValue(mockHistory);

      const result = await client.getWordScoreHistory('user-1', 'word-1');

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/admin/users/user-1/words/word-1/score-history',
      );
      expect(result.currentScore).toBe(85);
    });
  });

  describe('getUserLearningHeatmap', () => {
    it('should fetch user learning heatmap', async () => {
      const mockHeatmap = [
        { date: '2024-01-01', activityLevel: 3, accuracy: 0.9, averageScore: 85, uniqueWords: 20 },
      ];
      mockRequest.mockResolvedValue(mockHeatmap);

      const result = await client.getUserLearningHeatmap('user-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/heatmap');
      expect(result).toHaveLength(1);
    });

    it('should fetch heatmap with days parameter', async () => {
      mockRequest.mockResolvedValue([]);

      await client.getUserLearningHeatmap('user-1', 30);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/heatmap?days=30');
    });
  });

  // ==================== 异常标记 API 测试 ====================

  describe('flagAnomalyRecord', () => {
    it('should flag an anomaly record', async () => {
      const flagData = { reason: 'Suspicious activity', notes: 'Check this' };
      const mockFlag = {
        id: 'flag-1',
        userId: 'user-1',
        wordId: 'word-1',
        reason: 'Suspicious activity',
        notes: 'Check this',
        flaggedBy: 'admin',
        flaggedAt: '2024-01-01T00:00:00Z',
      };
      mockRequest.mockResolvedValue(mockFlag);

      const result = await client.flagAnomalyRecord('user-1', 'word-1', flagData);

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/words/word-1/flag', {
        method: 'POST',
        body: JSON.stringify(flagData),
      });
      expect(result.reason).toBe('Suspicious activity');
    });
  });

  describe('getAnomalyFlags', () => {
    it('should fetch anomaly flags', async () => {
      mockRequest.mockResolvedValue([]);

      const result = await client.getAnomalyFlags('user-1', 'word-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/words/word-1/flags');
      expect(result).toEqual([]);
    });
  });

  // ==================== 决策 API 测试 ====================

  describe('getUserDecisions', () => {
    it('should fetch user decisions', async () => {
      mockRequest.mockResolvedValue({ decisions: [], total: 0 });

      await client.getUserDecisions('user-1', {
        page: 1,
        pageSize: 20,
        startDate: '2024-01-01',
        decisionSource: 'AMAS',
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });

      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getDecisionDetail', () => {
    it('should fetch decision detail', async () => {
      mockRequest.mockResolvedValue({ id: 'decision-1' });

      await client.getDecisionDetail('user-1', 'decision-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/admin/users/user-1/decisions/decision-1');
    });
  });

  // ==================== 优化 API 测试 ====================

  describe('getOptimizationSuggestion', () => {
    it('should fetch optimization suggestion', async () => {
      const mockSuggestion = {
        params: { learningRate: 0.01 },
        paramSpace: { learningRate: { min: 0.001, max: 0.1, step: 0.001 } },
      };
      mockRequest.mockResolvedValue(mockSuggestion);

      const result = await client.getOptimizationSuggestion();

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/suggest');
      expect(result.params.learningRate).toBe(0.01);
    });
  });

  describe('recordOptimizationEvaluation', () => {
    it('should record optimization evaluation', async () => {
      mockRequest.mockResolvedValue({ recorded: true });

      const result = await client.recordOptimizationEvaluation({ learningRate: 0.01 }, 0.85);

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/evaluate', {
        method: 'POST',
        body: JSON.stringify({ params: { learningRate: 0.01 }, value: 0.85 }),
      });
      expect(result.recorded).toBe(true);
    });
  });

  describe('getBestOptimizationParams', () => {
    it('should fetch best optimization params', async () => {
      const mockBest = { params: { learningRate: 0.01 }, value: 0.95 };
      mockRequest.mockResolvedValue(mockBest);

      const result = await client.getBestOptimizationParams();

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/best');
      expect(result.value).toBe(0.95);
    });
  });

  describe('getOptimizationHistory', () => {
    it('should fetch optimization history', async () => {
      mockRequest.mockResolvedValue([]);

      const result = await client.getOptimizationHistory();

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/history');
      expect(result).toEqual([]);
    });
  });

  describe('triggerOptimization', () => {
    it('should trigger optimization', async () => {
      mockRequest.mockResolvedValue({ triggered: true });

      const result = await client.triggerOptimization();

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/trigger', { method: 'POST' });
      expect(result.triggered).toBe(true);
    });
  });

  describe('resetOptimizer', () => {
    it('should reset optimizer', async () => {
      mockRequest.mockResolvedValue({ reset: true });

      const result = await client.resetOptimizer();

      expect(mockRequest).toHaveBeenCalledWith('/api/optimization/reset', { method: 'POST' });
      expect(result.reset).toBe(true);
    });
  });

  // ==================== 因果推断 API 测试 ====================

  describe('recordCausalObservation', () => {
    it('should record causal observation', async () => {
      const mockResult = { id: 'obs-1', treatment: 1, outcome: 0.85, timestamp: '2024-01-01' };
      mockRequest.mockResolvedValue(mockResult);

      const result = await client.recordCausalObservation({
        features: [0.5, 0.3, 0.2],
        treatment: 1,
        outcome: 0.85,
      });

      expect(mockRequest).toHaveBeenCalledWith('/api/evaluation/causal/observe', {
        method: 'POST',
        body: expect.any(String),
      });
      expect(result?.treatment).toBe(1);
    });
  });

  describe('getCausalATE', () => {
    it('should fetch average treatment effect', async () => {
      const mockATE = { ate: 0.15, confidence: 0.95, sampleSize: 1000 };
      mockRequest.mockResolvedValue(mockATE);

      const result = await client.getCausalATE();

      expect(mockRequest).toHaveBeenCalledWith('/api/evaluation/causal/ate');
      expect(result.ate).toBe(0.15);
    });
  });

  describe('compareStrategies', () => {
    it('should compare two strategies', async () => {
      const mockComparison = { difference: 0.1, pValue: 0.03, significant: true };
      mockRequest.mockResolvedValue(mockComparison);

      const result = await client.compareStrategies(0, 1);

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/evaluation/causal/compare?strategyA=0&strategyB=1',
      );
      expect(result.significant).toBe(true);
    });
  });

  // ==================== 实验 API 测试 ====================

  describe('createExperiment', () => {
    it('should create an experiment', async () => {
      const experimentData = {
        name: 'Test Experiment',
        trafficAllocation: 'EVEN' as const,
        minSampleSize: 100,
        significanceLevel: 0.05,
        minimumDetectableEffect: 0.1,
        autoDecision: false,
        variants: [
          { id: 'v1', name: 'Control', weight: 0.5, isControl: true, parameters: {} },
          { id: 'v2', name: 'Treatment', weight: 0.5, isControl: false, parameters: {} },
        ],
      };
      mockRequest.mockResolvedValue({ id: 'exp-1', name: 'Test Experiment' });

      const result = await client.createExperiment(experimentData);

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments', {
        method: 'POST',
        body: JSON.stringify(experimentData),
      });
      expect(result.id).toBe('exp-1');
    });
  });

  describe('getExperiments', () => {
    it('should fetch experiments without params', async () => {
      mockRequest.mockResolvedValue({ experiments: [], total: 0 });

      const result = await client.getExperiments();

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments');
      expect(result.experiments).toEqual([]);
    });

    it('should fetch experiments with filters', async () => {
      mockRequest.mockResolvedValue({ experiments: [], total: 0 });

      await client.getExperiments({ status: 'RUNNING', page: 1, pageSize: 10 });

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/experiments?status=RUNNING&page=1&pageSize=10',
      );
    });
  });

  describe('getExperiment', () => {
    it('should fetch experiment detail', async () => {
      const mockExperiment = {
        id: 'exp-1',
        name: 'Test',
        status: 'RUNNING',
        variants: [],
        metrics: [],
      };
      mockRequest.mockResolvedValue(mockExperiment);

      const result = await client.getExperiment('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments/exp-1');
      expect(result.id).toBe('exp-1');
    });
  });

  describe('startExperiment', () => {
    it('should start an experiment', async () => {
      mockRequest.mockResolvedValue({ message: 'Experiment started' });

      const result = await client.startExperiment('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments/exp-1/start', { method: 'POST' });
      expect(result.message).toBe('Experiment started');
    });
  });

  describe('stopExperiment', () => {
    it('should stop an experiment', async () => {
      mockRequest.mockResolvedValue({ message: 'Experiment stopped' });

      const result = await client.stopExperiment('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments/exp-1/stop', { method: 'POST' });
      expect(result.message).toBe('Experiment stopped');
    });
  });

  describe('deleteExperiment', () => {
    it('should delete an experiment', async () => {
      mockRequest.mockResolvedValue({ message: 'Experiment deleted' });

      const result = await client.deleteExperiment('exp-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/experiments/exp-1', { method: 'DELETE' });
      expect(result.message).toBe('Experiment deleted');
    });
  });
});
