# Tasks - Learning Flow Algorithm Integration Audit

## Priority 1: Fix VARK Frontend Reading Tracking

- [x] Add `trackReadingStart('definition')` call when `currentWord` changes in LearningPage.tsx
- [x] Reading end timing already handled by `getData()` in `handleSelectAnswer`

## Priority 2: Add deviceType to answer_records

- [x] Create migration 042_add_device_type_to_answer_records.sql
- [x] Add `normalize_device_type()` function in record.rs
- [x] Add `device_type` field to `CreateRecordInput`
- [x] Extract User-Agent from request headers in amas.rs and records.rs

## Priority 3: Sync SQLite Fallback Schema

- [x] Add UMM columns to word_learning_states (ummStrength, ummConsolidation, ummLastReviewTs)
- [x] Add VARK columns to answer_records
- [x] Add deviceType column to answer_records
- [x] Add VARK aggregated stats to user_interaction_stats
- [x] Add context_history table
- [x] Add umm_shadow_results table

## Priority 4: Enable Shadow Recording

- [x] Add UMM engine imports to amas.rs
- [x] Call `compute_shadow()` after each `process_event`
- [x] Write shadow results to umm_shadow_results table

## Priority 5: Persist AMAS Runtime States

- [x] Create migration 043_add_amas_runtime_states.sql
- [x] Add fields to AmasUserState: visualFatigue, fusedFatigue, masteryHistory, habitSamples, ensemblePerformance
- [x] Update upsert_amas_user_state() to persist new fields
- [x] Update map_amas_user_state() to load new fields
- [x] Update persistence.rs row_to_user_state/user_state_to_row

## Summary

All 5 priority items have been implemented. The learning flow algorithm integration audit is complete.
