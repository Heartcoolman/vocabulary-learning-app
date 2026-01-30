-- Migration: Add UMM shadow calculation results table
-- Purpose: Store shadow computation results for A/B comparison with FSRS

CREATE TABLE IF NOT EXISTS umm_shadow_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    wordId TEXT NOT NULL,
    sessionId TEXT,
    eventTs INTEGER NOT NULL,
    -- FSRS values (baseline)
    fsrsInterval REAL NOT NULL,
    fsrsRetrievability REAL NOT NULL,
    fsrsStability REAL NOT NULL,
    frssDifficulty REAL NOT NULL,
    -- MDM values (shadow)
    mdmInterval REAL,
    mdmRetrievability REAL,
    mdmStrength REAL,
    mdmConsolidation REAL,
    -- MTP/IAD/EVM bonuses/penalties
    mtpBonus REAL,
    iadPenalty REAL,
    evmBonus REAL,
    -- Combined UMM retrievability
    ummRetrievability REAL,
    ummInterval REAL,
    -- Actual outcome (for accuracy calculation)
    actualRecalled INTEGER,
    elapsedDays REAL,
    -- Metadata
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_umm_shadow_user_word ON umm_shadow_results(userId, wordId);
CREATE INDEX IF NOT EXISTS idx_umm_shadow_created ON umm_shadow_results(createdAt);
