-- DropIndex
DROP INDEX "answer_records_session_timestamp_idx";

-- DropIndex
DROP INDEX "answer_records_user_correct_idx";

-- DropIndex
DROP INDEX "answer_records_user_timestamp_idx";

-- DropIndex
DROP INDEX "answer_records_word_timestamp_idx";

-- DropIndex
DROP INDEX "sessions_expires_idx";

-- DropIndex
DROP INDEX "word_learning_states_user_mastery_idx";

-- DropIndex
DROP INDEX "word_learning_states_user_next_review_idx";

-- DropIndex
DROP INDEX "word_learning_states_user_state_idx";

-- DropIndex
DROP INDEX "word_scores_user_score_idx";

-- DropIndex
DROP INDEX "words_spelling_idx";

-- DropIndex
DROP INDEX "words_wordbook_created_idx";

-- CreateTable
CREATE TABLE "anomaly_flags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "flaggedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "anomaly_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anomaly_flags_userId_idx" ON "anomaly_flags"("userId");

-- CreateIndex
CREATE INDEX "anomaly_flags_wordId_idx" ON "anomaly_flags"("wordId");

-- CreateIndex
CREATE INDEX "anomaly_flags_flaggedAt_idx" ON "anomaly_flags"("flaggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_flags_userId_wordId_key" ON "anomaly_flags"("userId", "wordId");

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
