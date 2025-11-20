import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
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
}

export interface UserStatistics {
  totalWords: number;
  totalRecords: number;
  correctCount: number;
  accuracy: number;
}
