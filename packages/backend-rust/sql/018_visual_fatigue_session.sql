-- Add sessionId column to visual_fatigue_records for session-scoped visual fatigue tracking
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

-- Create index for efficient session-based queries
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_sessionId" ON "visual_fatigue_records" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_visual_fatigue_records_sessionId_createdAt" ON "visual_fatigue_records" ("sessionId", "createdAt" DESC);
