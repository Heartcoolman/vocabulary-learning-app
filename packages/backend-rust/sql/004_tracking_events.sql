-- Migration: Add tracking_events table for behavior tracking persistence
-- Created: 2024-12-26

CREATE TABLE IF NOT EXISTS "tracking_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_tracking_events_user" ON "tracking_events"("userId");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_session" ON "tracking_events"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_type" ON "tracking_events"("eventType");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_created" ON "tracking_events"("createdAt" DESC);
