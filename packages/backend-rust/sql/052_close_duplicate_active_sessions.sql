-- Migration: Close duplicate active learning sessions
-- Goal: keep at most one endedAt-NULL session per user to avoid "a bunch of in-progress sessions"
-- caused by old client behavior (creating sessions on page open) or crashes.
--
-- Policy:
-- 1) For each user, keep the most recent active session (startedAt DESC); end the others.
-- 2) Also close empty active sessions (no answer_records) that are older than 10 minutes.

-- 1) Close duplicate active sessions, keep the most recent per user.
WITH active AS (
    SELECT
        "id",
        "userId",
        ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "startedAt" DESC) AS rn
    FROM "learning_sessions"
    WHERE "endedAt" IS NULL
)
UPDATE "learning_sessions" ls
SET "endedAt" = NOW(),
    "updatedAt" = NOW()
FROM active a
WHERE ls."id" = a."id"
  AND a.rn > 1;

-- 2) Close empty active sessions lingering too long.
UPDATE "learning_sessions" ls
SET "endedAt" = NOW(),
    "updatedAt" = NOW()
WHERE ls."endedAt" IS NULL
  AND COALESCE(ls."totalQuestions", 0) = 0
  AND NOT EXISTS (
      SELECT 1 FROM "answer_records" ar
      WHERE ar."sessionId" = ls."id"
  )
  AND ls."startedAt" < NOW() - INTERVAL '10 minutes';

