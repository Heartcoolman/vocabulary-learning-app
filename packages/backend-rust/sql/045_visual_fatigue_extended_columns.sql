-- Add extended columns to visual_fatigue_records for TFM algorithm support
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "eyeAspectRatio" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "avgBlinkDuration" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "headRoll" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "headStability" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "squintIntensity" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "expressionFatigueScore" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "gazeOffScreenRatio" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "browDownIntensity" DOUBLE PRECISION;
ALTER TABLE "visual_fatigue_records" ADD COLUMN IF NOT EXISTS "mouthOpenRatio" DOUBLE PRECISION;
