/*
  Warnings:

  - A unique constraint covering the columns `[userId,wordId,timestamp]` on the table `answer_records` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "answer_records_userId_wordId_timestamp_key" ON "answer_records"("userId", "wordId", "timestamp");
