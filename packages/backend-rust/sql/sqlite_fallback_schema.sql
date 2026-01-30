-- AUTO-GENERATED: 由 packages/backend/scripts/extract-sqlite-fallback-schema.cjs 生成
-- SOURCE: packages/backend/src/database/adapters/sqlite-adapter.ts

-- ============================================
-- 系统内部表
-- ============================================

-- 元数据表
CREATE TABLE IF NOT EXISTS "_db_metadata" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 待同步写入操作表
CREATE TABLE IF NOT EXISTS "_pending_writes" (
  "operation_id" TEXT PRIMARY KEY,
  "operation_data" TEXT NOT NULL,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 变更日志表
CREATE TABLE IF NOT EXISTS "_changelog" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('INSERT', 'UPDATE', 'DELETE')),
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "old_data" TEXT,
  "new_data" TEXT,
  "timestamp" INTEGER NOT NULL,
  "synced" INTEGER DEFAULT 0,
  "idempotency_key" TEXT UNIQUE,
  "tx_id" TEXT,
  "tx_seq" INTEGER,
  "tx_committed" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_changelog_synced" ON "_changelog" ("synced", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_changelog_table" ON "_changelog" ("table_name", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_changelog_tx" ON "_changelog" ("tx_id", "tx_seq");

-- 冲突记录表（P1修复：持久化冲突记录）
CREATE TABLE IF NOT EXISTS "_sync_conflicts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "change_id" INTEGER NOT NULL,
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "local_data" TEXT,
  "remote_data" TEXT,
  "resolution" TEXT,
  "resolved_at" TEXT,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_table" ON "_sync_conflicts" ("table_name");
CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_resolved" ON "_sync_conflicts" ("resolved_at");

-- ============================================
-- 用户与认证
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "role" TEXT DEFAULT 'USER',
  "rewardProfile" TEXT DEFAULT 'standard',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_users_rewardProfile" ON "users" ("rewardProfile");

-- 会话表（认证必需）
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_sessions_userId" ON "sessions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_sessions_token" ON "sessions" ("token");
CREATE INDEX IF NOT EXISTS "idx_sessions_expiresAt" ON "sessions" ("expiresAt");

-- ============================================
-- 词库与单词
-- ============================================

-- 词书表
CREATE TABLE IF NOT EXISTS "word_books" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "userId" TEXT,
  "isPublic" INTEGER DEFAULT 0,
  "wordCount" INTEGER DEFAULT 0,
  "coverImage" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_books_userId" ON "word_books" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_books_type" ON "word_books" ("type");

-- 单词表
CREATE TABLE IF NOT EXISTS "words" (
  "id" TEXT PRIMARY KEY,
  "spelling" TEXT NOT NULL,
  "phonetic" TEXT NOT NULL,
  "meanings" TEXT NOT NULL,
  "examples" TEXT NOT NULL,
  "audioUrl" TEXT,
  "wordBookId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("wordBookId", "spelling")
);

CREATE INDEX IF NOT EXISTS "idx_words_wordBookId" ON "words" ("wordBookId");
CREATE INDEX IF NOT EXISTS "idx_words_spelling" ON "words" ("spelling");
CREATE INDEX IF NOT EXISTS "idx_words_wordBookId_createdAt" ON "words" ("wordBookId", "createdAt");

-- 词频表
CREATE TABLE IF NOT EXISTS "word_frequency" (
  "word_id" TEXT PRIMARY KEY,
  "frequency_rank" INTEGER NOT NULL,
  "frequency_score" REAL NOT NULL,
  "corpus_source" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_word_frequency_rank" ON "word_frequency" ("frequency_rank");
CREATE INDEX IF NOT EXISTS "idx_word_frequency_source" ON "word_frequency" ("corpus_source");

-- ============================================
-- 学习记录
-- ============================================

-- 答题记录表
CREATE TABLE IF NOT EXISTS "answer_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "selectedAnswer" TEXT NOT NULL,
  "correctAnswer" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now')),
  "dwellTime" INTEGER,
  "masteryLevelAfter" INTEGER,
  "masteryLevelBefore" INTEGER,
  "responseTime" INTEGER,
  "sessionId" TEXT,
  -- VARK interaction tracking columns (Migration 041)
  "imageViewCount" INTEGER DEFAULT 0,
  "imageZoomCount" INTEGER DEFAULT 0,
  "imageLongPressMs" INTEGER DEFAULT 0,
  "audioPlayCount" INTEGER DEFAULT 0,
  "audioReplayCount" INTEGER DEFAULT 0,
  "audioSpeedAdjust" INTEGER DEFAULT 0,
  "definitionReadMs" INTEGER DEFAULT 0,
  "exampleReadMs" INTEGER DEFAULT 0,
  "noteWriteCount" INTEGER DEFAULT 0,
  -- Device type for EVM (Migration 042)
  "deviceType" TEXT DEFAULT 'unknown',
  PRIMARY KEY ("id", "timestamp"),
  UNIQUE("userId", "wordId", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_answer_records_wordId_timestamp" ON "answer_records" ("wordId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_answer_records_userId_isCorrect" ON "answer_records" ("userId", "isCorrect");
CREATE INDEX IF NOT EXISTS "idx_answer_records_sessionId_timestamp" ON "answer_records" ("sessionId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_answer_records_timestamp" ON "answer_records" ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_answer_records_userId_timestamp" ON "answer_records" ("userId", "timestamp");

-- 用户学习配置表
CREATE TABLE IF NOT EXISTS "user_study_configs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "selectedWordBookIds" TEXT NOT NULL,
  "dailyWordCount" INTEGER DEFAULT 20,
  "studyMode" TEXT DEFAULT 'sequential',
  "dailyMasteryTarget" INTEGER DEFAULT 20,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 单词学习状态表
CREATE TABLE IF NOT EXISTS "word_learning_states" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "state" TEXT DEFAULT 'NEW',
  "masteryLevel" INTEGER DEFAULT 0,
  "easeFactor" REAL DEFAULT 2.5,
  "reviewCount" INTEGER DEFAULT 0,
  "lastReviewDate" TEXT,
  "nextReviewDate" TEXT,
  "currentInterval" INTEGER DEFAULT 1,
  "consecutiveCorrect" INTEGER DEFAULT 0,
  "consecutiveWrong" INTEGER DEFAULT 0,
  "halfLife" REAL DEFAULT 1.0,
  "version" INTEGER DEFAULT 0,
  -- UMM columns (Migration 039)
  "ummStrength" REAL DEFAULT 1.0,
  "ummConsolidation" REAL DEFAULT 0.1,
  "ummLastReviewTs" INTEGER,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId" ON "word_learning_states" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_wordId" ON "word_learning_states" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_state" ON "word_learning_states" ("state");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_nextReviewDate" ON "word_learning_states" ("nextReviewDate");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_state" ON "word_learning_states" ("userId", "state");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_masteryLevel" ON "word_learning_states" ("userId", "masteryLevel");
CREATE INDEX IF NOT EXISTS "idx_word_learning_states_userId_nextReviewDate" ON "word_learning_states" ("userId", "nextReviewDate");

-- 单词分数表
CREATE TABLE IF NOT EXISTS "word_scores" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "totalScore" REAL DEFAULT 0,
  "accuracyScore" REAL DEFAULT 0,
  "speedScore" REAL DEFAULT 0,
  "stabilityScore" REAL DEFAULT 0,
  "proficiencyScore" REAL DEFAULT 0,
  "totalAttempts" INTEGER DEFAULT 0,
  "correctAttempts" INTEGER DEFAULT 0,
  "averageResponseTime" REAL DEFAULT 0,
  "averageDwellTime" REAL DEFAULT 0,
  "recentAccuracy" REAL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_scores_userId" ON "word_scores" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_wordId" ON "word_scores" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_totalScore" ON "word_scores" ("totalScore");
CREATE INDEX IF NOT EXISTS "idx_word_scores_userId_totalScore" ON "word_scores" ("userId", "totalScore");

-- 单词复习轨迹表
CREATE TABLE IF NOT EXISTS "word_review_traces" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "responseTime" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_word_review_traces_userId_wordId" ON "word_review_traces" ("userId", "wordId");
CREATE INDEX IF NOT EXISTS "idx_word_review_traces_userId_wordId_timestamp" ON "word_review_traces" ("userId", "wordId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_word_review_traces_timestamp" ON "word_review_traces" ("timestamp" DESC);

-- ============================================
-- 学习会话与行为
-- ============================================

-- 学习会话表
CREATE TABLE IF NOT EXISTS "learning_sessions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "endedAt" TEXT,
  "actualMasteryCount" INTEGER,
  "targetMasteryCount" INTEGER,
  "totalQuestions" INTEGER,
  "sessionType" TEXT DEFAULT 'NORMAL',
  "flowPeakScore" REAL,
  "avgCognitiveLoad" REAL,
  "contextShifts" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_learning_sessions_userId_startedAt" ON "learning_sessions" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "idx_learning_sessions_sessionType" ON "learning_sessions" ("sessionType");

-- 特征向量表
CREATE TABLE IF NOT EXISTS "feature_vectors" (
  "sessionId" TEXT NOT NULL,
  "featureVersion" INTEGER NOT NULL,
  "features" TEXT NOT NULL,
  "normMethod" TEXT,
  "answerRecordId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("sessionId", "featureVersion"),
  UNIQUE("answerRecordId", "featureVersion")
);

CREATE INDEX IF NOT EXISTS "idx_feature_vectors_version_createdAt" ON "feature_vectors" ("featureVersion", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_feature_vectors_answerRecordId" ON "feature_vectors" ("answerRecordId");

-- 用户状态历史表
CREATE TABLE IF NOT EXISTS "user_state_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "attention" REAL NOT NULL,
  "fatigue" REAL NOT NULL,
  "motivation" REAL NOT NULL,
  "memory" REAL NOT NULL,
  "speed" REAL NOT NULL,
  "stability" REAL NOT NULL,
  "trendState" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "date")
);

-- 习惯档案表
CREATE TABLE IF NOT EXISTS "habit_profiles" (
  "userId" TEXT PRIMARY KEY,
  "timePref" TEXT,
  "rhythmPref" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- AMAS 自适应学习
-- ============================================

-- AMAS 用户状态表
CREATE TABLE IF NOT EXISTS "amas_user_states" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "attention" REAL DEFAULT 0.7,
  "fatigue" REAL DEFAULT 0,
  "motivation" REAL DEFAULT 0,
  "confidence" REAL DEFAULT 0.5,
  "cognitiveProfile" TEXT DEFAULT '{"mem": 0.5, "speed": 0.5, "stability": 0.5}',
  "habitProfile" TEXT,
  "trendState" TEXT,
  "coldStartState" TEXT,
  "lastUpdateTs" INTEGER DEFAULT 0,
  -- Runtime state fields (Migration 043)
  "visualFatigue" REAL DEFAULT 0.0,
  "fusedFatigue" REAL DEFAULT 0.0,
  "masteryHistory" TEXT DEFAULT '[]',
  "habitSamples" TEXT DEFAULT '[]',
  "ensemblePerformance" TEXT DEFAULT '{}',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_states_userId" ON "amas_user_states" ("userId");
CREATE INDEX IF NOT EXISTS "idx_amas_user_states_lastUpdateTs" ON "amas_user_states" ("lastUpdateTs");

-- AMAS 用户模型表
CREATE TABLE IF NOT EXISTS "amas_user_models" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "modelData" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_models_userId" ON "amas_user_models" ("userId");

-- 用户学习档案表
CREATE TABLE IF NOT EXISTS "user_learning_profiles" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "theta" REAL DEFAULT 0,
  "thetaVariance" REAL DEFAULT 1,
  "attention" REAL DEFAULT 0.7,
  "fatigue" REAL DEFAULT 0,
  "motivation" REAL DEFAULT 0.5,
  "emotionBaseline" TEXT DEFAULT 'neutral',
  "lastReportedEmotion" TEXT,
  "flowScore" REAL DEFAULT 0,
  "flowBaseline" REAL DEFAULT 0.5,
  "activePolicyVersion" TEXT DEFAULT 'v1',
  "forgettingParams" TEXT DEFAULT '{}',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_learning_profiles_userId" ON "user_learning_profiles" ("userId");

-- ============================================
-- 算法配置与历史
-- ============================================

-- 算法配置表
CREATE TABLE IF NOT EXISTS "algorithm_configs" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT UNIQUE NOT NULL,
  "description" TEXT,
  "reviewIntervals" TEXT NOT NULL,
  "consecutiveCorrectThreshold" INTEGER DEFAULT 5,
  "consecutiveWrongThreshold" INTEGER DEFAULT 3,
  "difficultyAdjustmentInterval" INTEGER DEFAULT 1,
  "priorityWeightNewWord" INTEGER DEFAULT 40,
  "priorityWeightErrorRate" INTEGER DEFAULT 30,
  "priorityWeightOverdueTime" INTEGER DEFAULT 20,
  "priorityWeightWordScore" INTEGER DEFAULT 10,
  "scoreWeightAccuracy" INTEGER DEFAULT 40,
  "scoreWeightSpeed" INTEGER DEFAULT 30,
  "scoreWeightStability" INTEGER DEFAULT 20,
  "scoreWeightProficiency" INTEGER DEFAULT 10,
  "speedThresholdExcellent" INTEGER DEFAULT 3000,
  "speedThresholdGood" INTEGER DEFAULT 5000,
  "speedThresholdAverage" INTEGER DEFAULT 10000,
  "speedThresholdSlow" INTEGER DEFAULT 10000,
  "newWordRatioDefault" REAL DEFAULT 0.3,
  "newWordRatioHighAccuracy" REAL DEFAULT 0.5,
  "newWordRatioLowAccuracy" REAL DEFAULT 0.1,
  "newWordRatioHighAccuracyThreshold" REAL DEFAULT 0.85,
  "newWordRatioLowAccuracyThreshold" REAL DEFAULT 0.65,
  "masteryThresholds" TEXT NOT NULL,
  "isDefault" INTEGER DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 配置历史表
CREATE TABLE IF NOT EXISTS "config_history" (
  "id" TEXT PRIMARY KEY,
  "configId" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changeReason" TEXT,
  "previousValue" TEXT NOT NULL,
  "newValue" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_config_history_configId" ON "config_history" ("configId");
CREATE INDEX IF NOT EXISTS "idx_config_history_changedBy" ON "config_history" ("changedBy");
CREATE INDEX IF NOT EXISTS "idx_config_history_timestamp" ON "config_history" ("timestamp");

-- ============================================
-- A/B 测试与贝叶斯优化
-- ============================================

-- A/B 实验表
CREATE TABLE IF NOT EXISTS "ab_experiments" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trafficAllocation" TEXT DEFAULT 'WEIGHTED',
  "minSampleSize" INTEGER DEFAULT 100,
  "significanceLevel" REAL DEFAULT 0.05,
  "minimumDetectableEffect" REAL DEFAULT 0.05,
  "autoDecision" INTEGER DEFAULT 0,
  "status" TEXT DEFAULT 'DRAFT',
  "startedAt" TEXT,
  "endedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_ab_experiments_status" ON "ab_experiments" ("status");
CREATE INDEX IF NOT EXISTS "idx_ab_experiments_startedAt" ON "ab_experiments" ("startedAt");

-- A/B 变体表
CREATE TABLE IF NOT EXISTS "ab_variants" (
  "id" TEXT PRIMARY KEY,
  "experimentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weight" REAL DEFAULT 0.5,
  "isControl" INTEGER DEFAULT 0,
  "parameters" TEXT DEFAULT '{}',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_ab_variants_experimentId" ON "ab_variants" ("experimentId");

-- A/B 用户分配表
CREATE TABLE IF NOT EXISTS "ab_user_assignments" (
  "userId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "assignedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("userId", "experimentId")
);

CREATE INDEX IF NOT EXISTS "idx_ab_user_assignments_variantId" ON "ab_user_assignments" ("variantId");

-- A/B 实验指标表
CREATE TABLE IF NOT EXISTS "ab_experiment_metrics" (
  "id" TEXT PRIMARY KEY,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sampleCount" INTEGER DEFAULT 0,
  "primaryMetric" REAL DEFAULT 0,
  "averageReward" REAL DEFAULT 0,
  "stdDev" REAL DEFAULT 0,
  "m2" REAL DEFAULT 0,
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("experimentId", "variantId")
);

-- 贝叶斯优化器状态表
CREATE TABLE IF NOT EXISTS "bayesian_optimizer_state" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "observations" TEXT DEFAULT '[]',
  "bestParams" TEXT,
  "bestValue" REAL,
  "evaluationCount" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 因果推断观测表
CREATE TABLE IF NOT EXISTS "causal_observations" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "features" TEXT NOT NULL,
  "treatment" INTEGER NOT NULL,
  "outcome" REAL NOT NULL,
  "timestamp" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_causal_observations_treatment" ON "causal_observations" ("treatment");
CREATE INDEX IF NOT EXISTS "idx_causal_observations_timestamp" ON "causal_observations" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_causal_observations_userId" ON "causal_observations" ("userId");

-- ============================================
-- 决策记录与洞察
-- ============================================

-- 决策记录表
CREATE TABLE IF NOT EXISTS "decision_records" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "answerRecordId" TEXT,
  "sessionId" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now')),
  "decisionSource" TEXT NOT NULL,
  "coldstartPhase" TEXT,
  "weightsSnapshot" TEXT,
  "memberVotes" TEXT,
  "selectedAction" TEXT NOT NULL,
  "confidence" REAL DEFAULT 0,
  "reward" REAL,
  "traceVersion" INTEGER DEFAULT 1,
  "ingestionStatus" TEXT DEFAULT 'PENDING',
  "totalDurationMs" INTEGER,
  "isSimulation" INTEGER DEFAULT 0,
  "emotionLabel" TEXT,
  "flowScore" REAL,
  "actionRationale" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("id", "timestamp"),
  UNIQUE("decisionId", "timestamp")
);

CREATE INDEX IF NOT EXISTS "idx_decision_records_answerRecordId" ON "decision_records" ("answerRecordId");
CREATE INDEX IF NOT EXISTS "idx_decision_records_decisionSource" ON "decision_records" ("decisionSource");
CREATE INDEX IF NOT EXISTS "idx_decision_records_timestamp" ON "decision_records" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_decision_records_sessionId" ON "decision_records" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_decision_records_isSimulation" ON "decision_records" ("isSimulation");

-- 决策洞察表
CREATE TABLE IF NOT EXISTS "decision_insights" (
  "id" TEXT PRIMARY KEY,
  "decision_id" TEXT UNIQUE NOT NULL,
  "user_id" TEXT NOT NULL,
  "state_snapshot" TEXT NOT NULL,
  "difficulty_factors" TEXT NOT NULL,
  "triggers" TEXT DEFAULT '[]',
  "feature_vector_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_decision_insights_userId_decisionId" ON "decision_insights" ("user_id", "decision_id");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_featureVectorHash" ON "decision_insights" ("feature_vector_hash");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_createdAt" ON "decision_insights" ("created_at");

-- 流水线阶段表
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id" TEXT PRIMARY KEY,
  "decisionRecordId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TEXT NOT NULL,
  "endedAt" TEXT,
  "durationMs" INTEGER,
  "inputSummary" TEXT,
  "outputSummary" TEXT,
  "metadata" TEXT,
  "errorMessage" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_decisionRecordId_stage" ON "pipeline_stages" ("decisionRecordId", "stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_stage" ON "pipeline_stages" ("stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_status" ON "pipeline_stages" ("status");

-- ============================================
-- 奖励与成就
-- ============================================

-- 奖励队列表
CREATE TABLE IF NOT EXISTS "reward_queue" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT,
  "userId" TEXT NOT NULL,
  "dueTs" TEXT NOT NULL,
  "reward" REAL NOT NULL,
  "status" TEXT DEFAULT 'PENDING',
  "idempotencyKey" TEXT UNIQUE NOT NULL,
  "lastError" TEXT,
  "answerRecordId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_reward_queue_dueTs_status" ON "reward_queue" ("dueTs", "status");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_userId" ON "reward_queue" ("userId");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_sessionId" ON "reward_queue" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_userId_status_dueTs" ON "reward_queue" ("userId", "status", "dueTs");
CREATE INDEX IF NOT EXISTS "idx_reward_queue_answerRecordId" ON "reward_queue" ("answerRecordId");

-- 徽章定义表
CREATE TABLE IF NOT EXISTS "badge_definitions" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "iconUrl" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tier" INTEGER DEFAULT 1,
  "condition" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("name", "tier")
);

-- 用户徽章表
CREATE TABLE IF NOT EXISTS "user_badges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "tier" INTEGER DEFAULT 1,
  "unlockedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "badgeId", "tier")
);

CREATE INDEX IF NOT EXISTS "idx_user_badges_userId" ON "user_badges" ("userId");
CREATE INDEX IF NOT EXISTS "idx_user_badges_badgeId" ON "user_badges" ("badgeId");

-- 学习计划表
CREATE TABLE IF NOT EXISTS "learning_plans" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "dailyTarget" INTEGER NOT NULL,
  "estimatedCompletionDate" TEXT NOT NULL,
  "wordbookDistribution" TEXT NOT NULL,
  "weeklyMilestones" TEXT NOT NULL,
  "isActive" INTEGER DEFAULT 1,
  "totalWords" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 异常与预警
-- ============================================

-- 异常标记表
CREATE TABLE IF NOT EXISTS "anomaly_flags" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "flaggedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "flaggedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "resolved" INTEGER DEFAULT 0,
  "resolvedAt" TEXT,
  "resolvedBy" TEXT,
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_userId" ON "anomaly_flags" ("userId");
CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_wordId" ON "anomaly_flags" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_flaggedAt" ON "anomaly_flags" ("flaggedAt");

-- 遗忘预警表
CREATE TABLE IF NOT EXISTS "forgetting_alerts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "predictedForgetAt" TEXT NOT NULL,
  "recallProbability" REAL NOT NULL,
  "status" TEXT DEFAULT 'ACTIVE',
  "reviewedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_forgetting_alerts_userId_status" ON "forgetting_alerts" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_forgetting_alerts_predictedForgetAt" ON "forgetting_alerts" ("predictedForgetAt");

-- ============================================
-- 通知与偏好
-- ============================================

-- 通知表
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT DEFAULT 'UNREAD',
  "priority" TEXT DEFAULT 'NORMAL',
  "metadata" TEXT,
  "readAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_notifications_userId_status" ON "notifications" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_notifications_type" ON "notifications" ("type");
CREATE INDEX IF NOT EXISTS "idx_notifications_priority_status" ON "notifications" ("priority", "status");

-- 用户偏好表
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "preferredStudyTimeStart" TEXT DEFAULT '09:00',
  "preferredStudyTimeEnd" TEXT DEFAULT '21:00',
  "preferredDifficulty" TEXT DEFAULT 'adaptive',
  "dailyGoalEnabled" INTEGER DEFAULT 1,
  "dailyGoalWords" INTEGER DEFAULT 20,
  "enableForgettingAlerts" INTEGER DEFAULT 1,
  "enableAchievements" INTEGER DEFAULT 1,
  "enableReminders" INTEGER DEFAULT 1,
  "enableSystemNotif" INTEGER DEFAULT 1,
  "reminderFrequency" TEXT DEFAULT 'daily',
  "quietHoursStart" TEXT DEFAULT '22:00',
  "quietHoursEnd" TEXT DEFAULT '08:00',
  "theme" TEXT DEFAULT 'light',
  "language" TEXT DEFAULT 'zh-CN',
  "soundEnabled" INTEGER DEFAULT 1,
  "animationEnabled" INTEGER DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 用户学习目标表
CREATE TABLE IF NOT EXISTS "user_learning_objectives" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "mode" TEXT DEFAULT 'daily',
  "primaryObjective" TEXT DEFAULT 'accuracy',
  "minAccuracy" REAL,
  "maxDailyTime" INTEGER,
  "targetRetention" REAL,
  "weightShortTerm" REAL DEFAULT 0.4,
  "weightLongTerm" REAL DEFAULT 0.4,
  "weightEfficiency" REAL DEFAULT 0.2,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_learning_objectives_userId" ON "user_learning_objectives" ("userId");

-- 学习目标历史表
CREATE TABLE IF NOT EXISTS "objective_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "objectiveId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeMetrics" TEXT NOT NULL,
  "afterMetrics" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_objective_history_userId" ON "objective_history" ("userId");
CREATE INDEX IF NOT EXISTS "idx_objective_history_objectiveId" ON "objective_history" ("objectiveId");
CREATE INDEX IF NOT EXISTS "idx_objective_history_timestamp" ON "objective_history" ("timestamp");

-- ============================================
-- 视觉疲劳与交互追踪
-- ============================================

-- 视觉疲劳记录表
CREATE TABLE IF NOT EXISTS "visual_fatigue_records" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "score" REAL NOT NULL,
  "fusedScore" REAL NOT NULL,
  "perclos" REAL NOT NULL,
  "blinkRate" REAL NOT NULL,
  "yawnCount" INTEGER DEFAULT 0,
  "headPitch" REAL,
  "headYaw" REAL,
  "confidence" REAL NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_userId_createdAt" ON "visual_fatigue_records" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_createdAt" ON "visual_fatigue_records" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_userId" ON "visual_fatigue_records" ("userId");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_sessionId" ON "visual_fatigue_records" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_sessionId_createdAt" ON "visual_fatigue_records" ("sessionId", "createdAt" DESC);

-- 用户视觉疲劳配置表
CREATE TABLE IF NOT EXISTS "user_visual_fatigue_configs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "enabled" INTEGER DEFAULT 0,
  "detectionFps" INTEGER DEFAULT 5,
  "uploadIntervalMs" INTEGER DEFAULT 5000,
  "vlmAnalysisEnabled" INTEGER DEFAULT 0,
  "personalBaselineData" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_visual_fatigue_configs_userId" ON "user_visual_fatigue_configs" ("userId");

-- 用户交互统计表
CREATE TABLE IF NOT EXISTS "user_interaction_stats" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "pronunciationClicks" INTEGER DEFAULT 0,
  "pauseCount" INTEGER DEFAULT 0,
  "pageSwitchCount" INTEGER DEFAULT 0,
  "totalInteractions" INTEGER DEFAULT 0,
  "totalSessionDuration" INTEGER DEFAULT 0,
  "lastActivityTime" TEXT NOT NULL DEFAULT (datetime('now')),
  -- VARK aggregated stats (Migration 041)
  "avgSessionDurationMs" INTEGER DEFAULT 0,
  "sessionBreakCount" INTEGER DEFAULT 0,
  "preferredReviewInterval" INTEGER DEFAULT 24,
  "totalImageInteractions" INTEGER DEFAULT 0,
  "totalAudioInteractions" INTEGER DEFAULT 0,
  "totalReadingMs" INTEGER DEFAULT 0,
  "totalWritingActions" INTEGER DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_interaction_stats_userId" ON "user_interaction_stats" ("userId");

-- 用户追踪事件表
CREATE TABLE IF NOT EXISTS "user_tracking_events" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventData" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_tracking_events_userId_timestamp" ON "user_tracking_events" ("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_user_tracking_events_sessionId" ON "user_tracking_events" ("sessionId");

-- ============================================
-- 系统日志与告警
-- ============================================

-- 系统日志表
CREATE TABLE IF NOT EXISTS "system_logs" (
  "id" TEXT PRIMARY KEY,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "module" TEXT,
  "source" TEXT DEFAULT 'BACKEND',
  "context" TEXT,
  "error" TEXT,
  "requestId" TEXT,
  "userId" TEXT,
  "clientIp" TEXT,
  "userAgent" TEXT,
  "app" TEXT,
  "env" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_system_logs_timestamp" ON "system_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_system_logs_level" ON "system_logs" ("level");
CREATE INDEX IF NOT EXISTS "idx_system_logs_module" ON "system_logs" ("module");
CREATE INDEX IF NOT EXISTS "idx_system_logs_source" ON "system_logs" ("source");
CREATE INDEX IF NOT EXISTS "idx_system_logs_userId" ON "system_logs" ("userId");
CREATE INDEX IF NOT EXISTS "idx_system_logs_requestId" ON "system_logs" ("requestId");

-- 日志告警规则表
CREATE TABLE IF NOT EXISTS "log_alert_rules" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" INTEGER DEFAULT 1,
  "levels" TEXT NOT NULL,
  "module" TEXT,
  "messagePattern" TEXT,
  "threshold" INTEGER NOT NULL,
  "windowMinutes" INTEGER NOT NULL,
  "webhookUrl" TEXT,
  "cooldownMinutes" INTEGER DEFAULT 30,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_log_alert_rules_enabled" ON "log_alert_rules" ("enabled");

-- ============================================
-- LLM 增强与建议
-- ============================================

-- LLM 顾问建议表
CREATE TABLE IF NOT EXISTS "llm_advisor_suggestions" (
  "id" TEXT PRIMARY KEY,
  "weekStart" TEXT NOT NULL,
  "weekEnd" TEXT NOT NULL,
  "statsSnapshot" TEXT NOT NULL,
  "rawResponse" TEXT NOT NULL,
  "parsedSuggestion" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TEXT,
  "reviewNotes" TEXT,
  "appliedItems" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_llm_advisor_suggestions_status" ON "llm_advisor_suggestions" ("status");
CREATE INDEX IF NOT EXISTS "idx_llm_advisor_suggestions_createdAt" ON "llm_advisor_suggestions" ("createdAt");

-- 建议效果追踪表
CREATE TABLE IF NOT EXISTS "suggestion_effect_tracking" (
  "id" TEXT PRIMARY KEY,
  "suggestionId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "targetParam" TEXT NOT NULL,
  "oldValue" REAL NOT NULL,
  "newValue" REAL NOT NULL,
  "appliedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "metricsBeforeApply" TEXT NOT NULL,
  "metricsAfterApply" TEXT,
  "effectEvaluated" INTEGER DEFAULT 0,
  "effectScore" REAL,
  "effectAnalysis" TEXT,
  "evaluatedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_suggestionId" ON "suggestion_effect_tracking" ("suggestionId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_appliedAt" ON "suggestion_effect_tracking" ("appliedAt");
CREATE INDEX IF NOT EXISTS "idx_suggestion_effect_tracking_effectEvaluated" ON "suggestion_effect_tracking" ("effectEvaluated");

-- 词库质量检查表
CREATE TABLE IF NOT EXISTS "word_quality_checks" (
  "id" TEXT PRIMARY KEY,
  "wordBookId" TEXT NOT NULL,
  "checkType" TEXT NOT NULL,
  "totalWords" INTEGER NOT NULL,
  "checkedWords" INTEGER DEFAULT 0,
  "issuesFound" INTEGER DEFAULT 0,
  "issueDetails" TEXT DEFAULT '[]',
  "status" TEXT DEFAULT 'pending',
  "taskId" TEXT,
  "createdBy" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_quality_checks_wordBookId" ON "word_quality_checks" ("wordBookId");
CREATE INDEX IF NOT EXISTS "idx_word_quality_checks_status" ON "word_quality_checks" ("status");

-- 词库内容问题表
CREATE TABLE IF NOT EXISTS "word_content_issues" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "suggestion" TEXT,
  "status" TEXT DEFAULT 'open',
  "fixedBy" TEXT,
  "fixedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_content_issues_wordId" ON "word_content_issues" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_content_issues_checkId" ON "word_content_issues" ("checkId");
CREATE INDEX IF NOT EXISTS "idx_word_content_issues_status" ON "word_content_issues" ("status");

-- 词库内容增强版本表
CREATE TABLE IF NOT EXISTS "word_content_variants" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "originalValue" TEXT,
  "generatedValue" TEXT NOT NULL,
  "confidence" REAL DEFAULT 0.8,
  "taskId" TEXT,
  "status" TEXT DEFAULT 'pending',
  "approvedBy" TEXT,
  "approvedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_content_variants_wordId" ON "word_content_variants" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_content_variants_status" ON "word_content_variants" ("status");

-- LLM 分析任务表
CREATE TABLE IF NOT EXISTS "llm_analysis_tasks" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "priority" INTEGER DEFAULT 5,
  "input" TEXT NOT NULL,
  "output" TEXT,
  "tokensUsed" INTEGER,
  "error" TEXT,
  "retryCount" INTEGER DEFAULT 0,
  "createdBy" TEXT,
  "startedAt" TEXT,
  "completedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_llm_analysis_tasks_status_priority" ON "llm_analysis_tasks" ("status", "priority");
CREATE INDEX IF NOT EXISTS "idx_llm_analysis_tasks_type_status" ON "llm_analysis_tasks" ("type", "status");

-- 系统周报表
CREATE TABLE IF NOT EXISTS "system_weekly_reports" (
  "id" TEXT PRIMARY KEY,
  "weekStart" TEXT NOT NULL,
  "weekEnd" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "healthScore" REAL NOT NULL,
  "keyMetrics" TEXT NOT NULL,
  "highlights" TEXT NOT NULL,
  "concerns" TEXT NOT NULL,
  "recommendations" TEXT NOT NULL,
  "userMetrics" TEXT NOT NULL,
  "learningMetrics" TEXT NOT NULL,
  "systemMetrics" TEXT NOT NULL,
  "rawLLMResponse" TEXT,
  "tokensUsed" INTEGER,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("weekStart", "weekEnd")
);

-- 用户行为洞察表
CREATE TABLE IF NOT EXISTS "user_behavior_insights" (
  "id" TEXT PRIMARY KEY,
  "analysisDate" TEXT NOT NULL,
  "userSegment" TEXT NOT NULL,
  "patterns" TEXT NOT NULL,
  "insights" TEXT NOT NULL,
  "recommendations" TEXT NOT NULL,
  "userCount" INTEGER NOT NULL,
  "dataPoints" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("analysisDate", "userSegment")
);

-- 告警根因分析表
CREATE TABLE IF NOT EXISTS "alert_root_cause_analyses" (
  "id" TEXT PRIMARY KEY,
  "alertRuleId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "rootCause" TEXT NOT NULL,
  "suggestedFixes" TEXT NOT NULL,
  "relatedMetrics" TEXT NOT NULL,
  "confidence" REAL NOT NULL,
  "status" TEXT DEFAULT 'open',
  "resolvedBy" TEXT,
  "resolvedAt" TEXT,
  "resolution" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_alert_root_cause_analyses_alertRuleId" ON "alert_root_cause_analyses" ("alertRuleId");
CREATE INDEX IF NOT EXISTS "idx_alert_root_cause_analyses_status" ON "alert_root_cause_analyses" ("status");

-- 语境强化表
CREATE TABLE IF NOT EXISTS "word_contexts" (
  "id" TEXT PRIMARY KEY,
  "wordId" TEXT NOT NULL,
  "contextType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_word_contexts_wordId" ON "word_contexts" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_contexts_contextType" ON "word_contexts" ("contextType");

-- ============================================
-- VARK Learning Style (Migration 041)
-- ============================================

-- VARK model storage
CREATE TABLE IF NOT EXISTS "user_vark_models" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "sampleCount" INTEGER DEFAULT 0,
  "isMLEnabled" INTEGER DEFAULT 0,
  "visualWeights" TEXT DEFAULT '[]',
  "auditoryWeights" TEXT DEFAULT '[]',
  "readingWeights" TEXT DEFAULT '[]',
  "kinestheticWeights" TEXT DEFAULT '[]',
  "visualBias" REAL DEFAULT 0,
  "auditoryBias" REAL DEFAULT 0,
  "readingBias" REAL DEFAULT 0,
  "kinestheticBias" REAL DEFAULT 0,
  "lastCalibration" INTEGER DEFAULT 0,
  "lastTrainedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_vark_models_userId" ON "user_vark_models" ("userId");

-- ============================================
-- UMM Memory Model (Migration 039, 040)
-- ============================================

-- Context history table for EVM (Encoding Variability Metric)
CREATE TABLE IF NOT EXISTS "context_history" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "hourOfDay" INTEGER NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "questionType" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "timestamp" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_context_history_user_word" ON "context_history" ("userId", "wordId");
CREATE INDEX IF NOT EXISTS "idx_context_history_timestamp" ON "context_history" ("userId", "timestamp");

-- UMM shadow calculation results for A/B comparison with FSRS
CREATE TABLE IF NOT EXISTS "umm_shadow_results" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "userId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "sessionId" TEXT,
  "eventTs" INTEGER NOT NULL,
  -- FSRS values (baseline)
  "fsrsInterval" REAL NOT NULL,
  "fsrsRetrievability" REAL NOT NULL,
  "fsrsStability" REAL NOT NULL,
  "fsrsDifficulty" REAL NOT NULL,
  -- MDM values (shadow)
  "mdmInterval" REAL,
  "mdmRetrievability" REAL,
  "mdmStrength" REAL,
  "mdmConsolidation" REAL,
  -- MTP/IAD/EVM bonuses/penalties
  "mtpBonus" REAL,
  "iadPenalty" REAL,
  "evmBonus" REAL,
  -- Combined UMM retrievability
  "ummRetrievability" REAL,
  "ummInterval" REAL,
  -- Actual outcome (for accuracy calculation)
  "actualRecalled" INTEGER,
  "elapsedDays" REAL,
  -- Metadata
  "createdAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS "idx_umm_shadow_user_word" ON "umm_shadow_results" ("userId", "wordId");
CREATE INDEX IF NOT EXISTS "idx_umm_shadow_created" ON "umm_shadow_results" ("createdAt");
