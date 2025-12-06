import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  username: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdatePasswordDto {
  oldPassword: string;
  newPassword: string;
}

export interface CreateWordDto {
  spelling: string;
  phonetic: string | null;
  meanings: string[];
  examples: string[];
  audioUrl?: string | null;
}

export interface UpdateWordDto {
  spelling?: string;
  phonetic?: string | null;
  meanings?: string[];
  examples?: string[];
  audioUrl?: string | null;
}

export interface CreateRecordDto {
  wordId: string;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  timestamp?: number;
  responseTime?: number;
  dwellTime?: number;
  sessionId?: string;
  masteryLevelBefore?: number;
  masteryLevelAfter?: number;
}


export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctCount: number;
  accuracy: number;
}

// =============== 词书相关类型 ===============

export interface CreateWordBookDto {
  name: string;
  description?: string;
  coverImage?: string;
}

export interface UpdateWordBookDto {
  name?: string;
  description?: string;
  coverImage?: string;
}

export interface WordBookResponse {
  id: string;
  name: string;
  description: string | null;
  type: 'SYSTEM' | 'USER';
  wordCount: number;
  coverImage: string | null;
  userId: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============== 学习配置相关类型 ===============

export interface StudyConfigDto {
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode?: string;
}

export interface StudyConfigResponse {
  id: string;
  userId: string;
  selectedWordBookIds: string[];
  dailyWordCount: number;
  studyMode: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============== 管理员相关类型 ===============

export interface UserListResponse {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemStatsResponse {
  totalUsers: number;
  activeUsers: number;
  totalWordBooks: number;
  totalWords: number;
  totalRecords: number;
}

export interface UserLearningDataResponse {
  userId: string;
  totalWordsLearned: number;
  totalStudyTime: number;
  averageAccuracy: number;
  recentRecords: AnswerRecordResponse[];
}

export interface AnswerRecordResponse {
  id: string;
  wordId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timestamp: Date;
  word: {
    spelling: string;
    phonetic: string;
    meanings: string[];
  };
}
