-- CreateEnum
CREATE TYPE "DecisionIngestionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineStageType" AS ENUM ('PERCEPTION', 'MODELING', 'LEARNING', 'DECISION', 'EVALUATION', 'OPTIMIZATION');

-- CreateEnum
CREATE TYPE "PipelineStageStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "decision_records" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "answerRecordId" TEXT NOT NULL,
    "sessionId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionSource" TEXT NOT NULL,
    "coldstartPhase" TEXT,
    "weightsSnapshot" JSONB,
    "memberVotes" JSONB,
    "selectedAction" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward" DOUBLE PRECISION,
    "traceVersion" INTEGER NOT NULL DEFAULT 1,
    "ingestionStatus" "DecisionIngestionStatus" NOT NULL DEFAULT 'PENDING',
    "totalDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "decisionRecordId" TEXT NOT NULL,
    "stage" "PipelineStageType" NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" "PipelineStageStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputSummary" JSONB,
    "outputSummary" JSONB,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_records_decisionId_key" ON "decision_records"("decisionId");

-- CreateIndex
CREATE INDEX "decision_records_answerRecordId_idx" ON "decision_records"("answerRecordId");

-- CreateIndex
CREATE INDEX "decision_records_decisionSource_idx" ON "decision_records"("decisionSource");

-- CreateIndex
CREATE INDEX "decision_records_timestamp_idx" ON "decision_records"("timestamp");

-- CreateIndex
CREATE INDEX "decision_records_sessionId_idx" ON "decision_records"("sessionId");

-- CreateIndex
CREATE INDEX "pipeline_stages_decisionRecordId_stage_idx" ON "pipeline_stages"("decisionRecordId", "stage");

-- CreateIndex
CREATE INDEX "pipeline_stages_stage_idx" ON "pipeline_stages"("stage");

-- CreateIndex
CREATE INDEX "pipeline_stages_status_idx" ON "pipeline_stages"("status");

-- AddForeignKey
ALTER TABLE "decision_records" ADD CONSTRAINT "decision_records_answerRecordId_fkey" FOREIGN KEY ("answerRecordId") REFERENCES "answer_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_decisionRecordId_fkey" FOREIGN KEY ("decisionRecordId") REFERENCES "decision_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
