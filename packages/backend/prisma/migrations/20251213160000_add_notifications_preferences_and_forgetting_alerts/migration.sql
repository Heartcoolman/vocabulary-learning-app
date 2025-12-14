-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "ContextType" AS ENUM ('SENTENCE', 'CONVERSATION', 'ARTICLE', 'MEDIA');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('NORMAL', 'SPACED_REPETITION', 'INTENSIVE', 'QUIZ');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FORGETTING_ALERT', 'ACHIEVEMENT', 'REMINDER', 'SYSTEM', 'MILESTONE', 'STREAK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "learning_sessions"
ADD COLUMN     "sessionType" "SessionType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "flowPeakScore" DOUBLE PRECISION,
ADD COLUMN     "avgCognitiveLoad" DOUBLE PRECISION,
ADD COLUMN     "contextShifts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "learning_sessions_sessionType_idx" ON "learning_sessions"("sessionType");

-- AlterTable
ALTER TABLE "decision_records"
ADD COLUMN     "emotionLabel" TEXT,
ADD COLUMN     "flowScore" DOUBLE PRECISION,
ADD COLUMN     "actionRationale" TEXT;

-- CreateTable
CREATE TABLE "user_learning_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thetaVariance" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "attention" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "fatigue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivation" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "emotionBaseline" TEXT NOT NULL DEFAULT 'neutral',
    "lastReportedEmotion" TEXT,
    "flowScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flowBaseline" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "activePolicyVersion" TEXT NOT NULL DEFAULT 'v1',
    "forgettingParams" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forgetting_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "predictedForgetAt" TIMESTAMP(3) NOT NULL,
    "recallProbability" DOUBLE PRECISION NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forgetting_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_contexts" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "contextType" "ContextType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredStudyTimeStart" TEXT DEFAULT '09:00',
    "preferredStudyTimeEnd" TEXT DEFAULT '21:00',
    "preferredDifficulty" TEXT DEFAULT 'adaptive',
    "dailyGoalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyGoalWords" INTEGER NOT NULL DEFAULT 20,
    "enableForgettingAlerts" BOOLEAN NOT NULL DEFAULT true,
    "enableAchievements" BOOLEAN NOT NULL DEFAULT true,
    "enableReminders" BOOLEAN NOT NULL DEFAULT true,
    "enableSystemNotif" BOOLEAN NOT NULL DEFAULT true,
    "reminderFrequency" TEXT NOT NULL DEFAULT 'daily',
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '08:00',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "animationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_learning_profiles_userId_key" ON "user_learning_profiles"("userId");

-- CreateIndex
CREATE INDEX "user_learning_profiles_userId_idx" ON "user_learning_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "forgetting_alerts_userId_wordId_key" ON "forgetting_alerts"("userId", "wordId");

-- CreateIndex
CREATE INDEX "forgetting_alerts_userId_status_idx" ON "forgetting_alerts"("userId", "status");

-- CreateIndex
CREATE INDEX "forgetting_alerts_predictedForgetAt_idx" ON "forgetting_alerts"("predictedForgetAt");

-- CreateIndex
CREATE INDEX "word_contexts_wordId_idx" ON "word_contexts"("wordId");

-- CreateIndex
CREATE INDEX "word_contexts_contextType_idx" ON "word_contexts"("contextType");

-- CreateIndex
CREATE INDEX "notifications_userId_status_idx" ON "notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_priority_status_idx" ON "notifications"("priority", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_learning_profiles" ADD CONSTRAINT "user_learning_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forgetting_alerts" ADD CONSTRAINT "forgetting_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forgetting_alerts" ADD CONSTRAINT "forgetting_alerts_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_contexts" ADD CONSTRAINT "word_contexts_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
