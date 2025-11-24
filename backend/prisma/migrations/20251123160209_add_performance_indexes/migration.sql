-- 性能优化索引

-- AnswerRecord 表索引优化
-- 用于查询用户的最近答题记录（计算错误率、稳定性）
CREATE INDEX IF NOT EXISTS "answer_records_user_timestamp_idx" ON "answer_records"("userId", "timestamp" DESC);

-- 用于查询单词的答题历史
CREATE INDEX IF NOT EXISTS "answer_records_word_timestamp_idx" ON "answer_records"("wordId", "timestamp" DESC);

-- 用于查询会话的答题记录
CREATE INDEX IF NOT EXISTS "answer_records_session_timestamp_idx" ON "answer_records"("sessionId", "timestamp" DESC);

-- 用于统计正确率
CREATE INDEX IF NOT EXISTS "answer_records_user_correct_idx" ON "answer_records"("userId", "isCorrect");

-- WordLearningState 表索引优化
-- 用于查询需要复习的单词（按复习时间排序）
CREATE INDEX IF NOT EXISTS "word_learning_states_user_next_review_idx" ON "word_learning_states"("userId", "nextReviewDate");

-- 用于查询特定状态的单词
CREATE INDEX IF NOT EXISTS "word_learning_states_user_state_idx" ON "word_learning_states"("userId", "state");

-- 用于查询掌握程度
CREATE INDEX IF NOT EXISTS "word_learning_states_user_mastery_idx" ON "word_learning_states"("userId", "masteryLevel");

-- WordScore 表索引优化
-- 用于按得分排序查询
CREATE INDEX IF NOT EXISTS "word_scores_user_score_idx" ON "word_scores"("userId", "totalScore" DESC);

-- 用于查询低分单词（需要重点学习）
CREATE INDEX IF NOT EXISTS "word_scores_user_low_score_idx" ON "word_scores"("userId", "totalScore") WHERE "totalScore" < 40;

-- 用于查询高分单词（已熟练掌握）
CREATE INDEX IF NOT EXISTS "word_scores_user_high_score_idx" ON "word_scores"("userId", "totalScore") WHERE "totalScore" > 80;

-- AlgorithmConfig 表索引优化
-- 用于快速查找默认配置
CREATE INDEX IF NOT EXISTS "algorithm_configs_default_idx" ON "algorithm_configs"("isDefault") WHERE "isDefault" = true;

-- ConfigHistory 表索引优化
-- 用于按时间倒序查询配置历史
CREATE INDEX IF NOT EXISTS "config_history_timestamp_idx" ON "config_history"("timestamp" DESC);

-- Session 表索引优化
-- 用于清理过期会话
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions"("expiresAt");

-- Word 表索引优化
-- 用于按单词拼写搜索
CREATE INDEX IF NOT EXISTS "words_spelling_idx" ON "words"("spelling");

-- 用于词书的单词查询
CREATE INDEX IF NOT EXISTS "words_wordbook_created_idx" ON "words"("wordBookId", "createdAt" DESC);