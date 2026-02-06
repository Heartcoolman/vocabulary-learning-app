-- Add micro behavior columns to answer_records
ALTER TABLE "answer_records"
ADD COLUMN IF NOT EXISTS "isGuess" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "indecisionIndex" real,
ADD COLUMN IF NOT EXISTS "reactionLatencyMs" integer,
ADD COLUMN IF NOT EXISTS "keystrokeFluency" real;

-- Add indexes for micro behavior analysis
CREATE INDEX IF NOT EXISTS "idx_answer_records_isGuess" ON "answer_records" ("userId", "isGuess") WHERE "isGuess" = true;
