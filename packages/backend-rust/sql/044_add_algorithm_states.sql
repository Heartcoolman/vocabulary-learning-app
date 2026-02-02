ALTER TABLE "amas_user_states"
ADD COLUMN IF NOT EXISTS "algorithmStates" JSONB DEFAULT '{}';
