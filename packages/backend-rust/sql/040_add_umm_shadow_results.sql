-- Migration: Add UMM shadow calculation results table
-- Purpose: Store shadow computation results for A/B comparison with FSRS

CREATE TABLE IF NOT EXISTS umm_shadow_results (
    id SERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventTs" BIGINT NOT NULL,
    -- FSRS values (baseline)
    "fsrsInterval" DOUBLE PRECISION NOT NULL,
    "fsrsRetrievability" DOUBLE PRECISION NOT NULL,
    "fsrsStability" DOUBLE PRECISION NOT NULL,
    "fsrsDifficulty" DOUBLE PRECISION NOT NULL,
    -- MDM values (shadow)
    "mdmInterval" DOUBLE PRECISION,
    "mdmRetrievability" DOUBLE PRECISION,
    "mdmStrength" DOUBLE PRECISION,
    "mdmConsolidation" DOUBLE PRECISION,
    -- MTP/IAD/EVM bonuses/penalties
    "mtpBonus" DOUBLE PRECISION,
    "iadPenalty" DOUBLE PRECISION,
    "evmBonus" DOUBLE PRECISION,
    -- Combined UMM retrievability
    "ummRetrievability" DOUBLE PRECISION,
    "ummInterval" DOUBLE PRECISION,
    -- Actual outcome (for accuracy calculation)
    "actualRecalled" INTEGER,
    "elapsedDays" DOUBLE PRECISION,
    -- Metadata
    "createdAt" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    FOREIGN KEY ("userId") REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_umm_shadow_user_word ON umm_shadow_results("userId", "wordId");
CREATE INDEX IF NOT EXISTS idx_umm_shadow_created ON umm_shadow_results("createdAt");
