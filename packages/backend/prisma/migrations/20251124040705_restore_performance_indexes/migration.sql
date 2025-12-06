-- CreateIndex
CREATE INDEX "answer_records_userId_timestamp_idx" ON "answer_records"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "answer_records_wordId_timestamp_idx" ON "answer_records"("wordId", "timestamp");

-- CreateIndex
CREATE INDEX "answer_records_userId_isCorrect_idx" ON "answer_records"("userId", "isCorrect");

-- CreateIndex
CREATE INDEX "answer_records_sessionId_timestamp_idx" ON "answer_records"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "word_learning_states_userId_state_idx" ON "word_learning_states"("userId", "state");

-- CreateIndex
CREATE INDEX "word_learning_states_userId_masteryLevel_idx" ON "word_learning_states"("userId", "masteryLevel");

-- CreateIndex
CREATE INDEX "word_learning_states_userId_nextReviewDate_idx" ON "word_learning_states"("userId", "nextReviewDate");

-- CreateIndex
CREATE INDEX "word_scores_userId_totalScore_idx" ON "word_scores"("userId", "totalScore");

-- CreateIndex
CREATE INDEX "words_spelling_idx" ON "words"("spelling");

-- CreateIndex
CREATE INDEX "words_wordBookId_createdAt_idx" ON "words"("wordBookId", "createdAt");
