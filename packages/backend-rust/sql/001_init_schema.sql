-- 001_init_schema.sql
-- PostgreSQL 初始化 schema - 创建所有基础表

-- ============================================
-- 枚举类型
-- ============================================

DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "WordLearningState" AS ENUM ('NEW', 'LEARNING', 'REVIEWING', 'MASTERED', 'FORGOTTEN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SessionType" AS ENUM ('NORMAL', 'REVIEW', 'QUICK', 'TEST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "WordBookType" AS ENUM ('SYSTEM', 'USER', 'SHARED', 'IMPORTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- 用户与认证
-- ============================================

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "rewardProfile" TEXT DEFAULT 'standard',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");

CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token" TEXT UNIQUE NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_sessions_userId" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "idx_sessions_token" ON "sessions"("token");
CREATE INDEX IF NOT EXISTS "idx_sessions_expiresAt" ON "sessions"("expiresAt");

-- ============================================
-- 词库与单词
-- ============================================

CREATE TABLE IF NOT EXISTS "word_books" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "WordBookType" NOT NULL DEFAULT 'USER',
    "userId" TEXT,
    "isPublic" BOOLEAN DEFAULT false,
    "wordCount" INTEGER DEFAULT 0,
    "coverImage" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_word_books_userId" ON "word_books"("userId");
CREATE INDEX IF NOT EXISTS "idx_word_books_type" ON "word_books"("type");

CREATE TABLE IF NOT EXISTS "words" (
    "id" TEXT PRIMARY KEY,
    "spelling" TEXT NOT NULL,
    "phonetic" TEXT NOT NULL,
    "meanings" TEXT[] NOT NULL DEFAULT '{}',
    "examples" TEXT[] NOT NULL DEFAULT '{}',
    "audioUrl" TEXT,
    "wordBookId" TEXT NOT NULL REFERENCES "word_books"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("wordBookId", "spelling")
);

CREATE INDEX IF NOT EXISTS "idx_words_wordBookId" ON "words"("wordBookId");
CREATE INDEX IF NOT EXISTS "idx_words_spelling" ON "words"("spelling");

-- ============================================
-- 学习记录
-- ============================================

CREATE TABLE IF NOT EXISTS "answer_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    "dwellTime" INTEGER,
    "masteryLevelAfter" INTEGER,
    "masteryLevelBefore" INTEGER,
    "responseTime" INTEGER,
    "sessionId" TEXT,
    PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_answer_records_userId" ON "answer_records"("userId");
CREATE INDEX IF NOT EXISTS "idx_answer_records_wordId" ON "answer_records"("wordId");
CREATE INDEX IF NOT EXISTS "idx_answer_records_timestamp" ON "answer_records"("timestamp" DESC);

CREATE TABLE IF NOT EXISTS "user_study_configs" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT UNIQUE NOT NULL,
    "selectedWordBookIds" TEXT[] NOT NULL DEFAULT '{}',
    "dailyWordCount" INTEGER DEFAULT 20,
    "studyMode" TEXT DEFAULT 'sequential',
    "dailyMasteryTarget" INTEGER DEFAULT 20,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "word_learning_states" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "state" "WordLearningState" DEFAULT 'NEW',
    "masteryLevel" INTEGER DEFAULT 0,
    "easeFactor" DOUBLE PRECISION DEFAULT 2.5,
    "reviewCount" INTEGER DEFAULT 0,
    "lastReviewDate" TIMESTAMP,
    "nextReviewDate" TIMESTAMP,
    "currentInterval" INTEGER DEFAULT 1,
    "consecutiveCorrect" INTEGER DEFAULT 0,
    "consecutiveWrong" INTEGER DEFAULT 0,
    "halfLife" DOUBLE PRECISION DEFAULT 1.0,
    "version" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId" ON "word_learning_states"("userId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_wordId" ON "word_learning_states"("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_state" ON "word_learning_states"("state");

-- ============================================
-- 学习会话
-- ============================================

CREATE TABLE IF NOT EXISTS "learning_sessions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "endedAt" TIMESTAMP,
    "actualMasteryCount" INTEGER,
    "targetMasteryCount" INTEGER,
    "totalQuestions" INTEGER,
    "sessionType" "SessionType" DEFAULT 'NORMAL',
    "flowPeakScore" DOUBLE PRECISION,
    "avgCognitiveLoad" DOUBLE PRECISION,
    "contextShifts" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_learning_sessions_userId" ON "learning_sessions"("userId");

-- ============================================
-- 决策记录
-- ============================================

CREATE TABLE IF NOT EXISTS "decision_records" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "answerRecordId" TEXT,
    "sessionId" TEXT,
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    "decisionSource" TEXT NOT NULL,
    "coldstartPhase" TEXT,
    "weightsSnapshot" JSONB,
    "memberVotes" JSONB,
    "selectedAction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION DEFAULT 0,
    "reward" DOUBLE PRECISION,
    "traceVersion" INTEGER DEFAULT 1,
    "ingestionStatus" TEXT DEFAULT 'PENDING',
    "totalDurationMs" INTEGER,
    "isSimulation" BOOLEAN DEFAULT false,
    "emotionLabel" TEXT,
    "flowScore" DOUBLE PRECISION,
    "actionRationale" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_decision_records_sessionId" ON "decision_records"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_decision_records_timestamp" ON "decision_records"("timestamp");

-- ============================================
-- AMAS 用户状态
-- ============================================

CREATE TABLE IF NOT EXISTS "amas_user_states" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT UNIQUE NOT NULL,
    "attention" DOUBLE PRECISION DEFAULT 0.7,
    "fatigue" DOUBLE PRECISION DEFAULT 0,
    "motivation" DOUBLE PRECISION DEFAULT 0,
    "confidence" DOUBLE PRECISION DEFAULT 0.5,
    "cognitiveProfile" JSONB DEFAULT '{"mem": 0.5, "speed": 0.5, "stability": 0.5}',
    "habitProfile" JSONB,
    "trendState" TEXT,
    "coldStartState" TEXT,
    "lastUpdateTs" BIGINT DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_states_userId" ON "amas_user_states"("userId");

-- ============================================
-- 密码重置
-- ============================================

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "used" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_token" ON "password_reset_tokens"("token");
