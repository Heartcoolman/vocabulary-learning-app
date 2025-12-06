-- CreateEnum
CREATE TYPE "ABExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "ABTrafficAllocation" AS ENUM ('EVEN', 'WEIGHTED', 'DYNAMIC');

-- CreateTable
CREATE TABLE "ab_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trafficAllocation" "ABTrafficAllocation" NOT NULL DEFAULT 'WEIGHTED',
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "significanceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "minimumDetectableEffect" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "autoDecision" BOOLEAN NOT NULL DEFAULT false,
    "status" "ABExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_variants" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_user_assignments" (
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_user_assignments_pkey" PRIMARY KEY ("userId","experimentId")
);

-- CreateTable
CREATE TABLE "ab_experiment_metrics" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "primaryMetric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stdDev" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "m2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_experiment_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bayesian_optimizer_state" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "observations" JSONB NOT NULL DEFAULT '[]',
    "bestParams" JSONB,
    "bestValue" DOUBLE PRECISION,
    "evaluationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bayesian_optimizer_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causal_observations" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "features" JSONB NOT NULL,
    "treatment" INTEGER NOT NULL,
    "outcome" DOUBLE PRECISION NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "causal_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ab_experiments_status_idx" ON "ab_experiments"("status");

-- CreateIndex
CREATE INDEX "ab_experiments_startedAt_idx" ON "ab_experiments"("startedAt");

-- CreateIndex
CREATE INDEX "ab_variants_experimentId_idx" ON "ab_variants"("experimentId");

-- CreateIndex
CREATE INDEX "ab_user_assignments_variantId_idx" ON "ab_user_assignments"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ab_experiment_metrics_experimentId_variantId_key" ON "ab_experiment_metrics"("experimentId", "variantId");

-- CreateIndex
CREATE INDEX "causal_observations_treatment_idx" ON "causal_observations"("treatment");

-- CreateIndex
CREATE INDEX "causal_observations_timestamp_idx" ON "causal_observations"("timestamp");

-- CreateIndex
CREATE INDEX "causal_observations_userId_idx" ON "causal_observations"("userId");

-- AddForeignKey
ALTER TABLE "ab_variants" ADD CONSTRAINT "ab_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_user_assignments" ADD CONSTRAINT "ab_user_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_user_assignments" ADD CONSTRAINT "ab_user_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ab_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_experiment_metrics" ADD CONSTRAINT "ab_experiment_metrics_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_experiment_metrics" ADD CONSTRAINT "ab_experiment_metrics_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ab_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
