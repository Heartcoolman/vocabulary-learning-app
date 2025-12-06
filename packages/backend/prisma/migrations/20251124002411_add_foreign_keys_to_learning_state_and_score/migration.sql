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

-- AddForeignKey
ALTER TABLE "word_learning_states" ADD CONSTRAINT "word_learning_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_learning_states" ADD CONSTRAINT "word_learning_states_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_scores" ADD CONSTRAINT "word_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_scores" ADD CONSTRAINT "word_scores_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 恢复性能索引
CREATE INDEX "answer_records_user_timestamp_idx" ON "answer_records"("userId", "timestamp" DESC);
CREATE INDEX "answer_records_word_timestamp_idx" ON "answer_records"("wordId", "timestamp" DESC);
CREATE INDEX "answer_records_session_timestamp_idx" ON "answer_records"("sessionId", "timestamp" DESC);
CREATE INDEX "answer_records_user_correct_idx" ON "answer_records"("userId", "isCorrect");
CREATE INDEX "word_learning_states_user_next_review_idx" ON "word_learning_states"("userId", "nextReviewDate");
CREATE INDEX "word_learning_states_user_state_idx" ON "word_learning_states"("userId", "state");
CREATE INDEX "word_learning_states_user_mastery_idx" ON "word_learning_states"("userId", "masteryLevel");
CREATE INDEX "word_scores_user_score_idx" ON "word_scores"("userId", "totalScore" DESC);
CREATE INDEX "sessions_expires_idx" ON "sessions"("expiresAt");
CREATE INDEX "words_spelling_idx" ON "words"("spelling");
CREATE INDEX "words_wordbook_created_idx" ON "words"("wordBookId", "createdAt" DESC);
