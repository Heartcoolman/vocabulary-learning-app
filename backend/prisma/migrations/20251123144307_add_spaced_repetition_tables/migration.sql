-- CreateEnum
CREATE TYPE "WordState" AS ENUM ('NEW', 'LEARNING', 'REVIEWING', 'MASTERED');

-- AlterTable
ALTER TABLE "answer_records" ADD COLUMN     "dwellTime" INTEGER,
ADD COLUMN     "masteryLevelAfter" INTEGER,
ADD COLUMN     "masteryLevelBefore" INTEGER,
ADD COLUMN     "responseTime" INTEGER,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "word_learning_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "state" "WordState" NOT NULL DEFAULT 'NEW',
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "currentInterval" INTEGER NOT NULL DEFAULT 1,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_learning_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proficiencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "averageResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageDwellTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "algorithm_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reviewIntervals" INTEGER[],
    "consecutiveCorrectThreshold" INTEGER NOT NULL DEFAULT 5,
    "consecutiveWrongThreshold" INTEGER NOT NULL DEFAULT 3,
    "difficultyAdjustmentInterval" INTEGER NOT NULL DEFAULT 1,
    "priorityWeightNewWord" INTEGER NOT NULL DEFAULT 40,
    "priorityWeightErrorRate" INTEGER NOT NULL DEFAULT 30,
    "priorityWeightOverdueTime" INTEGER NOT NULL DEFAULT 20,
    "priorityWeightWordScore" INTEGER NOT NULL DEFAULT 10,
    "scoreWeightAccuracy" INTEGER NOT NULL DEFAULT 40,
    "scoreWeightSpeed" INTEGER NOT NULL DEFAULT 30,
    "scoreWeightStability" INTEGER NOT NULL DEFAULT 20,
    "scoreWeightProficiency" INTEGER NOT NULL DEFAULT 10,
    "speedThresholdExcellent" INTEGER NOT NULL DEFAULT 3000,
    "speedThresholdGood" INTEGER NOT NULL DEFAULT 5000,
    "speedThresholdAverage" INTEGER NOT NULL DEFAULT 10000,
    "speedThresholdSlow" INTEGER NOT NULL DEFAULT 10000,
    "newWordRatioDefault" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "newWordRatioHighAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "newWordRatioLowAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "newWordRatioHighAccuracyThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "newWordRatioLowAccuracyThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "masteryThresholds" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "algorithm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_history" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_learning_states_userId_idx" ON "word_learning_states"("userId");

-- CreateIndex
CREATE INDEX "word_learning_states_wordId_idx" ON "word_learning_states"("wordId");

-- CreateIndex
CREATE INDEX "word_learning_states_state_idx" ON "word_learning_states"("state");

-- CreateIndex
CREATE INDEX "word_learning_states_nextReviewDate_idx" ON "word_learning_states"("nextReviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "word_learning_states_userId_wordId_key" ON "word_learning_states"("userId", "wordId");

-- CreateIndex
CREATE INDEX "word_scores_userId_idx" ON "word_scores"("userId");

-- CreateIndex
CREATE INDEX "word_scores_wordId_idx" ON "word_scores"("wordId");

-- CreateIndex
CREATE INDEX "word_scores_totalScore_idx" ON "word_scores"("totalScore");

-- CreateIndex
CREATE UNIQUE INDEX "word_scores_userId_wordId_key" ON "word_scores"("userId", "wordId");

-- CreateIndex
CREATE INDEX "config_history_configId_idx" ON "config_history"("configId");

-- CreateIndex
CREATE INDEX "config_history_changedBy_idx" ON "config_history"("changedBy");

-- CreateIndex
CREATE INDEX "config_history_timestamp_idx" ON "config_history"("timestamp");

-- CreateIndex
CREATE INDEX "answer_records_sessionId_idx" ON "answer_records"("sessionId");

-- AddForeignKey
ALTER TABLE "config_history" ADD CONSTRAINT "config_history_configId_fkey" FOREIGN KEY ("configId") REFERENCES "algorithm_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
