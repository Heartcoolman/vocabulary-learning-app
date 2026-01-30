-- Migration 042: Add deviceType column to answer_records
-- Purpose: Track device type for EVM (Encoding Variability Metric) calculations

ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "deviceType" TEXT DEFAULT 'unknown';

-- Add index for deviceType queries
CREATE INDEX IF NOT EXISTS "idx_answer_records_device_type" ON "answer_records"("userId", "deviceType");
