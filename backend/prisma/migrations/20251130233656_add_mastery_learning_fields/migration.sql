-- AlterTable
ALTER TABLE "learning_sessions" ADD COLUMN     "actualMasteryCount" INTEGER,
ADD COLUMN     "targetMasteryCount" INTEGER,
ADD COLUMN     "totalQuestions" INTEGER;

-- AlterTable
ALTER TABLE "user_study_configs" ADD COLUMN     "dailyMasteryTarget" INTEGER NOT NULL DEFAULT 20;
