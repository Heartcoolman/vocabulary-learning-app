-- Migration: Add broadcast notification system tables

-- Broadcast target types
DO $$ BEGIN
    CREATE TYPE "BroadcastTarget" AS ENUM ('all', 'online', 'group', 'user', 'users');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Broadcast status types
DO $$ BEGIN
    CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'sent', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- broadcasts table - stores broadcast metadata
CREATE TABLE IF NOT EXISTS "broadcasts" (
    "id" TEXT PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target" "BroadcastTarget" NOT NULL,
    "targetFilter" JSONB,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "persistent" BOOLEAN NOT NULL DEFAULT FALSE,
    "expiresAt" TIMESTAMP(3),
    "status" "BroadcastStatus" NOT NULL DEFAULT 'sent',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "broadcasts_adminId_idx" ON "broadcasts"("adminId");
CREATE INDEX IF NOT EXISTS "broadcasts_status_idx" ON "broadcasts"("status");
CREATE INDEX IF NOT EXISTS "broadcasts_createdAt_idx" ON "broadcasts"("createdAt" DESC);

-- broadcast_audit_logs table - stores audit trail
CREATE TABLE IF NOT EXISTS "broadcast_audit_logs" (
    "id" TEXT PRIMARY KEY,
    "broadcastId" TEXT NOT NULL REFERENCES "broadcasts"("id") ON DELETE CASCADE,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "broadcast_audit_logs_broadcastId_idx" ON "broadcast_audit_logs"("broadcastId");

-- Add broadcastId column to notifications table for linking
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "broadcastId" TEXT REFERENCES "broadcasts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "notifications_broadcastId_idx" ON "notifications"("broadcastId");
