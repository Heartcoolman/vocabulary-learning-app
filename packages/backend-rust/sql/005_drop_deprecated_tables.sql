-- Migration: 005_drop_deprecated_tables.sql
-- Description: Remove deprecated tables replaced by newer implementations
-- Created: 2024-12-28

-- Step 1: Drop deprecated tracking table (replaced by tracking_events from migration 004)
DROP TABLE IF EXISTS "user_tracking_events" CASCADE;

-- Step 2: Drop deprecated quality management tables (replaced by quality_tasks and word_issues from migration 003)
DROP TABLE IF EXISTS "word_content_issues" CASCADE;
DROP TABLE IF EXISTS "word_quality_checks" CASCADE;

