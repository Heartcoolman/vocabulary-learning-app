/*
  Warnings:

  - A unique constraint covering the columns `[wordBookId,spelling]` on the table `words` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "learning_plans" ADD COLUMN     "totalWords" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "amas_user_states_lastUpdateTs_idx" ON "amas_user_states"("lastUpdateTs");

-- CreateIndex
CREATE INDEX "reward_queue_userId_status_dueTs_idx" ON "reward_queue"("userId", "status", "dueTs");

-- CreateIndex
CREATE UNIQUE INDEX "words_wordBookId_spelling_key" ON "words"("wordBookId", "spelling");
